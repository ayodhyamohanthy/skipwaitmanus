/**
 * BANDED-checkout storage (0123 tables, D-367). Founding places are reserved at
 * checkout creation and released if the checkout fails or expires unpaid.
 *
 * Every writer locks the (site, plan) counter row FOR UPDATE first and only
 * then touches membership rows, in one transaction, so the cap (also a database
 * CHECK) holds under concurrent buyers and lock order never inverts. Only a
 * reservation is ever released; an issued place is permanent (FOUNDING_TERMS).
 * Timestamps come from the application, never MySQL NOW() (AGENTS invariant 5).
 */
import { and, count, eq, gt, inArray, lte, or } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/mysql2";
import { bandedFoundingCounters, bandedFoundingMemberships, subscriptionCheckoutIntents, tokenBalances } from "../drizzle/schema";
import { PLAN_FAMILY, PLAN_FAMILY_IDS, planFamilyEntry, type PlanFamilyId } from "../shared/planFamily";
import type { BandedCheckoutDeps, BandedMembership, BandedSite, FoundingReservation } from "./bandedCheckout";
import type { BandedSubscriptionIntentInput } from "./bandedCheckoutRoutes";

type Db = ReturnType<typeof drizzle>;

function inconsistent(site: BandedSite, planId: PlanFamilyId): Error {
  return new Error(`Founding counter for ${site}/${planId} is lower than its reservations; refusing to sell until it is reconciled`);
}

export async function reserveFoundingPlace(db: Db, input: { site: BandedSite; planId: PlanFamilyId; userId: number; checkoutIntentId: string; now: Date; expiresAt: Date }): Promise<FoundingReservation> {
  const cap = planFamilyEntry(input.planId).foundingCap;
  const counterKey = and(eq(bandedFoundingCounters.site, input.site), eq(bandedFoundingCounters.planId, input.planId));
  return db.transaction(async tx => {
    const [counter] = await tx.select().from(bandedFoundingCounters).where(counterKey).limit(1).for("update");
    if (!counter) throw new Error(`Founding counter for ${input.site}/${input.planId} is missing (migration 0123 seeds it)`);
    const [existing] = await tx.select().from(bandedFoundingMemberships)
      .where(and(eq(bandedFoundingMemberships.site, input.site), eq(bandedFoundingMemberships.checkoutIntentId, input.checkoutIntentId))).limit(1).for("update");
    if (existing) {
      const live = existing.status === "reserved" && existing.planId === input.planId && existing.userId === input.userId && existing.expiresAt.getTime() > input.now.getTime();
      return { status: live ? "existing" : "key_used" };
    }
    // Free expired reservations, and the same person's earlier unpaid one for this plan:
    // a new checkout replaces it, so one person never holds two places in a band.
    const stale = await tx.select({ id: bandedFoundingMemberships.id }).from(bandedFoundingMemberships)
      .where(and(
        eq(bandedFoundingMemberships.site, input.site),
        eq(bandedFoundingMemberships.planId, input.planId),
        eq(bandedFoundingMemberships.status, "reserved"),
        or(lte(bandedFoundingMemberships.expiresAt, input.now), eq(bandedFoundingMemberships.userId, input.userId)),
      )).for("update");
    const reserved = counter.reservedCount - stale.length;
    if (reserved < 0) throw inconsistent(input.site, input.planId);
    if (stale.length > 0) {
      await tx.update(bandedFoundingMemberships).set({ status: "released", releasedAt: input.now })
        .where(and(inArray(bandedFoundingMemberships.id, stale.map(row => row.id)), eq(bandedFoundingMemberships.status, "reserved")));
    }
    if (counter.issuedCount + reserved >= cap) {
      if (stale.length > 0) await tx.update(bandedFoundingCounters).set({ reservedCount: reserved }).where(counterKey);
      return { status: "full" };
    }
    await tx.insert(bandedFoundingMemberships).values({ site: input.site, planId: input.planId, userId: input.userId, checkoutIntentId: input.checkoutIntentId, status: "reserved", expiresAt: input.expiresAt, createdAt: input.now });
    await tx.update(bandedFoundingCounters).set({ reservedCount: reserved + 1 }).where(counterKey);
    return { status: "reserved" };
  });
}

export async function releaseFoundingPlace(db: Db, input: { site: BandedSite; checkoutIntentId: string; now: Date }): Promise<{ released: boolean }> {
  const membershipKey = and(eq(bandedFoundingMemberships.site, input.site), eq(bandedFoundingMemberships.checkoutIntentId, input.checkoutIntentId));
  return db.transaction(async tx => {
    // Read the plan without a lock, then lock in the one order every writer uses: counter, then membership.
    const [peek] = await tx.select({ planId: bandedFoundingMemberships.planId }).from(bandedFoundingMemberships).where(membershipKey).limit(1);
    if (!peek) return { released: false };
    const counterKey = and(eq(bandedFoundingCounters.site, input.site), eq(bandedFoundingCounters.planId, peek.planId));
    const [counter] = await tx.select().from(bandedFoundingCounters).where(counterKey).limit(1).for("update");
    const [row] = await tx.select().from(bandedFoundingMemberships).where(membershipKey).limit(1).for("update");
    if (!counter || !row || row.status !== "reserved") return { released: false };
    if (counter.reservedCount < 1) throw inconsistent(input.site, peek.planId);
    await tx.update(bandedFoundingMemberships).set({ status: "released", releasedAt: input.now }).where(and(eq(bandedFoundingMemberships.id, row.id), eq(bandedFoundingMemberships.status, "reserved")));
    await tx.update(bandedFoundingCounters).set({ reservedCount: counter.reservedCount - 1 }).where(counterKey);
    return { released: true };
  });
}

/** Places a new buyer could take now: the cap less issued places and unexpired reservations (the real count, never invented). */
export async function foundingPlacesLeft(db: Db, site: BandedSite, now: Date): Promise<Record<PlanFamilyId, number>> {
  const counters = await db.select().from(bandedFoundingCounters).where(eq(bandedFoundingCounters.site, site));
  const live = await db.select({ planId: bandedFoundingMemberships.planId, n: count() }).from(bandedFoundingMemberships)
    .where(and(eq(bandedFoundingMemberships.site, site), eq(bandedFoundingMemberships.status, "reserved"), gt(bandedFoundingMemberships.expiresAt, now)))
    .groupBy(bandedFoundingMemberships.planId);
  const left = {} as Record<PlanFamilyId, number>;
  for (const plan of PLAN_FAMILY) {
    const counter = counters.find(row => row.planId === plan.id);
    // A missing counter row sells nothing rather than guessing.
    const issued = counter ? counter.issuedCount : plan.foundingCap;
    const reserved = Number(live.find(row => row.planId === plan.id)?.n ?? 0);
    left[plan.id] = Math.max(0, plan.foundingCap - issued - reserved);
  }
  return left;
}

const ACTIVE = new Set(["active", "non_renewing"]);

/** The seeker wallet's plan state, read the way getUserSubscription reads it. */
export async function bandedMembership(db: Db, userId: number): Promise<BandedMembership> {
  const [wallet] = await db.select({ plan: tokenBalances.plan, subscriptionId: tokenBalances.subscriptionId, subscriptionStatus: tokenBalances.subscriptionStatus })
    .from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1);
  if (!wallet) return { bandedPlan: null, activeSubscription: false };
  const activeSubscription = Boolean(wallet.subscriptionId) && wallet.plan !== "free" && ACTIVE.has(wallet.subscriptionStatus ?? "");
  const bandedPlan = activeSubscription && (PLAN_FAMILY_IDS as readonly string[]).includes(wallet.plan) ? (wallet.plan as PlanFamilyId) : null;
  return { bandedPlan, activeSubscription };
}

/** The pending plan intent; a replay of the same checkout (same page) is accepted once, anything else is refused. */
export async function createBandedSubscriptionIntent(db: Db, input: BandedSubscriptionIntentInput): Promise<void> {
  const [existing] = await db.select().from(subscriptionCheckoutIntents).where(eq(subscriptionCheckoutIntents.checkoutIntentId, input.checkoutIntentId)).limit(1);
  if (existing) {
    if (existing.hostedPageId === input.hostedPageId && existing.userId === input.userId && existing.plan === input.plan) return;
    throw new Error("A different checkout already holds this checkout intent id");
  }
  await db.insert(subscriptionCheckoutIntents).values({ ...input, billingPeriod: "monthly", kind: "new", status: "pending" });
}

/** The production wiring for server/_core/index.ts; `getDatabase` is db.ts getDb (kept out of this module for the MySQL proof). */
export function bandedCheckoutStore(getDatabase: () => Promise<Db | null>): { checkout: BandedCheckoutDeps; createSubscriptionIntent: (input: BandedSubscriptionIntentInput) => Promise<void> } {
  const database = async (): Promise<Db> => {
    const db = await getDatabase();
    if (!db) throw new Error("Database unavailable");
    return db;
  };
  return {
    checkout: {
      membership: async userId => bandedMembership(await database(), userId),
      reserveFoundingPlace: async input => reserveFoundingPlace(await database(), input),
      releaseFoundingPlace: async input => releaseFoundingPlace(await database(), input),
      foundingPlacesLeft: async (site, now) => foundingPlacesLeft(await database(), site, now),
    },
    createSubscriptionIntent: async input => createBandedSubscriptionIntent(await database(), input),
  };
}

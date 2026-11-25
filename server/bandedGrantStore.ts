/**
 * Storage adapter for banded checkout intents and fulfillment (0124 table).
 * Backs server/bandedCheckout.ts, server/bandedCheckoutRoutes.ts, and server/bandedGrants.ts.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  bandedCheckoutIntents,
  bandedFoundingCounters,
  bandedFoundingMemberships,
  bandedReferralBalances,
  billingReviewOutbox,
  tokenBalances,
  tokenTransactions,
} from "../drizzle/schema";
import type {
  BandedBillingRoute,
  BandedCart,
  BandedCurrency,
  BandedGrantKind,
  BandedSite,
} from "../shared/bandedGrants";
import type { PlanFamilyId, ReferralLevel } from "../shared/planFamily";
import type { BandedGrantDb } from "./bandedGrants";

export type Db = MySql2Database<Record<string, unknown>>;

export interface CreateBandedCheckoutIntentInput {
  site: BandedSite;
  checkoutIntentId: string;
  userId: number;
  kind: BandedGrantKind;
  planId?: PlanFamilyId | null;
  billingRoute: BandedBillingRoute;
  currency: BandedCurrency;
  expectedTotal: number;
  fingerprint: string;
  cart: BandedCart;
  now: Date;
  expiresAt: Date;
  replayDeadline: Date;
}

export type BandedCheckoutIntentRow = typeof bandedCheckoutIntents.$inferSelect;

export async function createBandedCheckoutIntent(
  db: Db,
  input: CreateBandedCheckoutIntentInput
): Promise<{ intent: BandedCheckoutIntentRow; isReplay: boolean }> {
  const [existing] = await db
    .select()
    .from(bandedCheckoutIntents)
    .where(
      and(
        eq(bandedCheckoutIntents.site, input.site),
        eq(bandedCheckoutIntents.checkoutIntentId, input.checkoutIntentId)
      )
    )
    .limit(1);

  if (existing) {
    const matches =
      existing.userId === input.userId &&
      existing.kind === input.kind &&
      existing.planId === (input.planId ?? null) &&
      existing.billingRoute === input.billingRoute &&
      existing.currency === input.currency &&
      existing.expectedTotal === input.expectedTotal &&
      existing.fingerprint === input.fingerprint;

    if (!matches) {
      throw new Error("A different checkout already holds this checkout intent id");
    }
    if (input.now.getTime() > existing.replayDeadline.getTime()) {
      throw new Error("This checkout was already started and its replay window has expired");
    }
    return { intent: existing, isReplay: true };
  }

  await db.insert(bandedCheckoutIntents).values({
    site: input.site,
    checkoutIntentId: input.checkoutIntentId,
    userId: input.userId,
    kind: input.kind,
    planId: input.planId ?? null,
    billingRoute: input.billingRoute,
    currency: input.currency,
    expectedTotal: input.expectedTotal,
    fingerprint: input.fingerprint,
    cart: input.cart,
    status: "creating",
    createdAt: input.now,
    updatedAt: input.now,
    expiresAt: input.expiresAt,
    replayDeadline: input.replayDeadline,
  });

  const [created] = await db
    .select()
    .from(bandedCheckoutIntents)
    .where(
      and(
        eq(bandedCheckoutIntents.site, input.site),
        eq(bandedCheckoutIntents.checkoutIntentId, input.checkoutIntentId)
      )
    )
    .limit(1);

  if (!created) throw new Error("Failed to insert banded checkout intent");
  return { intent: created, isReplay: false };
}

export async function bindHostedPageToBandedIntent(
  db: Db,
  input: {
    site: BandedSite;
    checkoutIntentId: string;
    hostedPageId: string;
    now: Date;
  }
): Promise<void> {
  await db
    .update(bandedCheckoutIntents)
    .set({
      hostedPageId: input.hostedPageId,
      status: "pending",
      updatedAt: input.now,
    })
    .where(
      and(
        eq(bandedCheckoutIntents.site, input.site),
        eq(bandedCheckoutIntents.checkoutIntentId, input.checkoutIntentId)
      )
    );
}

export async function findBandedCheckoutIntent(
  db: Db,
  filter: {
    site: BandedSite;
    checkoutIntentId?: string;
    hostedPageId?: string;
    invoiceId?: string;
  }
): Promise<BandedCheckoutIntentRow | null> {
  const conditions = [eq(bandedCheckoutIntents.site, filter.site)];
  if (filter.checkoutIntentId) {
    conditions.push(eq(bandedCheckoutIntents.checkoutIntentId, filter.checkoutIntentId));
  } else if (filter.hostedPageId) {
    conditions.push(eq(bandedCheckoutIntents.hostedPageId, filter.hostedPageId));
  } else if (filter.invoiceId) {
    conditions.push(eq(bandedCheckoutIntents.invoiceId, filter.invoiceId));
  } else {
    return null;
  }

  const [row] = await db
    .select()
    .from(bandedCheckoutIntents)
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

export async function listPendingBandedIntents(
  db: Db,
  filter: { olderThan: Date; newerThan: Date; recheckBefore?: Date; limit: number }
): Promise<BandedCheckoutIntentRow[]> {
  const conditions = [
    eq(bandedCheckoutIntents.status, "pending"),
    lt(bandedCheckoutIntents.createdAt, filter.olderThan),
    gt(bandedCheckoutIntents.createdAt, filter.newerThan),
  ];
  if (filter.recheckBefore) {
    conditions.push(
      or(
        isNull(bandedCheckoutIntents.lastCheckedAt),
        lt(bandedCheckoutIntents.lastCheckedAt, filter.recheckBefore)
      )!
    );
  }

  return db
    .select()
    .from(bandedCheckoutIntents)
    .where(and(...conditions))
    .orderBy(asc(bandedCheckoutIntents.createdAt), asc(bandedCheckoutIntents.id))
    .limit(filter.limit);
}

export async function touchBandedIntent(db: Db, id: number, checkedAt: Date): Promise<void> {
  await db
    .update(bandedCheckoutIntents)
    .set({ lastCheckedAt: checkedAt })
    .where(eq(bandedCheckoutIntents.id, id));
}

export async function markBandedIntentCancelled(db: Db, id: number, reason: string): Promise<void> {
  await db
    .update(bandedCheckoutIntents)
    .set({ status: "cancelled", failureReason: reason })
    .where(eq(bandedCheckoutIntents.id, id));
}

export async function markBandedIntentReview(db: Db, id: number, reason: string): Promise<void> {
  await db
    .update(bandedCheckoutIntents)
    .set({ status: "requires_review", failureReason: reason })
    .where(eq(bandedCheckoutIntents.id, id));
}

export async function markBandedIntentFulfilled(
  db: Db,
  id: number,
  input: { invoiceId?: string; subscriptionId?: string; fulfilledAt: Date }
): Promise<void> {
  await db
    .update(bandedCheckoutIntents)
    .set({
      status: "fulfilled",
      invoiceId: input.invoiceId,
      subscriptionId: input.subscriptionId,
      fulfilledAt: input.fulfilledAt,
    })
    .where(eq(bandedCheckoutIntents.id, id));
}

/**
 * Creates a BandedGrantDb backed by a live Drizzle transaction or connection.
 */
export function drizzleBandedGrantDb(tx: Db): BandedGrantDb {
  return {
    findIntent: async filter => {
      return findBandedCheckoutIntent(tx, filter);
    },
    updateIntent: async (id, patch) => {
      await tx.update(bandedCheckoutIntents).set(patch).where(eq(bandedCheckoutIntents.id, id));
    },
    getWallet: async (userId, role) => {
      const [wallet] = await tx
        .select()
        .from(tokenBalances)
        .where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role)))
        .limit(1)
        .for("update");
      return wallet ?? null;
    },
    updateWallet: async (id, patch) => {
      await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, id));
    },
    getCounter: async (site, planId) => {
      const [counter] = await tx
        .select()
        .from(bandedFoundingCounters)
        .where(and(eq(bandedFoundingCounters.site, site), eq(bandedFoundingCounters.planId, planId)))
        .limit(1)
        .for("update");
      return counter ?? null;
    },
    updateCounter: async (site, planId, patch) => {
      await tx
        .update(bandedFoundingCounters)
        .set(patch)
        .where(and(eq(bandedFoundingCounters.site, site), eq(bandedFoundingCounters.planId, planId)));
    },
    getMembership: async filter => {
      const conditions = [eq(bandedFoundingMemberships.site, filter.site)];
      if (filter.checkoutIntentId) {
        conditions.push(eq(bandedFoundingMemberships.checkoutIntentId, filter.checkoutIntentId));
      } else if (filter.subscriptionId) {
        conditions.push(eq(bandedFoundingMemberships.subscriptionId, filter.subscriptionId));
      }
      const [membership] = await tx
        .select()
        .from(bandedFoundingMemberships)
        .where(and(...conditions))
        .limit(1)
        .for("update");
      return membership ?? null;
    },
    updateMembership: async (id, patch) => {
      await tx.update(bandedFoundingMemberships).set(patch).where(eq(bandedFoundingMemberships.id, id));
    },
    getLevelBalance: async (userId, level) => {
      const [balance] = await tx
        .select()
        .from(bandedReferralBalances)
        .where(and(eq(bandedReferralBalances.userId, userId), eq(bandedReferralBalances.level, level)))
        .limit(1)
        .for("update");
      return balance ?? null;
    },
    upsertLevelBalance: async (userId, level, patch) => {
      const [existing] = await tx
        .select()
        .from(bandedReferralBalances)
        .where(and(eq(bandedReferralBalances.userId, userId), eq(bandedReferralBalances.level, level)))
        .limit(1)
        .for("update");

      if (existing) {
        await tx
          .update(bandedReferralBalances)
          .set(patch)
          .where(eq(bandedReferralBalances.id, existing.id));
        return { ...existing, ...patch };
      }

      await tx.insert(bandedReferralBalances).values({
        userId,
        level,
        includedRemaining: (patch.includedRemaining as number) ?? 0,
        includedCycleKey: (patch.includedCycleKey as string | null) ?? null,
        includedExpiresAt: (patch.includedExpiresAt as Date | null) ?? null,
        purchasedRemaining: (patch.purchasedRemaining as number) ?? 0,
      });

      const [created] = await tx
        .select()
        .from(bandedReferralBalances)
        .where(and(eq(bandedReferralBalances.userId, userId), eq(bandedReferralBalances.level, level)))
        .limit(1);
      return created;
    },
    insertLedgerRow: async row => {
      const inserted = await tx.insert(tokenTransactions).values(row as any);
      return Number(inserted[0].insertId);
    },
    listTransactions: async filter => {
      const conditions: any[] = [];
      if (filter.userId) conditions.push(eq(tokenTransactions.userId, filter.userId));
      if (filter.kind) conditions.push(eq(tokenTransactions.kind, filter.kind as any));
      if (filter.referenceType) conditions.push(eq(tokenTransactions.referenceType, filter.referenceType));
      if (filter.creditGrantId) conditions.push(eq(tokenTransactions.creditGrantId, filter.creditGrantId));

      const rows = await tx.select().from(tokenTransactions).where(and(...conditions));
      if (filter.referenceIdPrefix) {
        return rows.filter(r => r.referenceId && r.referenceId.startsWith(filter.referenceIdPrefix!));
      }
      return rows;
    },
    enqueueReview: async review => {
      const obligationKey = createHash("sha256").update(JSON.stringify(["banded-review-v1", review])).digest("hex");
      const conflictDigest = createHash("sha256").update(JSON.stringify(["banded-conflict-v1", review.reason, review.subscriptionId ?? review.eventId ?? null])).digest("hex");
      await tx.insert(billingReviewOutbox).values({
        obligationKey,
        conflictDigest,
        payload: JSON.stringify(review),
        status: "pending",
        submissionState: "never_submitted",
        attempts: 0,
        nextAttemptAt: new Date(),
        updatedAt: new Date(),
        createdAt: new Date(),
      });
    },
  };
}

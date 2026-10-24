// Kit credit ledger, transaction level (contract: shared/creditLedger.ts; pure
// rules: shared/creditCycles.ts, shared/creditSpend.ts; cycle steps:
// server/creditCycles.ts).
//
// Every function runs inside the caller's transaction after it has locked the
// wallet row (tokenBalances SELECT ... FOR UPDATE): that lock serializes every
// credit change for the wallet. Grant rows are locked after the wallet, never
// before, so no path can deadlock with another. Every change to a bucket
// writes an append-only tokenTransactions row whose unique idempotency key
// makes a replayed step fail loudly instead of applying twice. Dates come from
// the JS clock the caller passes in (invariant 5), never from DB NOW().
import { createHash } from "node:crypto";
import { isDuplicateKeyError } from "./dbErrors";
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { planCreditGrants, promoCreditGrants, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { BUCKET_SOURCES, type CreditsLedger, type LedgerGrant, type PromoBucket } from "../shared/creditLedger";
import { REVERSE_TRIAL } from "../shared/planCatalog";
import { allocateSpend, buildCreditsLedger, spendableBuckets, usedInCycle, type SpendAllocation } from "../shared/creditSpend";
import type { Carryover } from "../shared/planCatalog";
import { isPlanFamilyPaidPlan, planEntitlementsFor } from "../shared/planEntitlements";
import { FREE_MONTHLY_ALLOWANCE, currentMonthlyCycleKey } from "../shared/subscriptionPlans";

/** The transaction db.ts opens (drizzle(pool) without a relational schema). */
export type LedgerTx = Parameters<Parameters<MySql2Database<Record<string, unknown>>["transaction"]>[0]>[0];
export type WalletRow = typeof tokenBalances.$inferSelect;
export type GrantRow = typeof planCreditGrants.$inferSelect;
export type WalletRole = WalletRow["role"];
type LedgerInsert = typeof tokenTransactions.$inferInsert;
export type CyclePatch = Pick<WalletRow, "monthlyAllowance" | "monthlyCreditsRemaining" | "monthlyCycleKey">;
export type CycleRules = { creditsPerMonth: number; carryover: Carryover };

/** Another request changed the same credits first; the caller retries. */
export class CreditSpendConflictError extends Error {
  constructor() { super("That credit was just used. Try again."); this.name = "CreditSpendConflictError"; }
}

/** UPGRADE_NUDGES #2: a paid tool started with too few credits. Nothing was spent. */
export class InsufficientCreditsError extends Error {
  readonly code = "insufficient_credits" as const;
  constructor(readonly needed: number, readonly available: number) {
    super("You're out of credits. Add credits or compare plans.");
    this.name = "InsufficientCreditsError";
  }
}

/**
 * The credit rules of the plan that grants a cycle. Seekers follow the kit
 * plans (a retired Pro/Max id or any id outside the catalog reads as Free,
 * D-067); referrer wallets keep the pre-kit rule: Free's 3 a month whatever
 * the plan, no carryover (the Pro/Max allowance that was the only exception is
 * gone with those plans).
 */
export function cycleRulesFor(plan: string, role: WalletRole): CycleRules {
  if (role === "job_seeker") {
    // A D-132 paid family plan grants its credits per paid invoice
    // (grantV2PaidCredits), never from a monthly cycle allowance. Without this
    // guard the kit catalog reads a family id as Free (D-067) and opens a
    // 3-credit cycle every paid month (review P1).
    if (isPlanFamilyPaidPlan(plan)) return { creditsPerMonth: 0, carryover: 0 };
    const entitlements = planEntitlementsFor(plan);
    return { creditsPerMonth: entitlements.creditsPerMonth, carryover: entitlements.carryover };
  }
  return { creditsPerMonth: FREE_MONTHLY_ALLOWANCE, carryover: 0 };
}

/**
 * A new seeker wallet's cycle key: not a month, so the first reconcile opens
 * the current Free month with its 3 credits and a plan_grant row (no credit
 * ever appears without its ledger row).
 */
export const FRESH_SEEKER_CYCLE_KEY = "new";

/** The cycle columns of a wallet created now: seekers start empty and are reconciled into Free's month at once; referrers keep 3 a month. */
export function freshWalletCycle(role: WalletRole, now: Date = new Date()): CyclePatch {
  if (role === "job_seeker") return { monthlyAllowance: 0, monthlyCreditsRemaining: 0, monthlyCycleKey: FRESH_SEEKER_CYCLE_KEY };
  return { monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE, monthlyCycleKey: currentMonthlyCycleKey(now) };
}

export function digest(...parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40);
}

/** A unique-key collision, read through drizzle's DrizzleQueryError wrapper (the mysql2 error is its cause). */
export { isDuplicateKeyError };
/**
 * The ledger's name for the shared check. Existing ledger call sites and the
 * source pins in `paymentWalletConcurrency.test.ts` read this name; both names
 * are the same cause-walking function from `dbErrors.ts`.
 */
export const isDuplicateKey = isDuplicateKeyError;

function isMissingTable(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const typed = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (typed.code === "ER_NO_SUCH_TABLE" || typed.errno === 1146) return true;
    current = typed.cause;
  }
  return false;
}

export function asLedgerGrant(row: GrantRow): LedgerGrant {
  return { id: row.id, source: row.source, subscriptionId: row.subscriptionId ?? null, tokenCount: row.tokenCount, creditsRemaining: row.creditsRemaining, expiresAt: row.expiresAt ?? null, status: row.status };
}

/** Every grant row of the wallet, locked when `lock` (spends and reconcile). Before 0089 lands there are none. */
export async function readGrantsTx(tx: Pick<LedgerTx, "select">, userId: number, role: WalletRole, lock: boolean): Promise<GrantRow[]> {
  try {
    const query = tx.select().from(planCreditGrants).where(and(eq(planCreditGrants.userId, userId), eq(planCreditGrants.role, role)));
    return lock ? await query.for("update") : await query;
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function writeLedgerRow(tx: LedgerTx, row: LedgerInsert): Promise<number> {
  const inserted = await tx.insert(tokenTransactions).values(row);
  return Number(inserted[0].insertId);
}

export type SpendMeta = { idempotencyKey: string; referenceType: string; referenceId: string };
export type PromoHolding = PromoBucket & { tokenCount: number };

/**
 * Spends `credits` across the buckets in spend order (soonest expiry first)
 * from a locked, reconciled wallet, or refuses the whole spend. One ledger row
 * per bucket drawn, keyed `${idempotencyKey}#${n}`; row #1 marks the spend done.
 */
export async function spendCreditsTx(tx: LedgerTx, input: { wallet: WalletRow; grants: GrantRow[]; promo: PromoHolding | null; credits: number; meta: SpendMeta; now: Date }): Promise<{ wallet: WalletRow; grants: GrantRow[]; promoRemaining: number | null; allocations: SpendAllocation[] }> {
  const { wallet, now, meta } = input;
  const rules = cycleRulesFor(wallet.plan, wallet.role);
  const buckets = spendableBuckets({ wallet, carryover: rules.carryover, grants: input.grants.map(asLedgerGrant), promo: input.promo, now });
  const { allocations, shortfall } = allocateSpend(buckets, input.credits);
  if (shortfall > 0) throw new InsufficientCreditsError(input.credits, input.credits - shortfall);
  let monthly = wallet.monthlyCreditsRemaining;
  let balance = wallet.balance;
  let promoRemaining = input.promo?.credits ?? null;
  const grants = input.grants.map(grant => ({ ...grant }));
  const rows: LedgerInsert[] = [];
  for (let position = 0; position < allocations.length; position += 1) {
    const allocation = allocations[position];
    const n = allocation.credits;
    const row: LedgerInsert = { userId: wallet.userId, role: wallet.role, tokenCount: -n, kind: allocation.bucket === "promo" ? "promo_spend" : "credit_spend", source: BUCKET_SOURCES[allocation.bucket], sourceCycleKey: wallet.monthlyCycleKey, referenceType: meta.referenceType, referenceId: `${meta.referenceId}#${position + 1}`, idempotencyKey: `${meta.idempotencyKey}#${position + 1}` };
    if (allocation.bucket === "promo" && input.promo) {
      const current = promoRemaining ?? 0;
      const remaining = current - n;
      const claimed = await tx.update(promoCreditGrants).set(remaining === 0 ? { creditsRemaining: 0, status: "exhausted", consumedAt: now } : { creditsRemaining: remaining }).where(and(eq(promoCreditGrants.id, input.promo.grantId), eq(promoCreditGrants.status, "active"), eq(promoCreditGrants.creditsRemaining, current)));
      if (Number(claimed[0]?.affectedRows ?? 0) !== 1) throw new CreditSpendConflictError();
      promoRemaining = remaining;
    } else if (allocation.bucket === "carryover" || allocation.bucket === "trial" || allocation.bucket === "welcome") {
      const grant = grants.find(candidate => candidate.id === allocation.grantId);
      if (!grant) throw new CreditSpendConflictError();
      const remaining = grant.creditsRemaining - n;
      const claimed = await tx.update(planCreditGrants).set(remaining === 0 ? { creditsRemaining: 0, status: "exhausted", closedAt: now } : { creditsRemaining: remaining }).where(and(eq(planCreditGrants.id, grant.id), eq(planCreditGrants.status, "active"), eq(planCreditGrants.creditsRemaining, grant.creditsRemaining)));
      if (Number(claimed[0]?.affectedRows ?? 0) !== 1) throw new CreditSpendConflictError();
      Object.assign(grant, remaining === 0 ? { creditsRemaining: 0, status: "exhausted" as const, closedAt: now } : { creditsRemaining: remaining });
      row.creditGrantId = grant.id;
    } else if (allocation.bucket === "cycle") {
      monthly -= n;
    } else {
      balance -= n;
    }
    rows.push(row);
  }
  let next = wallet;
  if (monthly !== wallet.monthlyCreditsRemaining || balance !== wallet.balance) {
    // Compare-and-set on both wallet buckets: a concurrent writer that slipped past the row lock loses loudly.
    const debited = await tx.update(tokenBalances).set({ monthlyCreditsRemaining: monthly, balance }).where(and(eq(tokenBalances.id, wallet.id), eq(tokenBalances.monthlyCreditsRemaining, wallet.monthlyCreditsRemaining), eq(tokenBalances.balance, wallet.balance)));
    if (Number(debited[0]?.affectedRows ?? 0) !== 1) throw new CreditSpendConflictError();
    next = { ...wallet, monthlyCreditsRemaining: monthly, balance };
  }
  for (const row of rows) await writeLedgerRow(tx, row.source === BUCKET_SOURCES.cycle || row.source === BUCKET_SOURCES.purchased ? { ...row, balanceAfter: balance, monthlyCreditsAfter: monthly } : row);
  return { wallet: next, grants, promoRemaining, allocations };
}

/** True when the spend with this key already happened (its first ledger row exists). */
export async function spendAlreadyRecordedTx(tx: LedgerTx, userId: number, role: WalletRole, idempotencyKey: string): Promise<boolean> {
  const rows = await tx.select({ id: tokenTransactions.id }).from(tokenTransactions).where(and(eq(tokenTransactions.userId, userId), eq(tokenTransactions.role, role), eq(tokenTransactions.idempotencyKey, `${idempotencyKey}#1`))).limit(1);
  return rows.length > 0;
}

/**
 * The reverse trial's credits: 5, ending with the trial, once per canonical
 * person across every alias (or per account for a person-less legacy account).
 * The grant key is the claim; a second start finds it and grants nothing.
 */
export async function grantTrialCreditsTx(tx: LedgerTx, input: { userId: number; canonicalPersonId: number | null; now: Date; endsAt: Date }): Promise<{ granted: boolean; grantId: number | null }> {
  const grantKey = input.canonicalPersonId ? `trial:person:${input.canonicalPersonId}` : `trial:user:${input.userId}`;
  let grantId: number;
  try {
    const inserted = await tx.insert(planCreditGrants).values({ userId: input.userId, role: "job_seeker", source: "trial", grantKey, planId: REVERSE_TRIAL.plan, tokenCount: REVERSE_TRIAL.credits, creditsRemaining: REVERSE_TRIAL.credits, status: "active", grantedAt: input.now, expiresAt: input.endsAt });
    grantId = Number(inserted[0].insertId);
  } catch (error) {
    if (isDuplicateKey(error)) return { granted: false, grantId: null };
    throw error;
  }
  await writeLedgerRow(tx, { userId: input.userId, role: "job_seeker", tokenCount: REVERSE_TRIAL.credits, kind: "trial_grant", source: BUCKET_SOURCES.trial, referenceType: "credit_grant", referenceId: String(grantId), idempotencyKey: `trial:${grantId}`, creditGrantId: grantId });
  return { granted: true, grantId };
}

/** The ledger block for a reconciled wallet: buckets, cycle usage and expiries. */
export async function creditsLedgerTx(tx: LedgerTx, input: { wallet: WalletRow; grants: GrantRow[]; promo: PromoBucket | null; now: Date }): Promise<CreditsLedger> {
  const { wallet } = input;
  const cycleRows = await tx.select({ kind: tokenTransactions.kind, tokenCount: tokenTransactions.tokenCount }).from(tokenTransactions).where(and(eq(tokenTransactions.userId, wallet.userId), eq(tokenTransactions.role, wallet.role), eq(tokenTransactions.sourceCycleKey, wallet.monthlyCycleKey)));
  return buildCreditsLedger({ wallet, rules: cycleRulesFor(wallet.plan, wallet.role), grants: input.grants.map(asLedgerGrant), promo: input.promo, usedThisCycle: usedInCycle(cycleRows), now: input.now });
}

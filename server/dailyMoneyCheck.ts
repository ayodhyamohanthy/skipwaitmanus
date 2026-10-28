import { sendTransactionalEmail } from "./emailDelivery";
// Scheduled job "daily-money-check" (D-065, the payments bar under D-058).
//
// Once a day this reads the money tables and emails the owner anything that
// does not reconcile: every wallet against its ledger rows (the same bucket
// rules as the admin audit, but all wallets, not the 200 latest), one
// purchase credit per credited payment, payments parked for review, refunds
// no payment explains, checkouts still pending after a day, any wallet still
// marked with a retired Pro/Max plan and an active term (D-067: each one is a
// missed normalization to Free), asks still allocated to a referrer more
// than a day past their shelf life (a stuck ask-expiry sweep,
// P0-allocated-ask-stuck), a D-034/D-047 delivery spend still sitting on an ask
// that waits for coverage (its flip to visible was lost), and one spend
// reversed by two ledger rows (the reversal unique index broken). It never
// writes to a wallet, payment, ledger or ask
// row; the only writes are the job's own run record (the runner) and one
// operational-activity row when an alert email goes out. The email carries
// ids, amounts, currencies and reasons — never names, emails, or request content.
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { PENDING_MAX_AGE_MS } from "./chargebeePendingReconcile";
import { askCosts, operationalActivityLogs, paymentFulfillments, referralAvailabilitySlots, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { ASK_TTL_MS, COVERAGE_WAIT_MS, getAskShelfLifeEndsAtMs, referredDueAtMs, referredExtensionOperationKey } from "../shared/referral";
import { getDb, getFullCreditLedgerAudit, recordOperationalActivity } from "./db";
import { ABANDONED_CHECKOUT_REASON } from "./abandonedCheckouts";
import { ASK_DELIVERY_KEY_PREFIX } from "./coverageDelivery";
import { HELD_ASK_HISTORY_SINCE } from "./heldAsk";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

/** A checkout still pending after this is stale enough to list (D-065: "checkouts older than a day"). */
export const STALE_CHECKOUT_AGE_MS = 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
/** The hourly ask-expiry sweep has had a full day to close an ask past its shelf life; later than this it is stuck. */
export const ALLOCATED_ASK_GRACE_MS = 24 * 60 * 60_000;
export const MONEY_CHECK_BATCH = 200;
/**
 * D-065-C: a ledger spend is stored as `${referenceId}#${n}`, one row per bucket drawn, and the
 * refund path (refundLedgerSpendTx) reads at most this many rows per effect. The delivery lookup
 * uses the same bound, so a spend it can see and a spend the refund path can reverse are the same set.
 */
export const DELIVERY_SPEND_REFERENCE_BOUND = 32; // a checked limit shared with the refund path, not proof every spend fits it; an ask drawn from more buckets needs it raised in both places
/** Each check lists at most this many examples; the counts stay complete. */
export const FINDINGS_PREVIEW_LIMIT = 50;
/** The most finding lines one email carries; the subject keeps the full count. */
export const FINDINGS_EMAIL_LINE_LIMIT = 60;
const MONEY_CHECK_RECIPIENT = "ayodhya@skipwait.me";

export type WalletAuditResult = { checkedWallets: number; mismatches: Array<Record<string, unknown>>; integrity: Array<Record<string, unknown>> };
export type CreditedPaymentRow = { id: number; userId: number; role: string; tokenCount: number };
export type PaymentCreditCount = { paymentId: number; creditRows: number; creditedTokens: number };
export type ParkedPaymentRow = { id: number; amount: number; currency: string; reconciliationReason: string | null; createdAt: Date };
export type UnmatchedRefundRow = { logId: number; resourceId: string | null; createdAt: Date };
export type StaleCheckoutRow = { id: number; amount: number; currency: string; createdAt: Date };
/** A pending ask holding an allocated availability slot, with its window fields and its latest claim and slot release. */
export type AllocatedAskRow = { id: number; createdAt: Date; coverageVisibleAt: Date | null; waitingForCoverage: boolean; latestClaimAt: Date | null; latestReleaseAt: Date | null };
/** SQL pre-filter cutoffs: each window's end plus the grace, computed from the job's clock. */
export type AllocatedAskCutoffs = { visibleBefore: Date; waitingBefore: Date };
export type LegacyPlanWalletRow = { id: number; role: string; plan: string; termEnd: Date | null };
/** A D-034/D-047 delivery spend (ask-delivery:<id>) whose ask still waits for coverage. */
export type AskSpentWhileWaitingRow = { transactionId: number; requestId: number };
export type AskCostMismatchRow = { requestId: number; storedCost: number; spent: number };
/** One spend that two or more ledger rows reverse; the unique index should make this impossible. */
export type DoublyReversedSpendRow = { reversesTransactionId: number; reversalRows: number; ledgerRowIds: number[] };
/** D-038-A: a withdrawal or expiry refund whose ask had already been picked up by a claim. */
export type RefundAfterPickupRow = { transactionId: number; requestId: number; kind: string; createdAt: Date | null };
/** D-038-B: an approved ask still holding a referrer more than a day past its Referred deadline. */
export type ReferredDeadlineStuckRow = { id: number; referrerId: number; dueAt: Date };

export type DailyMoneyCheckDeps = {
  auditWallets: () => Promise<WalletAuditResult>;
  listCreditedPayments: (afterId: number, limit: number) => Promise<CreditedPaymentRow[]>;
  countPaymentCreditRows: (paymentIds: number[]) => Promise<PaymentCreditCount[]>;
  listParkedPayments: (limit: number) => Promise<ParkedPaymentRow[]>;
  listUnmatchedRefunds: (limit: number) => Promise<UnmatchedRefundRow[]>;
  listStaleCheckouts: (olderThan: Date, limit: number, newerThan?: Date) => Promise<StaleCheckoutRow[]>;
  listAllocatedAsks: (cutoffs: AllocatedAskCutoffs, afterId: number, limit: number) => Promise<AllocatedAskRow[]>;
  listLegacyPlanWallets: (now: Date, limit: number) => Promise<LegacyPlanWalletRow[]>;
  listAskDeliverySpendsWhileWaiting: (limit: number) => Promise<AskSpentWhileWaitingRow[]>;
  listDoublyReversedSpends: (limit: number) => Promise<DoublyReversedSpendRow[]>;
  listAskCostMismatches: (limit: number) => Promise<AskCostMismatchRow[]>;
  summarizeStaleCheckouts: (olderThan: Date, newerThan?: Date) => Promise<StaleCheckoutSummary>;
  listRefundsAfterPickup: (limit: number) => Promise<RefundAfterPickupRow[]>;
  listReferredPastDeadline: (nowMs: number, limit: number) => Promise<ReferredDeadlineStuckRow[]>;
  sendEmail: (input: { subject: string; text: string }) => Promise<boolean>;
  recordActivity: typeof recordOperationalActivity;
};

async function listCreditedPayments(afterId: number, limit: number): Promise<CreditedPaymentRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: paymentFulfillments.id, userId: paymentFulfillments.userId, role: paymentFulfillments.role, tokenCount: paymentFulfillments.tokenCount })
    .from(paymentFulfillments)
    .where(and(eq(paymentFulfillments.status, "credited"), gt(paymentFulfillments.id, afterId)))
    .orderBy(asc(paymentFulfillments.id)).limit(limit);
}

async function countPaymentCreditRows(paymentIds: number[]): Promise<PaymentCreditCount[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  if (paymentIds.length === 0) return [];
  const rows = await db.select({ referenceId: tokenTransactions.referenceId, creditRows: count(), creditedTokens: sql<string>`COALESCE(SUM(${tokenTransactions.tokenCount}), 0)` })
    .from(tokenTransactions)
    .where(and(eq(tokenTransactions.referenceType, "payment_fulfillment"), eq(tokenTransactions.kind, "purchase"), inArray(tokenTransactions.referenceId, paymentIds.map(String))))
    .groupBy(tokenTransactions.referenceId);
  return rows.map(row => ({ paymentId: Number(row.referenceId), creditRows: Number(row.creditRows), creditedTokens: Number(row.creditedTokens) }));
}

export async function listParkedPayments(limit: number): Promise<ParkedPaymentRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: paymentFulfillments.id, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, reconciliationReason: paymentFulfillments.reconciliationReason, createdAt: paymentFulfillments.createdAt })
    .from(paymentFulfillments).where(eq(paymentFulfillments.status, "requires_review"))
    .orderBy(asc(paymentFulfillments.id)).limit(limit);
}

async function listUnmatchedRefunds(limit: number): Promise<UnmatchedRefundRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  // A refund the webhook could not match to a payment never reaches Admin >
  // Payments requiring review, so it only exists as this log row; metadata
  // paymentId null is the unmatched marker (server/chargebeeRoutes.ts).
  const rows = await db.select({ id: operationalActivityLogs.id, resourceId: operationalActivityLogs.resourceId, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt })
    .from(operationalActivityLogs).where(eq(operationalActivityLogs.action, "billing.refund_needs_review"))
    .orderBy(asc(operationalActivityLogs.id)).limit(500);
  const unmatched: UnmatchedRefundRow[] = [];
  for (const row of rows) {
    let paymentId: unknown;
    try { paymentId = row.metadata ? (JSON.parse(row.metadata) as { paymentId?: unknown }).paymentId : null; } catch { paymentId = null; }
    if (paymentId === null || paymentId === undefined) unmatched.push({ logId: row.id, resourceId: row.resourceId ?? null, createdAt: row.createdAt });
    if (unmatched.length >= limit) break;
  }
  return unmatched;
}

export type StaleCheckoutSummary = { total: number; users: number; oldest: Date | null; newest: Date | null };

/** One line for every abandoned pending checkout: how many, how many accounts, and the date range. */
async function summarizeStaleCheckouts(olderThan: Date, newerThan?: Date): Promise<StaleCheckoutSummary> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  const [row] = await db.select({ total: count(), users: sql<number>`COUNT(DISTINCT ${paymentFulfillments.userId})`, oldest: sql<Date | null>`MIN(${paymentFulfillments.createdAt})`, newest: sql<Date | null>`MAX(${paymentFulfillments.createdAt})` })
    .from(paymentFulfillments).where(and(eq(paymentFulfillments.status, "pending"), lt(paymentFulfillments.createdAt, olderThan), ...(newerThan ? [gte(paymentFulfillments.createdAt, newerThan)] : []), or(isNull(paymentFulfillments.reconciliationReason), ne(paymentFulfillments.reconciliationReason, ABANDONED_CHECKOUT_REASON))));
  return { total: Number(row?.total ?? 0), users: Number(row?.users ?? 0), oldest: row?.oldest ? new Date(row.oldest) : null, newest: row?.newest ? new Date(row.newest) : null };
}

/** The oldest few in-window checkouts by id. `newerThan` keeps the sample inside the same 1-7 day window the
 * summary counts, so an aged-out row (its own line, unverified at the provider) is never named here. */
export async function listStaleCheckouts(olderThan: Date, limit: number, newerThan?: Date): Promise<StaleCheckoutRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: paymentFulfillments.id, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, createdAt: paymentFulfillments.createdAt })
    .from(paymentFulfillments).where(and(eq(paymentFulfillments.status, "pending"), lt(paymentFulfillments.createdAt, olderThan), ...(newerThan ? [gte(paymentFulfillments.createdAt, newerThan)] : []), or(isNull(paymentFulfillments.reconciliationReason), ne(paymentFulfillments.reconciliationReason, ABANDONED_CHECKOUT_REASON))))
    .orderBy(asc(paymentFulfillments.id)).limit(limit);
}

/**
 * Pending asks with an allocated slot whose window (getAskShelfLifeEndsAtMs: 7 days from first visibility,
 * creation without it, 90 days from creation while waiting) ended before the cutoffs, by id, one bounded
 * page after `afterId`. Claim events and slot releases come from two plain reads, so the job decides "never
 * claimed" in JS (release times are read too, for D-038's later "no claim since the latest release" rule): both
 * are written from the app clock by transitionReferralRequestTx and releaseAvailabilitySlotsTx, and neither is
 * compared with DB NOW().
 */
export async function listAllocatedPendingAsks(cutoffs: AllocatedAskCutoffs, afterId: number, limit: number): Promise<AllocatedAskRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  const asks = await db.select({ id: referralRequests.id, createdAt: referralRequests.createdAt, coverageVisibleAt: referralRequests.coverageVisibleAt, waitingForCoverage: referralRequests.waitingForCoverage })
    .from(referralRequests)
    .innerJoin(referralAvailabilitySlots, and(eq(referralAvailabilitySlots.referralRequestId, referralRequests.id), eq(referralAvailabilitySlots.status, "allocated")))
    .where(and(
      eq(referralRequests.status, "pending"), gt(referralRequests.id, afterId),
      or(
        and(eq(referralRequests.waitingForCoverage, true), lt(referralRequests.createdAt, cutoffs.waitingBefore)),
        and(eq(referralRequests.waitingForCoverage, false), or(
          and(isNotNull(referralRequests.coverageVisibleAt), lt(referralRequests.coverageVisibleAt, cutoffs.visibleBefore)),
          and(isNull(referralRequests.coverageVisibleAt), lt(referralRequests.createdAt, cutoffs.visibleBefore)),
        )),
      ),
    ))
    .orderBy(asc(referralRequests.id)).limit(limit);
  if (asks.length === 0) return [];
  const ids = asks.map(ask => ask.id);
  const claims = await db.select({ requestId: referralTransitionEvents.referralRequestId, at: referralTransitionEvents.createdAt })
    .from(referralTransitionEvents).where(and(inArray(referralTransitionEvents.referralRequestId, ids), eq(referralTransitionEvents.action, "claim")));
  const releases = await db.select({ requestId: referralAvailabilitySlots.referralRequestId, at: referralAvailabilitySlots.releasedAt })
    .from(referralAvailabilitySlots).where(and(inArray(referralAvailabilitySlots.referralRequestId, ids), eq(referralAvailabilitySlots.status, "released")));
  const latestOf = (rows: ReadonlyArray<{ requestId: number; at: Date | null }>) => {
    const latest = new Map<number, Date>();
    for (const row of rows) {
      const seen = latest.get(row.requestId);
      if (row.at && (!seen || row.at.getTime() > seen.getTime())) latest.set(row.requestId, row.at);
    }
    return latest;
  };
  const latestClaim = latestOf(claims);
  const latestRelease = latestOf(releases);
  return asks.map(ask => ({ ...ask, latestClaimAt: latestClaim.get(ask.id) ?? null, latestReleaseAt: latestRelease.get(ask.id) ?? null }));
}

/**
 * P0-allocated-ask-stuck: still allocated, never claimed, and its shelf life ended more
 * than ALLOCATED_ASK_GRACE_MS before `nowMs` (the app clock). The hourly sweep should have closed it with its
 * credit back. A claimed ask keeps its credit spent and never expires (D-021), so it is never a finding.
 */
export function isAllocatedAskPastWindow(ask: AllocatedAskRow, nowMs: number): boolean {
  // An assigned ask created before claims became recorded events keeps today's rules (it never expires), so the
  // sweep never closes it by design: flagging it would repeat the same line in every daily email (heldAsk.ts).
  if (!ask.waitingForCoverage && ask.createdAt.getTime() < HELD_ASK_HISTORY_SINCE.getTime()) return false;
  // Today's release rule (packet 4.1, heldForReferrerTx) is "no claim ever": an ask claimed once keeps its credit
  // spent and is never released, so it is never a finding. D-038 slice A moves the release rule and this check to
  // "no claim since the latest release" together (D-076 (1)); latestReleaseAt is kept for that.
  if (ask.latestClaimAt !== null) return false;
  const endsAt = getAskShelfLifeEndsAtMs(ask);
  return endsAt !== null && nowMs - endsAt > ALLOCATED_ASK_GRACE_MS;
}

/**
 * D-067: a wallet still marked pro or max reads as Free and is rolled to Free by the next read or the hourly
 * plan-credit-cycles job. One that still holds an active term was missed. The term end is compared with the
 * app clock (never MySQL NOW()); the plan values stay in the enum as storage-only.
 */
async function listLegacyPlanWallets(now: Date, limit: number): Promise<LegacyPlanWalletRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: tokenBalances.id, role: tokenBalances.role, plan: tokenBalances.plan, termEnd: tokenBalances.subscriptionCurrentTermEnd })
    .from(tokenBalances).where(and(inArray(tokenBalances.plan, ["pro", "max"]), gt(tokenBalances.subscriptionCurrentTermEnd, now)))
    .orderBy(asc(tokenBalances.id)).limit(limit);
}

/**
 * D-034/D-047: a waiting ask spends nothing, and its first-visibility spend (ask-delivery:<id>)
 * plus the flip to visible share one transaction. So a delivery spend whose ask still waits for
 * coverage is a lost flip. Pages the waiting asks — the only asks that can hold the fault — and
 * looks up their delivery spends; a legacy create charge uses another key and is never a finding.
 */
export async function listAskDeliverySpendsWhileWaiting(limit: number): Promise<AskSpentWhileWaitingRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  const found: AskSpentWhileWaitingRow[] = [];
  const seen = new Set<number>();
  let afterId = 0;
  for (;;) {
    const waiting = await db.select({ id: referralRequests.id }).from(referralRequests)
      .where(and(eq(referralRequests.waitingForCoverage, true), gt(referralRequests.id, afterId)))
      .orderBy(asc(referralRequests.id)).limit(MONEY_CHECK_BATCH);
    if (waiting.length === 0) break;
    const ids = waiting.map(row => row.id);
    const waitingIds = new Set(ids);
    // D-065-C: a ledger spend is written as `${referenceId}#${n}` (spendCreditsTx, one row per
    // bucket drawn), so the delivery spend is "<id>#1" and its key "ask-delivery:<id>#1". The old
    // lookup asked for the bare id, a shape production never writes, so this finding could never
    // fire. Same 32-row bound the refund path uses (refundLedgerSpendTx).
    const referenceKeys = ids.flatMap(id => Array.from({ length: DELIVERY_SPEND_REFERENCE_BOUND }, (_, n) => `${id}#${n + 1}`));
    // A delivery drawn from a promo bucket is kind "promo_spend" (spendCreditsTx), so both kinds count;
    // one finding per ask, even when the spend drew from several buckets.
    const spends = await db.select({ id: tokenTransactions.id, referenceId: tokenTransactions.referenceId, idempotencyKey: tokenTransactions.idempotencyKey })
      .from(tokenTransactions)
      .where(and(inArray(tokenTransactions.kind, ["credit_spend", "promo_spend"]), inArray(tokenTransactions.referenceId, referenceKeys)));
    for (const spend of spends) {
      if (found.length >= limit) return found;
      if (!(spend.idempotencyKey ?? "").startsWith(`${ASK_DELIVERY_KEY_PREFIX}:`)) continue;
      // The ask id is the part before the bucket suffix; anything else is not a delivery spend.
      const requestId = Number((spend.referenceId ?? "").split("#")[0]);
      if (!Number.isInteger(requestId) || !waitingIds.has(requestId) || seen.has(requestId)) continue;
      seen.add(requestId);
      found.push({ transactionId: spend.id, requestId });
    }
    const last = waiting[waiting.length - 1];
    if (!last || waiting.length < MONEY_CHECK_BATCH) break;
    afterId = last.id;
  }
  return found;
}

/**
 * D-132 audit item 6: an ask priced at creation (askCosts, written only while ASK_LEVEL_COST is on) must have
 * spent exactly that many credits once it has spent anything. Reads each stored cost and the ask's spend rows
 * (credit_spend and promo_spend; one row per bucket drawn) and lists any ask whose spend total differs. A waiting
 * or held ask has no spend rows yet and is never a finding; an ask with no stored cost is not checked.
 */
export async function listAskCostMismatches(limit: number): Promise<AskCostMismatchRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  const found: AskCostMismatchRow[] = [];
  let afterId = 0;
  for (;;) {
    const costs = await db.select({ id: askCosts.id, requestId: askCosts.referralRequestId, creditCost: askCosts.creditCost }).from(askCosts)
      .where(gt(askCosts.id, afterId)).orderBy(asc(askCosts.id)).limit(MONEY_CHECK_BATCH);
    if (costs.length === 0) break;
    const spends = await db.select({ referenceId: tokenTransactions.referenceId, tokenCount: tokenTransactions.tokenCount, kind: tokenTransactions.kind })
      .from(tokenTransactions)
      .where(and(inArray(tokenTransactions.kind, ["credit_spend", "promo_spend"]), inArray(tokenTransactions.referenceId, costs.map(row => String(row.requestId)))));
    const spentBy = new Map<number, number>();
    for (const spend of spends) {
      const requestId = Number(String(spend.referenceId ?? "").split("#")[0]);
      if (Number.isInteger(requestId)) spentBy.set(requestId, (spentBy.get(requestId) ?? 0) + Math.abs(Number(spend.tokenCount)));
    }
    for (const row of costs) {
      if (found.length >= limit) return found;
      const spent = spentBy.get(row.requestId);
      if (spent !== undefined && spent !== row.creditCost) found.push({ requestId: row.requestId, storedCost: row.creditCost, spent });
    }
    const last = costs[costs.length - 1];
    if (!last || costs.length < MONEY_CHECK_BATCH) break;
    afterId = last.id;
  }
  return found;
}

/**
 * One reversal row per spend is the ledger's contract (unique index
 * token_transactions_reversal_unique; MySQL allows many NULLs, not two ids). This proves it holds:
 * pages the distinct reversal targets by id and lists any target with more than one row.
 */
export async function listDoublyReversedSpends(limit: number): Promise<DoublyReversedSpendRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  const found: DoublyReversedSpendRow[] = [];
  let afterId = 0;
  for (;;) {
    const groups = await db.select({ reversesTransactionId: tokenTransactions.reversesTransactionId, reversalRows: count() })
      .from(tokenTransactions)
      .where(and(isNotNull(tokenTransactions.reversesTransactionId), gt(tokenTransactions.reversesTransactionId, afterId)))
      .groupBy(tokenTransactions.reversesTransactionId)
      .orderBy(asc(tokenTransactions.reversesTransactionId)).limit(MONEY_CHECK_BATCH);
    const doubled = groups.filter(group => Number(group.reversalRows) > 1);
    if (doubled.length > 0) {
      const targets = doubled.map(group => group.reversesTransactionId).filter((id): id is number => id !== null);
      const rows = await db.select({ id: tokenTransactions.id, reversesTransactionId: tokenTransactions.reversesTransactionId })
        .from(tokenTransactions).where(inArray(tokenTransactions.reversesTransactionId, targets)).orderBy(asc(tokenTransactions.id));
      for (const group of doubled) {
        if (found.length >= limit) return found;
        if (group.reversesTransactionId === null) continue;
        found.push({ reversesTransactionId: group.reversesTransactionId, reversalRows: Number(group.reversalRows), ledgerRowIds: rows.filter(row => row.reversesTransactionId === group.reversesTransactionId).map(row => row.id) });
      }
    }
    const last = groups[groups.length - 1];
    if (!last) break;
    const next = last.reversesTransactionId;
    if (groups.length < MONEY_CHECK_BATCH || next === null || next <= afterId) break;
    afterId = next;
  }
  return found;
}

/**
 * D-038-A: a refund whose ask had already been picked up. Once a referrer claimed the ask the
 * credit stays spent (D-034, D-076 (1)), so a withdrawal_refund or expiry_refund row whose ask's
 * latest pickup-or-release event before the refund was a claim is a money leak, not a refund.
 * Read-only and bounded: the newest `limit * 4` refund rows are examined, `limit` findings returned.
 */
export async function listRefundsAfterPickup(limit: number): Promise<RefundAfterPickupRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  const refunds = await db.select({ id: tokenTransactions.id, kind: tokenTransactions.kind, referenceId: tokenTransactions.referenceId, createdAt: tokenTransactions.createdAt })
    .from(tokenTransactions)
    .where(and(eq(tokenTransactions.referenceType, "referral_request"), inArray(tokenTransactions.kind, ["withdrawal_refund", "expiry_refund"])))
    .orderBy(desc(tokenTransactions.id)).limit(limit * 4);
  const found: RefundAfterPickupRow[] = [];
  for (const refund of refunds) {
    const requestId = Number(String(refund.referenceId ?? "").split("#")[0]);
    if (!Number.isInteger(requestId) || requestId <= 0) continue;
    const events = await db.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action }).from(referralTransitionEvents)
      .where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, ["claim", "claim_lapse", "referred_lapse", "step_back"]), refund.createdAt ? lte(referralTransitionEvents.createdAt, refund.createdAt) : undefined));
    let latest: { id: number; action: string } | null = null;
    for (const event of events) if (latest === null || Number(event.id) > Number(latest.id)) latest = event;
    if (latest?.action !== "claim") continue;
    found.push({ transactionId: refund.id, requestId, kind: refund.kind, createdAt: refund.createdAt ?? null });
    if (found.length >= limit) break;
  }
  return found;
}

/**
 * D-038-B: an approved ask more than a day past its Referred deadline. The `referral-timers` job should
 * have reopened it to colleagues with the credit released; if it is still approved, that release is
 * overdue and the referrer still holds the seeker's name and files. Read-only, bounded.
 */
export async function listReferredPastDeadline(nowMs: number, limit: number): Promise<ReferredDeadlineStuckRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  const asks = await db.select({ id: referralRequests.id, referrerId: referralRequests.referrerId }).from(referralRequests)
    .where(and(eq(referralRequests.status, "approved"), isNotNull(referralRequests.referrerId))).limit(MONEY_CHECK_BATCH);
  const found: ReferredDeadlineStuckRow[] = [];
  for (const ask of asks) {
    if (!ask.referrerId) continue;
    const events = await db.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, operationKey: referralTransitionEvents.operationKey, createdAt: referralTransitionEvents.createdAt, resultingStatus: referralTransitionEvents.resultingStatus })
      .from(referralTransitionEvents)
      .where(and(eq(referralTransitionEvents.referralRequestId, ask.id), inArray(referralTransitionEvents.action, ["approve", "review", "referred_lapse", "step_back", "referred_extension"])));
    let latestAcceptance: { id: number; action: string; createdAt: Date | string; resultingStatus: string | null } | null = null;
    for (const event of events) {
      if (event.action === "referred_extension") continue;
      if (latestAcceptance === null || Number(event.id) > latestAcceptance.id) latestAcceptance = { id: Number(event.id), action: event.action, createdAt: event.createdAt, resultingStatus: event.resultingStatus ?? null };
    }
    if (latestAcceptance === null || latestAcceptance.resultingStatus !== "approved") continue;
    // D-038-reconcile B-1: only the latest acceptance's own extension moves its deadline.
    const acceptance = latestAcceptance;
    const extended = events.some(event => event.action === "referred_extension" && event.operationKey === referredExtensionOperationKey(acceptance.id));
    const acceptedAtMs = latestAcceptance.createdAt instanceof Date ? latestAcceptance.createdAt.getTime() : Date.parse(String(latestAcceptance.createdAt));
    if (!Number.isFinite(acceptedAtMs)) continue;
    const dueAt = referredDueAtMs(acceptedAtMs, extended);
    if (nowMs - dueAt > ALLOCATED_ASK_GRACE_MS) found.push({ id: ask.id, referrerId: ask.referrerId, dueAt: new Date(dueAt) });
    if (found.length >= limit) break;
  }
  return found;
}

async function sendMoneyCheckEmail(input: { subject: string; text: string }): Promise<boolean> {
  try {
    const delivery = await sendTransactionalEmail({ to: MONEY_CHECK_RECIPIENT, subject: input.subject, text: input.text });
    try { await sendTransactionalEmail({ to: "ayodhya@mail.instinct.com", subject: input.subject, text: input.text }); } catch { /* copy is best effort */ }
    if (!delivery.sent) throw new Error(delivery.reason === "not_configured" ? "Money check email delivery is not configured" : "Money check email delivery failed");
    return true;
  } catch (error) {
    console.warn("[DailyMoneyCheck] Unable to send the owner email", error instanceof Error ? error.message : error);
    return false;
  }
}

const defaultMoneyCheckDeps: DailyMoneyCheckDeps = {
  auditWallets: getFullCreditLedgerAudit,
  listCreditedPayments,
  countPaymentCreditRows,
  listParkedPayments,
  listUnmatchedRefunds,
  listStaleCheckouts,
  listAllocatedAsks: listAllocatedPendingAsks,
  listLegacyPlanWallets,
  listAskDeliverySpendsWhileWaiting,
  listDoublyReversedSpends,
  listAskCostMismatches,
  summarizeStaleCheckouts,
  listRefundsAfterPickup,
  listReferredPastDeadline,
  sendEmail: sendMoneyCheckEmail,
  recordActivity: recordOperationalActivity,
};

export function createDailyMoneyCheck(deps: DailyMoneyCheckDeps = defaultMoneyCheckDeps) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const findings: string[] = [];

    const audit = await deps.auditWallets();
    for (const mismatch of audit.mismatches) findings.push(`wallet mismatch: ${JSON.stringify(mismatch)}`);
    for (const item of audit.integrity) findings.push(`wallet integrity: ${JSON.stringify(item)}`);

    // One purchase credit per payment: a credited payment holds exactly one
    // purchase ledger row for its token count (unique idempotency keys refuse
    // a second; a missing or short row means the buyer paid for credits they
    // do not have).
    let afterId = 0;
    let checkedPayments = 0;
    for (;;) {
      const payments = await deps.listCreditedPayments(afterId, MONEY_CHECK_BATCH);
      if (payments.length === 0) break;
      const counts = new Map((await deps.countPaymentCreditRows(payments.map(row => row.id))).map(row => [row.paymentId, row]));
      for (const payment of payments) {
        const credit = counts.get(payment.id);
        if (!credit || credit.creditRows !== 1 || credit.creditedTokens !== payment.tokenCount) {
          findings.push(`payment credit mismatch: payment #${payment.id} expects one purchase row for ${payment.tokenCount} credits, found ${credit?.creditRows ?? 0} row(s) totaling ${credit?.creditedTokens ?? 0}`);
        }
      }
      checkedPayments += payments.length;
      afterId = payments[payments.length - 1]!.id;
      if (payments.length < MONEY_CHECK_BATCH) break;
    }

    const parked = await deps.listParkedPayments(FINDINGS_PREVIEW_LIMIT);
    for (const payment of parked) findings.push(`parked payment: #${payment.id} ${payment.amount} ${payment.currency} (${payment.reconciliationReason ?? "no reason recorded"}, since ${payment.createdAt.toISOString()})`);

    const refunds = await deps.listUnmatchedRefunds(FINDINGS_PREVIEW_LIMIT);
    for (const refund of refunds) findings.push(`unmatched refund: log #${refund.logId} (${refund.resourceId ?? "no invoice id"}, ${refund.createdAt.toISOString()})`);

    // One summary line, not one line per checkout: abandoned checkout pages are common, no money moved, and a long list
    // buried the real findings. The oldest few ids are named so someone can look them up.
    const staleCutoff = new Date(nowMs - STALE_CHECKOUT_AGE_MS);
    // Rows older than the reconcile window (PENDING_MAX_AGE_MS) are no longer rechecked against Chargebee: they get their own
    // line, worded as unverified, never as "never paid" (nobody has asked the provider).
    const agedOutCutoff = new Date(nowMs - PENDING_MAX_AGE_MS);
    const staleSummary = await deps.summarizeStaleCheckouts(staleCutoff, agedOutCutoff);
    if (staleSummary.total > 0) {
      const sample = await deps.listStaleCheckouts(staleCutoff, 3, agedOutCutoff);
      findings.push(`stale checkouts: ${staleSummary.total} unpaid checkout page(s) from ${staleSummary.users} account(s) still pending after a day, oldest ${staleSummary.oldest?.toISOString() ?? "unknown"}, newest ${staleSummary.newest?.toISOString() ?? "unknown"}; none credited, no money moved (oldest ids: ${sample.map(row => `#${row.id}`).join(", ")})`);
    }

    const agedOut = await deps.summarizeStaleCheckouts(agedOutCutoff);
    if (agedOut.total > 0) {
      findings.push(`aged-out checkouts: ${agedOut.total} checkout page(s) from ${agedOut.users} account(s) are older than ${PENDING_MAX_AGE_MS / DAY_MS} days, aged out of reconciliation (no longer rechecked); payment status at the provider is unverified, oldest ${agedOut.oldest?.toISOString() ?? "unknown"}, newest ${agedOut.newest?.toISOString() ?? "unknown"}; none credited by us`);
    }

    // P0-allocated-ask-stuck: paged by id until a short batch, so claimed asks (which keep their slot and
    // never expire) can never fill a page and hide a stuck one; at most FINDINGS_PREVIEW_LIMIT are listed.
    const cutoffs: AllocatedAskCutoffs = { visibleBefore: new Date(nowMs - ASK_TTL_MS - ALLOCATED_ASK_GRACE_MS), waitingBefore: new Date(nowMs - COVERAGE_WAIT_MS - ALLOCATED_ASK_GRACE_MS) };
    const stuckAsks = new Set<number>();
    let askAfterId = 0;
    while (stuckAsks.size < FINDINGS_PREVIEW_LIMIT) {
      const asks = await deps.listAllocatedAsks(cutoffs, askAfterId, MONEY_CHECK_BATCH);
      for (const ask of asks) {
        if (stuckAsks.size >= FINDINGS_PREVIEW_LIMIT || stuckAsks.has(ask.id) || !isAllocatedAskPastWindow(ask, nowMs)) continue;
        stuckAsks.add(ask.id);
        findings.push(`allocated_ask_past_window: ask #${ask.id} is still allocated and was never claimed, more than a day past its shelf life (the ask-expiry sweep has not closed it)`);
      }
      const last = asks[asks.length - 1];
      if (!last || asks.length < MONEY_CHECK_BATCH) break;
      askAfterId = last.id;
    }

    const legacy = await deps.listLegacyPlanWallets(new Date(nowMs), FINDINGS_PREVIEW_LIMIT);
    for (const wallet of legacy) findings.push(`legacy plan wallet: wallet #${wallet.id} (${wallet.role}, ${wallet.plan}) still holds an active term until ${wallet.termEnd?.toISOString() ?? "an unknown date"}`);

    // D-065-B (D-034/D-047): the delivery spend and the flip to visible are one transaction, so a spend still
    // sitting on a waiting ask means the flip was lost. D-065-B: one reversal row per spend is the unique
    // index's promise, so a second row reversing the same spend is a fault.
    const waitingSpends = await deps.listAskDeliverySpendsWhileWaiting(FINDINGS_PREVIEW_LIMIT);
    for (const row of waitingSpends) findings.push(`ask_spent_while_waiting: ask #${row.requestId} still waits for coverage, but ledger row #${row.transactionId} spent a credit for it`);

    // D-132 audit item 6: credits spent must equal the cost stored when the ask was created.
    const costMismatches = await deps.listAskCostMismatches(FINDINGS_PREVIEW_LIMIT);
    for (const row of costMismatches) findings.push(`ask_cost_mismatch: ask #${row.requestId} was priced at ${row.storedCost} credits when it was created, but ${row.spent} were spent`);

    const doubleReversals = await deps.listDoublyReversedSpends(FINDINGS_PREVIEW_LIMIT);
    for (const row of doubleReversals) findings.push(`spend_reversed_twice: transaction #${row.reversesTransactionId} is reversed by ${row.reversalRows} rows (ledger rows ${row.ledgerRowIds.map(id => `#${id}`).join(", ")})`);

    // D-038-A: once a referrer claimed the ask the credit stays spent, so a refund after a pickup is a leak.
    const refundsAfterPickup = await deps.listRefundsAfterPickup(FINDINGS_PREVIEW_LIMIT);
    for (const row of refundsAfterPickup) findings.push(`refund_after_pickup: ledger row #${row.transactionId} returned a credit for ask #${row.requestId} (${row.kind}) although the ask's latest pickup was a claim`);

    // D-038-B: an accepted ask nobody marked Referred should have reopened a day ago, with the credit released.
    const referredStuck = await deps.listReferredPastDeadline(nowMs, FINDINGS_PREVIEW_LIMIT);
    for (const row of referredStuck) findings.push(`referred_deadline_stuck: ask #${row.id} is still approved more than a day past its Referred deadline (${row.dueAt.toISOString()}); the referral-timers job has not reopened it`);

    const output: JobRunOutput = { processed: audit.checkedWallets + checkedPayments, failed: 0 };
    if (findings.length === 0) return output;

    const subject = `skipwait.me daily money check · ${findings.length} finding${findings.length === 1 ? "" : "s"}`;
    const shown = findings.slice(0, FINDINGS_EMAIL_LINE_LIMIT);
    const text = [
      "The daily read-only money check found entries that do not reconcile. Nothing was written; each line needs a human look.",
      "",
      `Wallets checked: ${audit.checkedWallets}. Credited payments checked: ${checkedPayments}.`,
      "",
      ...shown,
      ...(findings.length > shown.length ? [`...and ${findings.length - shown.length} more finding(s) not shown here.`] : []),
      "",
      "Only ids, amounts, currencies and reasons are listed — no names, emails, or request content.",
    ].join("\n");
    const sent = await deps.sendEmail({ subject, text });
    await deps.recordActivity({ action: "billing.daily_money_check_alert", outcome: sent ? "success" : "failure", resourceType: "scheduled_job", resourceId: "daily-money-check", metadata: { findings: findings.length, checkedWallets: audit.checkedWallets, checkedPayments } }).catch(() => undefined);
    if (!sent) {
      // Fail the window so it is retried and reaches Sentry: a money mismatch
      // the owner never hears about is worse than a noisy retry.
      output.failed = 1;
      output.firstError = new Error(`The daily money check found ${findings.length} finding(s) but the owner email could not be sent`);
    }
    return output;
  };
}

export type MoneyCheckRunResult = { emailSent: boolean; findingsEmailed: boolean; subject: string | null; text: string | null };

/**
 * One on-demand run of the same read-only audit the daily job uses. It never
 * touches the job window or any money row. It returns the exact owner-email
 * text so an admin can read the findings even when delivery is down, and it
 * sends that same owner email through the normal adapter.
 */
export async function runMoneyCheckNow(nowMs: number, deps: DailyMoneyCheckDeps = defaultMoneyCheckDeps): Promise<MoneyCheckRunResult> {
  let captured: { subject: string; text: string } | null = null;
  let delivered = false;
  const run = createDailyMoneyCheck({
    ...deps,
    sendEmail: async input => {
      captured = input;
      delivered = await deps.sendEmail(input);
      return delivered;
    },
  });
  await run({ nowMs, windowKey: "manual" });
  const sent = captured as { subject: string; text: string } | null;
  return { emailSent: delivered, findingsEmailed: sent !== null, subject: sent?.subject ?? null, text: sent?.text ?? null };
}

/** The same audit with no email: findings text only (used by admin Skippie). */
export async function readMoneyCheckFindings(nowMs: number): Promise<{ findingsFound: boolean; subject: string | null; text: string | null }> {
  const result = await runMoneyCheckNow(nowMs, { ...defaultMoneyCheckDeps, sendEmail: async () => false });
  return { findingsFound: result.findingsEmailed, subject: result.subject, text: result.text };
}

// D-050: a personal-link ask (D-017) is created already assigned to the
// employee whose link the seeker used. Until that employee acts on it, the ask
// is "held" for them and counts as unclaimed: the seeker can withdraw it with
// the credit back, and the 7-day expiry returns the credit, exactly like an
// ask with no referrer. Each way of acting ends the hold:
//   - a claim records a "claim" transition event (every claim since 0058);
//   - an accept (one-click or review) moves the status out of "pending";
//   - a pass clears referrerId, reopening the ask to the company (D-021).
// A queue allocation (openCompanyReferralAvailability) also assigns an ask with
// no event; its "allocated" slot keeps that ask out of D-050.
//
// No db.ts import, so db.ts can use these inside its transactions without an
// import cycle (the planGates.ts pattern).
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, type SQL } from "drizzle-orm";
import { operationalActivityLogs, referralAvailabilitySlots, referralRequests, referralTransitionEvents } from "../drizzle/schema";
import type { LedgerTx } from "./creditLedger";

/**
 * Claims became recorded transition events with migration 0058 (commit
 * 2e5025be, deployed Sept 18-19 2026); before it a claim only set referrerId.
 * An assigned ask created earlier may be a claim nobody recorded, so it keeps
 * today's rules (no withdrawal, no expiry) and an operator resolves it.
 */
export const HELD_ASK_HISTORY_SINCE = new Date("2026-09-21T00:00:00.000Z");
/** One seeker's read closes at most this many stale held asks; the next read or the hourly sweep closes the rest. */
export const HELD_ASK_RECONCILE_LIMIT = 100;

/** The row half of the held rule. The history half needs the claim and allocation reads below. */
export type HeldCandidate = { readonly status: string; readonly referrerId: number | null; readonly createdAt: Date };
export function isHeldCandidate<T extends HeldCandidate>(row: T): row is T & { readonly referrerId: number } {
  return row.status === "pending" && row.referrerId !== null && row.createdAt.getTime() >= HELD_ASK_HISTORY_SINCE.getTime();
}

/** Caller holds the request row lock; the locking read sees an allocation committed before that lock. */
export async function readQueueAllocationTx(tx: Pick<LedgerTx, "select">, requestId: number): Promise<boolean> {
  const allocated = await tx.select({ id: referralAvailabilitySlots.id }).from(referralAvailabilitySlots)
    .where(and(eq(referralAvailabilitySlots.referralRequestId, requestId), eq(referralAvailabilitySlots.status, "allocated")))
    .limit(1).for("update");
  return allocated.length > 0;
}

export type StaleHeldAsk = { id: number; jobSeekerId: number; createdAt: Date };

/**
 * Held asks created before `cutoff`, oldest first. One anti-join, so claimed and allocated asks are
 * filtered out in SQL: they never fill a batch, and the sweep never locks or retries them. The
 * expiry re-decides each ask under its row lock before any money moves.
 */
export async function selectStaleHeldAsks(db: Pick<LedgerTx, "select">, input: { cutoff: Date; limit: number; jobSeekerId?: number }): Promise<StaleHeldAsk[]> {
  const conditions: SQL[] = [
    eq(referralRequests.status, "pending"), isNotNull(referralRequests.referrerId),
    lt(referralRequests.createdAt, input.cutoff), gte(referralRequests.createdAt, HELD_ASK_HISTORY_SINCE),
    isNull(referralTransitionEvents.id), isNull(referralAvailabilitySlots.id),
  ];
  if (input.jobSeekerId !== undefined) conditions.push(eq(referralRequests.jobSeekerId, input.jobSeekerId));
  return db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, createdAt: referralRequests.createdAt })
    .from(referralRequests)
    .leftJoin(referralTransitionEvents, and(eq(referralTransitionEvents.referralRequestId, referralRequests.id), eq(referralTransitionEvents.action, "claim")))
    .leftJoin(referralAvailabilitySlots, and(eq(referralAvailabilitySlots.referralRequestId, referralRequests.id), eq(referralAvailabilitySlots.status, "allocated")))
    .where(and(...conditions))
    .orderBy(asc(referralRequests.createdAt), asc(referralRequests.id))
    .limit(input.limit);
}

/**
 * The seeker list's held flag: which of `rows` are held for their referrer. Two plain reads and no
 * join, so the list's grouped attachment count is untouched. Read-only: withdraw and expiry
 * re-decide under the row lock.
 */
export async function listHeldForReferrerIds(db: Pick<LedgerTx, "select">, rows: ReadonlyArray<HeldCandidate & { readonly id: number }>): Promise<Set<number>> {
  const ids = rows.filter(row => isHeldCandidate(row)).map(row => row.id);
  if (!ids.length) return new Set();
  const claimed = await db.select({ id: referralTransitionEvents.referralRequestId }).from(referralTransitionEvents)
    .where(and(inArray(referralTransitionEvents.referralRequestId, ids), eq(referralTransitionEvents.action, "claim")));
  const allocated = await db.select({ id: referralAvailabilitySlots.referralRequestId }).from(referralAvailabilitySlots)
    .where(and(inArray(referralAvailabilitySlots.referralRequestId, ids), eq(referralAvailabilitySlots.status, "allocated")));
  const acted = new Set([...claimed, ...allocated].map(row => row.id));
  return new Set(ids.filter(id => !acted.has(id)));
}

/**
 * The D-050 audit row, written in the release transaction: the link owner the ask was held for
 * (the release clears referrerId), why it ended and whether a credit came back.
 */
export async function recordHeldAskReleaseTx(tx: Pick<LedgerTx, "insert">, input: { requestId: number; referrerId: number; reason: "withdrawn" | "expired"; creditReturned: boolean }): Promise<void> {
  await tx.insert(operationalActivityLogs).values({
    action: "personal_link_ask.released", outcome: "success", resourceType: "referral_request", resourceId: String(input.requestId),
    metadata: JSON.stringify({ reason: input.reason, creditReturned: input.creditReturned, referrerId: input.referrerId }),
  });
}

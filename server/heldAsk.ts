// An assigned ask nobody has picked up is an "unclaimed assignment", of two kinds:
//   - personal_link (D-050): a D-017 ask created already assigned to the
//     employee whose link the seeker used ("held" for them);
//   - queue_allocation (P0-allocated-ask-stuck): an ask assigned with an
//     "allocated" availability slot, by the D-034 coverage delivery or by
//     "Open referral capacity" (openCompanyReferralAvailability). An allocation
//     is not a pickup.
// Until the assigned employee acts, it counts as unclaimed: the seeker can
// withdraw it with the credit back, and the 7-day expiry returns the credit,
// exactly like an ask with no referrer. Each way of acting ends it:
//   - a claim records a "claim" transition event (every claim since 0058);
//   - an accept (one-click or review) moves the status out of "pending";
//   - a pass clears referrerId, reopening the ask to the company (D-021).
// Past its window (getAskShelfLifeEndsAtMs: 7 days from first visibility, or
// from creation for rows without coverageVisibleAt) it is a stale unclaimed ask
// on both sides: the seeker's withdraw/expiry return the credit, and the
// assigned employee can no longer claim it, it leaves their inbox and it stops
// taking one of the seeker's open slots.
//
// No db.ts import, so db.ts and planGates.ts can use these inside their queries
// and transactions without an import cycle (the planGates.ts pattern).
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { operationalActivityLogs, referralAvailabilitySlots, referralRequests, referralTransitionEvents } from "../drizzle/schema";
import { getAskExpiresAtMs, getAskShelfLifeEndsAtMs, type AskExpiryWindow } from "../shared/referral";
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

/** Which kind of unclaimed assignment an ask is: no allocated slot (a personal link) or an allocated slot. */
export type UnclaimedAssignmentKind = "personal_link" | "queue_allocation";

/** The row half of the unclaimed-assignment rule. The history half needs the claim and allocation reads below. */
export type HeldCandidate = { readonly status: string; readonly referrerId: number | null; readonly createdAt: Date };
export function isHeldCandidate<T extends HeldCandidate>(row: T): row is T & { readonly referrerId: number } {
  return row.status === "pending" && row.referrerId !== null && row.createdAt.getTime() >= HELD_ASK_HISTORY_SINCE.getTime();
}

/** Past the 7-day shelf life at `nowMs` (JS clock, never DB NOW()): the age half of isAskExpired, for asks the held rule may count as unclaimed. */
export function isPastAskShelfLife(createdAt: Date, nowMs: number): boolean {
  const expiresAt = getAskExpiresAtMs(createdAt);
  return expiresAt !== null && nowMs >= expiresAt;
}

/**
 * Past the ask's own window at `nowMs` (JS clock, never DB NOW()): getAskShelfLifeEndsAtMs, 7 days from first
 * visibility (coverageVisibleAt; rows without it: creation). Null deadline = not past (fail open: never strand).
 */
export function isPastAskWindow(row: { readonly createdAt: Date } & AskExpiryWindow, nowMs: number): boolean {
  const endsAt = getAskShelfLifeEndsAtMs(row);
  return endsAt !== null && nowMs >= endsAt;
}

/**
 * SQL for an assigned ask that is not an unclaimed assignment: its employee claimed it, or it predates recorded
 * claims. Correlated on referralRequests.id, so it belongs inside a query over referralRequests. The open-ask count
 * (planGates.openAskCondition) keeps these asks' slots however old they are; an unclaimed assignment of either kind
 * (an allocated slot is not a pickup) frees its slot when its window ends.
 */
export function assignedAskNotHeldCondition(): SQL {
  const condition = or(
    lt(referralRequests.createdAt, HELD_ASK_HISTORY_SINCE),
    sql`exists (select 1 from ${referralTransitionEvents} where ${referralTransitionEvents.referralRequestId} = ${referralRequests.id} and ${referralTransitionEvents.action} = ${"claim"})`,
  );
  if (!condition) throw new Error("Held-ask condition could not be built");
  return condition;
}

/** Caller holds the request row lock; the locking read sees an allocation committed before that lock. */
export async function readQueueAllocationTx(tx: Pick<LedgerTx, "select">, requestId: number): Promise<boolean> {
  const allocated = await tx.select({ id: referralAvailabilitySlots.id }).from(referralAvailabilitySlots)
    .where(and(eq(referralAvailabilitySlots.referralRequestId, requestId), eq(referralAvailabilitySlots.status, "allocated")))
    .limit(1).for("update");
  return allocated.length > 0;
}

export type StaleHeldAsk = { id: number; jobSeekerId: number; createdAt: Date };

/** The ask's window in SQL: first visibility before `visibleBefore`, or (no coverageVisibleAt) creation before `heldBefore`. */
function pastWindowCondition(input: { visibleBefore: Date; heldBefore: Date }): SQL {
  const condition = or(
    and(isNotNull(referralRequests.coverageVisibleAt), lt(referralRequests.coverageVisibleAt, input.visibleBefore)),
    and(isNull(referralRequests.coverageVisibleAt), lt(referralRequests.createdAt, input.heldBefore)),
  );
  if (!condition) throw new Error("Stale-window condition could not be built");
  return condition;
}

/**
 * Unclaimed assignments of either kind past their window, oldest first. One anti-join, so claimed asks
 * are filtered out in SQL: they never fill a batch, and the sweep never locks or retries them. The
 * expiry re-decides each ask under its row lock before any money moves.
 */
export async function selectStaleHeldAsks(db: Pick<LedgerTx, "select">, input: { visibleBefore: Date; heldBefore: Date; limit: number; jobSeekerId?: number }): Promise<StaleHeldAsk[]> {
  const conditions: SQL[] = [
    eq(referralRequests.status, "pending"), isNotNull(referralRequests.referrerId),
    pastWindowCondition(input), gte(referralRequests.createdAt, HELD_ASK_HISTORY_SINCE),
    isNull(referralTransitionEvents.id),
  ];
  if (input.jobSeekerId !== undefined) conditions.push(eq(referralRequests.jobSeekerId, input.jobSeekerId));
  return db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, createdAt: referralRequests.createdAt })
    .from(referralRequests)
    .leftJoin(referralTransitionEvents, and(eq(referralTransitionEvents.referralRequestId, referralRequests.id), eq(referralTransitionEvents.action, "claim")))
    .where(and(...conditions))
    .orderBy(asc(referralRequests.createdAt), asc(referralRequests.id))
    .limit(input.limit);
}

/** Which rows are unclaimed assignments, by kind. */
export type UnclaimedAssignments = { readonly personalLink: ReadonlySet<number>; readonly queueAllocation: ReadonlySet<number> };

/**
 * The seeker list's flags: which of `rows` are unclaimed assignments, split by kind (personal link:
 * no allocated slot; queue allocation: an allocated slot). Two plain reads and no join, so the
 * list's grouped attachment count is untouched. Read-only: withdraw and expiry re-decide under the
 * row lock.
 */
export async function listHeldForReferrerIds(db: Pick<LedgerTx, "select">, rows: ReadonlyArray<HeldCandidate & { readonly id: number }>): Promise<UnclaimedAssignments> {
  const ids = rows.filter(row => isHeldCandidate(row)).map(row => row.id);
  if (!ids.length) return { personalLink: new Set(), queueAllocation: new Set() };
  const claimed = await db.select({ id: referralTransitionEvents.referralRequestId }).from(referralTransitionEvents)
    .where(and(inArray(referralTransitionEvents.referralRequestId, ids), eq(referralTransitionEvents.action, "claim")));
  const allocated = await db.select({ id: referralAvailabilitySlots.referralRequestId }).from(referralAvailabilitySlots)
    .where(and(inArray(referralAvailabilitySlots.referralRequestId, ids), eq(referralAvailabilitySlots.status, "allocated")));
  const claimedIds = new Set(claimed.map(row => row.id));
  const allocatedIds = new Set(allocated.map(row => row.id));
  const unclaimed = ids.filter(id => !claimedIds.has(id));
  return { personalLink: new Set(unclaimed.filter(id => !allocatedIds.has(id))), queueAllocation: new Set(unclaimed.filter(id => allocatedIds.has(id))) };
}

/**
 * The assigned employee's inbox: which of the viewer's assigned rows are unclaimed assignments (either
 * kind) past their window. They leave the inbox like a stale unclaimed ask. Read-only: claim re-decides
 * under the row lock.
 */
export async function listStaleHeldForViewer(db: Pick<LedgerTx, "select">, rows: ReadonlyArray<HeldCandidate & AskExpiryWindow & { readonly id: number }>, viewerId: number, nowMs: number): Promise<Set<number>> {
  const stale = await listHeldForReferrerIds(db, rows.filter(row => row.referrerId === viewerId && isPastAskWindow(row, nowMs)));
  return new Set(rows.map(row => row.id).filter(id => stale.personalLink.has(id) || stale.queueAllocation.has(id)));
}

/**
 * The release audit row, written in the release transaction: the employee the ask was assigned to
 * (the release clears referrerId), why it ended and whether a credit came back. The action names
 * the kind: personal_link_ask.released (D-050) or queue_allocation.released.
 */
export async function recordHeldAskReleaseTx(tx: Pick<LedgerTx, "insert">, input: { requestId: number; referrerId: number; kind: UnclaimedAssignmentKind; reason: "withdrawn" | "expired"; creditReturned: boolean }): Promise<void> {
  await tx.insert(operationalActivityLogs).values({
    action: input.kind === "queue_allocation" ? "queue_allocation.released" : "personal_link_ask.released", outcome: "success", resourceType: "referral_request", resourceId: String(input.requestId),
    metadata: JSON.stringify({ reason: input.reason, creditReturned: input.creditReturned, referrerId: input.referrerId }),
  });
}

// Asks sent through a referrer's personal link (D-017: /fast/:code and
// /refer/:company/:alias).
//
// Creation assigns such an ask to the link owner (referralRequests.referrerId),
// so no colleague sees it, and writes a "link_assign" transition event as the
// durable marker. Until the link owner claims it ("claim" event) the ask is
// still unclaimed for every rule that protects the seeker:
// - it expires after ASK_TTL_DAYS and the reserved credit is refunded;
// - the seeker can withdraw it and get the credit back;
// - the link owner's pass releases it to colleagues at that company (as D-021
//   does for a claimed decline) instead of failing;
// - the seeker sees it as waiting, not "under review".
// Each of those paths clears referrerId when it releases the ask, so afterwards
// it is an ordinary company ask for every reader.
import { and, asc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { referralRequests, referralTransitionEvents } from "../drizzle/schema";

export const REFERRER_LINK_ASSIGN_ACTION = "link_assign";
const CLAIM_ACTION = "claim";

type Reader = Pick<MySql2Database<Record<string, never>>, "select">;
type ListedAsk = { readonly id: number; readonly status: string; readonly referrerId: number | null };

/**
 * The marker written with the ask, in the creation transaction. Revision 0 is
 * the ask as created (every real transition writes revision 1 or later), and
 * the actor is the seeker who chose the link.
 */
export function referrerLinkAssignEvent(requestId: number, seekerId: number): typeof referralTransitionEvents.$inferInsert {
  return { referralRequestId: requestId, operationKey: "link-assign", actorUserId: seekerId, action: REFERRER_LINK_ASSIGN_ACTION, fromStatus: "pending", resultingStatus: "pending", resultingRevision: 0 };
}

/** Sent through a personal link and not claimed by its owner yet. */
export function isAwaitingLinkReferrer(actions: readonly string[]): boolean {
  let assigned = false;
  let claimed = false;
  for (const action of actions) {
    if (action === REFERRER_LINK_ASSIGN_ACTION) assigned = true;
    else if (action === CLAIM_ACTION) claimed = true;
  }
  return assigned && !claimed;
}

/**
 * For one ask whose row the caller has locked FOR UPDATE. A plain read is
 * enough and avoids gap locks: every claim writes its event while holding that
 * same row lock, so a claim either committed before the caller's lock (and this
 * transaction's first consistent read, taken after the lock, sees it) or waits
 * for the caller to commit.
 */
export async function isAwaitingLinkReferrerTx(reader: Reader, requestId: number): Promise<boolean> {
  const events = await reader.select({ action: referralTransitionEvents.action }).from(referralTransitionEvents).where(eq(referralTransitionEvents.referralRequestId, requestId));
  return isAwaitingLinkReferrer(events.map(event => event.action));
}

/** The ids among these listed asks that are pending, assigned, and still waiting for their link owner. */
export async function awaitingLinkReferrerIds(reader: Reader, rows: readonly ListedAsk[]): Promise<Set<number>> {
  const ids = rows.filter(row => row.status === "pending" && row.referrerId !== null).map(row => row.id);
  if (!ids.length) return new Set();
  const events = await reader.select({ requestId: referralTransitionEvents.referralRequestId, action: referralTransitionEvents.action }).from(referralTransitionEvents)
    .where(and(inArray(referralTransitionEvents.referralRequestId, ids), inArray(referralTransitionEvents.action, [REFERRER_LINK_ASSIGN_ACTION, CLAIM_ACTION])));
  const actionsByAsk = new Map<number, string[]>();
  for (const event of events) actionsByAsk.set(event.requestId, [...(actionsByAsk.get(event.requestId) ?? []), event.action]);
  return new Set(ids.filter(id => isAwaitingLinkReferrer(actionsByAsk.get(id) ?? [])));
}

/** One seeker's link asks past the cutoff that their link owner never claimed (reconcile-on-read). */
export async function staleAwaitingLinkAskIds(reader: Reader, jobSeekerId: number, cutoff: Date): Promise<number[]> {
  const assigned = await reader.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId }).from(referralRequests)
    .where(and(eq(referralRequests.jobSeekerId, jobSeekerId), eq(referralRequests.status, "pending"), isNotNull(referralRequests.referrerId), lt(referralRequests.createdAt, cutoff)));
  const awaiting = await awaitingLinkReferrerIds(reader, assigned);
  return assigned.filter(row => awaiting.has(row.id)).map(row => row.id);
}

/** Every seeker's unclaimed link asks past the cutoff, oldest first, for the scheduled expiry sweep. */
export function staleLinkAsksQuery(reader: Reader, cutoff: Date, limit: number) {
  const assignedVia = alias(referralTransitionEvents, "linkAssign");
  const claimedBy = alias(referralTransitionEvents, "linkClaim");
  return reader.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, createdAt: referralRequests.createdAt }).from(referralRequests)
    .innerJoin(assignedVia, and(eq(assignedVia.referralRequestId, referralRequests.id), eq(assignedVia.action, REFERRER_LINK_ASSIGN_ACTION)))
    .leftJoin(claimedBy, and(eq(claimedBy.referralRequestId, referralRequests.id), eq(claimedBy.action, CLAIM_ACTION)))
    .where(and(eq(referralRequests.status, "pending"), isNotNull(referralRequests.referrerId), lt(referralRequests.createdAt, cutoff), isNull(claimedBy.id)))
    .orderBy(asc(referralRequests.createdAt), asc(referralRequests.id))
    .limit(limit);
}

/**
 * True when this seeker already has an ask under this idempotency key. A retry
 * of a send that committed must replay it even if the personal link was paused
 * since, so the link checks are skipped for it (the locked replay decides).
 */
export async function hasAskForIdempotencyKey(reader: Reader, jobSeekerId: number, idempotencyKey: string): Promise<boolean> {
  const rows = await reader.select({ id: referralRequests.id }).from(referralRequests).where(and(eq(referralRequests.jobSeekerId, jobSeekerId), eq(referralRequests.idempotencyKey, idempotencyKey))).limit(1);
  return rows.length > 0;
}

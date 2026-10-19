// D-034/D-047/D-061/D-062: the coverage-delivery rules shared by every surface
// that can give a waiting ask its first referrer — the create path, the
// deliver-or-hold transaction (server/db.ts), the queue opening
// (openCompanyReferralAvailability), a new employee's enrollment
// (saveVerifiedWorkEmail / completeWorkEmailOtpEnrollment) and the hourly
// retry (server/coverageDeliverySweep.ts). No db.ts import, so db.ts can use
// these inside its transactions without an import cycle (the heldAsk.ts and
// planGates.ts pattern).
//
// An ask moves through three coverage states (columns from migration 0095):
//   waiting  waitingForCoverage=true,  coverageHeldAt=null  — no credit spent,
//            no open slot, hidden from every referrer; closes at 90 days.
//   held     waitingForCoverage=true,  coverageHeldAt set   — an available
//            referrer exists but the seeker had no credit at that moment
//            (D-047): never delivered free, never billed later.
//   visible  waitingForCoverage=false, coverageHeldAt=null  — the credit is
//            spent (coverageVisibleAt set), the 7-day clock runs and the ask
//            appears in the referrer-facing surfaces (assigned, or reopened
//            by a pass).
// Covered-at-create asks (an available referrer at send time) keep the older
// single-step path: credit at create, coverageVisibleAt=createdAt.
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { COVERAGE_WAIT_DAYS } from "../shared/referral";

/** The D-034 spend of one ask's first visibility: one idempotent key per ask, for the ledger and for replays. */
export const ASK_DELIVERY_KEY_PREFIX = "ask-delivery";
export function askDeliveryKey(requestId: number): string {
  return `${ASK_DELIVERY_KEY_PREFIX}:${requestId}`;
}

/** One hourly window attempts at most this many waiting asks and this many held ones; the rest waits for the next window. */
export const COVERAGE_WAITING_BATCH = 100;
export const COVERAGE_HELD_BATCH = 100;
/** Referrers one delivery considers before it leaves the ask waiting; most remaining capacity first, then lowest id. */
export const COVERAGE_TARGET_SCAN_LIMIT = 25;
/** Deliveries try at most this many candidates per open slot (blocked and creditless asks keep their place). */
export const COVERAGE_ATTEMPTS_PER_SLOT = 4;

/** Once-only notification keys (`notifications.eventKey`). */
export function coverageDeliveredEventKey(requestId: number): string {
  return `coverage-delivered:${requestId}`.slice(0, 120);
}
export function coverageHeldEventKey(requestId: number): string {
  return `coverage-held:${requestId}`.slice(0, 120);
}
export function coverageReferrerEventKey(requestId: number, referrerId: number): string {
  return `coverage-delivery:${requestId}:${referrerId}`.slice(0, 120);
}

/** The seeker's notice when the credit is spent and the ask reaches referrers (the words the queue-opening path already used). */
export function coverageDeliveredNotice(companyDomain: string): { title: string; body: string } {
  return { title: "A referral review opened", body: `A verified employee at ${companyDomain} can now review your request.` };
}

/** D-047, verbatim: the ask is held at first visibility because the seeker has no credit to send it. */
export function coverageHeldNotice(companyDomain: string): { title: string; body: string } {
  return { title: "Add a credit to send your ask", body: `A verified employee at ${companyDomain} can now see asks. Add a credit to send yours.` };
}

/** The in-app notice a referrer gets when an ask is handed to them (the enrollment-path words). */
export function coverageReferrerNotice(companyDomain: string): { title: string; body: string } {
  return { title: "A private referral request is waiting", body: `A candidate has asked for help at ${companyDomain}. Review it only if you choose to help.` };
}

/** The seeker's notice when a never-covered ask closes at the 90-day mark (D-061): nothing was ever spent. */
export function coverageWaitExpiredNotice(companyDomain: string): { title: string; body: string } {
  return { title: "Your ask closed — no credit used", body: `No verified employee at ${companyDomain} became available within ${COVERAGE_WAIT_DAYS} days, and your ask never used a credit. You can send it again anytime.` };
}

/** The seeker's notice when they withdraw an ask that never reached a referrer (waiting or held): no credit was used. */
export const COVERAGE_WITHDRAWN_NOTICE = { title: "Your ask was withdrawn", body: "Your ask never reached an employee, so no credit was used. You can send a new ask anytime." } as const;

/** D-061: waiting and held asks never use an open slot, and no referrer-facing surface may show them. */
export function awaitingCoverageCondition(): SQL {
  return eq(referralRequests.waitingForCoverage, true);
}

/**
 * D-061: the only transitions an ask that has reached no referrer may still
 * take — the seeker's own withdraw and the clock's expiry. Every referrer-facing
 * action (claim, approve, review, pass, progress) is refused while the ask waits,
 * because no referrer has been given it.
 */
export const AWAITING_COVERAGE_ALLOWED_ACTIONS: readonly string[] = ["withdraw", "expire"];
export function isAwaitingCoverageActionAllowed(action: string): boolean {
  return AWAITING_COVERAGE_ALLOWED_ACTIONS.includes(action);
}

/** SQL: an ask a referrer-facing surface may show — not waiting and not held. */
export function visibleToReferrersCondition(): SQL {
  const condition = and(eq(referralRequests.waitingForCoverage, false), isNull(referralRequests.coverageHeldAt));
  if (!condition) throw new Error("Coverage visibility condition could not be built");
  return condition;
}

/**
 * What one delivery attempt did. `settled` means the ask is not waiting anymore
 * (delivered, withdrawn, closed or claimed already); a replay changes nothing.
 * `waiting.returnedToWaiting` is true when a held ask went back to plain
 * waiting because no open referrer is left.
 */
export type CoverageDeliveryOutcome =
  | { outcome: "delivered"; requestId: number; referrerId: number; seekerUserId: number; companyDomain: string; creditSpent: boolean }
  | { outcome: "held"; requestId: number; seekerUserId: number; companyDomain: string }
  | { outcome: "waiting"; requestId: number; returnedToWaiting: boolean }
  | { outcome: "blocked"; requestId: number }
  | { outcome: "settled"; requestId: number };

/** What one hand-off (a new employee's enrollment) delivered, held or stepped past. */
export type CoverageHandoffSummary = { delivered: number; held: number; skipped: number };

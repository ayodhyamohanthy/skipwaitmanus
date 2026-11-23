// D-174-pool-nudges (D-193 §5.9): waiting-pool nudges.
//
// D-097: every part ships behind a switch that stays off until QA verifies it.
// While this is false none of the parts runs: the inbox carries no waiting
// count, no pool review email is sent and no release notice is written.
//
// Part 2 (the pool review email) is not built here. A pool delivery writes no
// `referrerReviewEmailLinks` row — grants are created only with the request
// transaction (server/db.ts createCompanyReferralRequest) — so the existing
// claim/lease has no link to send. That is the packet's own stop condition;
// the task carries a blocked report with the evidence.
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { canonicalPeople, notifications, profiles, referralRequestPasses, users } from "../drizzle/schema";
import { blockedCounterpartsFailOpen } from "./blockedPairs";
import type { LedgerTx } from "./creditLedger";

export const POOL_NUDGES_ENABLED = false;
/** The in-app notice a released request writes to the company's other verified colleagues. */
export const POOL_RELEASE_NOTICE_KIND = "ask_released";
/** A release notice is a nudge, not a delivery: bound one release's fan-out. */
export const POOL_RELEASE_NOTICE_BATCH = 200;

export type PoolReleaseNoticeInput = {
  requestId: number;
  companyDomain: string;
  seekerUserId: number;
  /** The referrer whose pass or lapse released the request: never notified. */
  releasingReferrerId: number;
  /** The release transition's resulting revision: unique per release event. */
  revision: number;
};

/**
 * D-174-pool-nudges part 3: when a pass or a 48 h lapse releases a request, the
 * company's other verified colleagues who can now see it get one in-app notice.
 * The releasing referrer, anyone blocked with the seeker (either way) and anyone
 * who already passed are skipped. The notice never names the seeker, and the
 * eventKey makes a rerun of the same release a no-op. Callers gate on
 * `POOL_NUDGES_ENABLED` (server/db.ts), so the switch is read where it is mocked.
 */
export async function notifyColleaguesOfReleasedRequest(tx: Pick<LedgerTx, "select" | "insert">, input: PoolReleaseNoticeInput): Promise<number> {
  const companyDomain = input.companyDomain.trim().toLowerCase();
  if (!companyDomain) return 0;
  const colleagues = await tx.select({ userId: profiles.userId }).from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId))
    .leftJoin(referralRequestPasses, and(eq(referralRequestPasses.referralRequestId, input.requestId), eq(referralRequestPasses.referrerId, profiles.userId)))
    .where(and(
      eq(profiles.workEmailDomain, companyDomain),
      eq(profiles.accountType, "referrer"),
      isNotNull(profiles.workEmailVerifiedAt),
      eq(profiles.paused, false),
      eq(users.suspended, false),
      or(isNull(canonicalPeople.suspended), eq(canonicalPeople.suspended, false)),
      ne(profiles.userId, input.releasingReferrerId),
      isNull(referralRequestPasses.id),
    ))
    .limit(POOL_RELEASE_NOTICE_BATCH);
  const candidates = Array.from(new Set(colleagues.map(row => Number(row.userId)).filter(id => Number.isInteger(id) && id > 0)));
  if (!candidates.length) return 0;
  const blocked = await blockedCounterpartsFailOpen(tx, input.seekerUserId, candidates, "pool_release_notice");
  const recipients = candidates.filter(userId => !blocked.has(userId));
  const title = `A referral request at ${companyDomain} is open again`;
  const body = `A verified employee at ${companyDomain} couldn't take it on, so it's open to you and your colleagues. Open your inbox to review it.`;
  for (const userId of recipients) {
    const eventKey = `pool-released:${input.requestId}:v${input.revision}:${userId}`.slice(0, 120);
    await tx.insert(notifications).values({ userId, category: "referral", kind: POOL_RELEASE_NOTICE_KIND, refId: input.requestId, title, body, eventKey }).onDuplicateKeyUpdate({ set: { eventKey } });
  }
  return recipients.length;
}

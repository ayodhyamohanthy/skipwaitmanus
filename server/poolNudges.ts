// D-174-pool-nudges (D-193 §5.9): waiting-pool nudges.
//
// The switch (POOL_NUDGES_ENABLED) lives in shared/poolNudges.ts so server/db.ts
// can read it without an import cycle (D-384 (4)); it is re-exported here.
// Part 2, the pool review email, is the grant written at delivery
// (writeReviewGrantTx in server/db.ts) plus the hourly job in
// server/poolReviewEmail.ts.
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { canonicalPeople, notifications, profiles, referralRequestPasses, users } from "../drizzle/schema";
import { isSandboxSeeker } from "../shared/sandboxRequests";
import { blockedCounterpartsFailOpen } from "./blockedPairs";
import type { LedgerTx } from "./creditLedger";

export { POOL_NUDGES_ENABLED } from "../shared/poolNudges";
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
  // D-393 (a): a sandbox request reaches no real person, so a release nudges nobody. The demo referrer is the only
  // referrer it may reach, and it is the releasing referrer here.
  const seekerEmail = (await tx.select({ email: users.email }).from(users).where(eq(users.id, input.seekerUserId)).limit(1))[0]?.email;
  if (isSandboxSeeker(seekerEmail)) return 0;
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

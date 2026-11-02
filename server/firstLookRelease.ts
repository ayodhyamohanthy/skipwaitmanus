// Scheduled job "first-look-release": the poster's 24-hour head start no
// longer waits for anyone to read.
//
// D-022: an ask written from a post goes to the poster alone for 24 hours.
// When that window lapses without a decision, this job finds the lapsed asks
// (pending, unclaimed, with an expired first look) in bounded oldest-first
// batches and hands each to releaseFirstLookForRequest, which re-checks every
// precondition under the ask's row lock, clears the first-look fields and
// notifies the rest of the company in-app exactly once per colleague. A
// repeated sweep, a concurrent claim or a decision can never release twice.
// Anything left over is picked up by the next window.
import { and, asc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { ASK_TTL_MS } from "../shared/referral";
import { getDb, releaseFirstLookForRequest } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const FIRST_LOOK_RELEASE_BATCH = 200;

export type LapsedFirstLook = { id: number };

export type FirstLookReleaseDeps = {
  listLapsed: (now: Date, limit: number) => Promise<LapsedFirstLook[]>;
  release: (requestId: number, nowMs: number) => Promise<{ released: boolean }>;
};

export async function listLapsedFirstLooks(now: Date, limit: number): Promise<LapsedFirstLook[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  // Only asks still inside their own 7-day shelf life: older ones belong to
  // the ask-expiry sweep and must not notify anyone as "new".
  return db.select({ id: referralRequests.id })
    .from(referralRequests)
    .where(and(
      eq(referralRequests.status, "pending"),
      isNull(referralRequests.referrerId),
      isNotNull(referralRequests.firstLookReferrerId),
      lte(referralRequests.firstLookUntil, now),
      gt(referralRequests.createdAt, new Date(now.getTime() - ASK_TTL_MS)),
    ))
    .orderBy(asc(referralRequests.firstLookUntil), asc(referralRequests.id))
    .limit(limit);
}

export function createFirstLookRelease(deps: FirstLookReleaseDeps = { listLapsed: listLapsedFirstLooks, release: releaseFirstLookForRequest }) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const lapsed = await deps.listLapsed(new Date(nowMs), FIRST_LOOK_RELEASE_BATCH);
    const output: JobRunOutput = { processed: 0, failed: 0 };
    for (const ask of lapsed) {
      try {
        if ((await deps.release(ask.id, nowMs)).released) output.processed += 1;
      } catch (error) {
        output.failed += 1;
        if (output.firstError === undefined) output.firstError = error;
      }
    }
    return output;
  };
}

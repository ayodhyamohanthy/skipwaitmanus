// Scheduled job "ask-expiry-sweep": expiry no longer waits for someone to read.
//
// Finds unclaimed pending asks past their own shelf life across all seekers, in
// bounded oldest-first batches, and hands each to the same
// expireStalePendingReferralRequest the seeker's own reads already use. D-061
// gives an ask two windows: a visible unclaimed ask is stale 7 days after its
// first visibility (coverageVisibleAt; pre-0095 rows: creation), a waiting or
// held ask 90 days after creation. An unclaimed ask has no referrer, or is a
// personal-link ask still held for the employee whose link the seeker used, who
// has not claimed, accepted or passed (D-050, server/heldAsk.ts — its hold keeps
// the creation-based 7 days). The expiry re-checks ownership (the ask's own
// seeker), status, claimant and age under a row lock, refunds the credit once
// and notifies the seeker, so a concurrent read, a claim in flight or a
// repeated sweep can never expire or refund an ask twice. Anything left over is
// picked up by the next window.
import { and, asc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { ASK_TTL_MS, COVERAGE_WAIT_MS } from "../shared/referral";
import { expireStalePendingReferralRequest, getDb } from "./db";
import { selectStaleHeldAsks } from "./heldAsk";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { captureServerError } from "./sentry";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const ASK_EXPIRY_SWEEP_BATCH = 200;

export type StaleAsk = { id: number; jobSeekerId: number };

/** D-061: the three cutoffs one sweep window uses — visible asks 7 days after first visibility, waiting and held asks 90 or 7 days after creation. */
export type AskExpiryWindows = { visibleBefore: Date; waitingBefore: Date; heldBefore: Date };

export type AskExpirySweepDeps = {
  listStale: (windows: AskExpiryWindows, limit: number) => Promise<StaleAsk[]>;
  expire: (jobSeekerId: number, requestId: number, nowMs: number) => Promise<{ expired: boolean }>;
};

const oldestFirst = (a: { id: number; createdAt: Date }, b: { id: number; createdAt: Date }) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;

export async function listStalePendingAsks(windows: AskExpiryWindows, limit: number): Promise<StaleAsk[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const unassigned = await db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, createdAt: referralRequests.createdAt })
    .from(referralRequests)
    .where(and(
      eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId),
      or(
        // waiting or held: 90 days from creation, no cost (D-061)
        and(eq(referralRequests.waitingForCoverage, true), lt(referralRequests.createdAt, windows.waitingBefore)),
        // visible: 7 days from first visibility; rows from before 0095 have no coverageVisibleAt and keep creation
        and(eq(referralRequests.waitingForCoverage, false), or(
          and(isNotNull(referralRequests.coverageVisibleAt), lt(referralRequests.coverageVisibleAt, windows.visibleBefore)),
          and(isNull(referralRequests.coverageVisibleAt), lt(referralRequests.createdAt, windows.visibleBefore)),
        )),
      ),
    ))
    .orderBy(asc(referralRequests.createdAt), asc(referralRequests.id))
    .limit(limit);
  return mergeHeldStaleAsks(unassigned, () => selectStaleHeldAsks(db, { visibleBefore: windows.visibleBefore, heldBefore: windows.heldBefore, limit }), limit);
}

type StaleRow = { id: number; jobSeekerId: number; createdAt: Date };

/**
 * Each query is bounded on its own; merged oldest first, the batch keeps the same bound.
 * The held personal-link query (D-050) is newer than the unassigned one: if it fails, the
 * ordinary asks still expire and refund this window, and the failure is reported, never silent.
 */
export async function mergeHeldStaleAsks(unassigned: StaleRow[], loadHeld: () => Promise<StaleRow[]>, limit: number): Promise<StaleAsk[]> {
  let held: StaleRow[] = [];
  try {
    held = await loadHeld();
  } catch (error) {
    console.error("[ask-expiry-sweep] held personal-link asks skipped this window", { name: error instanceof Error ? error.name : "unknown" });
    captureServerError(error, { job: "ask-expiry-sweep", step: "held-asks" });
  }
  return [...unassigned, ...held].sort(oldestFirst).slice(0, limit).map(({ id, jobSeekerId }) => ({ id, jobSeekerId }));
}

export function createAskExpirySweep(deps: AskExpirySweepDeps = { listStale: listStalePendingAsks, expire: expireStalePendingReferralRequest }) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const stale = await deps.listStale({ visibleBefore: new Date(nowMs - ASK_TTL_MS), waitingBefore: new Date(nowMs - COVERAGE_WAIT_MS), heldBefore: new Date(nowMs - ASK_TTL_MS) }, ASK_EXPIRY_SWEEP_BATCH);
    const output: JobRunOutput = { processed: 0, failed: 0 };
    for (const ask of stale) {
      try {
        if ((await deps.expire(ask.jobSeekerId, ask.id, nowMs)).expired) output.processed += 1;
      } catch (error) {
        output.failed += 1;
        if (output.firstError === undefined) output.firstError = error;
      }
    }
    return output;
  };
}

// Scheduled job "ask-expiry-sweep": expiry no longer waits for someone to read.
//
// Finds unclaimed pending asks older than ASK_TTL_DAYS across all seekers, in
// bounded oldest-first batches, and hands each to the same
// expireStalePendingReferralRequest the seeker's own reads already use. An
// unclaimed ask has no referrer, or is a personal-link ask still held for the
// employee whose link the seeker used, who has not claimed, accepted or passed
// (D-050, server/heldAsk.ts). The expiry re-checks ownership (the ask's own
// seeker), status, claimant and age under a row lock, refunds the credit once
// and notifies the seeker, so a concurrent read, a claim in flight or a
// repeated sweep can never expire or refund an ask twice. Anything left over is
// picked up by the next window.
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { ASK_TTL_MS } from "../shared/referral";
import { expireStalePendingReferralRequest, getDb } from "./db";
import { selectStaleHeldAsks } from "./heldAsk";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { captureServerError } from "./sentry";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const ASK_EXPIRY_SWEEP_BATCH = 200;

export type StaleAsk = { id: number; jobSeekerId: number };

export type AskExpirySweepDeps = {
  listStale: (cutoff: Date, limit: number) => Promise<StaleAsk[]>;
  expire: (jobSeekerId: number, requestId: number, nowMs: number) => Promise<{ expired: boolean }>;
};

const oldestFirst = (a: { id: number; createdAt: Date }, b: { id: number; createdAt: Date }) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;

export async function listStalePendingAsks(cutoff: Date, limit: number): Promise<StaleAsk[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const unassigned = await db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, createdAt: referralRequests.createdAt })
    .from(referralRequests)
    .where(and(eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId), lt(referralRequests.createdAt, cutoff)))
    .orderBy(asc(referralRequests.createdAt), asc(referralRequests.id))
    .limit(limit);
  return mergeHeldStaleAsks(unassigned, () => selectStaleHeldAsks(db, { cutoff, limit }), limit);
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
    const stale = await deps.listStale(new Date(nowMs - ASK_TTL_MS), ASK_EXPIRY_SWEEP_BATCH);
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

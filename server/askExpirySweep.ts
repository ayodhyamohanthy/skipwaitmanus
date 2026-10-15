// Scheduled job "ask-expiry-sweep": expiry no longer waits for someone to read.
//
// Finds unclaimed pending asks older than ASK_TTL_DAYS across all seekers
// (including asks sent through a personal link that its owner never claimed,
// D-017), in bounded oldest-first batches, and hands each to the same
// expireStalePendingReferralRequest the seeker's own reads already use. That
// function re-checks ownership (the ask's own seeker), status, claimant and age
// under a row lock, refunds the reserved credit once and notifies the seeker,
// so a concurrent read, a claim in flight or a repeated sweep can never expire
// or refund an ask twice. Anything left over is picked up by the next window.
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { ASK_TTL_MS } from "../shared/referral";
import { expireStalePendingReferralRequest, getDb } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { staleLinkAsksQuery } from "./referrerLinkAsk";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const ASK_EXPIRY_SWEEP_BATCH = 200;

export type StaleAsk = { id: number; jobSeekerId: number };

export type AskExpirySweepDeps = {
  listStale: (cutoff: Date, limit: number) => Promise<StaleAsk[]>;
  expire: (jobSeekerId: number, requestId: number, nowMs: number) => Promise<{ expired: boolean }>;
};

type DatedStaleAsk = StaleAsk & { createdAt: Date };

/** Oldest first across both lists, at most `limit`, each ask once. */
export function oldestStaleAsks(lists: ReadonlyArray<readonly DatedStaleAsk[]>, limit: number): StaleAsk[] {
  const ordered = lists.flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  const seen = new Set<number>();
  const oldest: StaleAsk[] = [];
  for (const ask of ordered) {
    if (oldest.length >= limit) break;
    if (seen.has(ask.id)) continue;
    seen.add(ask.id);
    oldest.push({ id: ask.id, jobSeekerId: ask.jobSeekerId });
  }
  return oldest;
}

export async function listStalePendingAsks(cutoff: Date, limit: number): Promise<StaleAsk[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const unclaimed = await db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, createdAt: referralRequests.createdAt })
    .from(referralRequests)
    .where(and(eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId), lt(referralRequests.createdAt, cutoff)))
    .orderBy(asc(referralRequests.createdAt), asc(referralRequests.id))
    .limit(limit);
  const linkAsks = await staleLinkAsksQuery(db, cutoff, limit);
  return oldestStaleAsks([unclaimed, linkAsks], limit);
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

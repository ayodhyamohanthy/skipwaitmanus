// Scheduled job "coverage-delivery-retry": the D-062 recovery path for coverage
// delivery. Enrollment, queue openings and the create path hand waiting asks
// over the moment an available referrer appears; this job is the backstop that
// guarantees every covered ask still reaches a referrer.
//
// Every window processes two bounded, oldest-first batches:
//   - waiting asks (no referrer ever appeared, or one just did): each is offered
//     to the company's available referrers, most remaining capacity first, until
//     someone takes it (D-034: the credit is spent at that first visibility) or
//     the seeker has no credit (D-047: held, once-only notice, nothing
//     allocated) or every candidate is blocked/full (stays waiting);
//   - held asks (a referrer was available but the seeker had no credit): retried
//     the same way, and returned to plain waiting when no open referrer is left
//     at all — the seeker's "add a credit" notice is only live while one exists.
// The delivery re-checks everything under the ask's row lock, so a concurrent
// claim, withdraw or expiry can never deliver twice. Anything left over is
// picked up by the next window.
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { COVERAGE_HELD_BATCH, COVERAGE_WAITING_BATCH, type CoverageDeliveryOutcome } from "./coverageDelivery";
import { getDb, tryDeliverWaitingAsk } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export type CoverageSweepAsk = { id: number };

export type CoverageDeliverySweepDeps = {
  listWaiting: (limit: number) => Promise<CoverageSweepAsk[]>;
  listHeld: (limit: number) => Promise<CoverageSweepAsk[]>;
  deliver: (requestId: number, nowMs: number) => Promise<CoverageDeliveryOutcome>;
};

/** Waiting asks (never reached a referrer, not held for want of a credit), oldest queue position first. */
export async function listWaitingCoverageAsks(limit: number): Promise<CoverageSweepAsk[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: referralRequests.id })
    .from(referralRequests)
    .where(and(
      eq(referralRequests.status, "pending"),
      eq(referralRequests.waitingForCoverage, true),
      isNull(referralRequests.coverageHeldAt),
      isNull(referralRequests.referrerId),
    ))
    .orderBy(asc(referralRequests.coverageQueuedAt), asc(referralRequests.id))
    .limit(limit);
}

/** Held asks (a referrer existed when first visibility came, but the seeker had no credit — D-047), oldest first. */
export async function listHeldCoverageAsks(limit: number): Promise<CoverageSweepAsk[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: referralRequests.id })
    .from(referralRequests)
    .where(and(
      eq(referralRequests.status, "pending"),
      eq(referralRequests.waitingForCoverage, true),
      isNotNull(referralRequests.coverageHeldAt),
    ))
    .orderBy(asc(referralRequests.coverageHeldAt), asc(referralRequests.id))
    .limit(limit);
}

/**
 * `processed` counts work that moved an ask forward: a delivery (its credit was
 * spent and a referrer got it) or a held ask returned to waiting. An ask still
 * blocked on the seeker's credit, a blocked pair and an ask that is no longer
 * waiting are not progress and are left for the next window or the seeker.
 */
export function createCoverageDeliverySweep(deps: CoverageDeliverySweepDeps = { listWaiting: listWaitingCoverageAsks, listHeld: listHeldCoverageAsks, deliver: tryDeliverWaitingAsk }) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const waiting = await deps.listWaiting(COVERAGE_WAITING_BATCH);
    const held = await deps.listHeld(COVERAGE_HELD_BATCH);
    const output: JobRunOutput = { processed: 0, failed: 0 };
    for (const ask of [...waiting, ...held]) {
      try {
        const outcome = await deps.deliver(ask.id, nowMs);
        if (outcome.outcome === "delivered" || (outcome.outcome === "waiting" && outcome.returnedToWaiting)) output.processed += 1;
      } catch (error) {
        output.failed += 1;
        if (output.firstError === undefined) output.firstError = error;
      }
    }
    return output;
  };
}

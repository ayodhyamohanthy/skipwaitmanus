// Scheduled job "work-email-reverify-sweep" (queue task 6). PR 1: DRY RUN ONLY.
// It lists verified referrers whose 90-day window has lapsed (grandfathered to
// shared/reverify.ts REVERIFY_EPOCH_MS) and logs how many would be affected.
// It changes nothing: no badge removal, no ask release, no messages. Enforcement
// is a separate PR, enabled only on the founder's explicit say-so.
import { and, asc, isNotNull, lt } from "drizzle-orm";
import { profiles } from "../drizzle/schema";
import { REVERIFY_EPOCH_MS, reverifyDueCutoff } from "../shared/reverify";
import { getDb } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const REVERIFY_SWEEP_BATCH = 500;

export type DueReferrer = { userId: number };
export type ReverifySweepDeps = {
  listDue: (cutoff: Date, limit: number) => Promise<DueReferrer[]>;
  log: (message: string, detail: Record<string, unknown>) => void;
};

export async function listDueReferrers(cutoff: Date, limit: number): Promise<DueReferrer[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ userId: profiles.userId }).from(profiles)
    .where(and(isNotNull(profiles.workEmailVerifiedAt), lt(profiles.workEmailVerifiedAt, cutoff)))
    .orderBy(asc(profiles.workEmailVerifiedAt))
    .limit(limit);
}

export function createWorkEmailReverifySweep(deps: ReverifySweepDeps = { listDue: listDueReferrers, log: (message, detail) => console.info(message, detail) }) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    // Before the epoch plus the window nobody can be due, whatever their stored date says.
    if (reverifyDueCutoff(nowMs).getTime() <= REVERIFY_EPOCH_MS) {
      deps.log("[reverify-sweep] dry run: grandfathering window still open", { dueCount: 0 });
      return { processed: 0, failed: 0 };
    }
    const due = await deps.listDue(reverifyDueCutoff(nowMs), REVERIFY_SWEEP_BATCH);
    deps.log("[reverify-sweep] dry run: would require re-verification", { dueCount: due.length, enforced: false });
    return { processed: 0, failed: 0 };
  };
}

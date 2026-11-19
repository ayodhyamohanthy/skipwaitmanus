// Reviewed, idempotent backfill of jobs.jobFunction for rows created before
// migration 0077 (jobFunctionSource IS NULL). It reuses the exact classifier
// that ask creation uses, records the outcome with source "backfill" (a NULL
// function then means "examined, unknown"), and never touches a row whose
// source is already set, so a seeker's choice or a creation-time guess is
// never overwritten and re-runs are no-ops. Dry-run unless `apply` is true.
// Run through scripts/backfill-job-function.ts.
import { and, asc, gt, inArray, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { jobs } from "../drizzle/schema";
import { inferAskJobFunction, type InferredJobFunction } from "../shared/jobFunctionClassifier";

export type BackfillCandidate = { id: number; title: string; targetRoleUrl: string | null };
export type BackfillDecision = { id: number; jobFunction: InferredJobFunction | null };
export type BackfillStore = {
  selectBatch: (afterId: number, limit: number) => Promise<BackfillCandidate[]>;
  /** Marks rows still unexamined; returns how many changed. */
  markBatch: (ids: readonly number[], jobFunction: InferredJobFunction | null) => Promise<number>;
};
export type BackfillReport = {
  mode: "dry-run" | "apply";
  examined: number;
  updated: number;
  byFunction: Record<string, number>;
  samples: BackfillDecision[];
};

export function planJobFunctionBackfill(rows: readonly BackfillCandidate[]): BackfillDecision[] {
  return rows.map(row => ({ id: row.id, jobFunction: inferAskJobFunction({ title: row.title, targetRoleUrl: row.targetRoleUrl }) }));
}

const UNKNOWN = "unknown";

export async function runJobFunctionBackfill(store: BackfillStore, options: { apply: boolean; batchSize?: number; maxRows?: number }): Promise<BackfillReport> {
  const batchSize = Math.min(Math.max(Math.trunc(options.batchSize ?? 500), 1), 2000);
  const maxRows = Math.max(Math.trunc(options.maxRows ?? 100_000), 0);
  const report: BackfillReport = { mode: options.apply ? "apply" : "dry-run", examined: 0, updated: 0, byFunction: {}, samples: [] };
  let afterId = 0;
  while (report.examined < maxRows) {
    const rows = await store.selectBatch(afterId, Math.min(batchSize, maxRows - report.examined));
    if (rows.length === 0) break;
    const decisions = planJobFunctionBackfill(rows);
    report.examined += decisions.length;
    afterId = Math.max(...rows.map(row => row.id));
    const groups = new Map<InferredJobFunction | null, number[]>();
    for (const decision of decisions) {
      const key = decision.jobFunction ?? UNKNOWN;
      report.byFunction[key] = (report.byFunction[key] ?? 0) + 1;
      if (report.samples.length < 10) report.samples.push(decision);
      groups.set(decision.jobFunction, [...(groups.get(decision.jobFunction) ?? []), decision.id]);
    }
    if (options.apply) for (const [jobFunction, ids] of Array.from(groups)) report.updated += await store.markBatch(ids, jobFunction);
  }
  return report;
}

type BackfillDb = MySql2Database<Record<string, unknown>>;

/** Oldest unexamined rows after `afterId`. */
export function selectBackfillBatch(db: BackfillDb, afterId: number, limit: number) {
  return db.select({ id: jobs.id, title: jobs.title, targetRoleUrl: jobs.targetRoleUrl }).from(jobs)
    .where(and(isNull(jobs.jobFunctionSource), gt(jobs.id, afterId))).orderBy(asc(jobs.id)).limit(limit);
}

/** The guard `jobFunctionSource IS NULL` makes concurrent or repeated runs safe. */
export function markBackfillBatch(db: BackfillDb, ids: readonly number[], jobFunction: InferredJobFunction | null) {
  return db.update(jobs).set({ jobFunction, jobFunctionSource: "backfill" })
    .where(and(inArray(jobs.id, [...ids]), isNull(jobs.jobFunctionSource)));
}

export function drizzleBackfillStore(db: BackfillDb): BackfillStore {
  return {
    selectBatch: (afterId, limit) => selectBackfillBatch(db, afterId, limit),
    markBatch: async (ids, jobFunction) => {
      if (ids.length === 0) return 0;
      const result = await markBackfillBatch(db, ids, jobFunction);
      return Number(result[0]?.affectedRows ?? 0);
    },
  };
}

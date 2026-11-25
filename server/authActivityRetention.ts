// Scheduled job "auth-activity-retention" (ADMIN-activity-log, D-393): sign-in rows are kept 90 days.
//
// Each daily run deletes operationalActivityLogs rows whose action is one of the sign-in events recordAuthEvent
// writes (AUTH_ACTIONS) and that are older than AUTH_ACTIVITY_RETENTION_DAYS, in bounded batches of ids, oldest
// first. Nothing else is touched: account lifecycle rows from the WorkOS webhook (auth.workos_user_*), the
// work-email step-up audit trail and every non-sign-in row stay. The cutoff is computed here, never from the
// database clock (AGENTS.md invariant 5); a skew of seconds only moves a row by one run.
import { and, asc, inArray, lt } from "drizzle-orm";
import { operationalActivityLogs } from "../drizzle/schema";
import { AUTH_ACTIVITY_RETENTION_DAYS } from "../shared/adminActivity";
import { AUTH_ACTIONS } from "./authEvents";
import { getDb } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const AUTH_RETENTION_BATCH = 500;
export const AUTH_RETENTION_MAX_BATCHES = 20;
const DAY_MS = 86_400_000;

export type AuthRetentionStore = {
  /** Ids of sign-in rows created before `cutoff`, oldest first, at most `limit`. */
  expiredIds: (cutoff: Date, limit: number) => Promise<number[]>;
  deleteIds: (ids: number[]) => Promise<number>;
};

export function createDrizzleAuthRetentionStore(): AuthRetentionStore {
  return {
    async expiredIds(cutoff, limit) {
      const db = await getDb();
      if (!db) throw new JobRunStoreUnavailableError();
      const rows = await db.select({ id: operationalActivityLogs.id }).from(operationalActivityLogs)
        .where(and(inArray(operationalActivityLogs.action, [...AUTH_ACTIONS]), lt(operationalActivityLogs.createdAt, cutoff)))
        .orderBy(asc(operationalActivityLogs.id)).limit(limit);
      return rows.map(row => row.id);
    },
    async deleteIds(ids) {
      if (!ids.length) return 0;
      const db = await getDb();
      if (!db) throw new JobRunStoreUnavailableError();
      // The action is checked again so an id can never delete a row that is not a sign-in event.
      const result = await db.delete(operationalActivityLogs).where(and(inArray(operationalActivityLogs.id, ids), inArray(operationalActivityLogs.action, [...AUTH_ACTIONS])));
      return Number(result[0]?.affectedRows ?? 0);
    },
  };
}

export function createAuthActivityRetention(store?: AuthRetentionStore) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const resolved = store ?? createDrizzleAuthRetentionStore();
    const cutoff = new Date(nowMs - AUTH_ACTIVITY_RETENTION_DAYS * DAY_MS);
    let processed = 0;
    for (let batch = 0; batch < AUTH_RETENTION_MAX_BATCHES; batch += 1) {
      const ids = await resolved.expiredIds(cutoff, AUTH_RETENTION_BATCH);
      if (!ids.length) break;
      processed += await resolved.deleteIds(ids);
      if (ids.length < AUTH_RETENTION_BATCH) break;
    }
    return { processed, failed: 0 };
  };
}

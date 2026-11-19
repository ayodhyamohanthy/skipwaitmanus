// Durable run records for scheduled jobs (table jobRuns, migration 0078).
//
// The unique (jobName, windowKey) key is the single-flight lock: the first
// runner to insert a window's row owns it, every other runner sees a duplicate.
// A failed row, or a running row whose lease expired, can be taken over by a
// compare-and-set on its attempt number, so two runners can never both win.
// Completion only lands while the completing runner still owns the row. All
// times are JS times passed as parameters, never DB NOW() (invariant 5).
import { and, desc, eq, lt, or } from "drizzle-orm";
import { jobRuns } from "../drizzle/schema";
import { getDb } from "./db";
import { isDuplicateEntryError } from "./schemaReconcile";

export type JobRunRecord = typeof jobRuns.$inferSelect;

export type JobRunClaim = {
  jobName: string;
  windowKey: string;
  leaseOwner: string;
  startedAt: Date;
  leaseExpiresAt: Date;
};

export type JobRunCompletion = {
  jobName: string;
  windowKey: string;
  leaseOwner: string;
  status: "succeeded" | "failed";
  finishedAt: Date;
  processedCount: number;
  failedCount: number;
  error: string | null;
};

export interface JobRunStore {
  /** Inserts the window's row as running at attempt 1, or reports that the window already has a row. */
  insertRunning(claim: JobRunClaim): Promise<"inserted" | "duplicate">;
  find(jobName: string, windowKey: string): Promise<JobRunRecord | undefined>;
  /** Takes over a failed or lease-expired row only if it is still at `fromAttempt`. */
  takeOver(id: number, fromAttempt: number, claim: JobRunClaim): Promise<boolean>;
  /** Records the outcome only while `leaseOwner` still holds the running row. */
  complete(completion: JobRunCompletion): Promise<boolean>;
  /** The most recently started run of a job, optionally only a successful one. */
  latest(jobName: string, status?: "succeeded"): Promise<JobRunRecord | undefined>;
}

export class JobRunStoreUnavailableError extends Error {
  constructor() {
    super("Scheduled jobs need the database");
    this.name = "JobRunStoreUnavailableError";
  }
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  return db;
}

export function createMysqlJobRunStore(): JobRunStore {
  return {
    async insertRunning(claim) {
      const db = await requireDb();
      try {
        await db.insert(jobRuns).values({ ...claim, status: "running", attempt: 1, processedCount: 0, failedCount: 0 });
        return "inserted";
      } catch (error) {
        if (isDuplicateEntryError(error)) return "duplicate";
        throw error;
      }
    },
    async find(jobName, windowKey) {
      const db = await requireDb();
      return (await db.select().from(jobRuns).where(and(eq(jobRuns.jobName, jobName), eq(jobRuns.windowKey, windowKey))).limit(1))[0];
    },
    async takeOver(id, fromAttempt, claim) {
      const db = await requireDb();
      const [result] = await db.update(jobRuns)
        .set({ status: "running", attempt: fromAttempt + 1, leaseOwner: claim.leaseOwner, startedAt: claim.startedAt, leaseExpiresAt: claim.leaseExpiresAt, finishedAt: null, processedCount: 0, failedCount: 0, error: null })
        .where(and(
          eq(jobRuns.id, id),
          eq(jobRuns.jobName, claim.jobName),
          eq(jobRuns.windowKey, claim.windowKey),
          eq(jobRuns.attempt, fromAttempt),
          or(eq(jobRuns.status, "failed"), and(eq(jobRuns.status, "running"), lt(jobRuns.leaseExpiresAt, claim.startedAt))),
        ));
      return result.affectedRows === 1;
    },
    async complete(completion) {
      const db = await requireDb();
      const [result] = await db.update(jobRuns)
        .set({ status: completion.status, finishedAt: completion.finishedAt, processedCount: completion.processedCount, failedCount: completion.failedCount, error: completion.error })
        .where(and(eq(jobRuns.jobName, completion.jobName), eq(jobRuns.windowKey, completion.windowKey), eq(jobRuns.leaseOwner, completion.leaseOwner), eq(jobRuns.status, "running")));
      return result.affectedRows === 1;
    },
    async latest(jobName, status) {
      const db = await requireDb();
      const where = status ? and(eq(jobRuns.jobName, jobName), eq(jobRuns.status, status)) : eq(jobRuns.jobName, jobName);
      return (await db.select().from(jobRuns).where(where).orderBy(desc(jobRuns.startedAt), desc(jobRuns.id)).limit(1))[0];
    },
  };
}

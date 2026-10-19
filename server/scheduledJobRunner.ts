// Runs registered scheduled jobs at most once per window.
//
// A tick claims each job's current window in jobRuns (server/jobRunStore.ts):
// a fresh window is inserted, a succeeded window is skipped, a live lease is
// skipped, and a failed or abandoned window is taken over by compare-and-set
// until JOB_RUN_MAX_ATTEMPTS. The lease stops routine overlap, not a hung
// runner, so every job must also be idempotent per item. Failures go to
// Sentry with the job, window and attempt; stored errors are redacted.
import { randomBytes } from "node:crypto";
import { JOB_RUN_ERROR_MAX, JOB_RUN_MAX_ATTEMPTS, jobWindowKey, type JobTickOutcome, type JobTickResult, type ScheduledJobName } from "../shared/scheduledJobs";
import { JobRunStoreUnavailableError, type JobRunStore } from "./jobRunStore";
import { redactReconcileLogText } from "./schemaReconcile";

export type JobRunContext = { nowMs: number; windowKey: string };
/** `firstError` is the first per-item failure, kept so Sentry sees the real cause. */
export type JobRunOutput = { processed: number; failed: number; firstError?: unknown };

export type ScheduledJobDefinition = {
  name: ScheduledJobName;
  description: string;
  windowMs: number;
  leaseMs: number;
  run: (context: JobRunContext) => Promise<JobRunOutput>;
};

export type JobCapture = (error: unknown, context: Record<string, unknown>) => void;

export type JobRunnerDeps = {
  store: JobRunStore;
  now: () => number;
  newLeaseOwner?: () => string;
  capture?: JobCapture;
};

/**
 * Windows open a minute early: the cron fires exactly on a window boundary, so
 * a container clock a little behind the Worker's still lands in the window the
 * cron meant instead of finding the previous one already done.
 */
export const JOB_WINDOW_OPEN_EARLY_MS = 60_000;

const defaultLeaseOwner = () => randomBytes(16).toString("hex");

export function safeJobError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactReconcileLogText(message).slice(0, JOB_RUN_ERROR_MAX);
}

function failureText(output: JobRunOutput): string {
  const summary = `${output.failed} item(s) failed`;
  return output.firstError === undefined ? summary : `${summary}: ${safeJobError(output.firstError)}`.slice(0, JOB_RUN_ERROR_MAX);
}

export async function runScheduledJob(job: ScheduledJobDefinition, deps: JobRunnerDeps): Promise<JobTickResult> {
  const nowMs = deps.now();
  const windowKey = jobWindowKey(nowMs + JOB_WINDOW_OPEN_EARLY_MS, job.windowMs);
  const claim = { jobName: job.name, windowKey, leaseOwner: (deps.newLeaseOwner ?? defaultLeaseOwner)(), startedAt: new Date(nowMs), leaseExpiresAt: new Date(nowMs + job.leaseMs) };
  const skipped = (outcome: JobTickOutcome): JobTickResult => ({ job: job.name, windowKey, outcome, attempt: null, processed: 0, failed: 0 });

  let attempt = 1;
  if ((await deps.store.insertRunning(claim)) === "duplicate") {
    const row = await deps.store.find(job.name, windowKey);
    if (!row) throw new Error(`jobRuns reported a duplicate ${job.name} window ${windowKey} but has no row for it`);
    if (row.status === "succeeded") return skipped("already_ran");
    if (row.status === "running" && row.leaseExpiresAt.getTime() > nowMs) return skipped("leased");
    if (row.attempt >= JOB_RUN_MAX_ATTEMPTS) return skipped("attempts_exhausted");
    if (!(await deps.store.takeOver(row.id, row.attempt, claim))) return skipped("leased");
    attempt = row.attempt + 1;
  }

  let output: JobRunOutput = { processed: 0, failed: 0 };
  let thrown: unknown;
  let error: string | null = null;
  try {
    output = await job.run({ nowMs, windowKey });
    if (output.failed > 0) error = failureText(output);
  } catch (caught) {
    thrown = caught;
    error = safeJobError(caught);
  }
  const status = error === null ? "succeeded" : "failed";
  const context = { job: job.name, windowKey, attempt, processed: output.processed, failed: output.failed };
  if (status === "failed") deps.capture?.(thrown ?? output.firstError ?? new Error(`Scheduled job ${job.name} failed: ${error}`), context);

  const recorded = await deps.store.complete({ jobName: job.name, windowKey, leaseOwner: claim.leaseOwner, status, finishedAt: new Date(deps.now()), processedCount: output.processed, failedCount: output.failed, error });
  if (!recorded) deps.capture?.(new Error(`Scheduled job ${job.name} lost its lease before recording window ${windowKey}`), context);
  return { job: job.name, windowKey, outcome: status === "succeeded" ? "ran" : "failed", attempt, processed: output.processed, failed: output.failed };
}

/** Runs every job in order; one job's bookkeeping failure never stops the next. */
export async function runScheduledJobs(jobs: readonly ScheduledJobDefinition[], deps: JobRunnerDeps): Promise<JobTickResult[]> {
  const results: JobTickResult[] = [];
  for (const job of jobs) {
    try {
      results.push(await runScheduledJob(job, deps));
    } catch (error) {
      if (error instanceof JobRunStoreUnavailableError) throw error;
      deps.capture?.(error, { job: job.name, stage: "bookkeeping" });
      results.push({ job: job.name, windowKey: jobWindowKey(deps.now() + JOB_WINDOW_OPEN_EARLY_MS, job.windowMs), outcome: "failed", attempt: null, processed: 0, failed: 0 });
    }
  }
  return results;
}

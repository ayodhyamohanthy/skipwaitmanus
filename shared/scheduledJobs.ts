// Scheduled jobs contract: job names, run records, and the two responses
// (the internal cron tick and the admin status read).
//
// server/scheduledJobRegistry.ts defines the jobs. Table `jobRuns` (0078) keeps
// one row per job per window: its unique (jobName, windowKey) key is the
// single-flight lock and the row is the idempotent run record. Every server
// boundary parses with these schemas; nothing else defines these shapes.
import { z } from "zod";

export const SCHEDULED_JOB_NAMES = ["ask-expiry-sweep", "first-look-release", "plan-credit-cycles", "chargebee-pending-reconcile", "chargebee-subscription-reconcile", "work-email-reverify-sweep", "data-export-sweep", "work-email-otp-purge", "coverage-delivery-retry", "referral-timers", "daily-money-check", "billing-review-retry", "job-catalog-sync"] as const;
export const scheduledJobNameSchema = z.enum(SCHEDULED_JOB_NAMES);
export type ScheduledJobName = z.infer<typeof scheduledJobNameSchema>;

export const JOB_RUN_STATUSES = ["running", "succeeded", "failed"] as const;
export const jobRunStatusSchema = z.enum(JOB_RUN_STATUSES);
export type JobRunStatus = z.infer<typeof jobRunStatusSchema>;

/** A failed or abandoned window is retried by later ticks up to this many attempts. */
export const JOB_RUN_MAX_ATTEMPTS = 3;
export const JOB_RUN_ERROR_MAX = 500;
export const JOB_NAME_MAX = 64;
export const JOB_WINDOW_KEY_MAX = 32;

/** A window's key is its UTC start to the minute, for example 2026-10-14T10:15Z. */
export const JOB_WINDOW_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
export const jobWindowKeySchema = z.string().max(JOB_WINDOW_KEY_MAX).regex(JOB_WINDOW_KEY_PATTERN);

/**
 * What one tick did with one job: ran it (succeeded) or ran it and it failed;
 * skipped it because the window already succeeded, another runner holds a live
 * lease, or the window used up its attempts.
 */
export const JOB_TICK_OUTCOMES = ["ran", "failed", "already_ran", "leased", "attempts_exhausted"] as const;
export const jobTickOutcomeSchema = z.enum(JOB_TICK_OUTCOMES);
export type JobTickOutcome = z.infer<typeof jobTickOutcomeSchema>;

const isoTimestamp = z.iso.datetime();
const count = z.number().int().nonnegative();
const attemptNumber = z.number().int().min(1).max(JOB_RUN_MAX_ATTEMPTS);

export const jobTickResultSchema = z.strictObject({
  job: scheduledJobNameSchema,
  windowKey: jobWindowKeySchema,
  outcome: jobTickOutcomeSchema,
  /** The attempt this tick ran, or null when it skipped the job. */
  attempt: attemptNumber.nullable(),
  processed: count,
  failed: count,
});
export type JobTickResult = z.infer<typeof jobTickResultSchema>;

export const jobsTickResponseSchema = z.strictObject({
  tickedAt: isoTimestamp,
  results: z.array(jobTickResultSchema),
});
export type JobsTickResponse = z.infer<typeof jobsTickResponseSchema>;

export const jobRunSummarySchema = z.strictObject({
  windowKey: jobWindowKeySchema,
  status: jobRunStatusSchema,
  attempt: attemptNumber,
  startedAt: isoTimestamp,
  finishedAt: isoTimestamp.nullable(),
  processed: count,
  failed: count,
  error: z.string().max(JOB_RUN_ERROR_MAX).nullable(),
});
export type JobRunSummary = z.infer<typeof jobRunSummarySchema>;

export const adminScheduledJobSchema = z.strictObject({
  name: scheduledJobNameSchema,
  description: z.string().min(1).max(200),
  windowMinutes: z.number().int().positive(),
  lastRun: jobRunSummarySchema.nullable(),
  lastSucceededAt: isoTimestamp.nullable(),
  /** No success within three windows: the cron, the token or the job is broken. */
  overdue: z.boolean(),
});
export type AdminScheduledJob = z.infer<typeof adminScheduledJobSchema>;

export const adminScheduledJobsResponseSchema = z.strictObject({
  cron: z.string().min(1),
  checkedAt: isoTimestamp,
  jobs: z.array(adminScheduledJobSchema),
});
export type AdminScheduledJobsResponse = z.infer<typeof adminScheduledJobsResponseSchema>;

/** Windows are aligned to the epoch, so every runner derives the same key for the same instant. */
export function jobWindowKey(nowMs: number, windowMs: number): string {
  if (!Number.isSafeInteger(windowMs) || windowMs < 60_000 || windowMs % 60_000 !== 0) throw new Error("A job window is a whole number of minutes");
  const start = Math.floor(nowMs / windowMs) * windowMs;
  return `${new Date(start).toISOString().slice(0, 16)}Z`;
}

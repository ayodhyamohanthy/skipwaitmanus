// Scheduled jobs REST surface.
//   POST /api/internal/jobs/tick  Worker cron only (src/worker.ts scheduled()):
//        X-skipwait.me-Jobs-Tick = HMAC token from JWT_SECRET (shared/jobsTick.ts).
//        404 when JWT_SECRET is unset, 401 for a missing or stale token, 503
//        without a database; otherwise runs every due job once per window.
//        The public Worker route 404s /api/internal/ and strips the header.
//   GET  /api/admin/jobs          admin: last run, last success and overdue flag per job.
// Contracts live in shared/scheduledJobs.ts; services are injectable for tests.
import type { Express, Request, Response } from "express";
import { JOBS_CRON, JOBS_TICK_HEADER, JOBS_TICK_PATH } from "../shared/jobsTick";
import { adminScheduledJobsResponseSchema, jobsTickResponseSchema, type AdminScheduledJob, type JobRunSummary } from "../shared/scheduledJobs";
import { ENV } from "./_core/env";
import { verifyJobsTickToken } from "./jobsTickAuth";
import { createMysqlJobRunStore, JobRunStoreUnavailableError, type JobRunRecord, type JobRunStore } from "./jobRunStore";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";
import { runScheduledJobs, type JobCapture, type ScheduledJobDefinition } from "./scheduledJobRunner";
import { captureServerError } from "./sentry";
import { runMoneyCheckNow, type MoneyCheckRunResult } from "./dailyMoneyCheck";

type Identity = { account: { id: number; role?: "user" | "admin" } };
type ActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number };

export type ScheduledJobsRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: ActivityInput) => void | Promise<void>;
  /** The tick signing secret; JWT_SECRET by default. Empty disables the tick (404). */
  tickSecret?: () => string;
  now?: () => number;
  store?: JobRunStore;
  jobs?: readonly ScheduledJobDefinition[];
  capture?: JobCapture;
  /** On-demand read-only money check; defaults to the real audit. */
  runMoneyCheck?: (nowMs: number) => Promise<MoneyCheckRunResult>;
};

/** No success within this many windows marks a job overdue on the admin read. */
export const OVERDUE_WINDOWS = 3;

function summarize(row: JobRunRecord): JobRunSummary {
  return { windowKey: row.windowKey, status: row.status, attempt: row.attempt, startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null, processed: row.processedCount, failed: row.failedCount, error: row.error };
}

export function registerScheduledJobsRoutes(app: Express, deps: ScheduledJobsRouteDeps) {
  const tickSecret = deps.tickSecret ?? (() => ENV.cookieSecret);
  const now = deps.now ?? Date.now;
  const store = deps.store ?? createMysqlJobRunStore();
  const jobs = deps.jobs ?? SCHEDULED_JOBS;
  const capture = deps.capture ?? captureServerError;
  const record = (input: ActivityInput) => { try { void Promise.resolve(deps.recordActivity?.(input)).catch(() => undefined); } catch { /* logging never breaks the request */ } };

  app.post(JOBS_TICK_PATH, async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    const secret = tickSecret();
    if (!secret) return res.status(404).json({ error: "Not found" });
    const nowMs = now();
    if (!(await verifyJobsTickToken(req.header(JOBS_TICK_HEADER), secret, nowMs))) {
      record({ action: "jobs.tick_denied", outcome: "denied", resourceType: "scheduled_job" });
      // Only the Worker can reach this path, so a rejected tick means a secret
      // mismatch or clock drift between the Worker and the container: fix work.
      capture(new Error("Scheduled jobs tick rejected: missing, invalid or stale token"), { path: JOBS_TICK_PATH });
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const results = await runScheduledJobs(jobs, { store, now, capture });
      res.json(jobsTickResponseSchema.parse({ tickedAt: new Date(nowMs).toISOString(), results }));
    } catch (error) {
      if (error instanceof JobRunStoreUnavailableError) return res.status(503).json({ error: "Scheduled jobs are unavailable" });
      capture(error, { path: JOBS_TICK_PATH });
      res.status(500).json({ error: "The scheduled jobs tick failed" });
    }
  });

  app.get("/api/admin/jobs", async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const identity = await deps.resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: "Sign in to continue" });
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.jobs_denied", outcome: "denied", resourceType: "scheduled_job" });
      return res.status(403).json({ error: "Administrator access is required" });
    }
    const nowMs = now();
    try {
      const rows: AdminScheduledJob[] = await Promise.all(jobs.map(async job => {
        const [lastRun, lastSuccess] = await Promise.all([store.latest(job.name), store.latest(job.name, "succeeded")]);
        const lastSucceededAt = lastSuccess ? (lastSuccess.finishedAt ?? lastSuccess.startedAt) : null;
        return {
          name: job.name,
          description: job.description,
          windowMinutes: job.windowMs / 60_000,
          lastRun: lastRun ? summarize(lastRun) : null,
          lastSucceededAt: lastSucceededAt?.toISOString() ?? null,
          overdue: !lastSucceededAt || nowMs - lastSucceededAt.getTime() > OVERDUE_WINDOWS * job.windowMs,
        };
      }));
      res.json(adminScheduledJobsResponseSchema.parse({ cron: JOBS_CRON, checkedAt: new Date(nowMs).toISOString(), jobs: rows }));
    } catch (error) {
      if (error instanceof JobRunStoreUnavailableError) return res.status(503).json({ error: "Scheduled jobs are unavailable" });
      capture(error, { path: "/api/admin/jobs" });
      res.status(500).json({ error: "We could not load scheduled jobs" });
    }
  });

  // Admin-only, read-only on demand money check: returns the findings text and
  // sends the same owner email. Writes nothing but the activity-log row.
  let lastMoneyCheckAt = 0;
  app.post("/api/admin/money-check/run", async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const identity = await deps.resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: "Sign in to continue" });
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.money_check_denied", outcome: "denied", resourceType: "scheduled_job", resourceId: "daily-money-check" });
      return res.status(403).json({ error: "Administrator access is required" });
    }
    const nowMs = now();
    if (nowMs - lastMoneyCheckAt < 5 * 60_000) return res.status(429).json({ error: "The money check ran a moment ago. Wait 5 minutes." });
    lastMoneyCheckAt = nowMs;
    try {
      const result = await (deps.runMoneyCheck ?? runMoneyCheckNow)(nowMs);
      record({ actorUserId: identity.account.id, action: "admin.money_check_run", outcome: result.findingsEmailed && !result.emailSent ? "failure" : "success", resourceType: "scheduled_job", resourceId: "daily-money-check" });
      res.json({ ranAt: new Date(nowMs).toISOString(), findingsFound: result.findingsEmailed, emailSent: result.emailSent, subject: result.subject, findings: result.text });
    } catch (error) {
      lastMoneyCheckAt = 0;
      capture(error, { path: "/api/admin/money-check/run" });
      res.status(500).json({ error: "The money check could not run" });
    }
  });
}

// Scheduled jobs REST surface.
//   POST /api/internal/jobs/tick  Worker cron only (src/worker.ts scheduled()):
//        X-skipwait.me-Jobs-Tick = HMAC token from JWT_SECRET (shared/jobsTick.ts).
//        404 when JWT_SECRET is unset, 401 for a missing or stale token, 503
//        without a database; otherwise runs every due job once per window.
//        The public Worker route 404s /api/internal/ and strips the header.
//   GET  /api/admin/jobs          admin: last run, last success and overdue flag per job.
// Contracts live in shared/scheduledJobs.ts; services are injectable for tests.
import { sendAdminAlertEmail } from "./errorAlerting";
import { refuseReviewerExternalAction } from "./_core/reviewerLogin";
import type { Express, Request, Response } from "express";
import { JOBS_CRON, JOBS_TICK_HEADER, JOBS_TICK_PATH } from "../shared/jobsTick";
import { adminScheduledJobsResponseSchema, jobsTickResponseSchema, type AdminScheduledJob, type JobRunSummary } from "../shared/scheduledJobs";
import { ENV } from "./_core/env";
import { verifyJobsTickToken } from "./jobsTickAuth";
import { createMysqlJobRunStore, JobRunStoreUnavailableError, type JobRunRecord, type JobRunStore } from "./jobRunStore";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";
import { runScheduledJobs, type JobCapture, type ScheduledJobDefinition } from "./scheduledJobRunner";
import { captureServerError } from "./sentry";
import { closeAbandonedCheckouts, type AbandonedCheckoutResult } from "./abandonedCheckouts";
import { listOperationalActivity } from "./db";
import { runMoneyCheckNow, type MoneyCheckRunResult } from "./dailyMoneyCheck";
import { createCardStore, type CardStore } from "./skippieCards";
import { jobWindowKey } from "../shared/scheduledJobs";
import { runScheduledJob, JOB_WINDOW_OPEN_EARLY_MS } from "./scheduledJobRunner";
import { SKIPPIE_DAILY_CAP, SKIPPIE_QUESTION_MAX, askSkippieAdmin, type SkippieDeps } from "./skippieAdmin";

type Identity = { account: { id: number; role?: "user" | "admin" } };
type ActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> };

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
  /** Sends one fixed test alert through the real alert sender; defaults to sendAdminAlertEmail. */
  sendTestAlert?: (input: { subject: string; text: string }) => Promise<{ sent: boolean }>;
  closeAbandonedCheckouts?: (nowMs: number, options: { apply: boolean }) => Promise<AbandonedCheckoutResult>;
  /** Recent owner-alert attempts of the money check, newest first. */
  listMoneyCheckAlerts?: () => Promise<Array<{ outcome: string; createdAt: Date | string }>>;
  /** Admin Skippie (read-only). Off unless enabled. */
  skippie?: { enabled: () => boolean; deps: () => SkippieDeps; /** Absent = Linear cards save a draft only. */ createLinearIssue?: (title: string, body: string) => Promise<{ url: string }> };
};

export function summarizeMoneyCheckAlerts(rows: Array<{ outcome: string; createdAt: Date | string }>, nowMs: number) {
  const sorted = [...rows].map(row => ({ outcome: row.outcome, at: new Date(row.createdAt).getTime() })).sort((a, b) => b.at - a.at);
  const week = nowMs - 7 * 24 * 60 * 60_000;
  const latest = sorted[0] ?? null;
  const lastSuccess = sorted.find(row => row.outcome === "success") ?? null;
  return {
    latestOutcome: latest ? latest.outcome : null,
    latestAt: latest ? new Date(latest.at).toISOString() : null,
    lastSuccessAt: lastSuccess ? new Date(lastSuccess.at).toISOString() : null,
    failuresLast7Days: sorted.filter(row => row.outcome === "failure" && row.at >= week).length,
    ownerNotReached: latest?.outcome === "failure",
  };
}

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
    if (refuseReviewerExternalAction(res, (identity?.account as { openId?: string } | undefined)?.openId)) return;
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

  // Admin-only: close out abandoned checkout pages older than 7 days. Preview unless the body says apply:true.
  // It only marks a reason on rows that are still pending with no invoice; nothing is deleted or credited.
  app.post("/api/admin/money-check/close-abandoned", async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const identity = await deps.resolveIdentity(req);
    if (refuseReviewerExternalAction(res, (identity?.account as { openId?: string } | undefined)?.openId)) return;
    if (!identity) return res.status(401).json({ error: "Sign in to continue" });
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.abandoned_checkouts_denied", outcome: "denied", resourceType: "payment", resourceId: "abandoned-checkouts" });
      return res.status(403).json({ error: "Administrator access is required" });
    }
    const apply = (req.body as { apply?: unknown } | undefined)?.apply === true;
    try {
      const result = await (deps.closeAbandonedCheckouts ?? closeAbandonedCheckouts)(now(), { apply });
      record({ actorUserId: identity.account.id, action: apply ? "admin.abandoned_checkouts_closed" : "admin.abandoned_checkouts_previewed", outcome: "success", resourceType: "payment", resourceId: "abandoned-checkouts", metadata: { candidates: result.candidates, closed: result.closed, accounts: result.accounts } });
      res.json(result);
    } catch (error) {
      capture(error, { path: "/api/admin/money-check/close-abandoned" });
      res.status(500).json({ error: "We could not check abandoned checkouts" });
    }
  });

  // Admin-only: did the owner alert email actually go out? A failed send must be visible, not silent.
  app.get("/api/admin/money-check/status", async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const identity = await deps.resolveIdentity(req);
    if (refuseReviewerExternalAction(res, (identity?.account as { openId?: string } | undefined)?.openId)) return;
    if (!identity) return res.status(401).json({ error: "Sign in to continue" });
    if (identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
    try {
      const rows = await (deps.listMoneyCheckAlerts ?? (async () => (await listOperationalActivity({ action: "billing.daily_money_check_alert", limit: 100 })) as Array<{ outcome: string; createdAt: Date | string }>))();
      res.json(summarizeMoneyCheckAlerts(rows, now()));
    } catch (error) {
      capture(error, { path: "/api/admin/money-check/status" });
      res.status(500).json({ error: "We could not load the alert status" });
    }
  });

  // Admin-only: one fixed-body test alert through the same sender as real alerts. No user data.
  let lastTestAlertAt = 0;
  app.post("/api/admin/alerts/test", async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const identity = await deps.resolveIdentity(req);
    if (refuseReviewerExternalAction(res, (identity?.account as { openId?: string } | undefined)?.openId)) return;
    if (!identity) return res.status(401).json({ error: "Sign in to continue" });
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.test_alert_denied", outcome: "denied", resourceType: "alert", resourceId: "test-alert" });
      return res.status(403).json({ error: "Administrator access is required" });
    }
    const nowMs = now();
    if (nowMs - lastTestAlertAt < 5 * 60_000) return res.status(429).json({ error: "A test alert was sent a moment ago. Wait 5 minutes." });
    lastTestAlertAt = nowMs;
    try {
      const send = deps.sendTestAlert ?? (input => sendAdminAlertEmail(undefined, input));
      const result = await send({ subject: "skipwait.me test alert", text: "This is a test alert from the skipwait.me admin page. No action is needed. It contains no customer data." });
      record({ actorUserId: identity.account.id, action: "admin.test_alert", outcome: result.sent ? "success" : "failure", resourceType: "alert", resourceId: "test-alert" });
      res.json({ sentAt: new Date(nowMs).toISOString(), sent: result.sent });
    } catch (error) {
      lastTestAlertAt = 0;
      capture(error, { path: "/api/admin/alerts/test" });
      res.status(500).json({ error: "The test alert could not be sent" });
    }
  });

  // Admin-only, read-only on demand money check: returns the findings text and
  // sends the same owner email. Writes nothing but the activity-log row.
  let lastMoneyCheckAt = 0;
  app.post("/api/admin/money-check/run", async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const identity = await deps.resolveIdentity(req);
    if (refuseReviewerExternalAction(res, (identity?.account as { openId?: string } | undefined)?.openId)) return;
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

  // Admin Skippie, read-only. 404 while the flag is off. Same admin guard as /api/admin/jobs.
  // Step 4: approval cards. One store per process; cards live 5 minutes.
  const cardStore: CardStore = createCardStore({
    now,
    jobs,
    latestRun: async name => { const r = await store.latest(name); return r ? { status: r.status, windowKey: r.windowKey } : undefined; },
    currentWindowKey: (job, nowMs) => jobWindowKey(nowMs + JOB_WINDOW_OPEN_EARLY_MS, job.windowMs),
    rerun: async job => { const r = await runScheduledJob(job, { store, now, capture }); return { outcome: r.outcome, processed: r.processed, failed: r.failed }; },
    createLinearIssue: deps.skippie?.createLinearIssue,
    audit: e => record({ actorUserId: e.adminId, action: e.action, outcome: e.outcome, resourceType: "skippie_card", resourceId: e.cardId?.slice(0, 12), metadata: e.metadata }),
  });
  const skippieAsks = new Map<number, { day: string; count: number }>();
  app.post("/api/admin/skippie/ask", async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    if (!deps.skippie?.enabled()) return res.status(404).json({ error: "Not found" });
    const identity = await deps.resolveIdentity(req);
    if (refuseReviewerExternalAction(res, (identity?.account as { openId?: string } | undefined)?.openId)) return;
    if (!identity) return res.status(401).json({ error: "Sign in to continue" });
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.skippie_denied", outcome: "denied", resourceType: "skippie" });
      return res.status(403).json({ error: "Administrator access is required" });
    }
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question || question.length > SKIPPIE_QUESTION_MAX) return res.status(400).json({ error: `Ask a question of 1 to ${SKIPPIE_QUESTION_MAX} characters` });
    const day = new Date(now()).toISOString().slice(0, 10);
    const seen = skippieAsks.get(identity.account.id);
    const count = seen && seen.day === day ? seen.count : 0;
    if (count >= SKIPPIE_DAILY_CAP) return res.status(429).json({ error: "Daily Skippy limit reached" });
    skippieAsks.set(identity.account.id, { day, count: count + 1 });
    try {
      const out = await askSkippieAdmin(question, { ...deps.skippie.deps(), propose: input => cardStore.propose(identity.account.id, input) });
      record({ actorUserId: identity.account.id, action: "admin.skippie_ask", outcome: "success", resourceType: "skippie", metadata: { question, answer: out.answer.slice(0, 1500), tools: out.toolsUsed.join(","), mode: out.mode } });
      res.json({ answer: out.answer, toolsUsed: out.toolsUsed, mode: out.mode, cards: out.cards ?? [] });
    } catch (error) {
      record({ actorUserId: identity.account.id, action: "admin.skippie_ask", outcome: "failure", resourceType: "skippie", metadata: { question } });
      capture(error, { path: "/api/admin/skippie/ask" });
      res.status(500).json({ error: "Skippy could not answer" });
    }
  });

  // Approve or deny one card. Only the admin who owns the card, with the card id
  // in the path and a JSON body {"decision": "approve"|"deny"}. Model output and
  // user data have no route to this endpoint.
  app.post("/api/admin/skippie/cards/:id/decision", async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    if (!deps.skippie?.enabled()) return res.status(404).json({ error: "Not found" });
    const identity = await deps.resolveIdentity(req);
    if (refuseReviewerExternalAction(res, (identity?.account as { openId?: string } | undefined)?.openId)) return;
    if (!identity) return res.status(401).json({ error: "Sign in to continue" });
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.skippie_card_denied_access", outcome: "denied", resourceType: "skippie_card" });
      return res.status(403).json({ error: "Administrator access is required" });
    }
    if (!req.is("application/json")) return res.status(415).json({ error: "JSON only" });
    const decision = req.body?.decision;
    if (decision !== "approve" && decision !== "deny") return res.status(400).json({ error: "decision must be approve or deny" });
    const result = await cardStore.decide(identity.account.id, String(req.params.id).slice(0, 100), decision);
    res.status(result.state === "unknown" ? 404 : result.ok ? 200 : 409).json(result);
  });
}

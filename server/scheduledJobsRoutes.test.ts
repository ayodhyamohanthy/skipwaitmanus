import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { JOBS_CRON, JOBS_TICK_HEADER, JOBS_TICK_PATH, unixMinute } from "../shared/jobsTick";
import { adminScheduledJobsResponseSchema, jobsTickResponseSchema } from "../shared/scheduledJobs";
import { JobRunStoreUnavailableError, type JobRunRecord, type JobRunStore } from "./jobRunStore";
import type { ScheduledJobDefinition } from "./scheduledJobRunner";
import { registerScheduledJobsRoutes, type ScheduledJobsRouteDeps } from "./scheduledJobsRoutes";

const SECRET = "route-test-secret";
const NOW = Date.parse("2026-10-14T10:15:00.300Z");
const MINUTE = 60_000;
const token = (minute = unixMinute(NOW), secret = SECRET) => createHmac("sha256", secret).update(`jobs-tick:${minute}`).digest("hex");
const identities: Record<string, { account: { id: number; role: "user" | "admin" } }> = { admin: { account: { id: 1, role: "admin" } }, member: { account: { id: 2, role: "user" } } };

function memoryStore(seed: JobRunRecord[] = []): JobRunStore & { rows: JobRunRecord[] } {
  const rows = [...seed];
  return {
    rows,
    async insertRunning(claim) { if (rows.some(row => row.jobName === claim.jobName && row.windowKey === claim.windowKey)) return "duplicate"; rows.push({ id: rows.length + 1, ...claim, status: "running", attempt: 1, finishedAt: null, processedCount: 0, failedCount: 0, error: null }); return "inserted"; },
    async find(jobName, windowKey) { return rows.find(row => row.jobName === jobName && row.windowKey === windowKey); },
    async takeOver() { return false; },
    async complete(done) { const row = rows.find(item => item.jobName === done.jobName && item.windowKey === done.windowKey && item.leaseOwner === done.leaseOwner && item.status === "running"); if (!row) return false; Object.assign(row, { status: done.status, finishedAt: done.finishedAt, processedCount: done.processedCount, failedCount: done.failedCount, error: done.error }); return true; },
    async latest(jobName, status) { return rows.filter(row => row.jobName === jobName && (!status || row.status === status)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]; },
  };
}

function appWith(deps: Partial<ScheduledJobsRouteDeps> = {}) {
  const app = express();
  app.use(express.json());
  const activity: string[] = [];
  const capture = vi.fn();
  const run = vi.fn(async () => ({ processed: 2, failed: 0 }));
  const jobs: ScheduledJobDefinition[] = [{ name: "ask-expiry-sweep", description: "Closes stale asks", windowMs: 15 * MINUTE, leaseMs: 5 * MINUTE, run }];
  const store = memoryStore();
  registerScheduledJobsRoutes(app, { resolveIdentity: async req => identities[String(req.header("x-test-user"))], recordActivity: input => { activity.push(`${input.action}:${input.outcome}`); }, tickSecret: () => SECRET, now: () => NOW, store, jobs, capture, ...deps });
  return { app, activity, capture, run, store };
}

describe("POST /api/internal/jobs/tick", () => {
  it("runs due jobs for a valid Worker token and answers the strict tick shape", async () => {
    const { app, run, store } = appWith();
    const response = await request(app).post(JOBS_TICK_PATH).set(JOBS_TICK_HEADER, token());
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(jobsTickResponseSchema.parse(response.body)).toEqual({ tickedAt: new Date(NOW).toISOString(), results: [{ job: "ask-expiry-sweep", windowKey: "2026-10-14T10:15Z", outcome: "ran", attempt: 1, processed: 2, failed: 0 }] });
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.rows[0]).toMatchObject({ status: "succeeded", processedCount: 2 });
  });

  it("is idempotent within a window: a replayed tick reports already_ran and does not rerun", async () => {
    const { app, run } = appWith();
    await request(app).post(JOBS_TICK_PATH).set(JOBS_TICK_HEADER, token());
    const replay = await request(app).post(JOBS_TICK_PATH).set(JOBS_TICK_HEADER, token());
    expect(replay.status).toBe(200);
    expect(replay.body.results[0]).toMatchObject({ outcome: "already_ran", attempt: null });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no token", undefined],
    ["a stale token", token(unixMinute(NOW) - 2)],
    ["a token from another secret", token(unixMinute(NOW), "wrong")],
    ["a malformed token", "not-a-token"],
  ])("answers 401 with %s, records the denial, reports it and runs nothing", async (_label, presented) => {
    const { app, run, activity, capture } = appWith();
    const call = request(app).post(JOBS_TICK_PATH);
    const response = presented === undefined ? await call : await call.set(JOBS_TICK_HEADER, presented);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(run).not.toHaveBeenCalled();
    expect(activity).toEqual(["jobs.tick_denied:denied"]);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("is not reachable through a signed-in session, even an administrator's", async () => {
    const { app, run } = appWith();
    const response = await request(app).post(JOBS_TICK_PATH).set("x-test-user", "admin").set("Cookie", "app_session_id=whatever");
    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not exist (404) when JWT_SECRET is unset, whatever the header says", async () => {
    const { app, run } = appWith({ tickSecret: () => "" });
    const response = await request(app).post(JOBS_TICK_PATH).set(JOBS_TICK_HEADER, token(unixMinute(NOW), ""));
    expect(response.status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 503 without a database and never reports partial work", async () => {
    const store = memoryStore();
    const { app } = appWith({ store: { ...store, insertRunning: async () => { throw new JobRunStoreUnavailableError(); } } });
    const response = await request(app).post(JOBS_TICK_PATH).set(JOBS_TICK_HEADER, token());
    expect(response.status).toBe(503);
  });

  it("only accepts POST", async () => {
    const { app } = appWith();
    expect((await request(app).get(JOBS_TICK_PATH).set(JOBS_TICK_HEADER, token())).status).toBe(404);
  });
});

describe("GET /api/admin/jobs", () => {
  const succeeded = (finishedAt: number): JobRunRecord => ({ id: 1, jobName: "ask-expiry-sweep", windowKey: "2026-10-14T09:45Z", status: "succeeded", attempt: 1, leaseOwner: "a", startedAt: new Date(finishedAt - 2_000), leaseExpiresAt: new Date(finishedAt + 5 * MINUTE), finishedAt: new Date(finishedAt), processedCount: 3, failedCount: 0, error: null });

  it("401s anonymous callers and 403s signed-in non-admins without reading runs", async () => {
    const latest = vi.fn();
    const { app, activity } = appWith({ store: { ...memoryStore(), latest } });
    expect((await request(app).get("/api/admin/jobs")).status).toBe(401);
    const member = await request(app).get("/api/admin/jobs").set("x-test-user", "member");
    expect(member.status).toBe(403);
    expect(member.headers["cache-control"]).toBe("private, no-store");
    expect(latest).not.toHaveBeenCalled();
    expect(activity).toEqual(["admin.jobs_denied:denied"]);
  });

  it("shows an admin each job's last run and last success, not overdue while fresh", async () => {
    const failed: JobRunRecord = { ...succeeded(NOW - MINUTE), id: 2, windowKey: "2026-10-14T10:00Z", status: "failed", attempt: 2, startedAt: new Date(NOW - 30_000), finishedAt: new Date(NOW - 29_000), processedCount: 1, failedCount: 1, error: "1 item(s) failed" };
    const { app } = appWith({ store: memoryStore([succeeded(NOW - 20 * MINUTE), failed]) });
    const response = await request(app).get("/api/admin/jobs").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    const body = adminScheduledJobsResponseSchema.parse(response.body);
    expect(body.cron).toBe(JOBS_CRON);
    expect(body.jobs).toEqual([{ name: "ask-expiry-sweep", description: "Closes stale asks", windowMinutes: 15, lastRun: { windowKey: "2026-10-14T10:00Z", status: "failed", attempt: 2, startedAt: new Date(NOW - 30_000).toISOString(), finishedAt: new Date(NOW - 29_000).toISOString(), processed: 1, failed: 1, error: "1 item(s) failed" }, lastSucceededAt: new Date(NOW - 20 * MINUTE).toISOString(), overdue: false }]);
  });

  it("flags a job overdue when it never succeeded or not within three windows", async () => {
    const never = await request(appWith().app).get("/api/admin/jobs").set("x-test-user", "admin");
    expect(never.body.jobs[0]).toMatchObject({ lastRun: null, lastSucceededAt: null, overdue: true });
    const stale = await request(appWith({ store: memoryStore([succeeded(NOW - 46 * MINUTE)]) }).app).get("/api/admin/jobs").set("x-test-user", "admin");
    expect(stale.body.jobs[0].overdue).toBe(true);
  });

  it("answers 503 when the run records are unavailable", async () => {
    const { app } = appWith({ store: { ...memoryStore(), latest: async () => { throw new JobRunStoreUnavailableError(); } } });
    expect((await request(app).get("/api/admin/jobs").set("x-test-user", "admin")).status).toBe(503);
  });
});

describe("POST /api/admin/money-check/run", () => {
  const result = { emailSent: true, findingsEmailed: true, subject: "skipwait.me daily money check · 1 finding", text: "parked payment: #7" };
  it("rejects anonymous callers (401) and non-admins (403) without running the audit", async () => {
    const runMoneyCheck = vi.fn(async () => result);
    const { app, activity } = appWith({ runMoneyCheck });
    expect((await request(app).post("/api/admin/money-check/run")).status).toBe(401);
    const denied = await request(app).post("/api/admin/money-check/run").set("x-test-user", "member");
    expect(denied.status).toBe(403);
    expect(runMoneyCheck).not.toHaveBeenCalled();
    expect(activity).toContain("admin.money_check_denied:denied");
  });
  it("returns the findings text to an admin and logs the run", async () => {
    const runMoneyCheck = vi.fn(async () => result);
    const { app, activity } = appWith({ runMoneyCheck });
    const response = await request(app).post("/api/admin/money-check/run").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toMatchObject({ findingsFound: true, emailSent: true, findings: "parked payment: #7" });
    expect(activity).toContain("admin.money_check_run:success");
  });
  it("logs a failure when findings exist but the email did not send, and still returns them", async () => {
    const { app, activity } = appWith({ runMoneyCheck: async () => ({ ...result, emailSent: false }) });
    const response = await request(app).post("/api/admin/money-check/run").set("x-test-user", "admin");
    expect(response.body).toMatchObject({ emailSent: false, findings: "parked payment: #7" });
    expect(activity).toContain("admin.money_check_run:failure");
  });
  it("rate limits to one run per 5 minutes and reports errors without leaking them", async () => {
    const { app } = appWith({ runMoneyCheck: async () => result });
    await request(app).post("/api/admin/money-check/run").set("x-test-user", "admin");
    expect((await request(app).post("/api/admin/money-check/run").set("x-test-user", "admin")).status).toBe(429);
    const failing = appWith({ runMoneyCheck: async () => { throw new Error("db password leaked"); } });
    const response = await request(failing.app).post("/api/admin/money-check/run").set("x-test-user", "admin");
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("leaked");
    expect(failing.capture).toHaveBeenCalled();
  });
});

describe("POST /api/admin/alerts/test", () => {
  it("is admin only and sends nothing otherwise", async () => {
    const sendTestAlert = vi.fn(async () => ({ sent: true }));
    const { app, activity } = appWith({ sendTestAlert });
    expect((await request(app).post("/api/admin/alerts/test")).status).toBe(401);
    expect((await request(app).post("/api/admin/alerts/test").set("x-test-user", "member")).status).toBe(403);
    expect(sendTestAlert).not.toHaveBeenCalled();
    expect(activity).toContain("admin.test_alert_denied:denied");
  });
  it("sends one fixed body with no user data, logs it, and rate limits", async () => {
    const sendTestAlert = vi.fn(async (_i: { subject: string; text: string }) => ({ sent: true }));
    const { app, activity } = appWith({ sendTestAlert });
    const ok = await request(app).post("/api/admin/alerts/test").set("x-test-user", "admin").send({ text: "attacker text" });
    expect(ok.status).toBe(200);
    expect(ok.body.sent).toBe(true);
    expect(sendTestAlert.mock.calls[0]![0].subject).toBe("skipwait.me test alert");
    expect(sendTestAlert.mock.calls[0]![0].text).not.toContain("attacker");
    expect(activity).toContain("admin.test_alert:success");
    expect((await request(app).post("/api/admin/alerts/test").set("x-test-user", "admin")).status).toBe(429);
  });
  it("reports a failed send and hides errors", async () => {
    const failing = appWith({ sendTestAlert: async () => { throw new Error("key leaked"); } });
    const r = await request(failing.app).post("/api/admin/alerts/test").set("x-test-user", "admin");
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("leaked");
    const notSent = appWith({ sendTestAlert: async () => ({ sent: false }) });
    expect((await request(notSent.app).post("/api/admin/alerts/test").set("x-test-user", "admin")).body.sent).toBe(false);
  });
});

describe("POST /api/admin/money-check/close-abandoned", () => {
  const plan = { cutoff: "2026-10-15T00:00:00.000Z", candidates: 3, accounts: 2, oldest: null, newest: null, byCurrency: [], applied: false, closed: 0 };
  it("is admin only", async () => {
    const close = vi.fn(async () => plan);
    const { app } = appWith({ closeAbandonedCheckouts: close });
    expect((await request(app).post("/api/admin/money-check/close-abandoned")).status).toBe(401);
    expect((await request(app).post("/api/admin/money-check/close-abandoned").set("x-test-user", "member")).status).toBe(403);
    expect(close).not.toHaveBeenCalled();
  });
  it("previews by default and only applies when asked", async () => {
    const close = vi.fn(async (_n: number, o: { apply: boolean }) => ({ ...plan, applied: o.apply, closed: o.apply ? 3 : 0 }));
    const { app, activity } = appWith({ closeAbandonedCheckouts: close });
    await request(app).post("/api/admin/money-check/close-abandoned").set("x-test-user", "admin").send({});
    expect(close.mock.calls[0]![1]).toEqual({ apply: false });
    const applied = await request(app).post("/api/admin/money-check/close-abandoned").set("x-test-user", "admin").send({ apply: true });
    expect(close.mock.calls[1]![1]).toEqual({ apply: true });
    expect(applied.body).toMatchObject({ applied: true, closed: 3 });
    expect(activity).toContain("admin.abandoned_checkouts_previewed:success");
    expect(activity).toContain("admin.abandoned_checkouts_closed:success");
  });
});

describe("GET /api/admin/money-check/status", () => {
  const rows = [
    { outcome: "failure", createdAt: new Date() },
    { outcome: "failure", createdAt: new Date(Date.now() - 3600_000) },
    { outcome: "success", createdAt: new Date(Date.now() - 86400_000) },
  ];
  it("is admin only", async () => {
    const { app } = appWith({ listMoneyCheckAlerts: async () => rows });
    expect((await request(app).get("/api/admin/money-check/status")).status).toBe(401);
    expect((await request(app).get("/api/admin/money-check/status").set("x-test-user", "member")).status).toBe(403);
  });
  it("says the owner was not reached when the latest alert email failed", async () => {
    const { app } = appWith({ listMoneyCheckAlerts: async () => rows });
    const response = await request(app).get("/api/admin/money-check/status").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ownerNotReached: true, failuresLast7Days: 2, latestOutcome: "failure" });
    expect(response.body.lastSuccessAt).toBeTruthy();
  });
  it("is calm when the latest alert was delivered", async () => {
    const { app } = appWith({ listMoneyCheckAlerts: async () => [rows[2]!] });
    const response = await request(app).get("/api/admin/money-check/status").set("x-test-user", "admin");
    expect(response.body).toMatchObject({ ownerNotReached: false, failuresLast7Days: 0 });
  });
});

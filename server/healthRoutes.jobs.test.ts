import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { healthJobsResponseSchema } from "../shared/scheduledJobs";
import { registerHealthRoutes, type HealthDeps } from "./healthRoutes";
import { registerScheduledJobsRoutes } from "./scheduledJobsRoutes";
import type { JobRunRecord, JobRunStore } from "./jobRunStore";
import type { ScheduledJobDefinition } from "./scheduledJobRunner";

const HOUR = 60 * 60_000;
const NOW = Date.parse("2026-11-20T12:00:00Z");
const definitions: ScheduledJobDefinition[] = [
  { name: "coverage-delivery-retry", description: "Delivery", windowMs: HOUR, leaseMs: 60_000, run: async () => ({ processed: 0, failed: 0 }) },
  { name: "daily-money-check", description: "Audit", windowMs: 24 * HOUR, leaseMs: 60_000, run: async () => ({ processed: 0, failed: 0 }) },
];
const succeeded = (jobName: string, finishedAt: number): JobRunRecord => ({
  id: 712, jobName, windowKey: "2026-11-20T00:00Z", status: "succeeded", attempt: 1,
  leaseOwner: "private-lease", startedAt: new Date(finishedAt - 1_000), leaseExpiresAt: new Date(finishedAt + 60_000),
  finishedAt: new Date(finishedAt), processedCount: 31, failedCount: 0, error: "private diagnostics",
});
const latest = (age: number) => vi.fn(async (name: string) => succeeded(name, NOW - age));
function appWith(jobStore: Pick<JobRunStore, "latest">, extra: Partial<HealthDeps> = {}) {
  const app = express();
  registerHealthRoutes(app, {
    commitSha: async () => "private-sha", isReady: () => true, lastError: () => undefined,
    now: () => NOW, processStartMs: NOW - 48 * HOUR, jobs: definitions, jobStore, capture: vi.fn(), ...extra,
  });
  return app;
}

describe("public scheduled-job health", () => {
  it("returns only names and booleans without signing in, running a job, or writing a row", async () => {
    const read = latest(HOUR);
    const response = await request(appWith({ latest: read })).get("/api/health/jobs");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({ ok: true, jobs: definitions.map(job => ({ name: job.name, overdue: false })) });
    expect(healthJobsResponseSchema.parse(response.body)).toEqual(response.body);
    expect(read.mock.calls).toEqual(definitions.map(job => [job.name, "succeeded"]));
    expect(JSON.stringify(response.body)).not.toMatch(/private|712|processed|finishedAt|error|description/);
  });

  it("uses the same hourly and daily overdue rule as the admin read", async () => {
    const read = vi.fn(async (name: string) => succeeded(name, NOW - (name === "daily-money-check" ? 30 * HOUR + 1 : 3 * HOUR + 1)));
    const jobStore: JobRunStore = {
      latest: read, insertRunning: vi.fn(), find: vi.fn(), takeOver: vi.fn(), complete: vi.fn(),
    };
    const app = appWith(jobStore);
    registerScheduledJobsRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 1, role: "admin" } }), now: () => NOW,
      processStartMs: NOW - 48 * HOUR, jobs: definitions, store: jobStore,
    });
    const publicRead = await request(app).get("/api/health/jobs");
    const adminRead = await request(app).get("/api/admin/jobs");
    expect(publicRead.body).toEqual({ ok: false, jobs: definitions.map(job => ({ name: job.name, overdue: true })) });
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.jobs.map((job: { name: string; overdue: boolean }) => ({ name: job.name, overdue: job.overdue }))).toEqual(publicRead.body.jobs);
    expect(jobStore.insertRunning).not.toHaveBeenCalled();
    expect(jobStore.complete).not.toHaveBeenCalled();
  });

  it("allows a never-run job its startup grace, then marks it overdue", async () => {
    let clock = NOW;
    const app = appWith({ latest: vi.fn(async () => undefined) }, { now: () => clock, processStartMs: NOW });
    expect((await request(app).get("/api/health/jobs")).body.ok).toBe(true);
    clock += 3 * HOUR;
    expect((await request(app).get("/api/health/jobs")).body.ok).toBe(true);
    clock += 60_001;
    const response = await request(app).get("/api/health/jobs");
    expect(response.body).toEqual({ ok: false, jobs: [
      { name: "coverage-delivery-retry", overdue: true }, { name: "daily-money-check", overdue: false },
    ] });
  });

  it("answers 200 with ok false and no diagnostics when any store read fails", async () => {
    const capture = vi.fn();
    const app = appWith({ latest: vi.fn(async () => { throw new Error("mysql://private-token@private-db"); }) }, { capture });
    const response = await request(app).get("/api/health/jobs");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: false, jobs: definitions.map(job => ({ name: job.name, overdue: true })) });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response.body)).not.toMatch(/mysql|private|token|error/);
  });

  it("shares concurrent reads and refreshes the snapshot after 60 seconds", async () => {
    let clock = NOW;
    const read = latest(HOUR);
    const app = appWith({ latest: read }, { now: () => clock });
    const responses = await Promise.all(Array.from({ length: 12 }, () => request(app).get("/api/health/jobs")));
    expect(responses.every(response => response.status === 200 && response.body.ok === true)).toBe(true);
    expect(read).toHaveBeenCalledTimes(definitions.length);
    clock += 59_999;
    await request(app).get("/api/health/jobs");
    expect(read).toHaveBeenCalledTimes(definitions.length);
    clock += 1;
    await request(app).get("/api/health/jobs");
    expect(read).toHaveBeenCalledTimes(2 * definitions.length);
  });

  it("caches failed reads but observes recovery at the next refresh", async () => {
    let clock = NOW;
    const read = vi.fn(async (name: string) => {
      if (clock === NOW) throw new Error("unavailable");
      return succeeded(name, clock - HOUR);
    });
    const app = appWith({ latest: read }, { now: () => clock });
    expect((await request(app).get("/api/health/jobs")).body.ok).toBe(false);
    await request(app).get("/api/health/jobs");
    expect(read).toHaveBeenCalledTimes(definitions.length);
    clock += 60_000;
    expect((await request(app).get("/api/health/jobs")).body.ok).toBe(true);
    expect(read).toHaveBeenCalledTimes(2 * definitions.length);
  });

  it("bounds a stalled read and ignores its late success until a fresh snapshot", async () => {
    let clock = NOW;
    const pending: Array<() => void> = [];
    const read = vi.fn((name: string): Promise<JobRunRecord> => clock === NOW
      ? new Promise(resolve => { pending.push(() => resolve(succeeded(name, NOW - HOUR))); })
      : Promise.resolve(succeeded(name, clock - HOUR)));
    const capture = vi.fn();
    const app = appWith({ latest: read }, { now: () => clock, capture });
    const response = await request(app).get("/api/health/jobs");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: false, jobs: definitions.map(job => ({ name: job.name, overdue: true })) });
    expect(capture).toHaveBeenCalledTimes(1);
    for (const resolve of pending) resolve();
    expect((await request(app).get("/api/health/jobs")).body).toEqual(response.body);
    expect(read).toHaveBeenCalledTimes(definitions.length);
    clock += 60_000;
    expect((await request(app).get("/api/health/jobs")).body.ok).toBe(true);
    expect(read).toHaveBeenCalledTimes(2 * definitions.length);
  });

  it("rejects extra root and row fields, invalid names and mistyped flags at the shared boundary", () => {
    const valid = { ok: true, jobs: [{ name: "daily-money-check", overdue: false }] };
    expect(healthJobsResponseSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...valid, checkedAt: new Date(NOW).toISOString() },
      { ok: true, jobs: [{ ...valid.jobs[0], processed: 1 }] },
      { ok: true, jobs: [{ name: "not-registered", overdue: false }] },
      { ok: true, jobs: [{ name: "daily-money-check", overdue: "false" }] },
    ]) expect(healthJobsResponseSchema.safeParse(invalid).success).toBe(false);
  });
});

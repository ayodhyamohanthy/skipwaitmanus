import { describe, expect, it, vi } from "vitest";
import { JOB_RUN_MAX_ATTEMPTS } from "../shared/scheduledJobs";
import type { JobRunClaim, JobRunCompletion, JobRunRecord, JobRunStore } from "./jobRunStore";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { runScheduledJob, runScheduledJobs, type ScheduledJobDefinition } from "./scheduledJobRunner";

const MINUTE = 60_000;
const T0 = Date.parse("2026-10-14T10:15:00.050Z");

/** Faithful in-memory jobRuns: a unique (jobName, windowKey) key, CAS takeover, owner-checked completion. */
function memoryStore() {
  const rows: JobRunRecord[] = [];
  const key = (jobName: string, windowKey: string) => rows.find(row => row.jobName === jobName && row.windowKey === windowKey);
  const store: JobRunStore = {
    async insertRunning(claim: JobRunClaim) {
      if (key(claim.jobName, claim.windowKey)) return "duplicate";
      rows.push({ id: rows.length + 1, ...claim, status: "running", attempt: 1, finishedAt: null, processedCount: 0, failedCount: 0, error: null });
      return "inserted";
    },
    async find(jobName, windowKey) { const row = key(jobName, windowKey); return row && { ...row }; },
    async takeOver(id, fromAttempt, claim) {
      const row = rows.find(item => item.id === id && item.jobName === claim.jobName && item.windowKey === claim.windowKey);
      const free = row && row.attempt === fromAttempt && (row.status === "failed" || (row.status === "running" && row.leaseExpiresAt.getTime() < claim.startedAt.getTime()));
      if (!row || !free) return false;
      Object.assign(row, { status: "running", attempt: fromAttempt + 1, leaseOwner: claim.leaseOwner, startedAt: claim.startedAt, leaseExpiresAt: claim.leaseExpiresAt, finishedAt: null, processedCount: 0, failedCount: 0, error: null });
      return true;
    },
    async complete(done: JobRunCompletion) {
      const row = key(done.jobName, done.windowKey);
      if (!row || row.leaseOwner !== done.leaseOwner || row.status !== "running") return false;
      Object.assign(row, { status: done.status, finishedAt: done.finishedAt, processedCount: done.processedCount, failedCount: done.failedCount, error: done.error });
      return true;
    },
    async latest(jobName, status) {
      return rows.filter(row => row.jobName === jobName && (!status || row.status === status)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id - a.id)[0];
    },
  };
  return { store, rows };
}

function job(run: ScheduledJobDefinition["run"]): ScheduledJobDefinition {
  return { name: "ask-expiry-sweep", description: "test", windowMs: 15 * MINUTE, leaseMs: 5 * MINUTE, run };
}

let owners = 0;
const deps = (store: JobRunStore, nowMs: number, capture = vi.fn()) => ({ store, now: () => nowMs, newLeaseOwner: () => `owner-${++owners}`, capture });

describe("scheduled job runner: single flight per window", () => {
  it("runs a fresh window once and records the outcome", async () => {
    const { store, rows } = memoryStore();
    const run = vi.fn(async () => ({ processed: 4, failed: 0 }));
    const result = await runScheduledJob(job(run), deps(store, T0));
    expect(result).toEqual({ job: "ask-expiry-sweep", windowKey: "2026-10-14T10:15Z", outcome: "ran", attempt: 1, processed: 4, failed: 0 });
    expect(run).toHaveBeenCalledWith({ nowMs: T0, windowKey: "2026-10-14T10:15Z" });
    expect(rows[0]).toMatchObject({ status: "succeeded", attempt: 1, processedCount: 4, failedCount: 0, error: null, startedAt: new Date(T0) });
  });

  it("lets exactly one of two overlapping ticks run the window (lease contention)", async () => {
    const { store, rows } = memoryStore();
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const run = vi.fn(async () => { await gate; return { processed: 1, failed: 0 }; });
    const first = runScheduledJob(job(run), deps(store, T0));
    const second = runScheduledJob(job(run), deps(store, T0 + 2_000));
    const secondResult = await second;
    release();
    const firstResult = await first;
    expect(run).toHaveBeenCalledTimes(1);
    expect(firstResult.outcome).toBe("ran");
    expect(secondResult).toMatchObject({ outcome: "leased", attempt: null, processed: 0 });
    expect(rows).toHaveLength(1);
  });

  it("is idempotent: a repeated tick in a succeeded window does not run again, the next window does", async () => {
    const { store, rows } = memoryStore();
    const run = vi.fn(async () => ({ processed: 0, failed: 0 }));
    await runScheduledJob(job(run), deps(store, T0));
    expect((await runScheduledJob(job(run), deps(store, T0 + 5 * MINUTE))).outcome).toBe("already_ran");
    expect(run).toHaveBeenCalledTimes(1);
    expect((await runScheduledJob(job(run), deps(store, T0 + 15 * MINUTE))).outcome).toBe("ran");
    expect(rows.map(row => row.windowKey)).toEqual(["2026-10-14T10:15Z", "2026-10-14T10:30Z"]);
  });

  it("opens a window a minute early so a container clock just behind the cron lands in the cron's window", async () => {
    const { store } = memoryStore();
    const result = await runScheduledJob(job(async () => ({ processed: 0, failed: 0 })), deps(store, Date.parse("2026-10-14T10:14:59.700Z")));
    expect(result.windowKey).toBe("2026-10-14T10:15Z");
  });

  it("takes over a failed window on the next tick, up to the attempt cap", async () => {
    const { store, rows } = memoryStore();
    const run = vi.fn(async () => { throw new Error("transient"); });
    const outcomes = [];
    for (let i = 0; i < JOB_RUN_MAX_ATTEMPTS + 1; i += 1) outcomes.push(await runScheduledJob(job(run), deps(store, T0 + i * MINUTE)));
    expect(outcomes.map(item => [item.outcome, item.attempt])).toEqual([["failed", 1], ["failed", 2], ["failed", 3], ["attempts_exhausted", null]]);
    expect(run).toHaveBeenCalledTimes(JOB_RUN_MAX_ATTEMPTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", attempt: JOB_RUN_MAX_ATTEMPTS });
  });

  it("takes over a running row only after its lease expires (crashed runner)", async () => {
    const { store, rows } = memoryStore();
    await store.insertRunning({ jobName: "ask-expiry-sweep", windowKey: "2026-10-14T10:15Z", leaseOwner: "crashed", startedAt: new Date(T0), leaseExpiresAt: new Date(T0 + 5 * MINUTE) });
    const run = vi.fn(async () => ({ processed: 2, failed: 0 }));
    expect((await runScheduledJob(job(run), deps(store, T0 + 4 * MINUTE))).outcome).toBe("leased");
    expect(run).not.toHaveBeenCalled();
    const result = await runScheduledJob(job(run), deps(store, T0 + 6 * MINUTE));
    expect(result).toMatchObject({ outcome: "ran", attempt: 2, processed: 2 });
    expect(rows[0]).toMatchObject({ status: "succeeded", attempt: 2 });
  });

  it("refuses a second takeover of the same attempt (compare-and-set)", async () => {
    const { store, rows } = memoryStore();
    await store.insertRunning({ jobName: "ask-expiry-sweep", windowKey: "2026-10-14T10:15Z", leaseOwner: "a", startedAt: new Date(T0), leaseExpiresAt: new Date(T0) });
    rows[0].status = "failed";
    const claim = (owner: string) => ({ jobName: "ask-expiry-sweep", windowKey: "2026-10-14T10:15Z", leaseOwner: owner, startedAt: new Date(T0 + MINUTE), leaseExpiresAt: new Date(T0 + 6 * MINUTE) });
    expect(await store.takeOver(1, 1, claim("b"))).toBe(true);
    expect(await store.takeOver(1, 1, claim("c"))).toBe(false);
    expect(rows[0]).toMatchObject({ leaseOwner: "b", attempt: 2 });
  });
});

describe("scheduled job runner: failures", () => {
  it("records a thrown job as failed with a redacted error and reports it to Sentry", async () => {
    const { store, rows } = memoryStore();
    const capture = vi.fn();
    const boom = new Error("Failed query: select 1 params: [secret@example.com] password=hunter2");
    const result = await runScheduledJob(job(async () => { throw boom; }), deps(store, T0, capture));
    expect(result).toMatchObject({ outcome: "failed", attempt: 1, processed: 0, failed: 0 });
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error).not.toContain("secret@example.com");
    expect(rows[0].error).not.toContain("hunter2");
    expect(capture).toHaveBeenCalledWith(boom, expect.objectContaining({ job: "ask-expiry-sweep", windowKey: "2026-10-14T10:15Z", attempt: 1 }));
  });

  it("marks a run with per-item failures failed, keeps the processed count and reports the first cause", async () => {
    const { store, rows } = memoryStore();
    const capture = vi.fn();
    const cause = new Error("Your referral credit wallet is unavailable");
    const result = await runScheduledJob(job(async () => ({ processed: 3, failed: 2, firstError: cause })), deps(store, T0, capture));
    expect(result).toMatchObject({ outcome: "failed", processed: 3, failed: 2 });
    expect(rows[0]).toMatchObject({ status: "failed", processedCount: 3, failedCount: 2, error: "2 item(s) failed: Your referral credit wallet is unavailable" });
    expect(capture).toHaveBeenCalledWith(cause, expect.objectContaining({ failed: 2 }));
  });

  it("reports a run whose lease was lost before it could record its outcome", async () => {
    const { store, rows } = memoryStore();
    const capture = vi.fn();
    const result = await runScheduledJob(job(async () => { rows[0].leaseOwner = "someone-else"; return { processed: 1, failed: 0 }; }), deps(store, T0, capture));
    expect(result.outcome).toBe("ran");
    expect(rows[0].status).toBe("running");
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("lost its lease") }), expect.any(Object));
  });

  it("keeps running later jobs when one job's bookkeeping fails, but surfaces a missing database", async () => {
    const { store } = memoryStore();
    const capture = vi.fn();
    const broken: JobRunStore = { ...store, insertRunning: vi.fn().mockRejectedValueOnce(new Error("deadlock")).mockImplementation(store.insertRunning) };
    const run = vi.fn(async () => ({ processed: 0, failed: 0 }));
    const results = await runScheduledJobs([job(run), job(run)], deps(broken, T0, capture));
    expect(results.map(item => item.outcome)).toEqual(["failed", "ran"]);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ message: "deadlock" }), expect.objectContaining({ stage: "bookkeeping" }));
    const unavailable: JobRunStore = { ...store, insertRunning: async () => { throw new JobRunStoreUnavailableError(); } };
    await expect(runScheduledJobs([job(run)], deps(unavailable, T0 + 30 * MINUTE))).rejects.toBeInstanceOf(JobRunStoreUnavailableError);
  });
});

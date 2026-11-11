import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { jobRuns } from "../drizzle/schema";
import { deriveJobsTickToken, isInternalApiPath, JOBS_TICK_HEADER, JOBS_TICK_PATH, JOBS_TICK_TOKEN_PATTERN, unixMinute, withoutJobsTickHeader } from "../shared/jobsTick";
import {
  JOB_RUN_MAX_ATTEMPTS,
  JOB_RUN_STATUSES,
  SCHEDULED_JOB_NAMES,
  adminScheduledJobsResponseSchema,
  jobRunSummarySchema,
  jobTickResultSchema,
  jobWindowKey,
  jobsTickResponseSchema,
} from "../shared/scheduledJobs";
import { DESIRED_INDEXES, DESIRED_TABLES } from "./schemaReconcile";

const migration = readFileSync(join(__dirname, "..", "drizzle", "deploy", "0078_job_runs.sql"), "utf8");
const MINUTE = 60_000;

describe("jobs tick protocol", () => {
  it("derives HMAC-SHA256(secret, 'jobs-tick:' + minute) as lowercase hex, identical to node:crypto", async () => {
    const minute = unixMinute(Date.parse("2026-10-14T10:15:00.000Z"));
    const token = await deriveJobsTickToken("test-secret", minute);
    expect(token).toMatch(JOBS_TICK_TOKEN_PATTERN);
    expect(token).toBe(createHmac("sha256", "test-secret").update(`jobs-tick:${minute}`).digest("hex"));
    expect(await deriveJobsTickToken("test-secret", minute + 1)).not.toBe(token);
    expect(await deriveJobsTickToken("other-secret", minute)).not.toBe(token);
  });

  it("refuses an empty secret or a malformed minute", async () => {
    await expect(deriveJobsTickToken("", 1)).rejects.toThrow();
    await expect(deriveJobsTickToken("s", -1)).rejects.toThrow();
    await expect(deriveJobsTickToken("s", 1.5)).rejects.toThrow();
  });

  it("floors milliseconds to the unix minute", () => {
    expect(unixMinute(0)).toBe(0);
    expect(unixMinute(MINUTE - 1)).toBe(0);
    expect(unixMinute(MINUTE)).toBe(1);
  });

  it("strips the tick header from a public request and leaves other requests untouched", async () => {
    const plain = new Request("https://skipwait.me/api/health");
    expect(withoutJobsTickHeader(plain)).toBe(plain);
    const forged = new Request("https://skipwait.me/api/referrals", { method: "POST", headers: { [JOBS_TICK_HEADER]: "a".repeat(64), "X-Skipwait-Jobs-Tick": "b".repeat(64), "content-type": "application/json" }, body: JSON.stringify({ ok: true }) });
    const stripped = withoutJobsTickHeader(forged);
    expect(stripped.headers.has(JOBS_TICK_HEADER)).toBe(false);
    expect(stripped.headers.get("content-type")).toBe("application/json");
    expect(stripped.method).toBe("POST");
    expect(await stripped.json()).toEqual({ ok: true });
  });

  it("recognises every internal path and nothing else", () => {
    expect(isInternalApiPath(JOBS_TICK_PATH)).toBe(true);
    expect(isInternalApiPath("/api/internal")).toBe(true);
    expect(isInternalApiPath("/api/internal/anything")).toBe(true);
    expect(isInternalApiPath("/api/Internal/Jobs/Tick")).toBe(true);
    expect(isInternalApiPath("/api/internalize")).toBe(false);
    expect(isInternalApiPath("/api/admin/jobs")).toBe(false);
  });
});

describe("scheduled jobs contract", () => {
  it("names each job once, within the column width", () => {
    // GO-LIVE-1b added chargebee-subscription-reconcile (pending pass checkout safety net);
    // the D-067 recovery adds billing-review-retry (durable retired-plan review transport);
    // D-038 adds referral-timers (48 h claim and allocation lapses; referred deadline behind its switch).
    expect(SCHEDULED_JOB_NAMES).toEqual(["ask-expiry-sweep", "ask-invite-expiry", "first-look-release", "plan-credit-cycles", "chargebee-pending-reconcile", "chargebee-subscription-reconcile", "work-email-reverify-sweep", "data-export-sweep", "work-email-otp-purge", "coverage-delivery-retry", "referral-timers", "daily-money-check", "billing-review-retry", "job-catalog-sync"]);
    expect(new Set(SCHEDULED_JOB_NAMES).size).toBe(SCHEDULED_JOB_NAMES.length);
    expect(Math.max(...SCHEDULED_JOB_NAMES.map(name => name.length))).toBeLessThanOrEqual(64);
  });

  it("keys windows by their epoch-aligned UTC start", () => {
    const fifteen = 15 * MINUTE;
    expect(jobWindowKey(Date.parse("2026-10-14T10:15:00.000Z"), fifteen)).toBe("2026-10-14T10:15Z");
    expect(jobWindowKey(Date.parse("2026-10-14T10:29:59.999Z"), fifteen)).toBe("2026-10-14T10:15Z");
    expect(jobWindowKey(Date.parse("2026-10-14T10:30:00.000Z"), fifteen)).toBe("2026-10-14T10:30Z");
    expect(() => jobWindowKey(0, 90_000)).toThrow();
    expect(() => jobWindowKey(0, 0)).toThrow();
  });

  it("parses tick results strictly", () => {
    const result = { job: "ask-expiry-sweep", windowKey: "2026-10-14T10:15Z", outcome: "ran", attempt: 1, processed: 3, failed: 0 };
    expect(jobTickResultSchema.parse(result)).toEqual(result);
    expect(jobsTickResponseSchema.safeParse({ tickedAt: "2026-10-14T10:15:01.000Z", results: [result] }).success).toBe(true);
    for (const bad of [
      { ...result, job: "unknown-job" },
      { ...result, windowKey: "2026-10-14 10:15" },
      { ...result, outcome: "skipped" },
      { ...result, attempt: JOB_RUN_MAX_ATTEMPTS + 1 },
      { ...result, processed: -1 },
      { ...result, extra: true },
    ]) expect(jobTickResultSchema.safeParse(bad).success).toBe(false);
  });

  it("parses the admin status read strictly", () => {
    const lastRun = { windowKey: "2026-10-14T10:15Z", status: "failed", attempt: 2, startedAt: "2026-10-14T10:15:01.000Z", finishedAt: "2026-10-14T10:15:03.000Z", processed: 1, failed: 1, error: "1 item(s) failed" };
    expect(jobRunSummarySchema.parse(lastRun)).toEqual(lastRun);
    const body = { cron: "*/15 * * * *", checkedAt: "2026-10-14T10:20:00.000Z", jobs: [{ name: "ask-expiry-sweep", description: "Expires stale asks", windowMinutes: 15, lastRun, lastSucceededAt: null, overdue: true }] };
    expect(adminScheduledJobsResponseSchema.parse(body)).toEqual(body);
    expect(adminScheduledJobsResponseSchema.safeParse({ ...body, jobs: [{ ...body.jobs[0], lastRun: { ...lastRun, status: "queued" } }] }).success).toBe(false);
    expect(adminScheduledJobsResponseSchema.safeParse({ ...body, secret: "x" }).success).toBe(false);
  });
});

describe("jobRuns table and migration 0078", () => {
  it("declares the lock key, statuses and widths the contract assumes", () => {
    const config = getTableConfig(jobRuns);
    expect(jobRuns.status.enumValues).toEqual([...JOB_RUN_STATUSES]);
    const unique = config.indexes.find(index => index.config.name === "job_runs_job_window_unique");
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.columns.map(column => ("name" in column ? column.name : ""))).toEqual(["jobName", "windowKey"]);
    expect(jobRuns.jobName.length).toBe(64);
    expect(jobRuns.windowKey.length).toBe(32);
    expect(jobRuns.error.length).toBe(500);
    expect(jobRuns.finishedAt.notNull).toBe(false);
  });

  it("creates the table additively and idempotently", () => {
    const body = migration.replace(/--.*$/gm, "");
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS `jobRuns`/);
    expect(body).toContain("UNIQUE INDEX `job_runs_job_window_unique`(`jobName`,`windowKey`)");
    expect(body).toContain("INDEX `job_runs_job_started_idx`(`jobName`,`startedAt`)");
    expect(body).not.toMatch(/\b(ALTER|UPDATE|INSERT|DELETE|DROP|RENAME|TRUNCATE)\b/i);
  });

  it("is required by boot validation exactly as the migration creates it", () => {
    const desired = DESIRED_TABLES.find(item => item.table === "jobRuns");
    const normalise = (sql: string) => sql.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").replace(/;\s*$/, "").trim();
    expect(desired && normalise(desired.createSql)).toBe(normalise(migration.replace(/--.*$/gm, "")));
    expect(DESIRED_INDEXES).toContainEqual({ table: "jobRuns", name: "job_runs_job_window_unique", columns: "`jobName`,`windowKey`" });
    expect(DESIRED_INDEXES).toContainEqual({ table: "jobRuns", name: "job_runs_job_started_idx", columns: "`jobName`,`startedAt`", nonUnique: true });
  });
});

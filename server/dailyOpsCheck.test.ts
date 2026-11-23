import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, type SQL } from "drizzle-orm";
import { MySqlDialect, type MySqlTable } from "drizzle-orm/mysql-core";
import { jobs, jobRuns, notifications, operationalActivityLogs, profiles, referralRequests, referralReviewDeliveries, referrerReviewEmailLinks, userBlocks, users, workEmailOtpCodes, workEmailOtpRateLimits, workEmailOtpReceipts } from "../drizzle/schema";
import { jobWindowKey } from "../shared/scheduledJobs";
import { claimReferralReviewDelivery, completeReferralReviewDelivery, createReferralRequest, getDb, prepareReferrerReviewEmailNotifications, recordOperationalActivity } from "./db";
import { createDailyOpsCheck } from "./dailyOpsCheck";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { createMysqlJobRunStore } from "./jobRunStore";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";
import { runScheduledJob, type ScheduledJobDefinition } from "./scheduledJobRunner";
import { createWorkEmailOtpService } from "./workEmailOtp";
import { createWorkEmailOtpPurgeJob } from "./workEmailOtpPurge";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(actual.getDb) };
});
vi.mock("node:dns/promises", () => ({ resolveMx: vi.fn(async () => [{ exchange: "mail.acme.com", priority: 10 }]), resolve4: vi.fn(async () => []) }));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-24T12:00:00.000Z");
const MONDAY = Date.parse("2026-11-23T12:00:00.000Z");
const SEEKER = 7;
const REFERRER = 2;
const GHOST_REFERRER = 999;
const JOB_ID = 11;
const store = createInMemoryDrizzle();
const dialect = new MySqlDialect();
const fixture = { databaseClockSkewMs: 0, failActivityInsert: false, interleaveRequest: false };
let requestAggregateReads = 0;
let requestAggregateSql: string | undefined;
let requestAggregateParams: ReturnType<MySqlDialect["sqlToQuery"]>["params"] | undefined;

function withDefaults(table: MySqlTable, values: Row): Row {
  const row = { ...values };
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (row[key] !== undefined) continue;
    if (key === "createdAt" || key === "updatedAt") row[key] = new Date();
    else if (typeof column.default === "string" || typeof column.default === "number" || typeof column.default === "boolean") row[key] = column.default;
  }
  return row;
}

function fixtureDb(base: typeof store.db = store.db) {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "insert") return (table: MySqlTable) => {
        if (table === operationalActivityLogs && fixture.failActivityInsert) {
          return { values: () => { throw new Error("synthetic activity insert failure"); } };
        }
        const inner = target.insert(table);
        return { values: (input: Row | readonly Row[]) => {
          const rows = (Array.isArray(input) ? input : [input]) as readonly Row[];
          const query = inner.values(rows.map(row => withDefaults(table, row)));
          return { onDuplicateKeyUpdate: (config: Parameters<typeof query.onDuplicateKeyUpdate>[0]) => query.onDuplicateKeyUpdate(config), then: query.then.bind(query) };
        } };
      };
      if (prop === "execute") return async (query: SQL) => {
        const compiled = dialect.sqlToQuery(query);
        const text = compiled.sql.toLowerCase();
        if (text.includes("select now() as now")) return [[{ now: new Date(Date.now() + fixture.databaseClockSkewMs) }], []];
        if (text.includes("count(case when") && text.includes("referralrequests")) {
          requestAggregateReads += 1;
          requestAggregateSql = text;
          requestAggregateParams = compiled.params;
          if (fixture.interleaveRequest) {
            fixture.interleaveRequest = false;
            await newAsk(NOW - HOUR);
            vi.setSystemTime(NOW);
          }
          const databaseNow = Date.now() + fixture.databaseClockSkewMs;
          const recent = store.rows(referralRequests).filter(row => {
            const createdAt = new Date(String(row.createdAt)).getTime();
            return createdAt >= databaseNow - 7 * DAY && createdAt <= databaseNow;
          });
          return [[{ last24Hours: recent.filter(row => new Date(String(row.createdAt)).getTime() >= databaseNow - DAY).length, last7Days: recent.length }], []];
        }
        if (text.includes("select id, codehash")) {
          const rows = store.rows(workEmailOtpCodes).filter(row => row.consumedAt === null)
            .sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)) || Number(b.id) - Number(a.id))
            .map(row => ({ id: Number(row.id), codeHash: String(row.codeHash), attempts: Number(row.attempts ?? 0), createdAt: row.createdAt }));
          return [[rows[0] ?? null], []];
        }
        if (text.includes("select max(expiresat)")) return [[{ until: null }], []];
        if (text.includes("select hitcount")) return [[{ hitCount: 1 }], []];
        return [{ affectedRows: 1, insertId: 0 }, []];
      };
      if (prop === "transaction") return async <T>(run: (tx: typeof target) => Promise<T>) => {
        if (typeof target.transaction !== "function") return run(receiver as typeof target);
        return target.transaction(async tx => run(fixtureDb(tx as typeof store.db) as typeof target));
      };
      return Reflect.get(target, prop, receiver);
    },
  });
}

const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const person = (id: number, email: string): Row => full(users, { id, name: `Fixture person ${id}`, email, suspended: false });
const employee = (id: number, userId: number): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"), paused: false, notifyNewAsk: true });

type Email = { subject: string; text: string };
async function runOps(at = NOW, sendEmail: (input: Email) => Promise<boolean> = async () => true, windowKey = jobWindowKey(at, DAY)) {
  vi.setSystemTime(at);
  const emails: Email[] = [];
  const output = await createDailyOpsCheck({ sendEmail: async input => { emails.push(input); return sendEmail(input); } })({ nowMs: at, windowKey });
  return { emails, output };
}

async function newAsk(at = NOW, referrerId = REFERRER): Promise<number> {
  vi.setSystemTime(at);
  return (await createReferralRequest(SEEKER, { jobId: JOB_ID, referrerId, personalPitch: "Synthetic private pitch" })).id;
}

async function reviewDelivery(status: "failed" | "unknown" | "sent", attempts = 1, at = NOW) {
  const requestId = await newAsk(at);
  await store.db.insert(referrerReviewEmailLinks).values(full(referrerReviewEmailLinks, {
    referralRequestId: requestId, referrerId: REFERRER, linkToken: `token-${requestId}`.padEnd(48, "x"), expiresAt: new Date(at + 6 * DAY), grantVersion: 1,
  }));
  expect(await prepareReferrerReviewEmailNotifications(requestId)).toHaveLength(1);
  let deliveryId: number | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    vi.setSystemTime(at + (attempt - 1) * 10 * 60_000);
    const claim = await claimReferralReviewDelivery(requestId, REFERRER, "email", `lease-${attempt}`);
    if (!claim) throw new Error("Fixture delivery was not claimable");
    deliveryId = claim.id;
    expect(await completeReferralReviewDelivery(claim.id, `lease-${attempt}`, status === "sent" ? { status } : { status, error: "synthetic delivery failure" })).toEqual({ recorded: true });
  }
  vi.setSystemTime(NOW);
  if (deliveryId === undefined) throw new Error("Fixture delivery was not claimed");
  return deliveryId;
}

async function failedJobRuns(at: number, attempts: number, succeeds = false) {
  const job: ScheduledJobDefinition = {
    name: "ask-expiry-sweep", description: "Fixture job", windowMs: HOUR, leaseMs: 5 * 60_000,
    run: async () => { if (succeeds) return { processed: 0, failed: 0 }; throw new Error("synthetic job failure"); },
  };
  const jobStore = createMysqlJobRunStore();
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await runScheduledJob(job, { store: jobStore, now: () => at, newLeaseOwner: () => `owner-${attempt}`, capture: vi.fn() });
  }
}

async function purgeCodes(expiredUnused: number, consumed: number, at = NOW) {
  let code = "";
  const service = createWorkEmailOtpService({ now: () => Date.now(), sendEmail: async input => { code = input.code; return { sent: true, reason: "sent" }; } });
  for (let index = 0; index < consumed; index += 1) {
    vi.setSystemTime(at - 2 * HOUR);
    const email = `consumed${index}@acme.com`;
    expect(await service.sendCode(email, { ip: `192.0.2.${index + 1}` })).toEqual({ sent: true, reason: "sent" });
    expect(await service.verifyCode(email, code, { ip: `192.0.2.${index + 1}` })).toBe(true);
  }
  for (let index = 0; index < expiredUnused; index += 1) {
    vi.setSystemTime(at - 2 * HOUR);
    expect(await service.sendCode(`unused${index}@acme.com`, { ip: `198.51.100.${index + 1}` })).toEqual({ sent: true, reason: "sent" });
  }
  vi.setSystemTime(at);
  await createWorkEmailOtpPurgeJob()({ nowMs: at, windowKey: "2026-11-24T11:00Z" });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  fixture.databaseClockSkewMs = 0;
  fixture.failActivityInsert = false;
  fixture.interleaveRequest = false;
  requestAggregateReads = 0;
  requestAggregateSql = undefined;
  requestAggregateParams = undefined;
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDb());
  store.reset([
    [users, [person(SEEKER, "seeker@example.com"), person(REFERRER, "referrer@acme.com"), person(GHOST_REFERRER, "ghost@example.com")]],
    [profiles, [employee(31, REFERRER)]],
    [jobs, [full(jobs, { id: JOB_ID, company: "acme.com", title: "Synthetic role", targetRoleUrl: "https://careers.acme.com/jobs/11" })]],
    [userBlocks, []],
  ]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("daily ops invariants", () => {
  it("finds exhausted and overdue review emails, not fresh or sent rows, and emails counts and ids only", async () => {
    await newAsk(NOW, GHOST_REFERRER);
    const exhausted = await reviewDelivery("failed", 5);
    const overdue = await reviewDelivery("unknown", 1, NOW - 3 * HOUR);
    await reviewDelivery("failed", 1);
    await reviewDelivery("sent", 1);
    const { emails, output } = await runOps();
    expect(output).toEqual({ processed: 4, failed: 0 });
    expect(emails).toHaveLength(1);
    expect(emails[0].text).toContain("review_email_stuck");
    expect(emails[0].text).toContain(`"count":2`);
    expect(emails[0].text).toContain(`#${exhausted}`);
    expect(emails[0].text).toContain(`#${overdue}`);
    expect(emails[0].text).not.toMatch(/example\.com|acme\.com|Fixture person|Synthetic private pitch|token-|synthetic delivery/i);
  });

  it.each([[21, true], [20, false]] as const)("uses the seven-day request average: %i requests alerts %s", async (count, alerts) => {
    for (let index = 0; index < count; index += 1) await newAsk(NOW - 25 * HOUR - index * 6 * HOUR);
    vi.setSystemTime(NOW);
    const { emails } = await runOps();
    expect(emails).toHaveLength(alerts ? 1 : 0);
    if (alerts) expect(emails[0].text).toContain("request_drought");
  });

  it("does not report a drought when a request exists in the last 24 hours", async () => {
    for (let index = 0; index < 21; index += 1) await newAsk(NOW - 25 * HOUR - index * 6 * HOUR);
    await newAsk(NOW - HOUR);
    vi.setSystemTime(NOW);
    expect((await runOps()).emails).toEqual([]);
  });

  it("uses the database clock for database-generated request timestamps", async () => {
    for (let index = 0; index < 21; index += 1) await newAsk(NOW - 25 * HOUR - index * 6 * HOUR);
    await newAsk(NOW + HOUR);
    fixture.databaseClockSkewMs = 2 * HOUR;
    expect((await runOps()).emails).toEqual([]);
  });

  it("uses one request snapshot when a request arrives during the check", async () => {
    for (let index = 0; index < 21; index += 1) await newAsk(NOW - 25 * HOUR - index * 6 * HOUR);
    fixture.interleaveRequest = true;
    const { emails } = await runOps();
    expect(store.rows(referralRequests)).toHaveLength(22);
    expect(requestAggregateReads).toBe(1);
    expect(requestAggregateSql).toMatch(/count\(case when .*createdat.* >= \? then 1 end\) as last24hours/);
    expect(requestAggregateSql).toMatch(/where [\s\S]*createdat[\s\S]* >= \?\s+and\s+[\s\S]*createdat[\s\S]* <= \?/);
    expect(requestAggregateParams).toEqual([new Date(NOW - DAY), new Date(NOW - 7 * DAY), new Date(NOW)]);
    expect(emails).toEqual([]);
  });

  it.each([
    [3, 0, true], [2, 0, false], [3, 25 * HOUR, false],
  ] as const)("reports only recently exhausted job runs: attempts %i, age %i", async (attempts, age, alerts) => {
    await failedJobRuns(NOW - age, attempts);
    vi.setSystemTime(NOW);
    const { emails } = await runOps();
    expect(emails).toHaveLength(alerts ? 1 : 0);
    if (alerts) expect(emails[0].text).toContain("job_exhausted");
  });

  it("does not report a successful job run", async () => {
    await failedJobRuns(NOW, 1, true);
    vi.setSystemTime(NOW);
    expect((await runOps()).emails).toEqual([]);
  });

  it.each([[5, 0, true], [4, 0, false], [5, 1, false]] as const)("checks unused work-email codes: %i unused, %i consumed, alert %s", async (unused, consumed, alerts) => {
    await purgeCodes(unused, consumed);
    const activity = store.rows(operationalActivityLogs);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ action: "work_email_otp.purged", outcome: "success" });
    expect(JSON.parse(String(activity[0].metadata))).toEqual({ consumed, expiredUnused: unused });
    const { emails } = await runOps();
    expect(emails).toHaveLength(alerts ? 1 : 0);
    if (alerts) expect(emails[0].text).toContain("work_email_codes_unused");
  });

  it("rolls back the purge when its count telemetry cannot be written", async () => {
    const service = createWorkEmailOtpService({ now: () => Date.now(), sendEmail: async () => ({ sent: true, reason: "sent" }) });
    vi.setSystemTime(NOW - 2 * HOUR);
    expect(await service.sendCode("rollback@acme.com", { ip: "203.0.113.10" })).toEqual({ sent: true, reason: "sent" });
    vi.setSystemTime(NOW);
    const tables = [workEmailOtpCodes, workEmailOtpReceipts, workEmailOtpRateLimits, operationalActivityLogs];
    const before = tables.map(table => store.rows(table));
    fixture.failActivityInsert = true;
    await expect(createWorkEmailOtpPurgeJob()({ nowMs: NOW, windowKey: "2026-11-24T11:00Z" })).rejects.toThrow("synthetic activity insert failure");
    expect(tables.map(table => store.rows(table))).toEqual(before);
  });

  it("ignores purge telemetry outside the last 24 hours", async () => {
    await purgeCodes(5, 0, NOW - 25 * HOUR);
    expect((await runOps()).emails).toEqual([]);
  });

  it("fails closed on malformed purge telemetry without echoing its contents", async () => {
    await recordOperationalActivity({ action: "work_email_otp.purged", outcome: "success", resourceType: "work_email_otp_purge", resourceId: new Date(NOW).toISOString(), metadata: { consumed: "private malformed value", expiredUnused: 5 } });
    await expect(runOps()).rejects.toThrow("Invalid work-email purge counts in activity log #1");
  });

  it("is registered once per day with a shorter lease", () => {
    const registered = SCHEDULED_JOBS.filter(job => job.name === "daily-ops-check");
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ windowMs: DAY, leaseMs: 15 * 60_000 });
    expect(registered[0].leaseMs).toBeLessThan(registered[0].windowMs);
    expect(registered[0].description.length).toBeGreaterThan(0);
    expect(registered[0].description.length).toBeLessThanOrEqual(200);
  });

  it("writes no rows while checking findings", async () => {
    await purgeCodes(5, 0);
    const tables = [users, profiles, jobs, notifications, referralRequests, referrerReviewEmailLinks, referralReviewDeliveries, jobRuns, operationalActivityLogs, workEmailOtpCodes, workEmailOtpReceipts, workEmailOtpRateLimits];
    const before = tables.map(table => store.rows(table));
    expect((await runOps()).emails).toHaveLength(1);
    expect(tables.map(table => store.rows(table))).toEqual(before);
  });

  it("sends one short all-clear email on Monday and none on other days", async () => {
    expect((await runOps(MONDAY)).emails).toEqual([{ subject: "skipwait.me daily ops check · all clear", text: "All clear: no ops invariants failed." }]);
    expect((await runOps(NOW)).emails).toEqual([]);
  });

  it("sends Monday's all-clear when the container clock is still Sunday", async () => {
    const at = Date.parse("2026-11-22T23:59:59.700Z");
    expect((await runOps(at, async () => true, "2026-11-23T00:00Z")).emails).toEqual([{ subject: "skipwait.me daily ops check · all clear", text: "All clear: no ops invariants failed." }]);
  });

  it("fails the window and reaches Sentry when the owner email is refused", async () => {
    await purgeCodes(5, 0);
    const capture = vi.fn();
    const job: ScheduledJobDefinition = { name: "ask-expiry-sweep", description: "Fixture runner", windowMs: HOUR, leaseMs: 5 * 60_000, run: createDailyOpsCheck({ sendEmail: async () => false }) };
    const result = await runScheduledJob(job, { store: createMysqlJobRunStore(), now: () => NOW, capture });
    expect(result).toMatchObject({ outcome: "failed", processed: 4, failed: 1 });
    expect(capture).toHaveBeenCalledOnce();
  });

  it("refuses a missing database rather than reporting a false all-clear", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(null);
    await expect(runOps()).rejects.toThrow("Scheduled jobs need the database");
  });
});

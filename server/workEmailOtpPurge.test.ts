import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import { SCHEDULED_JOB_NAMES } from "../shared/scheduledJobs";
import { getDb } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";
import { RECEIPT_REPLAY_GRACE_MS, WORK_EMAIL_PURGE_BATCH, createWorkEmailOtpPurgeJob, purgeWorkEmailOtpRows } from "./workEmailOtpPurge";

/*
 * Queue task 3 (work-email-hmac-storage): the verification tables must not keep
 * a work address in the clear. This job deletes spent and expired rows (codes,
 * enrollment receipts, OTP rate-limit windows) and rewrites every legacy
 * plaintext row to the one-way fingerprint. It is bounded per run, idempotent,
 * and keeps a day of grace on receipts so a client retry after a lost response
 * still replays as already-verified instead of "receipt invalid".
 *
 * The fake client speaks drizzle's mysql2 convention: `query(rawQuery, params)`
 * with `rowsAsArray`, so a select's rows are arrays in the selected field order
 * (which is why the fixtures list `{ id, email }` in that order). Replies are
 * matched by statement shape, so no assertion depends on emission order.
 */
vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), getDb: vi.fn() }));

type Reply = { when: string; rows?: Array<Record<string, unknown>>; affectedRows?: number };

function fakeDb(replies: Reply[]) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (q: { sql?: string }, params: unknown[] = []) => {
    const sql = String(q.sql ?? "");
    queries.push({ sql, params: params ?? [] });
    const folded = sql.toLowerCase();
    const reply = replies.find(candidate => folded.includes(candidate.when.toLowerCase()));
    return (folded.startsWith("select")
      ? [(reply?.rows ?? []).map(row => Object.values(row)), []]
      : [{ affectedRows: reply?.affectedRows ?? 0 }, []]) as [unknown, unknown[]];
  };
  const db = drizzle({ client: { query } as unknown as Pool });
  vi.mocked(getDb).mockResolvedValue(db as never);
  return { queries };
}

const statement = (queries: Array<{ sql: string; params: unknown[] }>, when: string) => {
  const found = queries.filter(query => query.sql.toLowerCase().includes(when.toLowerCase()));
  expect(found.map(query => query.sql), `expected exactly one statement containing "${when}"`).toHaveLength(1);
  return found[0];
};
// drizzle hands timestamp params to the driver as "YYYY-MM-DD HH:MM:SS.mmm" (UTC) strings.
const asMs = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.NaN;
};
const NOW = new Date("2026-10-16T12:00:00.000Z");
const CONTEXT = { nowMs: NOW.getTime(), windowKey: "2026-10-16T12:00Z" };

beforeEach(() => { vi.mocked(getDb).mockReset(); });

describe("work email OTP purge", () => {
  it("deletes spent and expired rows in one bounded batch, then rewrites the plaintext that is left", async () => {
    const { queries } = fakeDb([
      { when: "`workemailotpcodes`.`email` not like", rows: [{ id: 5, email: "ref@acme.com" }] },
      { when: "`workemailotpreceipts`.`email` not like", rows: [{ id: 12, email: "ref@acme.com" }] },
      { when: "delete from `workemailotpcodes`", affectedRows: 2 },
      { when: "delete from `workemailotpreceipts`", affectedRows: 1 },
      { when: "delete from `workemailotpratelimits`", affectedRows: 1 },
      { when: "usedat` is not null", rows: [{ id: 9 }] },
      { when: "consumedat` is not null", rows: [{ id: 1 }, { id: 2 }] },
      { when: "from `workemailotpratelimits`", rows: [{ id: 4 }] },
      { when: "update `workemailotpcodes`", affectedRows: 1 },
      { when: "update `workemailotpreceipts`", affectedRows: 1 },
    ]);
    expect(await purgeWorkEmailOtpRows(NOW)).toEqual({ deletedCodes: 2, deletedReceipts: 1, deletedRateLimits: 1, rewrittenCodes: 1, rewrittenReceipts: 1 });

    // Codes: consumed or expired, oldest first, bounded by the batch cap.
    const codeScan = statement(queries, "consumedat` is not null");
    expect(codeScan.sql.toLowerCase()).toContain("expiresat` <=");
    expect(codeScan.sql.toLowerCase()).toContain("order by");
    expect(codeScan.params).toContain(WORK_EMAIL_PURGE_BATCH);
    expect(asMs(codeScan.params.find(value => typeof value === "string"))).toBe(NOW.getTime());
    expect(statement(queries, "delete from `workemailotpcodes`").params).toEqual([1, 2]);

    // Receipts keep a day of replay grace, so a retry after a lost response still replays.
    const receiptScan = statement(queries, "usedat` is not null");
    expect(receiptScan.params).toContain(WORK_EMAIL_PURGE_BATCH);
    expect(receiptScan.params.map(asMs).filter(value => !Number.isNaN(value))).toContain(NOW.getTime() - RECEIPT_REPLAY_GRACE_MS);
    expect(statement(queries, "delete from `workemailotpreceipts`").params).toEqual([9]);

    // Expired OTP rate-limit windows are spent rows too.
    expect(statement(queries, "delete from `workemailotpratelimits`").params).toEqual([4]);

    // Only a row that is not already a fingerprint is rewritten, and each update is a compare-and-set.
    expect(statement(queries, "`workemailotpcodes`.`email` not like").params).toContain("h:%");
    const written = statement(queries, "update `workemailotpcodes`");
    expect(String(written.params[0])).toMatch(/^h:[0-9a-f]{64}$/);
    expect(String(written.params[0])).not.toContain("acme");
    expect(written.params.slice(1)).toEqual([5, "ref@acme.com"]);
    // A plaintext receipt for the same address carries the same fingerprint, so both tables agree.
    const receiptWritten = statement(queries, "update `workemailotpreceipts`");
    expect(receiptWritten.params[0]).toEqual(written.params[0]);
    expect(receiptWritten.params.slice(1)).toEqual([12, "ref@acme.com"]);
  });

  it("is idempotent: a rerun of an already-purged table finds nothing left to do", async () => {
    const rewriteOnce = () => fakeDb([
      { when: "`workemailotpcodes`.`email` not like", rows: [{ id: 5, email: "ref@acme.com" }] },
      { when: "update `workemailotpcodes`", affectedRows: 1 },
    ]);
    const first = rewriteOnce();
    expect(await purgeWorkEmailOtpRows(NOW)).toEqual({ deletedCodes: 0, deletedReceipts: 0, deletedRateLimits: 0, rewrittenCodes: 1, rewrittenReceipts: 0 });
    const written = statement(first.queries, "update `workemailotpcodes`").params[0];

    fakeDb([]);
    expect(await purgeWorkEmailOtpRows(NOW)).toEqual({ deletedCodes: 0, deletedReceipts: 0, deletedRateLimits: 0, rewrittenCodes: 0, rewrittenReceipts: 0 });

    // The same address always fingerprints to the same stored value, so a rerun cannot churn rows.
    const again = rewriteOnce();
    expect(await purgeWorkEmailOtpRows(NOW)).toMatchObject({ rewrittenCodes: 1 });
    expect(statement(again.queries, "update `workemailotpcodes`").params[0]).toEqual(written);
  });

  it("never exceeds the batch cap, whatever limit it is called with", async () => {
    const { queries } = fakeDb([]);
    await purgeWorkEmailOtpRows(NOW, WORK_EMAIL_PURGE_BATCH * 10);
    const scans = queries.filter(query => query.sql.toLowerCase().includes("order by"));
    expect(scans).toHaveLength(5);
    for (const scan of scans) expect(scan.params).toContain(WORK_EMAIL_PURGE_BATCH);
  });

  it("treats a missing database as an unavailable job store, not as an empty run", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    await expect(purgeWorkEmailOtpRows(NOW)).rejects.toBeInstanceOf(JobRunStoreUnavailableError);
  });
});

describe("work email OTP purge job", () => {
  it("reports every row it moved and propagates a store failure to the runner", async () => {
    const job = createWorkEmailOtpPurgeJob({ purge: async () => ({ deletedCodes: 2, deletedReceipts: 1, deletedRateLimits: 3, rewrittenCodes: 4, rewrittenReceipts: 5 }) });
    expect(await job(CONTEXT)).toEqual({ processed: 15, failed: 0 });

    const failing = createWorkEmailOtpPurgeJob({ purge: async () => { throw new JobRunStoreUnavailableError(); } });
    await expect(failing(CONTEXT)).rejects.toBeInstanceOf(JobRunStoreUnavailableError);
  });

  it("is registered hourly with a shorter lease, inside the one job-name contract", () => {
    const registered = SCHEDULED_JOBS.find(job => job.name === "work-email-otp-purge");
    expect(SCHEDULED_JOB_NAMES).toContain("work-email-otp-purge");
    expect(registered).toBeDefined();
    expect(registered?.windowMs).toBe(60 * 60_000);
    expect(registered?.leaseMs).toBeLessThan(registered.windowMs);
    expect(registered?.description.length).toBeGreaterThan(0);
    expect(registered?.description.length).toBeLessThanOrEqual(200);
  });
});

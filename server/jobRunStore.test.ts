import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The MySQL store's correctness lives in its WHERE clauses: the unique-key
// insert, the attempt compare-and-set and the owner-checked completion. Capture
// what it sends and compile it with drizzle's own MySQL dialect.
type Captured = { kind: "insert" | "update" | "select"; values?: Record<string, unknown>; set?: Record<string, unknown>; where?: SQL };
const state = vi.hoisted(() => ({ db: null as unknown, captured: [] as Array<Record<string, unknown>>, affectedRows: 1, insertError: null as unknown, selectRows: [] as unknown[] }));
vi.mock("./db", () => ({ getDb: async () => state.db }));

import { JobRunStoreUnavailableError, createMysqlJobRunStore } from "./jobRunStore";

const dialect = new MySqlDialect();
const compiled = (where: SQL | undefined) => (where ? dialect.sqlToQuery(where) : { sql: "", params: [] as unknown[] });
const last = () => state.captured[state.captured.length - 1] as Captured;
const claim = { jobName: "ask-expiry-sweep", windowKey: "2026-10-14T10:15Z", leaseOwner: "owner-1", startedAt: new Date("2026-10-14T10:15:00.000Z"), leaseExpiresAt: new Date("2026-10-14T10:20:00.000Z") };

beforeEach(() => {
  state.captured = [];
  state.affectedRows = 1;
  state.insertError = null;
  state.selectRows = [];
  state.db = {
    insert: () => ({ values: async (values: Record<string, unknown>) => { state.captured.push({ kind: "insert", values }); if (state.insertError) throw state.insertError; return [{ affectedRows: 1, insertId: 1 }]; } }),
    update: () => ({ set: (set: Record<string, unknown>) => ({ where: async (where: SQL) => { state.captured.push({ kind: "update", set, where }); return [{ affectedRows: state.affectedRows }]; } }) }),
    select: () => ({ from: () => ({ where: (where: SQL) => { state.captured.push({ kind: "select", where }); const chain = { orderBy: () => chain, limit: async () => state.selectRows }; return chain; } }) }),
  };
});

describe("MySQL job run store", () => {
  it("inserts a window as running at attempt 1 with JS timestamps", async () => {
    expect(await createMysqlJobRunStore().insertRunning(claim)).toBe("inserted");
    expect(last().values).toEqual({ ...claim, status: "running", attempt: 1, processedCount: 0, failedCount: 0 });
  });

  it("reads a duplicate-key insert as another runner owning the window", async () => {
    state.insertError = Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY", errno: 1062 }) });
    expect(await createMysqlJobRunStore().insertRunning(claim)).toBe("duplicate");
  });

  it("rethrows any other insert failure", async () => {
    state.insertError = Object.assign(new Error("Lock wait timeout"), { code: "ER_LOCK_WAIT_TIMEOUT", errno: 1205 });
    await expect(createMysqlJobRunStore().insertRunning(claim)).rejects.toThrow("Lock wait timeout");
  });

  it("takes over only a failed or lease-expired row still at the expected attempt", async () => {
    const store = createMysqlJobRunStore();
    expect(await store.takeOver(9, 1, claim)).toBe(true);
    const { sql, params } = compiled(last().where);
    expect(sql).toContain("`jobRuns`.`id` = ?");
    expect(sql).toContain("`jobRuns`.`attempt` = ?");
    expect(sql).toContain("`jobRuns`.`jobName` = ?");
    expect(sql).toContain("`jobRuns`.`windowKey` = ?");
    expect(sql).toMatch(/`jobRuns`\.`status` = \? or \(`jobRuns`\.`status` = \? and `jobRuns`\.`leaseExpiresAt` < \?\)/);
    expect(params).toEqual(expect.arrayContaining([9, 1, "failed", "running"]));
    expect(params).toContain("2026-10-14 10:15:00.000");
    expect(last().set).toMatchObject({ status: "running", attempt: 2, leaseOwner: "owner-1", finishedAt: null, error: null });
    state.affectedRows = 0;
    expect(await store.takeOver(9, 1, claim)).toBe(false);
  });

  it("completes only while the same owner holds the running row", async () => {
    const store = createMysqlJobRunStore();
    const done = { jobName: claim.jobName, windowKey: claim.windowKey, leaseOwner: "owner-1", status: "succeeded" as const, finishedAt: new Date("2026-10-14T10:15:05.000Z"), processedCount: 3, failedCount: 0, error: null };
    expect(await store.complete(done)).toBe(true);
    const { sql, params } = compiled(last().where);
    expect(sql).toContain("`jobRuns`.`leaseOwner` = ?");
    expect(sql).toContain("`jobRuns`.`status` = ?");
    expect(params).toEqual(["ask-expiry-sweep", "2026-10-14T10:15Z", "owner-1", "running"]);
    state.affectedRows = 0;
    expect(await store.complete(done)).toBe(false);
  });

  it("filters the latest run by job and optionally by success", async () => {
    const store = createMysqlJobRunStore();
    await store.latest("ask-expiry-sweep");
    expect(compiled(last().where).params).toEqual(["ask-expiry-sweep"]);
    await store.latest("ask-expiry-sweep", "succeeded");
    expect(compiled(last().where).params).toEqual(["ask-expiry-sweep", "succeeded"]);
  });

  it("fails closed with a typed error when there is no database", async () => {
    state.db = null;
    await expect(createMysqlJobRunStore().insertRunning(claim)).rejects.toBeInstanceOf(JobRunStoreUnavailableError);
    await expect(createMysqlJobRunStore().latest("ask-expiry-sweep")).rejects.toBeInstanceOf(JobRunStoreUnavailableError);
  });
});

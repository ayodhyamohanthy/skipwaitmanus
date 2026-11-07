import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { concurrencyTestsEnabled, openConcurrencyHarness, raceOnStartLine, raceProbeEnabled } from "./harness";
import type { Pool } from "mysql2/promise";
import { numberColumn, selectCount, selectRows, stringColumn } from "./sandboxSql";

/**
 * Runs on every `pnpm test`, with or without a sandbox. The harness resets every
 * table it can see, so the refusal rules below are the only thing between a
 * mistyped environment variable and a real database: they must be proven where
 * they cannot depend on the MySQL job being available.
 */
const SANDBOX = "mysql://root:sandbox@127.0.0.1:3306/skipwait_test";
const saved = { ...process.env };

beforeEach(() => {
  process.env = { ...saved };
  delete process.env.MYSQL_CONCURRENCY_TESTS;
  delete process.env.MYSQL_RACE_PROBE;
  delete process.env.MYSQL_TEST_URL;
});

afterEach(() => {
  process.env = { ...saved };
});

describe("sandbox target guard", () => {
  it("keeps the harness opt-in", () => {
    expect(concurrencyTestsEnabled()).toBe(false);
    process.env.MYSQL_CONCURRENCY_TESTS = "true";
    expect(concurrencyTestsEnabled()).toBe(false);
    process.env.MYSQL_CONCURRENCY_TESTS = "1";
    expect(concurrencyTestsEnabled()).toBe(true);
  });

  it("keeps race probes behind both gates", () => {
    process.env.MYSQL_RACE_PROBE = "1";
    expect(raceProbeEnabled()).toBe(false);
    process.env.MYSQL_CONCURRENCY_TESTS = "1";
    expect(raceProbeEnabled()).toBe(true);
  });

  it("refuses a target that is not a sandbox database", async () => {
    process.env.MYSQL_CONCURRENCY_TESTS = "1";
    for (const target of ["skipwait", "skipwaitprod", "production", "app"]) {
      process.env.MYSQL_TEST_URL = `mysql://root:sandbox@127.0.0.1:3306/${target}`;
      await expect(openConcurrencyHarness()).rejects.toThrow(/sandbox database named skipwait_test/);
    }
  });

  it("refuses a target that DATABASE_URL already points at", async () => {
    process.env.MYSQL_CONCURRENCY_TESTS = "1";
    process.env.DATABASE_URL = SANDBOX;
    process.env.MYSQL_TEST_URL = SANDBOX;
    await expect(openConcurrencyHarness()).rejects.toThrow(/will not run there/);
  });

  it("requires a target before opening anything", async () => {
    process.env.MYSQL_CONCURRENCY_TESTS = "1";
    await expect(openConcurrencyHarness()).rejects.toThrow(/MYSQL_TEST_URL is required/);
  });

  it("will not release a start line that cannot fill", async () => {
    await expect(raceOnStartLine(1, async () => 1)).rejects.toThrow(/at least two parties/);
  });
});

describe("driver row coercion", () => {
  it("reads only the columns a spec asked for", () => {
    const row = { balance: 4, monthlyCredits: "2", monthlyCycleKey: "2026-09" };
    expect(numberColumn(row, "balance", "wallet")).toBe(4);
    expect(numberColumn(row, "monthlyCredits", "wallet")).toBe(2);
    expect(stringColumn(row, "monthlyCycleKey", "wallet")).toBe("2026-09");
    expect(() => numberColumn(row, "monthlyCycleKey", "wallet")).toThrow(/expected number "monthlyCycleKey"/);
    expect(() => stringColumn(row, "balance", "wallet")).toThrow(/expected string "balance"/);
  });

  it("returns no rows for a write result", async () => {
    const executor = { query: async () => [{ affectedRows: 1, insertId: 7 }, []] } as unknown as Pool;
    expect(await selectRows(executor, "UPDATE tokenBalances SET balance = 1")).toEqual([]);
  });

  it("reads a count from the aliased column", async () => {
    const executor = { query: async () => [[{ n: 3 }], []] } as unknown as Pool;
    expect(await selectCount(executor, "SELECT COUNT(*) AS n FROM users")).toBe(3);
  });
});

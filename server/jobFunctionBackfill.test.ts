import { drizzle } from "drizzle-orm/mysql2";
import { describe, expect, it } from "vitest";
import { parseBackfillArgs } from "../scripts/backfill-job-function";
import type { JobFunctionSource } from "../shared/jobFunctions";
import { PLACEHOLDER_JOB_TITLE, type InferredJobFunction } from "../shared/jobFunctionClassifier";
import { markBackfillBatch, planJobFunctionBackfill, runJobFunctionBackfill, selectBackfillBatch, type BackfillStore } from "./jobFunctionBackfill";

type Row = { id: number; title: string; targetRoleUrl: string | null; jobFunction: string | null; jobFunctionSource: JobFunctionSource | null };

/** In-memory jobs table with the same guard the SQL uses: only rows whose source is NULL. */
function memoryStore(rows: Row[]): BackfillStore & { writes: number } {
  const store = {
    writes: 0,
    selectBatch: async (afterId: number, limit: number) => rows.filter(row => row.jobFunctionSource === null && row.id > afterId).sort((a, b) => a.id - b.id).slice(0, limit).map(({ id, title, targetRoleUrl }) => ({ id, title, targetRoleUrl })),
    markBatch: async (ids: readonly number[], jobFunction: InferredJobFunction | null) => {
      store.writes++;
      let changed = 0;
      for (const row of rows) if (ids.includes(row.id) && row.jobFunctionSource === null) { row.jobFunction = jobFunction; row.jobFunctionSource = "backfill"; changed++; }
      return changed;
    },
  };
  return store;
}

const fixture = (): Row[] => [
  { id: 1, title: PLACEHOLDER_JOB_TITLE, targetRoleUrl: "https://careers.wipro.com/job/product-designer-123", jobFunction: null, jobFunctionSource: null },
  { id: 2, title: PLACEHOLDER_JOB_TITLE, targetRoleUrl: "https://boards.greenhouse.io/acme/jobs/4567", jobFunction: null, jobFunctionSource: null },
  { id: 3, title: "Senior Data Analyst", targetRoleUrl: null, jobFunction: null, jobFunctionSource: null },
  { id: 4, title: PLACEHOLDER_JOB_TITLE, targetRoleUrl: "https://careers.acme.com/job/software-engineer", jobFunction: "Product", jobFunctionSource: "seeker" },
  { id: 5, title: PLACEHOLDER_JOB_TITLE, targetRoleUrl: "https://careers.acme.com/jobs/9", jobFunction: null, jobFunctionSource: "inferred" },
  { id: 6, title: PLACEHOLDER_JOB_TITLE, targetRoleUrl: "https://jobs.example.com/account-executive", jobFunction: null, jobFunctionSource: null },
];

describe("job function backfill", () => {
  it("plans with the same classifier as ask creation", () => {
    expect(planJobFunctionBackfill(fixture().slice(0, 3))).toEqual([{ id: 1, jobFunction: "Design" }, { id: 2, jobFunction: null }, { id: 3, jobFunction: "Data" }]);
  });

  it("writes nothing on a dry run and reports what it would do", async () => {
    const rows = fixture();
    const store = memoryStore(rows);
    const report = await runJobFunctionBackfill(store, { apply: false, batchSize: 2 });
    expect(report).toMatchObject({ mode: "dry-run", examined: 4, updated: 0, byFunction: { Design: 1, unknown: 1, Data: 1, Sales: 1 } });
    expect(store.writes).toBe(0);
    expect(rows).toEqual(fixture());
  });

  it("applies once, marks unknowns as examined, never overwrites a decided row, and re-runs as a no-op", async () => {
    const rows = fixture();
    const first = await runJobFunctionBackfill(memoryStore(rows), { apply: true, batchSize: 2 });
    expect(first).toMatchObject({ mode: "apply", examined: 4, updated: 4 });
    expect(rows.map(row => [row.id, row.jobFunction, row.jobFunctionSource])).toEqual([
      [1, "Design", "backfill"], [2, null, "backfill"], [3, "Data", "backfill"], [4, "Product", "seeker"], [5, null, "inferred"], [6, "Sales", "backfill"],
    ]);
    const again = await runJobFunctionBackfill(memoryStore(rows), { apply: true });
    expect(again).toMatchObject({ examined: 0, updated: 0 });
  });

  it("stops at the row cap", async () => {
    const report = await runJobFunctionBackfill(memoryStore(fixture()), { apply: false, batchSize: 500, maxRows: 2 });
    expect(report.examined).toBe(2);
  });

  it("guards every read and write on an unset source in SQL", () => {
    const db = drizzle.mock();
    const select = selectBackfillBatch(db, 10, 500).toSQL();
    expect(select.sql).toMatch(/`jobs`\.`jobFunctionSource` is null/);
    expect(select.sql).toMatch(/`jobs`\.`id` > \?/);
    expect(select.sql).toMatch(/order by `jobs`\.`id` asc limit \?/);
    const update = markBackfillBatch(db, [1, 3], "Design").toSQL();
    expect(update.sql).toMatch(/^update `jobs` set `jobFunction` = \?, `jobFunctionSource` = \?/);
    expect(update.sql).toMatch(/`jobs`\.`id` in \(\?, \?\) and `jobs`\.`jobFunctionSource` is null/);
    expect(update.params).toEqual(["Design", "backfill", 1, 3]);
  });

  it("is a dry run unless --apply is passed", () => {
    expect(parseBackfillArgs([])).toEqual({ apply: false, batchSize: 500, maxRows: 100_000 });
    expect(parseBackfillArgs(["--apply", "--batch", "50", "--max", "10"])).toEqual({ apply: true, batchSize: 50, maxRows: 10 });
    expect(parseBackfillArgs(["--batch", "9000"]).batchSize).toBe(2000);
    expect(() => parseBackfillArgs(["--yes"])).toThrow(/Unknown option/);
    expect(() => parseBackfillArgs(["--batch", "0"])).toThrow(/positive/);
  });
});

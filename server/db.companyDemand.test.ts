import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { companySuggestions } from "../drizzle/schema";
import { countCompanyDemand, createCompanySuggestion, listCompanySuggestionsAdmin } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

/*
 * Seeker company demand (§3b row 20): a vote is one row per seeker, so the same
 * company asked for by two seekers is two rows and reviewers see the count.
 * These call the real server/db.ts through a fixture client that evaluates the
 * predicates that path builds (col = ?, LOWER(col) = ?, col > ?, and the
 * insert/update side effects) and nothing else.
 */

const dialect = new MySqlDialect();
const TABLE = getTableName(companySuggestions);
const COLUMNS = Object.keys(getTableColumns(companySuggestions));
const DAY = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;
let rows: Row[];
let sequence: number;

const asMs = (value: unknown) => (value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(`${value.replace(" ", "T")}Z`) : Number(value));

/** The equalities, LOWER() comparisons and bounds this code path renders, applied row by row. */
function matches(condition: SQLQuery, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const predicates = [...query.sql.matchAll(/(?:LOWER\()?`([^`]+)`\.`([^`]+)`(?:\))?\s*(=|>|<)\s*\?/g)];
  if (predicates.length !== query.params.length) throw new Error(`Unparsed SQL: ${query.sql}`);
  return predicates.every((match, index) => {
    const [, table, column, operator] = match;
    if (table !== TABLE || !COLUMNS.includes(column)) throw new Error(`Unexpected predicate: ${match[0]}`);
    const value = row[column];
    const param = query.params[index];
    if (operator === "=") return (match[0].startsWith("LOWER(") ? String(value).toLowerCase() : value) === param;
    const left = asMs(value); const right = asMs(param);
    return operator === ">" ? left > right : left < right;
  });
}

function project(selected: Row[], columns?: Record<string, unknown>): Row[] {
  if (!columns) return structuredClone(selected);
  return selected.map(row => Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, row[(column as { name: string }).name]])));
}

function chain(run: () => Row[], columns?: Record<string, unknown>) {
  const read = (n?: number) => { const found = project(run(), columns); return n === undefined ? found : found.slice(0, n); };
  return {
    where: (condition: SQLQuery) => chain(() => run().filter(row => matches(condition, row)), columns),
    orderBy: () => chain(run, columns),
    limit: (n: number) => chain(() => run().slice(0, n), columns),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(read()).then(resolve),
  };
}

function fixtureClient() {
  return {
    select: (columns?: Record<string, unknown>) => ({ from: () => chain(() => rows, columns) }),
    insert: () => ({ values: async (row: Row) => { const id = ++sequence; rows.push({ id, createdAt: new Date(), status: "open", ...row }); return [{ insertId: id }]; } }),
    update: () => ({ set: (patch: Row) => ({ where: async (condition: SQLQuery) => { const found = rows.filter(row => matches(condition, row)); for (const row of found) Object.assign(row, patch); return [{ affectedRows: found.length }]; } }) }),
  };
}

const SEEKER = 7;
const OTHER = 8;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
  rows = [];
  sequence = 0;
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureClient());
});

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("seeker company demand votes", () => {
  it("records the vote with the work function the seeker chose", async () => {
    const vote = await createCompanySuggestion(SEEKER, { companyName: "  Wipro  ", jobFunction: "Design" });
    expect(vote).toEqual({ id: 1, companyName: "Wipro", jobFunction: "Design", alreadyRecorded: false });
    expect(rows[0]).toMatchObject({ submitterUserId: SEEKER, companyName: "Wipro", jobFunction: "Design", role: "seeker" });
  });

  it("keeps one vote per seeker and company without spending the daily allowance", async () => {
    const first = await createCompanySuggestion(SEEKER, { companyName: "Wipro" });
    const repeat = await createCompanySuggestion(SEEKER, { companyName: "wipro" });
    expect(repeat).toEqual({ ...first, alreadyRecorded: true });
    expect(rows).toHaveLength(1);
    expect(await createCompanySuggestion(SEEKER, { companyName: " WIPRO ", jobFunction: "Data" })).toMatchObject({ jobFunction: "Data", alreadyRecorded: true });
    expect(rows[0].jobFunction).toBe("Data");
  });

  it("counts a second seeker as new demand for the same company", async () => {
    await createCompanySuggestion(SEEKER, { companyName: "Wipro", jobFunction: "Design" });
    const other = await createCompanySuggestion(OTHER, { companyName: "wipro", jobFunction: "Engineering" });
    expect(other.alreadyRecorded).toBe(false);
    expect(rows).toHaveLength(2);
    const queue = await listCompanySuggestionsAdmin(50);
    expect(queue).toHaveLength(2);
    expect(queue.every(row => row.votes === 2)).toBe(true);
    expect(queue.map(row => row.jobFunction).sort()).toEqual(["Design", "Engineering"]);
  });

  it("caps a seeker at three new companies and rejects an unknown function", async () => {
    await createCompanySuggestion(SEEKER, { companyName: "Wipro" });
    await createCompanySuggestion(SEEKER, { companyName: "TCS" });
    await createCompanySuggestion(SEEKER, { companyName: "Infosys" });
    await expect(createCompanySuggestion(SEEKER, { companyName: "HCL" })).rejects.toThrow(/up to 3 companies a day/i);
    await expect(createCompanySuggestion(SEEKER, { companyName: "Wipro", jobFunction: "Astronomy" })).rejects.toThrow(/Choose a work function from the list/i);
    // At the cap, re-asking a company the seeker already voted for is still allowed and adds nothing.
    await expect(createCompanySuggestion(SEEKER, { companyName: "wipro" })).resolves.toMatchObject({ alreadyRecorded: true });
    expect(rows).toHaveLength(3);
  });

  it("counts votes by trimmed name and ignores blank names", () => {
    const counts = countCompanyDemand([{ companyName: " Wipro " }, { companyName: "wipro" }, { companyName: "TCS" }, { companyName: "  " }]);
    expect([...counts.entries()]).toEqual([["wipro", 2], ["tcs", 1]]);
  });

  it("only counts votes inside the last day against the allowance", async () => {
    rows.push({ id: 1, submitterUserId: SEEKER, companyName: "Old Co", jobFunction: null, role: "seeker", status: "open", createdAt: new Date(Date.now() - 2 * DAY) });
    await createCompanySuggestion(SEEKER, { companyName: "Wipro" });
    await createCompanySuggestion(SEEKER, { companyName: "TCS" });
    await createCompanySuggestion(SEEKER, { companyName: "Infosys" });
    expect(rows).toHaveLength(4);
  });
});

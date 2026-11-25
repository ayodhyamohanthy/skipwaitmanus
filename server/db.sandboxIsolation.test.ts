import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName, SQL, Table, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  askInviteLinks, askOrigins, askWorkItems, jobs, messages, profiles, referralAttachments, referralAvailabilitySlots,
  referralRequestPasses, referralRequestSaves, referralRequests, referralTransitionEvents, users,
} from "../drizzle/schema";
import { SANDBOX_REFERRER_EMAIL, SANDBOX_SEEKER_EMAIL } from "../shared/sandboxRequests";
import { getUnclaimedCompanyReferralPreview, listCompanyReferralInboxByState, saveCompanyReferralRequest } from "./db";

/*
 * D-393 (a): a sandbox request (its seeker is the reviewer demo seeker) reaches only the demo referrer, who acts
 * as a verified employee of whatever company it names. A real verified employee of that company must never see,
 * preview or save it, and the demo referrer must never see a real request.
 *
 * Real calls into server/db.ts against a fixture client implementing the slice of SQL these read paths use
 * (select with inner/left joins, including an aliased table, groupBy, =/<>/</<=/is null, in, and/or).
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const REAL_SEEKER = 7;
const DEMO_SEEKER = 8;
const EMPLOYEE = 10;
const DEMO_REFERRER = 20;
const SANDBOX_REQUEST = 601;
const REAL_REQUEST = 602;

type Row = Record<string, unknown>;
const TABLES = [askInviteLinks, askOrigins, askWorkItems, jobs, messages, profiles, referralAttachments, referralAvailabilitySlots, referralRequestPasses, referralRequestSaves, referralRequests, referralTransitionEvents, users];
const COLUMNS_BY_NAME = new Map(TABLES.map(table => [getTableName(table), Object.keys(getTableColumns(table))]));

let rows: Record<string, Row[]>;

/** The name a query refers to (an alias such as `sandbox_seeker`) and the table its rows live in (`users`). */
const tableNameOf = (table: unknown) => getTableName(table as never);
const sourceNameOf = (table: unknown) => String((table as Record<symbol, unknown>)[Table.Symbol.OriginalName] ?? tableNameOf(table));
const bucket = (table: unknown) => (rows[sourceNameOf(table)] ??= []);

type Part = { table: string; source: string; row: Row | null };
/** Every column of every joined table keyed "name.column"; a left join with no match is all null. */
function flatten(parts: Part[]): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const part of parts) for (const column of COLUMNS_BY_NAME.get(part.source) ?? []) flat[`${part.table}.${column}`] = part.row ? part.row[column] ?? null : null;
  return flat;
}

const asMs = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return value;
};

function splitTopLevel(sql: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0; let start = 0; let i = 0;
  while (i < sql.length) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    else if (depth === 0 && sql.startsWith(operator, i)) { parts.push(sql.slice(start, i)); i += operator.length; start = i; continue; }
    i++;
  }
  parts.push(sql.slice(start));
  return parts;
}

const ATOM = /^`([^`]+)`\.`([^`]+)`\s*(?:(is not null|is null)|(<>|<=|>=|=|<|>)\s*(?:(`([^`]+)`\.`([^`]+)`)|\?))$/i;
const COUNT_COLUMN = /^count\(`([^`]+)`\.`([^`]+)`\)$/i;
const sqlTextOf = (value: unknown): string | null => (value instanceof SQL ? dialect.sqlToQuery(value).sql.trim() : null);

function matches(condition: unknown, flat: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition as SQLQuery);
  const cursor = { index: 0 };
  const unwrap = (sql: string): string => {
    let text = sql.trim();
    while (text.startsWith("(")) {
      let depth = 0; let closesAt = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") { depth--; if (depth === 0) { closesAt = i; break; } }
      }
      if (closesAt !== text.length - 1) break;
      text = text.slice(1, -1).trim();
    }
    return text;
  };
  const evaluate = (sql: string): boolean => {
    const trimmed = unwrap(sql);
    if (!trimmed) return true;
    const orParts = splitTopLevel(trimmed, " or ");
    if (orParts.length > 1) return orParts.map(evaluate).some(Boolean);
    const andParts = splitTopLevel(trimmed, " and ");
    if (andParts.length > 1) return andParts.map(evaluate).every(Boolean);
    const inMatch = /^`([^`]+)`\.`([^`]+)` in \((.+)\)$/.exec(trimmed);
    if (inMatch) {
      const n = (inMatch[3].match(/\?/g) ?? []).length;
      const values = query.params.slice(cursor.index, cursor.index + n);
      cursor.index += n;
      return values.includes(flat[`${inMatch[1]}.${inMatch[2]}`]);
    }
    const match = ATOM.exec(trimmed);
    if (!match) throw new Error(`fixture cannot evaluate: ${trimmed}`);
    const value = flat[`${match[1]}.${match[2]}`];
    const [, , , nullOp, compareOp, rightColumn, rightTable, rightName] = match;
    if (nullOp) return /is not null/i.test(nullOp) ? value !== null && value !== undefined : value === null || value === undefined;
    const right = rightColumn ? flat[`${rightTable}.${rightName}`] : query.params[cursor.index++];
    // SQL three-valued logic: a comparison with NULL is never true.
    if (value === null || value === undefined || right === null || right === undefined) return false;
    if (compareOp === "=") return asMs(value) === asMs(right);
    if (compareOp === "<>") return asMs(value) !== asMs(right);
    const left = asMs(value); const bound = asMs(right);
    if (typeof left !== "number" || typeof bound !== "number") return false;
    if (compareOp === "<") return left < bound;
    if (compareOp === "<=") return left <= bound;
    if (compareOp === ">") return left > bound;
    return left >= bound;
  };
  return evaluate(query.sql);
}

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => {
    const state: { from?: unknown; joins: Array<{ table: unknown; on: unknown; kind: "inner" | "left" }>; where?: unknown } = { joins: [] };
    const project = (combo: Part[]): Row => {
      if (!projection) return structuredClone(combo[0].row ?? {});
      const flat = flatten(combo);
      const out: Row = {};
      for (const [key, value] of Object.entries(projection)) {
        const text = sqlTextOf(value);
        if (text !== null) {
          const column = COUNT_COLUMN.exec(text);
          const cell = column ? flat[`${column[1]}.${column[2]}`] : undefined;
          out[key] = column ? (cell === null || cell === undefined ? 0 : 1) : null;
          continue;
        }
        out[key] = flat[`${tableNameOf((value as { table: unknown }).table)}.${(value as { name: string }).name}`];
      }
      return out;
    };
    const run = (): Row[] => {
      let combos: Part[][] = bucket(state.from).map(row => [{ table: tableNameOf(state.from), source: sourceNameOf(state.from), row }]);
      for (const join of state.joins) {
        const name = tableNameOf(join.table); const source = sourceNameOf(join.table);
        const next: Part[][] = [];
        for (const combo of combos) {
          const matched = bucket(join.table).filter(candidate => matches(join.on, flatten([...combo, { table: name, source, row: candidate }])));
          for (const candidate of matched) next.push([...combo, { table: name, source, row: candidate }]);
          if (join.kind === "left" && matched.length === 0) next.push([...combo, { table: name, source, row: null }]);
        }
        combos = next;
      }
      if (state.where) combos = combos.filter(combo => matches(state.where, flatten(combo)));
      return combos.map(project);
    };
    const slice = (n: number) => run().slice(0, n);
    const chain = {
      from: (table: unknown) => { state.from = table; return chain; },
      innerJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "inner" }); return chain; },
      leftJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "left" }); return chain; },
      where: (condition: unknown) => { state.where = condition; return chain; },
      groupBy: () => chain,
      orderBy: () => chain,
      limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve, reject) }),
      for: async (_mode: string) => run(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  const insert = (table: unknown) => ({
    values: (input: Row) => {
      bucket(table).push({ id: bucket(table).length + 1, ...structuredClone(input) });
      return Object.assign(Promise.resolve([{ affectedRows: 1 }]), { onDuplicateKeyUpdate: async () => [{ affectedRows: 1 }] });
    },
  });
  const remove = (table: unknown) => ({
    where: async (condition: unknown) => {
      const name = tableNameOf(table); const source = sourceNameOf(table);
      const kept = bucket(table).filter(row => !matches(condition, flatten([{ table: name, source, row }])));
      const removed = bucket(table).length - kept.length;
      rows[source] = kept;
      return [{ affectedRows: removed }];
    },
  });
  const api = { select, insert, delete: remove };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const userRow = (id: number, name: string, email: string) => ({ id, name, email, suspended: false, canonicalPersonId: null });
const referrerProfile = (id: number, userId: number, workEmailDomain: string) => ({ id, userId, accountType: "referrer", workEmailDomain, workEmailVerifiedAt: new Date(NOW - 30 * DAY), paused: false, notifyNewAsk: true, referralCapacity: null });
const request = (id: number, jobId: number, jobSeekerId: number, personalPitch: string) => ({
  id, jobId, jobSeekerId, referrerId: null, personalPitch, status: "pending", revision: 1, referrerMessage: null, debitTransactionId: null,
  // What createCompanyReferralRequest writes for a covered request, the sandbox one included.
  waitingForCoverage: false, coverageQueuedAt: null, coverageVisibleAt: new Date(NOW - HOUR), coverageHeldAt: null, savedAt: null,
  opportunityId: null, firstLookReferrerId: null, firstLookUntil: null, createdAt: new Date(NOW - HOUR), updatedAt: new Date(NOW - HOUR),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  rows = {
    users: [
      userRow(REAL_SEEKER, "Sam Seeker", "sam@example.com"),
      userRow(DEMO_SEEKER, "Demo Seeker", SANDBOX_SEEKER_EMAIL),
      userRow(EMPLOYEE, "Ravi Patel", "ravi.patel@acme.com"),
      userRow(DEMO_REFERRER, "Demo Referrer", SANDBOX_REFERRER_EMAIL),
    ],
    profiles: [referrerProfile(1, EMPLOYEE, "acme.com"), referrerProfile(2, DEMO_REFERRER, "reviewer.skipwait.me")],
    jobs: [
      { id: 3, company: "acme.com", title: "Sandbox role", targetRoleUrl: "https://careers.acme.com/jobs/1", jobFunction: "Design", compensation: null },
      { id: 4, company: "acme.com", title: "Real role", targetRoleUrl: "https://careers.acme.com/jobs/2", jobFunction: "Design", compensation: null },
    ],
    referralRequests: [
      request(SANDBOX_REQUEST, 3, DEMO_SEEKER, "Sandbox pitch from the demo seeker."),
      request(REAL_REQUEST, 4, REAL_SEEKER, "A real seeker's pitch."),
    ],
    referralAttachments: [], referralAvailabilitySlots: [], referralRequestPasses: [], referralRequestSaves: [],
    referralTransitionEvents: [], messages: [], askOrigins: [], askWorkItems: [], askInviteLinks: [],
  };
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const inboxIds = async (userId: number) => (await listCompanyReferralInboxByState(userId, "new")).map(row => row.id);

describe("D-393 (a): a sandbox request never reaches a real employee", () => {
  it("keeps the demo seeker's request out of a real employee's inbox and preview at the company it names", async () => {
    expect(await inboxIds(EMPLOYEE)).not.toContain(SANDBOX_REQUEST);
    expect(await getUnclaimedCompanyReferralPreview(EMPLOYEE, SANDBOX_REQUEST)).toBeUndefined();
  });

  it("refuses a real employee's save of the demo seeker's request and writes nothing", async () => {
    await expect(saveCompanyReferralRequest(EMPLOYEE, SANDBOX_REQUEST, true)).rejects.toThrow(/no longer available to save/);
    expect(rows.referralRequestSaves).toEqual([]);
  });
});

describe("D-393 (5): the demo referrer tests a sandbox request at any company", () => {
  it("lists it in the demo referrer's new inbox and opens the pre-acceptance preview without the seeker's name", async () => {
    expect(await inboxIds(DEMO_REFERRER)).toEqual([SANDBOX_REQUEST]);
    const preview = await getUnclaimedCompanyReferralPreview(DEMO_REFERRER, SANDBOX_REQUEST);
    expect(preview).toMatchObject({ id: SANDBOX_REQUEST, companyDomain: "acme.com", title: "Sandbox role", candidateMessage: "Sandbox pitch from the demo seeker." });
    expect(preview).not.toHaveProperty("name");
    expect(preview).not.toHaveProperty("candidateName");
    expect(JSON.stringify(preview)).not.toContain("Demo Seeker");
    expect(JSON.stringify(preview)).not.toContain(SANDBOX_SEEKER_EMAIL);
  });
});

describe("a real request keeps its ordinary scope", () => {
  it("is shown to and previewed by the real employee at its company, and saved by them", async () => {
    expect(await inboxIds(EMPLOYEE)).toEqual([REAL_REQUEST]);
    expect(await getUnclaimedCompanyReferralPreview(EMPLOYEE, REAL_REQUEST)).toMatchObject({ id: REAL_REQUEST, title: "Real role" });
    await expect(saveCompanyReferralRequest(EMPLOYEE, REAL_REQUEST, true)).resolves.toEqual({ requestId: REAL_REQUEST, saved: true });
  });

  it("never reaches the demo referrer", async () => {
    expect(await inboxIds(DEMO_REFERRER)).not.toContain(REAL_REQUEST);
    expect(await getUnclaimedCompanyReferralPreview(DEMO_REFERRER, REAL_REQUEST)).toBeUndefined();
  });
});

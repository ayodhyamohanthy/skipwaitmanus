import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName, SQL, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  askCosts, askWorkItems, bandedReferralBalances, canonicalPeople, jobs, notifications, operationalActivityLogs, planCreditGrants,
  profiles, promoCreditGrants, referralAttachments, referralDocumentAccessGrants,
  referralRequestPasses, referralRequestSaves, referralRequests, referralReviewDeliveries,
  referralTransitionEvents, referrerReviewEmailLinks, tokenBalances, tokenTransactions, users, workItems,
} from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { askWorkItemIdsSchema, dedupeAskWorkItemIds, MAX_ASK_WORK_ITEMS } from "../shared/askWorkItems";
import { CATALOG_PLAN_IDS } from "../shared/planCatalog";
import { planEntitlementsFor } from "../shared/planEntitlements";
import {
  companyReferralFingerprint, createCompanyReferralRequest, getUnclaimedCompanyReferralPreview,
  tryDeliverWaitingAsk, previewBandedAskCost, refundLedgerSpendTx, getTokenWallet,
  type CreateCompanyReferralInput,
} from "./db";
import { PlanLimitError } from "./planGates";

/*
 * Task 13 slice A (0105): the showcase pieces a seeker pins to an ask travel as
 * a copy taken at the send instant. These are real calls into server/db.ts
 * against a fixture client that implements the slice of SQL the create path and
 * the pre-acceptance preview use.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const SEEKER = 7;
const STRANGER = 8;
const REFERRER = 9;
const URL_ = "https://careers.acme.com/jobs/123";
const PITCH = "I shipped the approvals redesign this role describes.";

type Row = Record<string, unknown>;
const TABLES = [bandedReferralBalances, askCosts, askWorkItems, canonicalPeople, jobs, notifications, operationalActivityLogs, planCreditGrants, profiles, promoCreditGrants, referralAttachments, referralDocumentAccessGrants, referralRequestPasses, referralRequestSaves, referralRequests, referralReviewDeliveries, referralTransitionEvents, referrerReviewEmailLinks, tokenBalances, tokenTransactions, users, workItems];
const TABLE_BY_NAME = new Map(TABLES.map(table => [getTableName(table), table]));
const COLUMNS_BY_NAME = new Map(TABLES.map(table => [getTableName(table), Object.keys(getTableColumns(table))]));

let rows: Record<string, Row[]>;
let sequence: Record<string, number>;

const tableNameOf = (table: unknown) => getTableName(table as never);
const bucket = (table: unknown) => (rows[tableNameOf(table)] ??= []);

/** Every column of every joined table keyed "table.column"; a left join with no match is all null. */
function flatten(parts: Array<{ table: string; row: Row | null }>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const part of parts) for (const column of COLUMNS_BY_NAME.get(part.table) ?? []) flat[`${part.table}.${column}`] = part.row ? part.row[column] ?? null : null;
  return flat;
}

/** drizzle hands timestamp params to the driver as "YYYY-MM-DD HH:MM:SS.mmm" (UTC) strings. */
const asMs = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return value;
};

/** Splits a condition at depth 0 on a boolean operator, so nested groups keep their meaning. */
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
const COUNT_ALL = /^count\(\*\)$/i;
const COUNT_COLUMN = /^count\(`([^`]+)`\.`([^`]+)`\)$/i;
const sqlTextOf = (value: unknown): string | null => (value instanceof SQL ? dialect.sqlToQuery(value).sql.trim() : null);

/** MySQL ordering: NULL sorts before every value ascending; numbers and dates compare by value. */
function compareValues(a: unknown, b: unknown): number {
  const av = asMs(a); const bv = asMs(b);
  const aNull = av === null || av === undefined; const bNull = bv === null || bv === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return -1;
  if (bNull) return 1;
  if (typeof av === "number" && typeof bv === "number") return av === bv ? 0 : av < bv ? -1 : 1;
  const as = String(av); const bs = String(bv);
  return as === bs ? 0 : as < bs ? -1 : 1;
}

/**
 * The WHERE slice this suite exercises: =, <, <=, >, >=, <>, is (not) null, in, and/or,
 * and the open-ask count's correlated `exists (select 1 from <table> where ...)`
 * (a match against any of that table's rows, with the outer row in scope).
 */
function matches(condition: unknown, flat: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition as SQLQuery);
  const cursor = { index: 0 };
  let scope = flat;
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
      const size = (inMatch[3].match(/\?/g) ?? []).length;
      const values = query.params.slice(cursor.index, cursor.index + size);
      cursor.index += size;
      return values.includes(scope[`${inMatch[1]}.${inMatch[2]}`]);
    }
    // The open-ask count asks whether a claim ever happened for this request:
    // evaluate the inner condition once per row of the subquery's table, with
    // the outer row still in scope for the correlation.
    const existsMatch = /^exists \(select 1 from `([^`]+)` where (.+)\)$/.exec(trimmed);
    if (existsMatch) {
      const [, table, inner] = existsMatch;
      const start = cursor.index; const outer = scope;
      let found = false;
      for (const row of rows[table] ?? []) {
        cursor.index = start;
        scope = { ...outer, ...flatten([{ table, row }]) };
        if (evaluate(inner)) found = true;
      }
      scope = outer;
      cursor.index = start + (inner.match(/\?/g) ?? []).length;
      return found;
    }
    const match = ATOM.exec(trimmed);
    if (!match) throw new Error(`fixture cannot evaluate: ${trimmed}`);
    const value = scope[`${match[1]}.${match[2]}`];
    const [, , , nullOp, compareOp, rightColumn, rightTable, rightName] = match;
    if (nullOp) return /is not null/i.test(nullOp) ? value !== null && value !== undefined : value === null || value === undefined;
    const right = rightColumn ? scope[`${rightTable}.${rightName}`] : query.params[cursor.index++];
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
    const state: {
      from?: unknown;
      joins: Array<{ table: unknown; on: unknown; kind: "inner" | "left" }>;
      where?: unknown;
      groups: unknown[];
      orders: Array<{ table: string; column: string; direction: 1 | -1 }>;
    } = { joins: [], groups: [], orders: [] };
    const project = (combo: Array<{ table: string; row: Row | null }>): Row => {
      if (!projection) return structuredClone(combo[0].row ?? {});
      const flat = flatten(combo);
      const out: Row = {};
      for (const [key, value] of Object.entries(projection)) {
        const selectedTable = [...TABLE_BY_NAME.values()].find(table => table === value);
        if (selectedTable) { out[key] = structuredClone(combo.find(part => part.table === tableNameOf(selectedTable))?.row ?? null); continue; }
        const text = sqlTextOf(value);
        if (text !== null) {
          const column = COUNT_COLUMN.exec(text);
          const cell = column ? flat[`${column[1]}.${column[2]}`] : undefined;
          out[key] = COUNT_ALL.test(text) ? 1 : column ? (cell === null || cell === undefined ? 0 : 1) : null;
          continue;
        }
        out[key] = flat[`${tableNameOf((value as { table: unknown }).table)}.${(value as { name: string }).name}`];
      }
      return out;
    };
    const run = (): Row[] => {
      let combos = bucket(state.from).map(row => [{ table: tableNameOf(state.from), row }]);
      for (const join of state.joins) {
        const name = tableNameOf(join.table);
        const next: typeof combos = [];
        for (const combo of combos) {
          const matched = bucket(join.table).filter(candidate => matches(join.on, flatten([...combo, { table: name, row: candidate }])));
          for (const candidate of matched) next.push([...combo, { table: name, row: candidate }]);
          if (join.kind === "left" && matched.length === 0) next.push([...combo, { table: name, row: null }]);
        }
        combos = next;
      }
      if (state.where) combos = combos.filter(combo => matches(state.where, flatten(combo)));
      if (state.orders.length) combos = [...combos].sort((a, b) => {
        const fa = flatten(a); const fb = flatten(b);
        for (const order of state.orders) {
          const result = compareValues(fa[`${order.table}.${order.column}`], fb[`${order.table}.${order.column}`]);
          if (result !== 0) return result * order.direction;
        }
        return 0;
      });
      const entries = projection ? Object.entries(projection) : [];
      const onlyCounts = entries.length > 0 && entries.every(([, value]) => { const text = sqlTextOf(value); return text !== null && (COUNT_ALL.test(text) || COUNT_COLUMN.test(text)); });
      if (onlyCounts && state.groups.length === 0) {
        return [Object.fromEntries(entries.map(([key, value]) => {
          const column = COUNT_COLUMN.exec(sqlTextOf(value)!);
          return [key, column
            ? combos.filter(combo => { const cell = flatten(combo)[`${column[1]}.${column[2]}`]; return cell !== null && cell !== undefined; }).length
            : combos.length];
        }))];
      }
      return combos.map(project);
    };
    const slice = (n: number) => run().slice(0, n);
    const chain = {
      from: (table: unknown) => { state.from = table; return chain; },
      innerJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "inner" }); return chain; },
      leftJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "left" }); return chain; },
      where: (condition: unknown) => { state.where = condition; return chain; },
      groupBy: (...group: unknown[]) => { state.groups = group; return chain; },
      orderBy: (...order: unknown[]) => {
        for (const term of order) {
          const match = /^`([^`]+)`\.`([^`]+)`\s+(asc|desc)$/i.exec(sqlTextOf(term) ?? "");
          if (match) state.orders.push({ table: match[1], column: match[2], direction: match[3].toLowerCase() === "desc" ? -1 : 1 });
        }
        return chain;
      },
      limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve, reject) }),
      for: async (_mode: string) => run(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  const update = (table: unknown) => ({
    set: (patch: Row) => ({
      where: async (condition: unknown) => {
        const matched = bucket(table).filter(row => matches(condition, flatten([{ table: tableNameOf(table), row }])));
        for (const row of matched) for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value);
        return [{ affectedRows: matched.length }];
      },
    }),
  });
  const insert = (table: unknown) => ({
    values: (input: Row | Row[]) => {
      const name = tableNameOf(table);
      const insertedIds: number[] = [];
      for (const item of Array.isArray(input) ? input : [input]) {
        const id = (sequence[name] = (sequence[name] ?? 0) + 1);
        insertedIds.push(id);
        bucket(table).push({ id, ...structuredClone(item) });
      }
      return Object.assign(Promise.resolve([{ affectedRows: 1, insertId: insertedIds[0] }]), { onDuplicateKeyUpdate: async () => [{ affectedRows: 1 }] });
    },
  });
  const api = { select, update, insert };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
    const before = structuredClone({ rows, sequence });
    try { return await cb(api); }
    catch (error) { rows = before.rows; sequence = before.sequence; throw error; }
  } };
}

const piece = (id: number, userId: number, over: Row = {}): Row => ({ id, userId, title: `Piece ${id}`, kind: "project", source: null, url: `https://example.com/work/${id}`, pinned: false, visibleOnProfile: true, updatedAt: new Date(NOW - DAY), ...over });
const referrerProfile = (userId: number) => ({ id: userId, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(NOW - 30 * DAY), paused: false, notifyNewAsk: true, referralCapacity: null });
const wallet = (plan = "free"): Row => ({
  id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3,
  monthlyCycleKey: currentMonthlyCycleKey(new Date(NOW)), plan, subscriptionId: plan === "free" ? null : `sub_${plan}`,
  subscriptionStatus: plan === "free" ? null : "active", subscriptionCurrency: null, subscriptionCurrentTermStart: null,
  subscriptionCurrentTermEnd: plan === "free" ? null : new Date(NOW + 20 * DAY), subscriptionResourceVersion: null,
});

function seed(plan = "momentum") {
  rows = {
    users: [{ id: SEEKER, name: "Sam Seeker", email: "sam@example.com", suspended: false, canonicalPersonId: null }, { id: STRANGER, name: "Nina Other", email: "nina@example.com", suspended: false, canonicalPersonId: null }, { id: REFERRER, name: "Maya Chen", email: "maya@acme.com", suspended: false, canonicalPersonId: null }],
    canonicalPeople: [], companyCoverageInvitations: [],
    profiles: [referrerProfile(REFERRER)],
    jobs: [],
    tokenBalances: [wallet(plan)],
    tokenTransactions: [],
    planCreditGrants: [],
    promoCreditGrants: [],
    referralRequests: [],
    referralAttachments: [{ id: 41, ownerId: SEEKER, referralRequestId: null, fileName: "resume.pdf", fileKey: "private/resume", mimeType: "application/pdf", fileSize: 3 }],
    workItems: [piece(11, SEEKER, { title: "Led the approvals redesign", kind: "case_study" }), piece(12, SEEKER, { title: "Shipped the mobile PWA", kind: "code", source: "GitHub" }), piece(13, STRANGER, { title: "Someone else's piece" })],
    askCosts: [],
    askWorkItems: [],
    referralTransitionEvents: [],
    referralRequestPasses: [],
    referralRequestSaves: [],
    referralDocumentAccessGrants: [],
    referrerReviewEmailLinks: [],
    referralReviewDeliveries: [],
    notifications: [],
    operationalActivityLogs: [],
  };
  sequence = {};
}

describe("BANDED-spend real create transaction", () => {
  const expiresAt = new Date(NOW + DAY);
  const balance = (includedRemaining = 2, purchasedRemaining = 2): Row => ({ id: 1, userId: SEEKER, level: "early", includedRemaining, purchasedRemaining, includedCycleKey: "paid-cycle-one", includedExpiresAt: expiresAt });
  const expectedCost = (bucket: "included" | "free" | "purchased", cycleKey: string | null) => ({ units: 1 as const, band: "early" as const, source: [{ bucket, units: 1 as const, cycleKey }] });
  beforeEach(() => {
    vi.stubEnv("BANDED_SALES_ENABLED", "true");
    vi.stubEnv("ASK_LEVEL_COST", "false");
    seed("early_to_mid");
    rows.tokenBalances[0].subscriptionCurrentTermStart = new Date(NOW - DAY);
    rows.bandedReferralBalances = [balance()];
  });
  it("spends included at the request level before free and purchased", async () => {
    await send();
    expect(rows.bandedReferralBalances[0].includedRemaining).toBe(1);
    expect(rows.bandedReferralBalances[0].purchasedRemaining).toBe(2);
    expect(rows.tokenBalances[0]).toMatchObject({ plan: "early_to_mid", monthlyCreditsRemaining: 3 });
  });
  it("spends free before purchased when included is exhausted", async () => {
    rows.bandedReferralBalances = [balance(0)];
    await send();
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
    expect(rows.bandedReferralBalances[0].purchasedRemaining).toBe(2);
  });
  it("spends purchased only at the matching level after free is exhausted", async () => {
    rows.bandedReferralBalances = [balance(0)];
    rows.tokenBalances[0].monthlyCreditsRemaining = 0;
    await send();
    expect(rows.bandedReferralBalances[0].purchasedRemaining).toBe(1);
    expect(rows.tokenBalances[0].balance).toBe(0);
  });
  it("outside the plan band uses only free, even with another level's balances", async () => {
    await send({ targetRoleUrl: "https://careers.acme.com/jobs/senior-engineer" });
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
    expect(rows.bandedReferralBalances[0]).toMatchObject({ includedRemaining: 2, purchasedRemaining: 2 });
  });
  it("refuses outside-band requests without free allowance and rolls everything back", async () => {
    rows.tokenBalances[0].monthlyCreditsRemaining = 0;
    rows.tokenBalances[0].balance = 50;
    const before = structuredClone({ rows, sequence });
    await expect(send({ targetRoleUrl: "https://careers.acme.com/jobs/senior-engineer" })).rejects.toThrow();
    expect({ rows, sequence }).toEqual(before);
  });
  it("expired included referrals are unavailable", async () => {
    rows.bandedReferralBalances[0].includedExpiresAt = new Date(NOW);
    await send();
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
    expect(rows.bandedReferralBalances[0].includedRemaining).toBe(2);
  });
  it("never spends another seeker's level balances", async () => {
    rows.bandedReferralBalances[0].userId = STRANGER;
    await send();
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
    expect(rows.bandedReferralBalances[0].includedRemaining).toBe(2);
  });
  it("rejects a changed source with no writes, and accepts same-key reconfirmation", async () => {
    const before = structuredClone({ rows, sequence });
    await expect(send({ expectedCost: expectedCost("free", currentMonthlyCycleKey(new Date(NOW))) })).rejects.toMatchObject({ code: "ask_price_changed" });
    expect({ rows, sequence }).toEqual(before);
    const result = await send();
    expect(result).toMatchObject({ replayed: false, chargedCost: { units: 1, band: "early", source: [{ bucket: "included", units: 1 }] } });
  });
  it("replays the original request charge after the live source changes", async () => {
    const first = await send();
    rows.bandedReferralBalances[0].includedRemaining = 0;
    const before = structuredClone({ rows, sequence });
    const replay = await send();
    expect(replay).toMatchObject({ replayed: true, chargedCost: first.chargedCost });
    expect({ rows, sequence }).toEqual(before);
  });
  it("waiting requests spend nothing", async () => {
    rows.profiles = [];
    await send();
    expect(rows.tokenTransactions.filter(row => row.kind === "credit_spend")).toEqual([]);
    expect(rows.bandedReferralBalances[0].includedRemaining).toBe(2);
  });
  it("first visibility spends the waiting request's matching included referral exactly once", async () => {
    rows.profiles = [];
    const waiting = await send();
    rows.referralRequests[0].debitTransactionId = null;
    rows.profiles = [referrerProfile(REFERRER)];
    expect(await tryDeliverWaitingAsk(waiting.requestId, NOW)).toMatchObject({ outcome: "delivered" });
    await tryDeliverWaitingAsk(waiting.requestId, NOW);
    expect(rows.bandedReferralBalances[0].includedRemaining).toBe(1);
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
    expect(rows.tokenTransactions.filter(row => row.kind === "credit_spend")).toHaveLength(1);
  });
  it("outside-band first visibility without free allowance stays held with no debit", async () => {
    rows.profiles = [];
    rows.tokenBalances[0].monthlyCreditsRemaining = 0;
    const waiting = await send({ targetRoleUrl: "https://careers.acme.com/jobs/senior-engineer" });
    rows.referralRequests[0].debitTransactionId = null;
    rows.profiles = [referrerProfile(REFERRER)];
    expect(await tryDeliverWaitingAsk(waiting.requestId, NOW)).toMatchObject({ outcome: "held" });
    expect(rows.referralRequests[0].waitingForCoverage).toBe(true);
    expect(rows.tokenTransactions.filter(row => row.kind === "credit_spend")).toHaveLength(0);
    expect(rows.bandedReferralBalances[0].includedRemaining).toBe(2);
  });
  it("F1: refuses across calendar rollover atomically, then reconfirms with the same key", async () => {
    rows.bandedReferralBalances = [balance(0)];
    rows.tokenBalances[0].monthlyCycleKey = "2026-09";
    const before = structuredClone({ rows, sequence });
    await expect(send({ expectedCost: expectedCost("free", "2026-09") })).rejects.toMatchObject({ code: "ask_price_changed" });
    expect({ rows, sequence }).toEqual(before);
    const expected = expectedCost("free", "2026-10");
    const first = await send({ expectedCost: expected });
    expect(first.chargedCost).toEqual(expected);
    expect(rows.tokenTransactions.filter(row => row.kind === "plan_grant")).toHaveLength(1);
    expect(rows.tokenBalances[0]).toMatchObject({ plan: "early_to_mid", monthlyCycleKey: "2026-10", monthlyCreditsRemaining: 2 });
    await send({ expectedCost: expected });
    expect(rows.tokenTransactions.filter(row => row.kind === "credit_spend")).toHaveLength(1);
  });
  it("F2: replay reads only this user's request-bound debit despite a matching client key elsewhere", async () => {
    const first = await send();
    rows.tokenTransactions.unshift({ id: 999, userId: STRANGER, role: "job_seeker", kind: "credit_spend", tokenCount: -1, source: "banded:purchased:executive", sourceCycleKey: null, referenceType: "referral_request", referenceId: `${first.requestId}#1`, idempotencyKey: "pinned-key-0001#1" });
    rows.tokenTransactions.unshift({ id: 998, userId: SEEKER, role: "job_seeker", kind: "credit_spend", tokenCount: -1, source: "banded:purchased:executive", sourceCycleKey: null, referenceType: "referral_request", referenceId: "123456#1", idempotencyKey: "pinned-key-0001#1" });
    expect((await send()).chargedCost).toEqual(first.chargedCost);
  });
  it("the preview shows exactly the source create spends", async () => {
    const quote = await previewBandedAskCost(SEEKER, URL_);
    expect(quote).toMatchObject({ level: 2, cost: 1, shortfall: 0, coverageStatus: "covered", acceptedCost: { band: "early", units: 1 } });
    expect((await send({ expectedCost: quote.acceptedCost })).chargedCost).toEqual(quote.acceptedCost);
  });
  it("a changed included cycle needs explicit confirmation even when its counts match", async () => {
    const quote = await previewBandedAskCost(SEEKER, URL_);
    rows.bandedReferralBalances[0].includedCycleKey = "paid-cycle-two";
    const before = structuredClone({ rows, sequence });
    await expect(send({ expectedCost: quote.acceptedCost })).rejects.toMatchObject({ code: "ask_price_changed" });
    expect({ rows, sequence }).toEqual(before);
  });
  it("a quoted send cannot fall back to legacy billing after the switch goes off", async () => {
    const quote = await previewBandedAskCost(SEEKER, URL_);
    vi.stubEnv("BANDED_SALES_ENABLED", "false");
    const before = structuredClone({ rows, sequence });
    await expect(send({ expectedCost: quote.acceptedCost })).rejects.toMatchObject({ code: "not_on_sale" });
    expect({ rows, sequence }).toEqual(before);
  });
  it("turning sales off keeps existing banded wallet state recoverable", async () => {
    await send();
    vi.stubEnv("BANDED_SALES_ENABLED", "false");
    await getTokenWallet(SEEKER, "job_seeker");
    expect(rows.tokenBalances[0]).toMatchObject({ plan: "early_to_mid", subscriptionStatus: "active", monthlyCreditsRemaining: 3 });
    expect(rows.bandedReferralBalances[0].includedRemaining).toBe(1);
  });
  it("waiting quote becomes a 409 when coverage opens; no request or debit is committed", async () => {
    rows.profiles = [];
    const quote = await previewBandedAskCost(SEEKER, URL_);
    expect(quote).toMatchObject({ cost: 0, coverageStatus: "waiting_for_company_coverage", acceptedCost: { units: 0, source: [] } });
    rows.profiles = [referrerProfile(REFERRER)];
    const before = structuredClone({ rows, sequence });
    await expect(send({ expectedCost: quote.acceptedCost })).rejects.toMatchObject({ code: "ask_price_changed" });
    expect({ rows, sequence }).toEqual(before);
  });
  it.each(["included", "purchased"] as const)("refunds %s to its original level once, even with sales off", async source => {
    if (source === "purchased") {
      rows.bandedReferralBalances = [balance(0)];
      rows.tokenBalances[0].monthlyCreditsRemaining = 0;
    }
    const first = await send();
    vi.stubEnv("BANDED_SALES_ENABLED", "false");
    const db = fixtureDatabase();
    const refund = () => db.transaction(async tx => refundLedgerSpendTx(tx, { userId: SEEKER, requestId: first.requestId, kind: "withdrawal_refund", wallet: rows.tokenBalances[0] as Parameters<typeof refundLedgerSpendTx>[1]["wallet"], now: new Date(NOW) }));
    expect(await refund()).toMatchObject({ returned: 1 });
    expect(await refund()).toMatchObject({ returned: 0 });
    expect(rows.bandedReferralBalances[0]).toMatchObject(source === "included" ? { includedRemaining: 2 } : { purchasedRemaining: 2 });
    expect(rows.tokenBalances[0].balance).toBe(0);
    expect(rows.tokenTransactions.filter(row => row.kind === "withdrawal_refund")).toHaveLength(1);
  });
  it("does not restore an included referral into a different paid cycle", async () => {
    const first = await send();
    rows.bandedReferralBalances[0].includedCycleKey = "next-paid-cycle";
    const db = fixtureDatabase();
    const result = await db.transaction(async tx => refundLedgerSpendTx(tx, { userId: SEEKER, requestId: first.requestId, kind: "withdrawal_refund", wallet: rows.tokenBalances[0] as Parameters<typeof refundLedgerSpendTx>[1]["wallet"], now: new Date(NOW) }));
    expect(result).toMatchObject({ returned: 0 });
    expect(rows.bandedReferralBalances[0].includedRemaining).toBe(1);
    expect(rows.tokenTransactions.filter(row => row.kind === "withdrawal_refund")[0]).toMatchObject({ tokenCount: 0 });
  });

  it("attributes purchased debit to supplying purchase row and retains creditGrantId on reversal", async () => {
    rows.bandedReferralBalances[0].includedRemaining = 0;
    rows.tokenBalances[0].monthlyCreditsRemaining = 0;
    rows.bandedReferralBalances[0].purchasedRemaining = 2;
    // Seed purchase row in tokenTransactions
    rows.tokenTransactions.push({
      id: 99,
      userId: SEEKER,
      role: "job_seeker",
      tokenCount: 2,
      kind: "purchase",
      source: "banded:purchased:early",
      referenceType: "chargebee_invoice",
      referenceId: "inv_99:early",
      idempotencyKey: "banded_purchase:test:inv_99:early",
    });
    const first = await send();
    const spendTx = rows.tokenTransactions.find(r => r.kind === "credit_spend" && r.source === "banded:purchased:early");
    expect(spendTx).toBeDefined();
    expect(spendTx?.creditGrantId).toBe(99);

    const db = fixtureDatabase();
    const result = await db.transaction(async tx => refundLedgerSpendTx(tx, { userId: SEEKER, requestId: first.requestId, kind: "withdrawal_refund", wallet: rows.tokenBalances[0] as Parameters<typeof refundLedgerSpendTx>[1]["wallet"], now: new Date(NOW) }));
    expect(result).toMatchObject({ returned: 1 });
    const refundTx = rows.tokenTransactions.find(r => r.kind === "withdrawal_refund" && r.reversesTransactionId === spendTx?.id);
    expect(refundTx?.creditGrantId).toBe(99);
  });

  it("does not restore a purchased referral if the supplying purchase was refunded by provider", async () => {
    rows.bandedReferralBalances[0].includedRemaining = 0;
    rows.tokenBalances[0].monthlyCreditsRemaining = 0;
    rows.bandedReferralBalances[0].purchasedRemaining = 1;
    // Seed purchase row
    rows.tokenTransactions.push({
      id: 101,
      userId: SEEKER,
      role: "job_seeker",
      tokenCount: 1,
      kind: "purchase",
      source: "banded:purchased:early",
      referenceType: "chargebee_invoice",
      referenceId: "inv_101:early",
      idempotencyKey: "banded_purchase:test:inv_101:early",
    });
    const first = await send();
    const spendTx = rows.tokenTransactions.find(r => r.kind === "credit_spend" && r.creditGrantId === 101);
    expect(spendTx).toBeDefined();

    // Provider refunds the purchase row
    rows.tokenTransactions.push({
      id: 102,
      userId: SEEKER,
      role: "job_seeker",
      tokenCount: -1,
      kind: "withdrawal_refund",
      source: "banded:refund:early",
      creditGrantId: 101,
      referenceType: "chargebee_refund",
      referenceId: "ref_101:early",
      idempotencyKey: "banded_refund:test:ref_101:early",
    });

    const db = fixtureDatabase();
    const result = await db.transaction(async tx => refundLedgerSpendTx(tx, { userId: SEEKER, requestId: first.requestId, kind: "withdrawal_refund", wallet: rows.tokenBalances[0] as Parameters<typeof refundLedgerSpendTx>[1]["wallet"], now: new Date(NOW) }));
    expect(result).toMatchObject({ returned: 0 });
    expect(rows.bandedReferralBalances[0].purchasedRemaining).toBe(0);
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  seed();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const ask = (over: Partial<CreateCompanyReferralInput> = {}): CreateCompanyReferralInput => ({ targetRoleUrl: URL_, personalPitch: PITCH, attachmentIds: [41], idempotencyKey: "pinned-key-0001", ...over });
const send = (over: Partial<CreateCompanyReferralInput> = {}) => createCompanyReferralRequest(SEEKER, ask(over));
/** D-132 audit item 2: the level and cost an ask was priced at are stored once, at creation. */
describe("the ask stores the level and cost it was priced at", () => {
  it("flag off: the ask costs 1 credit and writes no cost row (today's behaviour)", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    await send();
    expect(rows.askCosts).toEqual([]);
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
  });

  it("flag on: stores the classified level, the cost and its source against the request", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    const result = await send();
    expect(rows.askCosts).toHaveLength(1);
    expect(rows.askCosts[0]).toMatchObject({ referralRequestId: Number(rows.referralRequests[0].id), creditCost: 2, source: "classified_at_create" });
    expect(rows.askCosts[0].jobLevel).toBe(2);
    expect(result).toMatchObject({ replayed: false });
  });

  it("flag on: a replay of the same send stores nothing twice and spends nothing twice", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    await send();
    const after = rows.tokenBalances[0].monthlyCreditsRemaining;
    const replay = await send();
    expect(replay).toMatchObject({ replayed: true });
    expect(rows.askCosts).toHaveLength(1);
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(after);
  });

  /** D-132 audit item 5: Send again is a new ask with its own price; an existing ask is never re-priced. */
  it("Send again after the flag changed: the first ask keeps its stored cost, the new send is priced on its own", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    await send();
    const first = { ...rows.askCosts[0] };
    vi.stubEnv("ASK_LEVEL_COST", "false");
    await send({ idempotencyKey: "pinned-key-0002" }).catch(() => undefined);
    expect(rows.askCosts[0]).toMatchObject({ referralRequestId: first.referralRequestId, creditCost: first.creditCost, jobLevel: first.jobLevel });
    expect(rows.askCosts).toHaveLength(1);
  });

  /**
   * POSTMERGE-oct22 P1 (#482): an ask that waits across an ASK_LEVEL_COST
   * activation keeps the flat price it was quoted. A waiting ask writes no
   * askCosts row while the flag is off, so the missing row IS the snapshot:
   * delivery must not classify the job again against the current flag.
   */
  it("a waiting ask created with the flag off is delivered at 1 credit after the flag turns on", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    rows.profiles = []; // no verified referrer yet, so the ask waits for coverage
    await send();
    expect(rows.referralRequests[0].waitingForCoverage).toBe(true);
    expect(rows.askCosts).toEqual([]);
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
    // The fixture writes only the columns the create path names; MySQL stores NULL for debitTransactionId.
    rows.referralRequests[0].debitTransactionId = null;

    // Activation between creation and first delivery: the ask must not be repriced.
    vi.stubEnv("ASK_LEVEL_COST", "true");
    rows.profiles = [referrerProfile(REFERRER)];
    const outcome = await tryDeliverWaitingAsk(Number(rows.referralRequests[0].id), NOW);

    expect(outcome.outcome).toBe("delivered");
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
  });
});

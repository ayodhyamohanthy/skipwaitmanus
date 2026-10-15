import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQL, getTableColumns, getTableName, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  jobs,
  notifications,
  profiles,
  referralAttachments,
  referralAvailabilitySlots,
  referralDocumentAccessGrants,
  referralRequestPasses,
  referralRequestSaves,
  referralRequests,
  referralTransitionEvents,
  referrerReviewEmailLinks,
} from "../drizzle/schema";
import { getUnclaimedCompanyReferralPreview, oneClickReviewReferralRequest, reviewReferralRequest } from "./db";

/*
 * D-021: a decline by a verified employee reopens the ask for the rest of that
 * company until it expires — the credit stays spent, the declining employee
 * never sees it again, and the seeker is told in plain words that the ask is
 * open again. Only expiry or withdrawal end an ask without acceptance.
 *
 * These are real calls into server/db.ts against a fixture client that
 * implements the slice of SQL the pass transition uses (select with joins,
 * update, delete, insert with onDuplicateKeyUpdate, transaction).
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = new Date("2026-10-15T12:00:00.000Z");
const LATER = new Date("2026-10-15T12:00:01.000Z");

type Row = Record<string, unknown>;
const TABLES = [jobs, notifications, profiles, referralAttachments, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequestSaves, referralRequests, referralTransitionEvents, referrerReviewEmailLinks];
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

// drizzle hands timestamp params to the driver as "YYYY-MM-DD HH:MM:SS.mmm" (UTC) strings.
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

const ATOM = /^`([^`]+)`\.`([^`]+)`\s*(?:(is not null|is null)|(=|<>|<|>)\s*(?:(`([^`]+)`\.`([^`]+)`)|\?))$/i;

/** Evaluates the WHERE slice this suite exercises: =, <, is (not) null, and/or, column or param right side. */
function matches(condition: unknown, flat: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition as SQL);
  const cursor = { index: 0 };
  /** Drops parens that wrap the whole expression, so the group inside really groups. */
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
    const atom = trimmed;
    const match = ATOM.exec(atom);
    if (!match) throw new Error(`fixture cannot evaluate: ${atom}`);
    const value = flat[`${match[1]}.${match[2]}`];
    const [, , , nullOp, compareOp, rightColumn, rightTable, rightName] = match;
    if (nullOp) return /is not null/i.test(nullOp) ? value !== null && value !== undefined : value === null || value === undefined;
    const right = rightColumn ? flat[`${rightTable}.${rightName}`] : query.params[cursor.index++];
    if (compareOp === "=") return asMs(value) === asMs(right);
    if (compareOp === "<>") return asMs(value) !== asMs(right);
    const left = asMs(value); const bound = asMs(right);
    if (typeof left !== "number" || typeof bound !== "number") return false;
    return compareOp === "<" ? left < bound : left > bound;
  };
  return evaluate(query.sql);
}

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => {
    const state: { from?: unknown; joins: Array<{ table: unknown; on: unknown; kind: "inner" | "left" }>; where?: unknown } = { joins: [] };
    const project = (combo: Array<{ table: string; row: Row | null }>): Row => {
      if (!projection) return structuredClone(combo[0].row ?? {});
      const flat = flatten(combo);
      const out: Row = {};
      for (const [key, value] of Object.entries(projection)) {
        const selectedTable = [...TABLE_BY_NAME.values()].find(table => table === value);
        if (selectedTable) out[key] = structuredClone(combo.find(part => part.table === tableNameOf(selectedTable))?.row ?? null);
        else out[key] = flat[`${tableNameOf((value as { table: unknown }).table)}.${(value as { name: string }).name}`];
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
      return combos.map(project);
    };
    const slice = (n: number) => run().slice(0, n);
    const chain = {
      from: (table: unknown) => { state.from = table; return chain; },
      innerJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "inner" }); return chain; },
      leftJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "left" }); return chain; },
      where: (condition: unknown) => { state.where = condition; return chain; },
      limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve, reject) }),
      for: async (_mode: string) => run(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  const update = (table: unknown) => ({
    set: (patch: Row) => ({
      where: async (condition: unknown) => {
        const name = tableNameOf(table);
        const matched = bucket(table).filter(row => matches(condition, flatten([{ table: name, row }])));
        for (const row of matched) for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value);
        return [{ affectedRows: matched.length }];
      },
    }),
  });
  const insert = (table: unknown) => ({
    values: (input: Row | Row[]) => {
      const name = tableNameOf(table);
      for (const item of Array.isArray(input) ? input : [input]) {
        const id = (sequence[name] = (sequence[name] ?? 0) + 1);
        bucket(table).push({ id, ...structuredClone(item) });
      }
      return Object.assign(Promise.resolve([{ affectedRows: 1 }]), { onDuplicateKeyUpdate: async () => [{ affectedRows: 1 }] });
    },
  });
  const remove = (table: unknown) => ({
    where: async (condition: unknown) => {
      const name = tableNameOf(table);
      const kept = bucket(table).filter(row => !matches(condition, flatten([{ table: name, row }])));
      const removed = bucket(table).length - kept.length;
      rows[name] = kept;
      return [{ affectedRows: removed }];
    },
  });
  const api = { select, update, insert, delete: remove };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

/** A verified Acme employee (referrerId 9 claims; referrerId 10 is another employee). */
const profileRow = (userId: number) => ({ id: userId, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: NOW, paused: false, notifyNewAsk: true });

const requestRow = (over: Row = {}): Row => ({ id: 501, jobSeekerId: 7, jobId: 3, referrerId: 9, personalPitch: "I led two launches.", status: "pending", revision: 4, referrerMessage: null, createdAt: new Date("2026-10-14T12:00:00.000Z"), updatedAt: new Date("2026-10-14T12:00:00.000Z"), debitTransactionId: 11, ...over });

function seed() {
  rows = {
    profiles: [profileRow(9), profileRow(10)],
    jobs: [{ id: 3, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/designer", jobFunction: "Design" }],
    referralRequests: [requestRow()],
    referralDocumentAccessGrants: [{ id: 1, referralRequestId: 501, referrerId: 9, requestRevision: 4, grantVersion: 1, grantedAt: NOW, expiresAt: new Date("2026-11-14T12:00:00.000Z"), revokedAt: null, revokeReason: null }],
    referralAvailabilitySlots: [{ id: 1, referralRequestId: 501, referrerId: 9, status: "allocated", releasedAt: null }],
    referralRequestSaves: [{ id: 1, referralRequestId: 501, referrerId: 9 }],
    referrerReviewEmailLinks: [{ id: 1, referralRequestId: 501, referrerId: 9, linkToken: "opaque-token", grantVersion: 1, expiresAt: new Date("2026-10-16T12:00:00.000Z"), consumedAt: null, status: "pending" }],
    referralRequestPasses: [],
    referralTransitionEvents: [],
    notifications: [],
    referralAttachments: [],
  };
  sequence = {};
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  seed();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const ask = () => rows.referralRequests[0];
const seekerNotice = () => rows.notifications[0];

describe("a claimed decline reopens the ask (D-021)", () => {
  it("releases the claim, keeps the ask pending and tells the seeker it is open again", async () => {
    const result = await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "timing", passReason: "at_capacity" });

    expect(result).toMatchObject({ status: "passed", declineReason: "timing", companyDomain: "acme.com", jobSeekerId: 7, reopened: true });
    // The ask survives: same status, one revision forward, no claim.
    expect(ask()).toMatchObject({ status: "pending", referrerId: null, referrerMessage: null, revision: 5 });
    // The pass excludes this employee for good and carries the kit reason.
    expect(rows.referralRequestPasses).toEqual([expect.objectContaining({ referralRequestId: 501, referrerId: 9, reason: "timing", reasonCode: "at_capacity" })]);
    // The claim's access ends with it: no document grant, no saved row, no live review link, no queue allocation.
    expect(rows.referralDocumentAccessGrants[0]).toMatchObject({ referrerId: 9, revokeReason: "passed" });
    expect(rows.referralDocumentAccessGrants[0].revokedAt).toBeInstanceOf(Date);
    expect(rows.referralRequestSaves).toEqual([]);
    expect((rows.referrerReviewEmailLinks[0].consumedAt as Date)).toBeInstanceOf(Date);
    expect(rows.referralAvailabilitySlots[0]).toMatchObject({ status: "released", referrerId: 9 });
    // The seeker is told in plain words, in the same transaction as the pass.
    expect(seekerNotice()).toMatchObject({ userId: 7, category: "status", kind: expect.any(String), refId: 501, title: "Update on your referral request — acme.com" });
    expect(String(seekerNotice().body)).toContain("Your ask is open again to other verified employees at acme.com.");
    expect(ask().status).not.toBe("declined");
    // One deterministic event records the pass without changing the status.
    const events = rows.referralTransitionEvents.filter(event => event.action === "pass");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ operationKey: "one-click:9:declined:timing", actorUserId: 9, fromStatus: "pending", resultingStatus: "pending", resultingRevision: 5 });
  });

  it("hands the released ask back to the company queue and keeps it out of the passer's reach", async () => {
    expect(await getUnclaimedCompanyReferralPreview(10, 501)).toBeUndefined();
    expect(await getUnclaimedCompanyReferralPreview(9, 501)).toBeDefined();

    await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "cannot_support", passReason: "not_my_team" });

    expect(await getUnclaimedCompanyReferralPreview(10, 501)).toBeDefined();
    expect(await getUnclaimedCompanyReferralPreview(9, 501)).toBeUndefined();
  });

  it("replays an exact retry without applying anything twice", async () => {
    await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "timing", passReason: "at_capacity" });
    const revokedAt = rows.referralDocumentAccessGrants[0].revokedAt;
    const retry = await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "timing", passReason: "at_capacity" });

    expect(retry).toMatchObject({ status: "passed", replayed: true, reopened: false });
    expect(ask().revision).toBe(5);
    expect(rows.referralRequestPasses).toHaveLength(1);
    expect(rows.notifications).toHaveLength(1);
    expect(rows.referralTransitionEvents).toHaveLength(1);
    expect(rows.referralDocumentAccessGrants[0].revokedAt).toBe(revokedAt);
  });

  it("still refuses a third party, and never touches the ask", async () => {
    await expect(oneClickReviewReferralRequest(10, { requestId: 501, decision: "declined", declineReason: "timing", passReason: "at_capacity" })).rejects.toThrow(/no longer available/);
    expect(ask()).toMatchObject({ status: "pending", referrerId: 9, revision: 4 });
    expect(rows.referralRequestPasses).toEqual([]);
    expect(rows.notifications).toEqual([]);
  });

  it("keeps an unclaimed pass exactly as it was: pending, no claim, same notice", async () => {
    ask().referrerId = null;
    const result = await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "cannot_support", passReason: "prefer_not_to_say" });

    expect(result).toMatchObject({ status: "passed", reopened: false });
    expect(ask()).toMatchObject({ status: "pending", referrerId: null, revision: 5 });
    expect(String(seekerNotice().body)).toContain("Your request stays active for other employees.");
    expect(String(seekerNotice().body)).not.toContain("open again");
  });
});

describe("the claimed-review decline is the same pass (D-021)", () => {
  it("reopens the ask instead of ending it, and keeps the referrer's note private", async () => {
    const result = await reviewReferralRequest(9, { requestId: 501, decision: "declined", message: "  Not the team I can help this cycle  " });

    expect(result).toMatchObject({ status: "passed" });
    expect(ask()).toMatchObject({ status: "pending", referrerId: null, referrerMessage: null, revision: 5 });
    expect(rows.referralRequestPasses).toEqual([expect.objectContaining({ referrerId: 9, reason: "Not the team I can help this cycle", reasonCode: null })]);
    expect(String(seekerNotice().body)).toContain("Your ask is open again to other verified employees at acme.com.");
    expect(String(seekerNotice().body)).not.toContain("Not the team I can help");
    expect(rows.referralTransitionEvents.some(event => event.resultingStatus === "declined")).toBe(false);
    expect(rows.referralDocumentAccessGrants[0].revokeReason).toBe("passed");
  });

  it("falls back to the plain decline note and replays an exact retry", async () => {
    await reviewReferralRequest(9, { requestId: 501, decision: "declined" });
    expect(rows.referralRequestPasses[0]).toMatchObject({ reason: "I cannot support a referral for this role right now.", reasonCode: null });
    const retry = await reviewReferralRequest(9, { requestId: 501, decision: "declined" });
    expect(retry).toMatchObject({ status: "passed", replayed: true });
    expect(rows.referralRequestPasses).toHaveLength(1);
    expect(rows.notifications).toHaveLength(1);
  });
});

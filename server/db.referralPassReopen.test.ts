import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQL, getTableColumns, getTableName, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  tokenBalances, tokenTransactions, planCreditGrants, promoCreditGrants,
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
import { claimCompanyReferralRequest, withdrawCompanyReferralRequest, expireStalePendingReferralRequest, getAccessibleReferralAttachment, getUnclaimedCompanyReferralPreview, oneClickReviewReferralRequest, reviewReferralRequest } from "./db";

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
const TABLES = [tokenBalances, tokenTransactions, planCreditGrants, promoCreditGrants, jobs, notifications, profiles, referralAttachments, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequestSaves, referralRequests, referralTransitionEvents, referrerReviewEmailLinks];
const TABLE_BY_NAME = new Map(TABLES.map(table => [getTableName(table), table]));
const COLUMNS_BY_NAME = new Map(TABLES.map(table => [getTableName(table), Object.keys(getTableColumns(table))]));

let rows: Record<string, Row[]>;
let sequence: Record<string, number>;
let historyUnavailable = false;

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
    const inMatch = /^`([^`]+)`\.`([^`]+)` in \((.+)\)$/.exec(trimmed);
    if (inMatch) {
      const count = (inMatch[3].match(/\?/g) ?? []).length;
      const values = query.params.slice(cursor.index, cursor.index + count);
      cursor.index += count;
      return values.includes(flat[`${inMatch[1]}.${inMatch[2]}`]);
    }
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
      if (historyUnavailable && state.from === referralTransitionEvents) throw new Error("history unavailable");
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
      orderBy: (..._order: unknown[]) => chain,
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

const requestRow = (over: Row = {}): Row => ({ id: 501, jobSeekerId: 7, jobId: 3, referrerId: 9, personalPitch: "I led two launches.", status: "pending", revision: 4, referrerMessage: null, waitingForCoverage: false, coverageVisibleAt: null, coverageHeldAt: null, createdAt: new Date("2026-10-14T12:00:00.000Z"), updatedAt: new Date("2026-10-14T12:00:00.000Z"), debitTransactionId: 11, ...over });

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
  historyUnavailable = false;
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
    expect(String(seekerNotice().body)).toContain("Your ask is open again to other verified employees there.");
    expect(ask().status).not.toBe("declined");
    // One deterministic event records the pass without changing the status. D-035: at_capacity
    // is not fixable, so the action is pass_release and the credit releases at the terminal.
    const events = rows.referralTransitionEvents.filter(event => event.action === "pass_release");
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

  it("records a D-052 reason code and names the reason to the seeker, never the referrer", async () => {
    await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "cannot_support", passReason: "only_refer_known" });

    expect(rows.referralRequestPasses).toEqual([expect.objectContaining({ referrerId: 9, reason: "cannot_support", reasonCode: "only_refer_known" })]);
    expect(String(seekerNotice().body)).toContain("A verified employee at acme.com said: I only refer people I know.");
    expect(String(seekerNotice().body)).not.toContain("(I only refer people I know)");
    expect(ask()).toMatchObject({ status: "pending", referrerId: null });
  });
});

describe("the claimed-review decline is the same pass (D-021)", () => {
  it("reopens the ask instead of ending it, and keeps the referrer's note private", async () => {
    const result = await reviewReferralRequest(9, { requestId: 501, decision: "declined", message: "  Not the team I can help this cycle  " });

    expect(result).toMatchObject({ status: "passed" });
    expect(ask()).toMatchObject({ status: "pending", referrerId: null, referrerMessage: null, revision: 5 });
    expect(rows.referralRequestPasses).toEqual([expect.objectContaining({ referrerId: 9, reason: "Not the team I can help this cycle", reasonCode: null })]);
    expect(String(seekerNotice().body)).toContain("Your ask is open again to other verified employees there.");
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


describe("attachment lookup scopes the requested file before limiting", () => {
  beforeEach(() => {
    rows.referralAttachments = [
      { id: 71, ownerId: 7, referralRequestId: null, fileName: "first.pdf", fileKey: "private/first", mimeType: "application/pdf", fileSize: 3 },
      { id: 72, ownerId: 7, referralRequestId: 501, fileName: "second.pdf", fileKey: "private/second", mimeType: "application/pdf", fileSize: 3 },
    ];
  });

  it("returns each owned upload even when another upload was stored first", async () => {
    expect(await getAccessibleReferralAttachment(7, 71)).toMatchObject({ id: 71 });
    expect(await getAccessibleReferralAttachment(7, 72)).toMatchObject({ id: 72 });
  });

  it("returns nothing for a missing id or another user's file", async () => {
    expect(await getAccessibleReferralAttachment(7, 99)).toBeUndefined();
    expect(await getAccessibleReferralAttachment(10, 72)).toBeUndefined();
  });

  it("keeps owner access even if the owner has a historical pass record", async () => {
    rows.referralRequestPasses.push({ id: 2, referralRequestId: 501, referrerId: 7 });
    expect(await getAccessibleReferralAttachment(7, 72)).toMatchObject({ id: 72 });
  });

  it("preserves assigned-referrer grant, expiry and pass checks", async () => {
    // D-019(e): the claimed ask is still pending, so its active claim-era grant opens nothing.
    expect(await getAccessibleReferralAttachment(9, 72)).toBeUndefined();
    ask().status = "approved";
    // Approved without referrer 9's own acceptance (an administrator approved the claim before ee226f3): still nothing.
    expect(await getAccessibleReferralAttachment(9, 72)).toBeUndefined();
    // Referrer 9's own acceptance, older than 30 days, so the grant's window decides each check below.
    rows.referralTransitionEvents.push({ id: 1, referralRequestId: 501, operationKey: "one-click:9:approved", actorUserId: 9, action: "approve", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 5, referenceId: null, createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) });
    expect(await getAccessibleReferralAttachment(9, 72)).toMatchObject({ id: 72 });
    rows.referralDocumentAccessGrants[0].expiresAt = new Date(0);
    expect(await getAccessibleReferralAttachment(9, 72)).toBeUndefined();
    rows.referralDocumentAccessGrants[0].expiresAt = new Date("2099-01-01");
    rows.referralDocumentAccessGrants[0].revokedAt = new Date();
    expect(await getAccessibleReferralAttachment(9, 72)).toBeUndefined();
    rows.referralDocumentAccessGrants[0].revokedAt = null;
    rows.referralRequestPasses.push({ id: 1, referralRequestId: 501, referrerId: 9 });
    expect(await getAccessibleReferralAttachment(9, 72)).toBeUndefined();
  });
});


// Monetary-policy regressions run real claim/pass/terminal functions, not mocked transitions.
// A seeded debit is the persisted output of send, not an assertion that send was exercised.
describe("pickup permanently spends the ask credit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    ask().referrerId = null;
    rows.referralDocumentAccessGrants = [];
    rows.referralAvailabilitySlots = [];
    rows.referrerReviewEmailLinks = [];
    rows.tokenBalances = [{ id: 1, userId: 7, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free" }];
    rows.tokenTransactions = [{ id: 11, userId: 7, role: "job_seeker", kind: "credit_spend", tokenCount: -1, source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "referral_request", referenceId: "501#1", reversesTransactionId: null }];
    rows.planCreditGrants = [];
    rows.promoCreditGrants = [];
    sequence.tokenTransactions = 11;
  });

  async function finish(terminal: "withdraw" | "expiry") {
    if (terminal === "withdraw") {
      const result = await withdrawCompanyReferralRequest(7, 501);
      expect(result).toMatchObject({ withdrawn: true, status: "withdrawn" });
      expect(ask().status).toBe("withdrawn");
    } else {
      const later = new Date("2026-10-23T12:00:00Z");
      vi.setSystemTime(later);
      await expireStalePendingReferralRequest(7, 501, later.getTime());
    }
  }

  it.each([
    ["ledger refund", "credit_spend", "monthly_allowance", "2026-10", 2, false, true],
    ["ended ledger cycle", "credit_spend", "monthly_allowance", "2026-09", 2, false, false],
    ["capped ledger cycle", "credit_spend", "monthly_allowance", "2026-10", 3, false, false],
    ["prior ledger reversal", "credit_spend", "monthly_allowance", "2026-10", 2, true, false],
    ["legacy monthly refund", "direct_request", "monthly_allowance", "2026-10", 2, false, true],
    ["ended legacy cycle", "direct_request", "monthly_allowance", "2026-09", 2, false, false],
    ["capped legacy cycle", "direct_request", "monthly_allowance", "2026-10", 3, false, false],
    ["legacy purchased refund", "direct_request", "purchased_balance", null, 2, false, true],
    ["prior legacy reversal", "direct_request", "monthly_allowance", "2026-10", 2, true, false],
  ] as const)("reports actual movement, not debit existence, for %s", async (_scenario, kind, source, sourceCycleKey, monthly, reversed, creditRefunded) => {
    Object.assign(rows.tokenTransactions[0], { kind, source, sourceCycleKey });
    rows.tokenBalances[0].monthlyCreditsRemaining = monthly;
    if (reversed) rows.tokenTransactions.push({ id: 12, reversesTransactionId: 11 });
    const result = await withdrawCompanyReferralRequest(7, 501);
    expect(result).toMatchObject({ withdrawn: true, status: "withdrawn", creditRefunded });
    expect(ask().status).toBe("withdrawn");
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(monthly + (creditRefunded && source === "monthly_allowance" ? 1 : 0));
    expect(rows.tokenBalances[0].balance).toBe(creditRefunded && source === "purchased_balance" ? 1 : 0);
    expect(await withdrawCompanyReferralRequest(7, 501)).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(rows.tokenTransactions.filter(row => row.reversesTransactionId === 11)).toHaveLength(1);
  });

  it("reports no refund for a free ask", async () => {
    ask().debitTransactionId = null; rows.tokenTransactions = [];
    expect(await withdrawCompanyReferralRequest(7, 501)).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2); expect(rows.tokenTransactions).toEqual([]);
  });

  it("releases the credit after actual claim, a legacy declined review and withdrawal (D-035)", async () => {
    await claimCompanyReferralRequest(9, 501);
    await reviewReferralRequest(9, { requestId: 501, decision: "declined" });
    expect(await withdrawCompanyReferralRequest(7, 501)).toMatchObject({ withdrawn: true, creditRefunded: true });
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
    expect(rows.tokenTransactions.filter(row => row.reversesTransactionId === 11)).toHaveLength(1);
  });

  for (const terminal of ["withdraw", "expiry"] as const) {
    it(`releases the credit after actual claim then a legacy declined review then ${terminal} (D-035)`, async () => {
      await claimCompanyReferralRequest(9, 501);
      expect(ask().referrerId).toBe(9);
      expect(rows.referralTransitionEvents.some(event => event.action === "claim")).toBe(true);
      await reviewReferralRequest(9, { requestId: 501, decision: "declined" });
      expect(ask()).toMatchObject({ status: "pending", referrerId: null });
      expect(rows.referralTransitionEvents.some(event => event.action === "pass_release")).toBe(true);
      await finish(terminal);
      await finish(terminal);
      expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
      expect(rows.tokenTransactions.filter(row => row.reversesTransactionId === 11)).toHaveLength(1);
      expect(rows.tokenTransactions.filter(row => row.reversesTransactionId != null)).toHaveLength(1);
    });

    it(`returns a never-claimed credit once on ${terminal}`, async () => {
      await finish(terminal);
      await finish(terminal);
      expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
      expect(rows.tokenTransactions.filter(row => row.reversesTransactionId === 11)).toHaveLength(1);
    });

    it(`does not claim a free historical ask spent a credit on ${terminal}`, async () => {
      ask().debitTransactionId = null;
      rows.tokenTransactions = [];
      await claimCompanyReferralRequest(9, 501);
      await reviewReferralRequest(9, { requestId: 501, decision: "declined" });
      await finish(terminal);
      if (terminal === "expiry") {
        expect(String(rows.notifications.at(-1)?.body)).not.toContain("credit");
        expect(String(rows.notifications.at(-1)?.body)).toContain("open slot is free");
      } else {
        expect(rows.referralTransitionEvents.some(event => event.action === "withdraw")).toBe(true);
      }
      expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
      expect(rows.tokenTransactions).toEqual([]);
    });

    it(`fails closed when claim history is unavailable on ${terminal}`, async () => {
      historyUnavailable = true;
      await expect(finish(terminal)).rejects.toThrow("history unavailable");
      expect(ask().status).toBe("pending");
      expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
      expect(rows.tokenTransactions).toHaveLength(1);
    });

    it(`still refunds after an unclaimed pass on ${terminal}`, async () => {
      await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "timing", passReason: "at_capacity" });
      expect(rows.referralTransitionEvents.every(event => event.action !== "claim")).toBe(true);
      await finish(terminal);
      expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
    });

    it(`honors historical claim evidence on ${terminal} without pretending a claim was executed`, async () => {
      rows.referralTransitionEvents.push({ id: 101, referralRequestId: 501, operationKey: "claim:9", actorUserId: 9, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 3 });
      await finish(terminal);
      expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
      expect(rows.tokenTransactions.filter(row => row.reversesTransactionId != null)).toEqual([]);
    });
  }
});


describe("the pass reason decides the credit (D-035)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    ask().referrerId = null;
    rows.referralDocumentAccessGrants = [];
    rows.referralAvailabilitySlots = [];
    rows.referrerReviewEmailLinks = [];
    rows.tokenBalances = [{ id: 1, userId: 7, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free" }];
    rows.tokenTransactions = [{ id: 11, userId: 7, role: "job_seeker", kind: "credit_spend", tokenCount: -1, source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "referral_request", referenceId: "501#1", reversesTransactionId: null }];
    rows.planCreditGrants = [];
    rows.promoCreditGrants = [];
    sequence.tokenTransactions = 11;
  });

  async function finish(terminal: "withdraw" | "expiry") {
    if (terminal === "withdraw") {
      const result = await withdrawCompanyReferralRequest(7, 501);
      expect(result).toMatchObject({ withdrawn: true, status: "withdrawn" });
      expect(ask().status).toBe("withdrawn");
    } else {
      const later = new Date("2026-10-23T12:00:00Z");
      vi.setSystemTime(later);
      await expireStalePendingReferralRequest(7, 501, later.getTime());
    }
  }

  it("keeps the credit spent after a claim when the pass reason is fixable", async () => {
    await claimCompanyReferralRequest(9, 501);
    await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "role_not_a_fit", passReason: "needs_experience" });
    expect(rows.referralTransitionEvents.some(event => event.action === "pass_release")).toBe(false);
    expect(rows.referralTransitionEvents.some(event => event.action === "pass")).toBe(true);
    await finish("expiry");
    expect(ask().status).toBe("closed");
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
    expect(rows.tokenTransactions.filter(row => row.reversesTransactionId != null)).toEqual([]);
    expect(String(rows.notifications.at(-1)?.body)).toContain("stays spent");
  });

  it("releases the credit after a claim when the pass reason is not fixable, once, on expiry and on withdrawal", async () => {
    await claimCompanyReferralRequest(9, 501);
    await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "role_not_a_fit", passReason: "role_closed" });
    expect(rows.referralTransitionEvents.filter(event => event.action === "pass_release")).toHaveLength(1);
    expect(rows.referralTransitionEvents.some(event => event.action === "pass")).toBe(false);
    await finish("expiry");
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
    expect(rows.tokenTransactions.filter(row => row.reversesTransactionId === 11)).toHaveLength(1);
    expect(String(rows.notifications.at(-1)?.body)).toContain("Your credit is back on your balance");
  });

  it("releases the credit after a claim when the pass reason is not fixable, on withdrawal", async () => {
    await claimCompanyReferralRequest(9, 501);
    await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "role_not_a_fit", passReason: "role_closed" });
    await finish("withdraw");
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
    expect(rows.tokenTransactions.filter(row => row.reversesTransactionId === 11)).toHaveLength(1);
  });

  it("tells the seeker why, and that the credit comes back, when the pass releases", async () => {
    await claimCompanyReferralRequest(9, 501);
    await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "role_not_a_fit", passReason: "role_closed" });
    const body = String(rows.notifications.at(-1)?.body);
    expect(body).toContain("A verified employee at acme.com said: Role is closed.");
    expect(body).toContain("Your ask is open again to other verified employees there.");
    expect(body).toContain("If nobody picks it up, your credit comes back, unless its month or plan has ended by then.");
    expect(body).not.toContain("Updating your profile");
  });

  it("tells the seeker what to fix when the pass is fixable, without promising the credit back", async () => {
    await claimCompanyReferralRequest(9, 501);
    await oneClickReviewReferralRequest(9, { requestId: 501, decision: "declined", declineReason: "role_not_a_fit", passReason: "needs_experience" });
    const body = String(rows.notifications.at(-1)?.body);
    expect(body).toContain("A verified employee at acme.com said: Role needs more experience.");
    expect(body).toContain("Updating your profile or note can help the next employee decide.");
    expect(body).not.toContain("credit comes back");
  });

  it("omits the reason line for a legacy pass with no code and still promises the credit back", async () => {
    await claimCompanyReferralRequest(9, 501);
    await reviewReferralRequest(9, { requestId: 501, decision: "declined" });
    const body = String(rows.notifications.at(-1)?.body);
    expect(body).not.toContain("A verified employee");
    expect(body).toContain("Your ask is open again to other verified employees there.");
    expect(body).toContain("If nobody picks it up, your credit comes back");
  });
});

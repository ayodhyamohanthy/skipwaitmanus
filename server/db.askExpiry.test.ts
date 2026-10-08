import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQL, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { notifications, referralDocumentAccessGrants, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { expireStalePendingReferralRequest, reconcileExpiredPendingReferrals } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = new Date("2026-10-08T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

type Table = typeof referralRequests | typeof tokenBalances | typeof tokenTransactions | typeof referralTransitionEvents | typeof notifications | typeof referralDocumentAccessGrants;
let tables: Record<string, Array<Record<string, unknown>>>;

function rowsFor(table: Table): Array<Record<string, unknown>> {
  if (table === referralRequests) return tables.requests;
  if (table === tokenBalances) return tables.wallets;
  if (table === tokenTransactions) return tables.txns;
  if (table === referralTransitionEvents) return tables.events;
  if (table === notifications) return tables.notes;
  if (table === referralDocumentAccessGrants) return tables.docGrants;
  throw new Error("Unexpected table");
}

// drizzle hands timestamp params to the driver as "YYYY-MM-DD HH:MM:SS.mmm" (UTC) strings.
const asMs = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return value;
};

function matches(condition: SQLQuery, row: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition);
  const tokens = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(=|<|is null|is not null)/gi)];
  let i = 0;
  for (const token of tokens) {
    const col = token[1];
    const op = token[2].toLowerCase();
    if (op === "is null") {
      if (row[col] !== null && row[col] !== undefined) return false;
      continue;
    }
    if (op === "is not null") {
      if (row[col] === null || row[col] === undefined) return false;
      continue;
    }
    const param = query.params[i++];
    if (op === "=") {
      if (asMs(row[col]) !== asMs(param)) return false;
    } else if (op === "<") {
      const left = asMs(row[col]);
      const right = asMs(param);
      if (!(typeof left === "number" && typeof right === "number" && left < right)) return false;
    }
  }
  return true;
}

function insertInto(table: Table, row: Record<string, unknown>) {
  const rows = rowsFor(table);
  const id = rows.length + 1;
  rows.push({ id, ...structuredClone(row) });
  return [{ affectedRows: 1, insertId: id }];
}

function chainable(selected: () => Array<Record<string, unknown>>) {
  const slice = (n: number) => structuredClone(selected().slice(0, n));
  return {
    limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve) }),
    for: async (_mode: string) => structuredClone(selected()),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(selected())).then(resolve),
  };
}

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => ({
    from: (table: Table) => ({
      where: (condition: SQLQuery) => {
        const run = () => {
          const selected = rowsFor(table).filter(row => matches(condition, row));
          if (projection) return selected.map(row => Object.fromEntries(Object.entries(projection).map(([k, c]) => [k, row[(c as { name: string }).name]])));
          return selected;
        };
        return chainable(run);
      },
    }),
  });
  const update = (table: Table) => ({
    set: (patch: Record<string, unknown>) => ({
      where: async (condition: SQLQuery) => {
        const selected = rowsFor(table).filter(row => matches(condition, row));
        selected.forEach(row => {
          for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value);
        });
        return [{ affectedRows: selected.length }];
      },
    }),
  });
  const insert = (table: Table) => ({
    values: (row: Record<string, unknown> | Array<Record<string, unknown>>) => {
      const done = (async () => insertInto(table, (Array.isArray(row) ? row[0] : row) as Record<string, unknown>))();
      return Object.assign(done, { onDuplicateKeyUpdate: async () => [{ affectedRows: 1, insertId: 0 }] });
    },
  });
  const api = { select, update, insert };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const walletRow = () => ({ id: 1, userId: 7, role: "job_seeker" as const, balance: 2, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free" as const, subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: NOW });
const debitRow = (source: string, cycle: string) => ({ id: 11, userId: 7, role: "job_seeker" as const, tokenCount: -1, kind: "direct_request" as const, source, sourceCycleKey: cycle, referenceType: "referral_request", referenceId: "501", reversesTransactionId: null, balanceAfter: 2, monthlyCreditsAfter: 2 });
const requestRow = (createdAt: Date, over: Partial<Record<string, unknown>> = {}) => ({ id: 501, jobSeekerId: 7, jobId: 3, referrerId: null, personalPitch: "x", status: "pending", revision: 0, waitingForCoverage: false, coverageQueuedAt: null, referrerMessage: null, savedAt: null, idempotencyKey: null, requestFingerprint: null, debitTransactionId: 11, createdAt, updatedAt: createdAt, ...over });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { requests: [], wallets: [walletRow()], txns: [], events: [], notes: [], docGrants: [] };
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("ask expiry", () => {
  it("expires a stale unclaimed ask, refunds monthly credit, and notifies", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 8 * DAY))];
    const result = await expireStalePendingReferralRequest(7, 501, NOW.getTime());
    expect(result.expired).toBe(true);
    if (!result.expired) throw new Error("expected the stale ask to expire");
    expect(result.status).toBe("closed");
    expect(tables.requests[0].status).toBe("closed");
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(3);
    const refund = tables.txns.find(t => t.kind === "expiry_refund");
    expect(refund).toMatchObject({ userId: 7, tokenCount: 1, source: "monthly_allowance", reversesTransactionId: 11, referenceId: "501" });
    expect(tables.events.some(e => e.action === "expire" && e.resultingStatus === "closed")).toBe(true);
    expect(tables.notes.some(n => String(n.title).includes("expired"))).toBe(true);
    expect(result.creditSummary).toMatchObject({ monthlyCreditsRemaining: 3 });
  });

  it("refunds purchased balance instead of monthly allowance", async () => {
    tables.txns = [debitRow("purchased_balance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 9 * DAY))];
    await expireStalePendingReferralRequest(7, 501, NOW.getTime());
    expect(tables.wallets[0].balance).toBe(3);
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(2);
  });

  it("records a zero-credit refund when the monthly cycle rolled over", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-09")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 8 * DAY))];
    await expireStalePendingReferralRequest(7, 501, NOW.getTime());
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(2);
    expect(tables.txns.find(t => t.kind === "expiry_refund")).toMatchObject({ tokenCount: 0 });
    expect(tables.requests[0].status).toBe("closed");
  });

  it("leaves fresh and claimed asks untouched", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 2 * DAY), { id: 501 }), requestRow(new Date(NOW.getTime() - 9 * DAY), { id: 502, referrerId: 9 })];
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(false);
    expect((await expireStalePendingReferralRequest(7, 502, NOW.getTime())).expired).toBe(false);
    expect(tables.txns.some(t => t.kind === "expiry_refund")).toBe(false);
    expect(tables.events.length).toBe(0);
  });

  it("is idempotent: a second expiry changes nothing and refunds once", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 8 * DAY))];
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(true);
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(false);
    expect(tables.txns.filter(t => t.kind === "expiry_refund").length).toBe(1);
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(3);
  });

  it("reconciles only stale asks and reports their ids", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 2 * DAY), { id: 501 }), requestRow(new Date(NOW.getTime() - 10 * DAY), { id: 502 })];
    const result = await reconcileExpiredPendingReferrals(7, NOW.getTime());
    expect(result.expiredRequestIds).toEqual([502]);
    expect(tables.requests.find(r => r.id === 501)?.status).toBe("pending");
    expect(tables.requests.find(r => r.id === 502)?.status).toBe("closed");
  });

  it("fails open per request: one bad row never blocks the rest", async () => {
    tables.txns = [];
    tables.requests = [requestRow(new Date(NOW.getTime() - 10 * DAY), { id: 503, debitTransactionId: 99 })];
    const result = await reconcileExpiredPendingReferrals(7, NOW.getTime());
    // No debit row and no wallet change possible is fine (nothing reserved),
    // but a missing wallet with a real debit must throw like a withdraw.
    expect(result.expiredRequestIds).toEqual([503]);
  });

  it("throws like a withdraw when a debit exists but the wallet is gone", async () => {
    tables.wallets = [];
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 10 * DAY))];
    await expect(expireStalePendingReferralRequest(7, 501, NOW.getTime())).rejects.toThrow(/wallet is unavailable/);
    expect(tables.requests[0].status).toBe("pending");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQL, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { askInviteLinks, jobs, notifications, planCreditGrants, promoCreditGrants, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { expireStalePendingReferralRequest, withdrawCompanyReferralRequest } from "./db";
import { createAskExpirySweep } from "./askExpirySweep";
import { coverageWaitExpiredNotice } from "./coverageDelivery";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = new Date("2026-10-08T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

type Table = typeof referralRequests | typeof tokenBalances | typeof tokenTransactions | typeof referralTransitionEvents | typeof notifications | typeof referralDocumentAccessGrants | typeof planCreditGrants | typeof promoCreditGrants | typeof jobs | typeof referralAvailabilitySlots | typeof askInviteLinks;
let tables: Record<string, Array<Record<string, unknown>>>;

function rowsFor(table: Table): Array<Record<string, unknown>> {
  if (table === referralRequests) return tables.requests;
  if (table === tokenBalances) return tables.wallets;
  if (table === tokenTransactions) return tables.txns;
  if (table === referralTransitionEvents) return tables.events;
  if (table === notifications) return tables.notes;
  if (table === referralDocumentAccessGrants) return tables.docGrants;
  if (table === jobs) return tables.jobs;
  if (table === referralAvailabilitySlots) return tables.slots;
  if (table === askInviteLinks) return [];
  if (table === planCreditGrants || table === promoCreditGrants) return [];
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
  const tokens = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(=|<|is null|is not null|in \(([^)]*)\))/gi)];
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
    if (op.startsWith("in")) {
      const n = (token[3].match(/\?/g) ?? []).length;
      const allowed = query.params.slice(i, i + n); i += n;
      if (!allowed.some(value => asMs(value) === asMs(row[col]))) return false;
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
    orderBy: () => chainable(selected),
    limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve) }),
    for: async (_mode: string) => structuredClone(selected()),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(selected())).then(resolve),
  };
}

function fixtureDatabase() {
  // A projection column from the joined jobs table (companyDomain: jobs.company) resolves through the row's jobId.
  const cell = (row: Record<string, unknown>, column: unknown) => {
    if (column === jobs.company) return tables.jobs.find(job => job.id === row.jobId)?.company ?? null;
    return row[(column as { name: string }).name];
  };
  const select = (projection?: Record<string, unknown>) => ({
    from: (table: Table) => {
      const where = (condition: SQLQuery) => {
        const run = () => {
          const selected = rowsFor(table).filter(row => matches(condition, row));
          if (projection) return selected.map(row => Object.fromEntries(Object.entries(projection).map(([k, c]) => [k, cell(row, c)])));
          return selected;
        };
        return chainable(run);
      };
      return { where, innerJoin: (_joined: Table, _on: SQLQuery) => ({ where }) };
    },
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
const requestRow = (createdAt: Date, over: Partial<Record<string, unknown>> = {}) => ({ id: 501, jobSeekerId: 7, jobId: 3, referrerId: null, personalPitch: "x", status: "pending", revision: 0, waitingForCoverage: false, coverageQueuedAt: null, coverageVisibleAt: null, coverageHeldAt: null, referrerMessage: null, savedAt: null, idempotencyKey: null, requestFingerprint: null, debitTransactionId: 11, createdAt, updatedAt: createdAt, ...over });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { requests: [], wallets: [walletRow()], txns: [], events: [], notes: [], docGrants: [], slots: [], jobs: [{ id: 3, company: "acme.com" }] };
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
    // Every claim has written this event since migration 0058; an assigned ask without one is a personal-link ask (D-050).
    tables.events = [{ id: 1, referralRequestId: 502, operationKey: "claim:9", actorUserId: 9, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1 }];
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(false);
    expect((await expireStalePendingReferralRequest(7, 502, NOW.getTime())).expired).toBe(false);
    expect(tables.txns.some(t => t.kind === "expiry_refund")).toBe(false);
    expect(tables.events.filter(e => e.action !== "claim")).toEqual([]);
    expect(tables.requests.map(r => r.status)).toEqual(["pending", "pending"]);
  });

  it("is idempotent: a second expiry changes nothing and refunds once", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 8 * DAY))];
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(true);
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(false);
    expect(tables.txns.filter(t => t.kind === "expiry_refund").length).toBe(1);
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(3);
  });

  it("keeps a young waiting ask open; at the 90-day mark it closes free, clears the waiting flags and says no credit was used (D-061)", async () => {
    tables.requests = [requestRow(new Date(NOW.getTime() - 8 * DAY), { waitingForCoverage: true, coverageQueuedAt: new Date(NOW.getTime() - 8 * DAY), debitTransactionId: null })];
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(false);
    expect(tables.requests[0].status).toBe("pending");
    tables.requests = [requestRow(new Date(NOW.getTime() - 91 * DAY), { waitingForCoverage: true, coverageQueuedAt: new Date(NOW.getTime() - 91 * DAY), debitTransactionId: null })];
    const result = await expireStalePendingReferralRequest(7, 501, NOW.getTime());
    expect(result).toMatchObject({ expired: true, status: "closed" });
    expect(tables.requests[0]).toMatchObject({ status: "closed", waitingForCoverage: false, coverageQueuedAt: null, coverageHeldAt: null });
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(2);
    expect(tables.txns).toEqual([]);
    expect(tables.notes).toEqual([expect.objectContaining({ userId: 7, refId: 501, ...coverageWaitExpiredNotice("acme.com") })]);
  });

  it("runs the 7-day clock from first visibility, not creation, on a delivered ask (D-061)", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    // Waiting 30 days before coverage, visible only 2: the clock has barely started.
    tables.requests = [requestRow(new Date(NOW.getTime() - 30 * DAY), { coverageVisibleAt: new Date(NOW.getTime() - 2 * DAY) })];
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(false);
    expect(tables.requests[0].status).toBe("pending");
    // Visible for 8 days: past its window although it was created long before.
    tables.requests = [requestRow(new Date(NOW.getTime() - 30 * DAY), { coverageVisibleAt: new Date(NOW.getTime() - 8 * DAY) })];
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(true);
    expect(tables.requests[0].status).toBe("closed");
  });

  // The reconcile-on-read tests moved to askExpirySweep.personalLink.test.ts (same assertions): reconcile now also reads
  // personal-link asks through a join, which this fixture cannot evaluate.

  it("refuses to expire or refund another seeker's ask (cross-user)", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 9 * DAY))];
    await expect(expireStalePendingReferralRequest(8, 501, NOW.getTime())).rejects.toThrow(/not in your account/);
    expect(tables.requests[0].status).toBe("pending");
    expect(tables.txns.some(t => t.kind === "expiry_refund")).toBe(false);
    expect(tables.notes.length).toBe(0);
  });

  it("scheduled sweep expires each stale ask as its own seeker, and a mismatched pair changes nothing", async () => {
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 9 * DAY))];
    const context = { nowMs: NOW.getTime(), windowKey: "2026-10-08T12:00Z" };
    const forged = await createAskExpirySweep({ listStale: async () => [{ id: 501, jobSeekerId: 8 }], expire: expireStalePendingReferralRequest })(context);
    expect(forged).toMatchObject({ processed: 0, failed: 1 });
    expect(tables.requests[0].status).toBe("pending");
    const real = await createAskExpirySweep({ listStale: async () => [{ id: 501, jobSeekerId: 7 }], expire: expireStalePendingReferralRequest })(context);
    expect(real).toEqual({ processed: 1, failed: 0 });
    expect(tables.requests[0].status).toBe("closed");
    expect(tables.txns.filter(t => t.kind === "expiry_refund").length).toBe(1);
    expect(tables.notes.filter(n => n.userId === 7).length).toBe(1);
  });

  it("expires a free ask (asks no longer reserve a credit): the slot frees, nothing is refunded", async () => {
    tables.requests = [requestRow(new Date(NOW.getTime() - 8 * DAY), { debitTransactionId: null })];
    const before = structuredClone(tables.wallets);
    const result = await expireStalePendingReferralRequest(7, 501, NOW.getTime());
    expect(result).toMatchObject({ expired: true, status: "closed" });
    expect(tables.wallets).toEqual(before);
    expect(tables.txns).toEqual([]);
    expect(tables.notes).toEqual([expect.objectContaining({ userId: 7, title: "Your ask expired — slot freed" })]);
  });

  it("withdraws a free ask without touching credits, and still refuses a reserved debit that went missing", async () => {
    tables.requests = [requestRow(new Date(NOW.getTime() - 2 * DAY), { debitTransactionId: null })];
    const before = structuredClone(tables.wallets);
    expect(await withdrawCompanyReferralRequest(7, 501)).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect(tables.requests[0].status).toBe("withdrawn");
    expect(tables.wallets).toEqual(before);
    expect(tables.txns).toEqual([]);
    tables.requests = [requestRow(new Date(NOW.getTime() - 2 * DAY), { id: 502, debitTransactionId: 99 })];
    await expect(withdrawCompanyReferralRequest(7, 502)).rejects.toThrow(/debit is unavailable/);
    expect(tables.requests[0].status).toBe("pending");
    await expect(withdrawCompanyReferralRequest(8, 502)).rejects.toThrow(/not in your account/);
  });

  it("returns a pre-switch reserved credit once across withdraw and expiry, in either order", async () => {
    tables.txns = [debitRow("purchased_balance", "2026-10"), { ...debitRow("purchased_balance", "2026-10"), id: 12, referenceId: "502" }];
    tables.requests = [requestRow(new Date(NOW.getTime() - 8 * DAY)), requestRow(new Date(NOW.getTime() - 8 * DAY), { id: 502, debitTransactionId: 12 })];
    // Withdraw first: a repeated withdraw and the later expiry sweep never refund again.
    expect(await withdrawCompanyReferralRequest(7, 501)).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect(await withdrawCompanyReferralRequest(7, 501)).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect((await expireStalePendingReferralRequest(7, 501, NOW.getTime())).expired).toBe(false);
    // Expiry first: the closed ask can no longer be withdrawn, so nothing comes back twice.
    expect((await expireStalePendingReferralRequest(7, 502, NOW.getTime())).expired).toBe(true);
    await expect(withdrawCompanyReferralRequest(7, 502)).rejects.toThrow(/can no longer be withdrawn/);
    expect(tables.txns.filter(t => t.kind === "withdrawal_refund").map(t => t.reversesTransactionId)).toEqual([11]);
    expect(tables.txns.filter(t => t.kind === "expiry_refund").map(t => t.reversesTransactionId)).toEqual([12]);
    expect(tables.wallets[0].balance).toBe(4);
  });

  it("throws like a withdraw when a debit exists but the wallet is gone", async () => {
    tables.wallets = [];
    tables.txns = [debitRow("monthly_allowance", "2026-10")];
    tables.requests = [requestRow(new Date(NOW.getTime() - 10 * DAY))];
    await expect(expireStalePendingReferralRequest(7, 501, NOW.getTime())).rejects.toThrow(/wallet is unavailable/);
    expect(tables.requests[0].status).toBe("pending");
  });

  it("credit spent at send: withdraw before pickup returns it once; expiry returns it once; claim and decline paths never refund", async () => {
    const spend = (id: number, ask: number) => ({ id, userId: 7, role: "job_seeker" as const, tokenCount: -1, kind: "credit_spend" as const, source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "referral_request", referenceId: `${ask}#1`, reversesTransactionId: null, idempotencyKey: `k${ask}#1`, balanceAfter: 2, monthlyCreditsAfter: 1, creditGrantId: null });
    tables.wallets[0].monthlyCreditsRemaining = 0;
    tables.txns = [spend(21, 501), spend(22, 502), spend(23, 503)];
    tables.requests = [requestRow(new Date(NOW.getTime() - 2 * DAY), { debitTransactionId: 21 }), requestRow(new Date(NOW.getTime() - 8 * DAY), { id: 502, debitTransactionId: 22 }), requestRow(new Date(NOW.getTime() - 2 * DAY), { id: 503, debitTransactionId: 23, referrerId: 9, status: "claimed" })];
    expect(await withdrawCompanyReferralRequest(7, 501)).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect(await withdrawCompanyReferralRequest(7, 501)).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(1);
    expect((await expireStalePendingReferralRequest(7, 502, NOW.getTime())).expired).toBe(true);
    expect((await expireStalePendingReferralRequest(7, 502, NOW.getTime())).expired).toBe(false);
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(2);
    // A claimed ask keeps its credit: it cannot be withdrawn, and the sweep never touches it.
    await expect(withdrawCompanyReferralRequest(7, 503)).rejects.toThrow(/already claimed/);
    expect((await expireStalePendingReferralRequest(7, 503, NOW.getTime())).expired).toBe(false);
    expect(tables.wallets[0].monthlyCreditsRemaining).toBe(2);
    expect(tables.txns.filter(t => t.reversesTransactionId != null).map(t => [t.kind, t.reversesTransactionId, t.tokenCount])).toEqual([["withdrawal_refund", 21, 1], ["expiry_refund", 22, 1]]);
  });
});

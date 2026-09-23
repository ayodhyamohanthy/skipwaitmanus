import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQL, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { notifications, operationalActivityLogs, paymentFulfillments, promoCreditGrants, tokenBalances, tokenTransactions, users } from "../drizzle/schema";
import { getTokenWallet, fulfillChargebeePayment, revokePromoGrant, spendToken } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = new Date("2026-10-01T00:00:00.000Z");

type Table = typeof users | typeof tokenBalances | typeof tokenTransactions | typeof promoCreditGrants | typeof paymentFulfillments | typeof notifications | typeof operationalActivityLogs;
let tables: Record<string, Array<Record<string, unknown>>>;
let failPromoTables = false;
const schemaMissingError = () => Object.assign(new Error("Table 'skipwait.promoCreditGrants' doesn't exist"), { code: "ER_NO_SUCH_TABLE", errno: 1146 });

function rowsFor(table: Table): Array<Record<string, unknown>> {
  if (table === promoCreditGrants && failPromoTables) throw schemaMissingError();
  if (table === users) return tables.users;
  if (table === tokenBalances) return tables.wallets;
  if (table === tokenTransactions) return tables.txns;
  if (table === promoCreditGrants) return tables.grants;
  if (table === paymentFulfillments) return tables.payments;
  if (table === notifications) return tables.notes;
  if (table === operationalActivityLogs) return tables.activity;
  throw new Error("Unexpected table");
}

function matches(condition: SQLQuery, row: Record<string, unknown>): boolean {  const query = dialect.sqlToQuery(condition);
  const equals = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(m => m[1]);
  let i = 0;
  for (const column of equals) {
    if (row[column] !== query.params[i]) return false;
    i += 1;
  }
  const inMatch = query.sql.match(/`[^`]+`\.`([^`]+)` in \((?:\?,? ?)+\)/i);
  if (inMatch && !(query.params.slice(i) as unknown[]).includes(row[inMatch[1]])) return false;
  return true;
}

function insertInto(table: Table, row: Record<string, unknown>) {
  const rows = rowsFor(table);
  if (table === promoCreditGrants && rows.some(r => r.userId === row.userId && r.role === row.role)) {
    throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
  }
  if (table === tokenBalances && rows.some(r => r.userId === row.userId && r.role === row.role)) {
    throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
  }
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
      where:  (condition: SQLQuery) => {
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
      where: async  (condition: SQLQuery) => {
        const selected = rowsFor(table).filter(row => matches(condition, row));
        // Interpret `column + N` SQL increments (wallet balance credits)
        // against the current row value instead of storing the SQL object.
        selected.forEach(row => {
          for (const [key, value] of Object.entries(patch)) {
            if (value instanceof SQL) {
              const query = dialect.sqlToQuery(value);
              const numbers = query.params.filter((p): p is number => typeof p === "number");
              if (typeof row[key] === "number" && numbers.length > 0 && /\+/.test(query.sql)) {
                row[key] = (row[key] as number) + numbers[numbers.length - 1];
                continue;
              }
            }
            row[key] = structuredClone(value);
          }
        });
        return [{ affectedRows: selected.length }];
      },
    }),
  });
  const insert = (table: Table) => ({
    values: async (row: Record<string, unknown> | Array<Record<string, unknown>>) => insertInto(table, (Array.isArray(row) ? row[0] : row) as Record<string, unknown>),
    onDuplicateKeyUpdate: () => ({ values: async () => [{ affectedRows: 1, insertId: 0 }] }),
  });
  const api = { select, update, insert, delete: () => { throw new Error("not needed"); }, execute: async () => [[], []] as unknown };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const walletRow = () => ({ id: 1, userId: 7, role: "job_seeker" as const, balance: 2, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free" as const, subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: NOW });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { users: [{ id: 7 }], wallets: [walletRow()], txns: [], grants: [], payments: [], notes: [], activity: [] };
  failPromoTables = false;
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("promo credit grants", () => {
  it("spends expiring promo credits before monthly and pack balances", async () => {
    tables.grants = [{ id: 1, userId: 7, role: "job_seeker", tokenCount: 5, creditsRemaining: 5, status: "active", source: "first_paid_invoice", providerRef: "in_1", grantedAt: NOW, expiresAt: new Date("2026-10-20T00:00:00.000Z"), consumedAt: null, revokedAt: null, revokedReason: null, createdAt: NOW }];
    const summary = await spendToken(7, "job_seeker");
    expect(tables.grants[0]).toMatchObject({ creditsRemaining: 4, status: "active" });
    expect(tables.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 3, balance: 2 });
    expect(tables.txns).toHaveLength(1);
    expect(tables.txns[0]).toMatchObject({ tokenCount: -1, kind: "promo_spend" });
    expect(summary).toMatchObject({ promoCreditsRemaining: 4, promoStatus: "active", totalAvailable: 4 + 3 + 2 });
  });

  it("falls through to monthly credits once promo is exhausted and marks the grant", async () => {
    tables.grants = [{ id: 1, userId: 7, role: "job_seeker", tokenCount: 5, creditsRemaining: 1, status: "active", source: "first_paid_invoice", providerRef: "in_1", grantedAt: NOW, expiresAt: new Date("2026-10-20T00:00:00.000Z"), consumedAt: null, revokedAt: null, revokedReason: null, createdAt: NOW }];
    await spendToken(7, "job_seeker");
    expect(tables.grants[0]).toMatchObject({ creditsRemaining: 0, status: "exhausted" });
    await spendToken(7, "job_seeker");
    expect(tables.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 2 });
  });

  it("treats expired promo as zero, marks it expired, and spends monthly instead", async () => {
    tables.grants = [{ id: 1, userId: 7, role: "job_seeker", tokenCount: 5, creditsRemaining: 5, status: "active", source: "first_paid_invoice", providerRef: "in_1", grantedAt: new Date("2026-08-01T00:00:00.000Z"), expiresAt: new Date("2026-08-31T00:00:00.000Z"), consumedAt: null, revokedAt: null, revokedReason: null, createdAt: new Date("2026-08-01T00:00:00.000Z") }];
    const summary = await spendToken(7, "job_seeker");
    expect(tables.grants[0]).toMatchObject({ status: "expired", creditsRemaining: 5 });
    expect(tables.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(summary).toMatchObject({ promoCreditsRemaining: 0, totalAvailable: 0 + 2 + 2 });
  });

  it("excludes revoked grants from spend and summary", async () => {
    tables.grants = [{ id: 1, userId: 7, role: "job_seeker", tokenCount: 5, creditsRemaining: 5, status: "revoked", source: "first_paid_invoice", providerRef: "in_1", grantedAt: NOW, expiresAt: new Date("2026-10-20T00:00:00.000Z"), consumedAt: null, revokedAt: NOW, revokedReason: "duplicate_account", createdAt: NOW }];
    const summary = await getTokenWallet(7, "job_seeker");
    expect(summary).toMatchObject({ promoCreditsRemaining: 0, promoStatus: "revoked", totalAvailable: 3 + 2 });
    expect(summary.promoExpiresAt).toBeNull();
  });

  it("revokes a grant, zeroes the remainder, and keeps the audit trail", async () => {
    tables.grants = [{ id: 1, userId: 7, role: "job_seeker", tokenCount: 5, creditsRemaining: 4, status: "active", source: "first_paid_invoice", providerRef: "in_1", grantedAt: NOW, expiresAt: new Date("2026-10-20T00:00:00.000Z"), consumedAt: null, revokedAt: null, revokedReason: null, createdAt: NOW }];
    await expect(revokePromoGrant(1, "duplicate_account")).resolves.toMatchObject({ grantId: 1, status: "revoked" });
    expect(tables.grants[0]).toMatchObject({ status: "revoked", creditsRemaining: 0, revokedReason: "duplicate_account" });
    const summary = await getTokenWallet(7, "job_seeker");
    expect(summary.totalAvailable).toBe(3 + 2);
  });

  it("reports promo expiry on the wallet summary", async () => {
    tables.grants = [{ id: 1, userId: 7, role: "job_seeker", tokenCount: 5, creditsRemaining: 5, status: "active", source: "first_paid_invoice", providerRef: "in_1", grantedAt: NOW, expiresAt: new Date("2026-10-31T00:00:00.000Z"), consumedAt: null, revokedAt: null, revokedReason: null, createdAt: NOW }];
    const summary = await getTokenWallet(7, "job_seeker");
    expect(summary).toMatchObject({ promoCreditsRemaining: 5, promoStatus: "active", totalAvailable: 5 + 3 + 2 });
    expect(new Date(summary.promoExpiresAt as unknown as string).toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("grants promo credits when the first pack payment is fulfilled", async () => {
    tables.payments = [{ id: 1, provider: "chargebee", providerEventId: "pending:page1", providerInvoiceId: null, providerHostedPageId: "page1", checkoutIntentId: "intent1", userId: 7, role: "job_seeker", tokenCount: 3, amount: 300, currency: "USD", status: "pending", reconciliationReason: null, lastCheckedAt: null, creditedAt: null, createdAt: NOW }];
    const result = await fulfillChargebeePayment({ eventId: "evt_1", hostedPageId: "page1", invoiceId: "in_1", passThruContent: "intent1", amount: 300, currency: "USD" });
    expect(result).toMatchObject({ status: "credited", tokenCount: 3 });
    expect(tables.wallets[0]).toMatchObject({ balance: 5 });
    expect(tables.grants).toHaveLength(1);
    expect(tables.grants[0]).toMatchObject({ userId: 7, role: "job_seeker", tokenCount: 5, creditsRemaining: 5, status: "active" });
    expect(new Date(tables.grants[0].expiresAt as unknown as string).toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(tables.txns.some(t => t.kind === "promo_grant" && t.tokenCount === 5)).toBe(true);
    expect(tables.notes).toHaveLength(1);
    const summary = await getTokenWallet(7, "job_seeker");
    expect(summary.totalAvailable).toBe(5 + 3 + 5);
  });

  it("never double-grants on webhook replay or a second purchase", async () => {
    tables.payments = [{ id: 1, provider: "chargebee", providerEventId: "pending:page1", providerInvoiceId: null, providerHostedPageId: "page1", checkoutIntentId: "intent1", userId: 7, role: "job_seeker", tokenCount: 3, amount: 300, currency: "USD", status: "pending", reconciliationReason: null, lastCheckedAt: null, creditedAt: null, createdAt: NOW }];
    const first = { eventId: "evt_1", hostedPageId: "page1", invoiceId: "in_1", passThruContent: "intent1", amount: 300, currency: "USD" };
    expect(await fulfillChargebeePayment(first)).toMatchObject({ status: "credited" });
    expect(await fulfillChargebeePayment(first)).toMatchObject({ status: "duplicate" });
    expect(tables.grants).toHaveLength(1);
    tables.payments.push({ id: 2, provider: "chargebee", providerEventId: "pending:page2", providerInvoiceId: null, providerHostedPageId: "page2", checkoutIntentId: "intent2", userId: 7, role: "job_seeker", tokenCount: 10, amount: 1000, currency: "USD", status: "pending", reconciliationReason: null, lastCheckedAt: null, creditedAt: null, createdAt: NOW });
    expect(await fulfillChargebeePayment({ eventId: "evt_2", hostedPageId: "page2", invoiceId: "in_2", passThruContent: "intent2", amount: 1000, currency: "USD" })).toMatchObject({ status: "credited" });
    expect(tables.grants).toHaveLength(1);
    expect(tables.wallets[0]).toMatchObject({ balance: 2 + 3 + 10 });
  });

  it("degrades to monthly credits when the promo schema has not migrated yet", async () => {
    failPromoTables = true;
    const summary = await spendToken(7, "job_seeker");
    expect(tables.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(summary).toMatchObject({ promoCreditsRemaining: 0, promoStatus: null, totalAvailable: 2 + 2 });
  });

  it("reports a zero promo summary when the promo schema has not migrated yet", async () => {
    failPromoTables = true;
    const summary = await getTokenWallet(7, "job_seeker");
    expect(summary).toMatchObject({ promoCreditsRemaining: 0, promoStatus: null, totalAvailable: 3 + 2 });
  });

  it("still credits a paid purchase when the promo schema has not migrated yet", async () => {
    failPromoTables = true;
    tables.payments = [{ id: 1, provider: "chargebee", providerEventId: "pending:page1", providerInvoiceId: null, providerHostedPageId: "page1", checkoutIntentId: "intent1", userId: 7, role: "job_seeker", tokenCount: 3, amount: 300, currency: "USD", status: "pending", reconciliationReason: null, lastCheckedAt: null, creditedAt: null, createdAt: NOW }];
    const result = await fulfillChargebeePayment({ eventId: "evt_1", hostedPageId: "page1", invoiceId: "in_1", passThruContent: "intent1", amount: 300, currency: "USD" });
    expect(result).toMatchObject({ status: "credited", tokenCount: 3 });
    expect(tables.wallets[0]).toMatchObject({ balance: 5 });
    expect(tables.activity.some(a => a.action === "promo.grant_skipped_schema_pending")).toBe(true);
  });
});

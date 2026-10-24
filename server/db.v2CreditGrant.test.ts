import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { operationalActivityLogs, paymentFulfillments, promoCreditGrants, subscriptionCheckoutIntents, subscriptionEvents, tokenBalances, tokenTransactions, notifications, users } from "../drizzle/schema";
import { PLAN_CREDIT_RUNGS } from "../shared/planFamily";
import { expectedBundleAmount } from "./v2Crediting";
import { grantV2PaidCredits } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

type Wallet = typeof tokenBalances.$inferSelect;
type Intent = typeof subscriptionCheckoutIntents.$inferSelect;
type Fulfillment = typeof paymentFulfillments.$inferSelect;
const dialect = new MySqlDialect();
let wallets: Wallet[];
let intents: Intent[];
let fulfillments: Fulfillment[];
let txns: Array<Record<string, unknown>>;
let promoGrants: Array<Record<string, unknown>>;
let promoTxns: Array<Record<string, unknown>>;
let promoNotes: Array<Record<string, unknown>>;
let activityLogs: Array<Record<string, unknown>>;
let userRows: Array<Record<string, unknown>>;

function matches(condition: SQL, row: object) {
  const query = dialect.sqlToQuery(condition);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(match => match[1]);
  expect(columns.length).toBe(query.params.length);
  expect(columns.length).toBeGreaterThan(0);
  return columns.every((column, index) => (row as Record<string, unknown>)[column] === query.params[index]);
}

function fixtureDatabase() {
  const rows = (table: unknown): Array<Record<string, unknown>> => {
    if (table === tokenBalances) return wallets as never;
    if (table === subscriptionCheckoutIntents) return intents as never;
    if (table === paymentFulfillments) return fulfillments as never;
    if (table === tokenTransactions) return txns;
    if (table === promoCreditGrants) return promoGrants;
    if (table === subscriptionEvents) return [];
    if (table === notifications) return promoNotes;
    if (table === operationalActivityLogs) return activityLogs;
    if (table === users) return userRows as never;
    throw new Error("Unexpected table");
  };
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: SQL) => ({ limit: (limit: number) => {
      const result = () => structuredClone(rows(table).filter(row => matches(condition, row)).slice(0, limit));
      return {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        for: async (mode: string) => {
          expect(mode).toBe("update");
          return result();
        },
      };
    } }) }) }),
    update: (table: unknown) => ({ set: (patch: object) => ({ where: async (condition: SQL) => {
      const selected = rows(table).filter(row => matches(condition, row));
      // balance += N arrives as an SQL fragment, not a plain value.
      const sqlPatch = patch as Record<string, unknown>;
      selected.forEach(row => {
        for (const [key, value] of Object.entries(sqlPatch)) {
          if (value && typeof value === "object" && Array.isArray((value as { queryChunks?: unknown }).queryChunks)) {
            const amount = Number(dialect.sqlToQuery(value as SQL).params[0]);
            (row as Record<string, unknown>)[key] = Number((row as Record<string, unknown>)[key] ?? 0) + amount;
          } else (row as Record<string, unknown>)[key] = value;
        }
      });
      return [{ affectedRows: selected.length }];
    } }) }),
    insert: (table: unknown) => ({ values: async (row: Record<string, unknown>) => {
      const tableRows = rows(table);
      tableRows.push({ id: tableRows.length + 1, ...row });
      return [{ affectedRows: 1, insertId: tableRows.length }];
    } }),
  };
  return { transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) };
}

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test"); vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "true");
  wallets = [{ id: 1, userId: 7, role: "job_seeker", balance: 12, monthlyCreditsRemaining: 0, monthlyAllowance: 0, monthlyCycleKey: "fresh", plan: "fast_track", subscriptionId: "sub_v2_1", subscriptionStatus: "active", subscriptionCurrency: "INR", subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: 10, updatedAt: new Date() } as Wallet];
  intents = [{ id: 1, userId: 9, role: "job_seeker", hostedPageId: "hp_first", checkoutIntentId: "intent_first", plan: "fast_track", itemPriceId: "skipwait_v2plan_fast_track-INR", amount: 162400, currency: "INR", status: "pending", createdAt: new Date(), updatedAt: new Date() } as Intent];
  fulfillments = [];
  txns = [];
  promoGrants = [];
  promoTxns = [];
  promoNotes = [];
  activityLogs = [];
  userRows = [{ id: 9, email: "qa-preview-dev@skipwait.me" }];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("D-132 grantV2PaidCredits", () => {
  it("a renewal credits the wallet found by subscription, once per invoice, with the first-payment promo", async () => {
    const result = await grantV2PaidCredits({ eventId: "ev_r1", invoiceId: "inv_r1", subscriptionId: "sub_v2_1", planFamily: "fast_track", rung: 25, amount: 162_400, currency: "INR" });
    expect(result).toMatchObject({ status: "credited", tokenCount: 25, userId: 7, role: "job_seeker" });
    expect(wallets[0].balance).toBe(37);
    const purchases = txns.filter(txn => txn.kind === "purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ userId: 7, tokenCount: 25, kind: "purchase", source: "purchased_balance", referenceType: "chargebee_invoice", referenceId: "inv_r1", idempotencyKey: "v2credits-inv_r1" });
    expect(fulfillments[0]).toMatchObject({ providerEventId: "ev_r1", status: "credited", tokenCount: 25, amount: 162_400 });
    // First verified payment earns the promo (frozen copy), once per user.
    expect(promoGrants).toHaveLength(1);
  });

  it("a redelivered event is a duplicate, never a second credit", async () => {
    await grantV2PaidCredits({ eventId: "ev_r1", invoiceId: "inv_r1", subscriptionId: "sub_v2_1", planFamily: "fast_track", rung: 25, amount: 162_400, currency: "INR" });
    const again = await grantV2PaidCredits({ eventId: "ev_r1", invoiceId: "inv_r1", subscriptionId: "sub_v2_1", planFamily: "fast_track", rung: 25, amount: 162_400, currency: "INR" });
    expect(again).toMatchObject({ status: "duplicate", tokenCount: 25 });
    expect(wallets[0].balance).toBe(37);
    expect(txns.filter(txn => txn.kind === "purchase")).toHaveLength(1);
    expect(promoGrants).toHaveLength(1);
  });

  it("the first month resolves the buyer through the hosted-page checkout intent", async () => {
    wallets = [];
    const result = await grantV2PaidCredits({ eventId: "ev_f1", invoiceId: "inv_f1", hostedPageId: "hp_first", passThruContent: "intent_first", planFamily: "fast_track", rung: 25, amount: 162_400, currency: "INR" });
    expect(result).toMatchObject({ status: "credited", tokenCount: 25, userId: 9 });
    expect(wallets).toHaveLength(1);
    expect(wallets[0]).toMatchObject({ userId: 9, role: "job_seeker", balance: 25 });
  });

  it("an amount that disagrees with the frozen ladder parks for review, nothing credited", async () => {
    const result = await grantV2PaidCredits({ eventId: "ev_m1", invoiceId: "inv_m1", subscriptionId: "sub_v2_1", planFamily: "fast_track", rung: 25, amount: 190_000, currency: "INR" });
    expect(result).toMatchObject({ status: "requires_review", reason: "checkout_amount_mismatch", expectedAmount: 162_400, paidAmount: 190_000 });
    expect(wallets[0].balance).toBe(12);
    expect(txns).toHaveLength(0);
    expect(fulfillments[0]).toMatchObject({ status: "requires_review", reconciliationReason: "checkout_amount_mismatch" });
    expect(activityLogs.some(row => row.action === "billing.payment_amount_mismatch")).toBe(true);
  });

  it("an invoice in a currency the frozen ladder cannot price parks for review, never credits", async () => {
    const result = await grantV2PaidCredits({ eventId: "ev_c1", invoiceId: "inv_c1", subscriptionId: "sub_v2_1", planFamily: "fast_track", rung: 25, amount: 162_400, currency: "EUR" });
    expect(result).toMatchObject({ status: "requires_review", reason: "checkout_amount_mismatch", expectedAmount: null });
    expect(wallets[0].balance).toBe(12);
    expect(txns).toHaveLength(0);
    expect(fulfillments[0]).toMatchObject({ status: "requires_review", reconciliationReason: "checkout_amount_mismatch", currency: "EUR" });
  });

  it("a bare invoice email never names the buyer: nothing is credited, it waits for review", async () => {
    // Review F2: users.email is nullable, not unique and free-typed at the
    // provider's page, so a matching address is not proof of identity.
    wallets = [];
    intents = [];
    const result = await grantV2PaidCredits({ eventId: "ev_e1", invoiceId: "inv_e1", subscriptionId: "sub_new_1", customerId: "cust_1", customerEmail: "qa-preview-dev@skipwait.me", planFamily: "fast_track", rung: 5, amount: expectedBundleAmount("fast_track", 5, "USD"), currency: "USD" });
    expect(result).toMatchObject({ status: "ignored", reason: "unknown_v2_subscription" });
    expect(wallets).toHaveLength(0);
    expect(txns).toHaveLength(0);
    expect(fulfillments).toHaveLength(0);
    expect(activityLogs.some(row => row.action === "billing.v2_grant_unknown_subscription")).toBe(true);
  });

  it("the first invoice resolves through the unique provider customer binding", async () => {
    wallets = [];
    intents = [];
    userRows = [{ id: 11, email: "payer@example.test", chargebeeCustomerId: "cust_bound_1" }];
    const result = await grantV2PaidCredits({ eventId: "ev_b1", invoiceId: "inv_b1", subscriptionId: "sub_bound_1", customerId: "cust_bound_1", planFamily: "fast_track", rung: 5, amount: expectedBundleAmount("fast_track", 5, "USD"), currency: "USD" });
    expect(result).toMatchObject({ status: "credited", tokenCount: 5, userId: 11, role: "job_seeker" });
    expect(wallets).toHaveLength(1);
    expect(wallets[0]).toMatchObject({ userId: 11, role: "job_seeker", balance: 5, subscriptionId: "sub_bound_1" });
    expect(activityLogs.some(row => row.action === "billing.v2_grant_unknown_subscription")).toBe(false);
  });

  it("an ambiguous provider customer binding grants nothing and alerts", async () => {
    wallets = [];
    intents = [];
    userRows = [{ id: 11, email: "one@example.test", chargebeeCustomerId: "cust_dup" }, { id: 12, email: "two@example.test", chargebeeCustomerId: "cust_dup" }];
    const result = await grantV2PaidCredits({ eventId: "ev_dup", invoiceId: "inv_dup", subscriptionId: "sub_dup", customerId: "cust_dup", planFamily: "fast_track", rung: 5, amount: expectedBundleAmount("fast_track", 5, "USD"), currency: "USD" });
    expect(result).toMatchObject({ status: "ignored", reason: "unknown_v2_subscription" });
    expect(wallets).toHaveLength(0);
    expect(txns).toHaveLength(0);
    expect(activityLogs.some(row => row.action === "billing.v2_grant_unknown_subscription")).toBe(true);
  });

  it("every v2 rung credits exactly its own credit count against its bundle total", async () => {
    for (const rung of PLAN_CREDIT_RUNGS) {
      fulfillments = [];
      const amount = expectedBundleAmount("fast_track", rung, "USD");
      const result = await grantV2PaidCredits({ eventId: `ev_rung_${rung}`, invoiceId: `inv_rung_${rung}`, subscriptionId: "sub_v2_1", planFamily: "fast_track", rung, amount, currency: "USD" });
      expect(result).toMatchObject({ status: "credited", tokenCount: rung, userId: 7 });
    }
    // 6 rungs credited once each on top of the 12 the wallet started with.
    expect(wallets[0].balance).toBe(12 + PLAN_CREDIT_RUNGS.reduce((sum, rung) => sum + rung, 0));
  });

  it("a subscription nobody knows is logged and ignored for the unmatched-payment alert", async () => {
    const result = await grantV2PaidCredits({ eventId: "ev_u1", invoiceId: "inv_u1", subscriptionId: "sub_stray", planFamily: "insider", rung: 10, amount: 6_860, currency: "USD" });
    expect(result).toMatchObject({ status: "ignored", reason: "unknown_v2_subscription" });
    expect(wallets[0].balance).toBe(12);
    expect(activityLogs.some(row => row.action === "billing.v2_grant_unknown_subscription")).toBe(true);
  });

  it("a missing invoice id can never key a grant", async () => {
    const result = await grantV2PaidCredits({ eventId: "ev_x1", subscriptionId: "sub_v2_1", planFamily: "fast_track", rung: 25, amount: 162_400, currency: "INR" });
    expect(result).toMatchObject({ status: "ignored", reason: "missing_invoice" });
    expect(wallets[0].balance).toBe(12);
  });
});

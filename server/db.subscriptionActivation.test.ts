import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { subscriptionCheckoutIntents, subscriptionEvents, tokenBalances, promoCreditGrants, tokenTransactions, notifications } from "../drizzle/schema";
import { SUBSCRIPTION_PLANS } from "../shared/subscriptionPlans";
import { applyChargebeeSubscriptionEvent } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

type Wallet = typeof tokenBalances.$inferSelect;
type Intent = typeof subscriptionCheckoutIntents.$inferSelect;
type Event = typeof subscriptionEvents.$inferInsert;
const dialect = new MySqlDialect();
const termStart = new Date("2026-09-01T00:00:00.000Z");
const termEnd = new Date("2026-10-01T00:00:00.000Z");
const input = {
  eventId: "event_new", eventType: "subscription_created", hostedPageId: "page_new", passThruContent: "intent_new",
  subscriptionId: "subscription_new", plan: "pro" as const, currency: "INR" as const, status: "active",
  currentTermStart: termStart, currentTermEnd: termEnd, resourceVersion: 10,
};
let wallets: Wallet[];
let intents: Intent[];
let events: Event[];
let promoGrants: Array<Record<string, unknown>>;
let promoTxns: Array<Record<string, unknown>>;
let promoNotes: Array<Record<string, unknown>>;
let locks: Array<{ table: unknown; params: unknown[] }>;
let walletInserts: ReturnType<typeof vi.fn>;
let walletUpdates: ReturnType<typeof vi.fn>;

function matches(condition: SQL, row: object) {
  const query = dialect.sqlToQuery(condition);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(match => match[1]);
  expect(columns.length).toBe(query.params.length);
  expect(columns.length).toBeGreaterThan(0);
  return columns.every((column, index) => (row as Record<string, unknown>)[column] === query.params[index]);
}

function fixtureDatabase() {
  const rows = (table: unknown) => {
    if (table === tokenBalances) return wallets;
    if (table === subscriptionCheckoutIntents) return intents;
    if (table === subscriptionEvents) return events;
    if (table === promoCreditGrants) return promoGrants;
    if (table === tokenTransactions) return promoTxns;
    if (table === notifications) return promoNotes;
    throw new Error("Unexpected table");
  };
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: SQL) => ({ limit: (limit: number) => {
      const result = () => structuredClone(rows(table).filter(row => matches(condition, row)).slice(0, limit));
      return {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        for: async (mode: string) => {
          expect(mode).toBe("update");
          locks.push({ table, params: dialect.sqlToQuery(condition).params });
          return result();
        },
      };
    } }) }) }),
    update: (table: unknown) => ({ set: (patch: object) => ({ where: async (condition: SQL) => {
      const selected = rows(table).filter(row => matches(condition, row));
      if (table === tokenBalances) walletUpdates(patch);
      selected.forEach(row => Object.assign(row, patch));
      return [{ affectedRows: selected.length }];
    } }) }),
    insert: (table: unknown) => ({ values: async (row: Record<string, unknown>) => {
      if (table === tokenBalances) {
        walletInserts(row);
        if (wallets.some(wallet => wallet.userId === row.userId && wallet.role === row.role)) throw new Error("Duplicate wallet");
      }
      if (table === subscriptionEvents && events.some(event => event.provider === row.provider && event.providerEventId === row.providerEventId)) throw new Error("Duplicate event");
      rows(table).push({ id: rows(table).length + 1, ...row } as never);
      return [{ affectedRows: 1, insertId: rows(table).length }];
    } }),
  };
  return { transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
    const snapshot = structuredClone({ wallets, intents, events, promoGrants, promoTxns, promoNotes });
    try { return await callback(tx); }
    catch (error) {
      wallets = snapshot.wallets; intents = snapshot.intents; events = snapshot.events;
      promoGrants = snapshot.promoGrants; promoTxns = snapshot.promoTxns; promoNotes = snapshot.promoNotes;
      throw error;
    }
  } };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  wallets = [{ id: 1, userId: 7, role: "job_seeker", balance: 12, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-09", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: termStart }];
  intents = [{ id: 1, userId: 7, role: "job_seeker", hostedPageId: "page_new", checkoutIntentId: "intent_new", plan: "pro", itemPriceId: "skipwait_pro_monthly-INR", amount: 59900, currency: "INR", status: "pending", createdAt: termStart, updatedAt: termStart }];
  events = [];
  promoGrants = [];
  promoTxns = [];
  promoNotes = [];
  locks = [];
  walletInserts = vi.fn();
  walletUpdates = vi.fn();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => vi.unstubAllEnvs());

function expectUnchanged(before: { wallets: Wallet[]; intents: Intent[] }) {
  expect(wallets).toEqual(before.wallets);
  expect(intents).toEqual(before.intents);
  expect(walletUpdates).not.toHaveBeenCalled();
  expect(walletInserts).not.toHaveBeenCalled();
}

describe("applyChargebeeSubscriptionEvent wallet binding", () => {
  it.each(["job_seeker", "referrer"] as const)("activates the intent's existing %s wallet without losing purchased credits", async role => {
    wallets[0].role = role;
    intents[0].role = role;
    const otherWallet = { ...wallets[0], id: 2, role: role === "job_seeker" ? "referrer" as const : "job_seeker" as const, balance: 50 };
    wallets.push(otherWallet);
    const result = await applyChargebeeSubscriptionEvent(input);
    expect(result).toMatchObject({ status: "applied", userId: 7, role, creditSummary: { purchasedCreditsRemaining: 12, monthlyCreditsRemaining: SUBSCRIPTION_PLANS.pro.monthlyAllowance, totalAvailable: 12 + SUBSCRIPTION_PLANS.pro.monthlyAllowance } });
    expect(wallets).toHaveLength(2);
    expect(wallets[0]).toMatchObject({ id: 1, userId: 7, role, plan: "pro", balance: 12, subscriptionId: input.subscriptionId });
    expect(wallets[1]).toEqual(otherWallet);
    expect(walletInserts).not.toHaveBeenCalled();
    expect(walletUpdates).toHaveBeenCalledOnce();
    expect(walletUpdates.mock.calls[0][0]).not.toHaveProperty("balance");
    expect(locks).toContainEqual({ table: tokenBalances, params: [7, role] });
    expect(intents[0].status).toBe("activated");
    // First bank-verified activation earns the promo grant exactly once.
    expect(promoGrants).toHaveLength(1);
    expect(promoGrants[0]).toMatchObject({ tokenCount: 5, creditsRemaining: 5, status: "active" });
  });

  it("keeps duplicate delivery idempotent and does not refill credits for a newer event in the same term", async () => {
    await applyChargebeeSubscriptionEvent(input);
    wallets[0].monthlyCreditsRemaining = 4;
    expect(await applyChargebeeSubscriptionEvent(input)).toEqual({ status: "duplicate" });
    expect(walletUpdates).toHaveBeenCalledTimes(1);
    expect(await applyChargebeeSubscriptionEvent({ ...input, eventId: "event_update", resourceVersion: 11, hostedPageId: undefined, passThruContent: undefined })).toMatchObject({ status: "applied" });
    expect(wallets[0]).toMatchObject({ balance: 12, monthlyCreditsRemaining: 4 });
    expect(events).toHaveLength(2);
  });

  it("checks resource versions only for the same subscription", async () => {
    Object.assign(wallets[0], { subscriptionId: "subscription_cancelled", subscriptionStatus: "cancelled", subscriptionResourceVersion: 999, subscriptionCurrentTermStart: termStart, subscriptionCurrentTermEnd: termEnd });
    expect(await applyChargebeeSubscriptionEvent(input)).toMatchObject({ status: "applied" });
    expect(wallets[0]).toMatchObject({ balance: 12, subscriptionId: input.subscriptionId, subscriptionResourceVersion: 10, monthlyCreditsRemaining: SUBSCRIPTION_PLANS.pro.monthlyAllowance });
    expect(await applyChargebeeSubscriptionEvent({ ...input, eventId: "event_stale", resourceVersion: 9 })).toEqual({ status: "stale" });
    expect(walletUpdates).toHaveBeenCalledOnce();
  });

  it("does not inherit missing metadata from an unrelated cancelled subscription", async () => {
    Object.assign(wallets[0], { subscriptionId: "subscription_cancelled", subscriptionStatus: "cancelled", subscriptionResourceVersion: 999, subscriptionCurrency: "USD", subscriptionCurrentTermStart: termStart, subscriptionCurrentTermEnd: termEnd });
    await applyChargebeeSubscriptionEvent({ ...input, currentTermStart: undefined, currentTermEnd: undefined, resourceVersion: undefined });
    expect(wallets[0]).toMatchObject({ balance: 12, subscriptionCurrency: "INR", subscriptionResourceVersion: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null });
  });

  it.each(["active", "non_renewing", "in_trial"])("does not replace another %s paid subscription", async status => {
    Object.assign(wallets[0], { plan: "max", subscriptionId: "subscription_other", subscriptionStatus: status });
    const before = structuredClone({ wallets, intents });
    expect(await applyChargebeeSubscriptionEvent(input)).toMatchObject({ status: "ignored", reason: "subscription_conflict" });
    expectUnchanged(before);
  });

  it.each(["user", "role"])("rejects a subscription belonging to a different intent %s", async mismatch => {
    wallets[0].subscriptionId = input.subscriptionId;
    if (mismatch === "user") wallets[0].userId = 8;
    else wallets[0].role = "referrer";
    const before = structuredClone({ wallets, intents });
    expect(await applyChargebeeSubscriptionEvent(input)).toMatchObject({ status: "ignored", reason: "subscription_owner_mismatch" });
    expectUnchanged(before);
  });

  it.each([
    { hostedPageId: "wrong_page" }, { passThruContent: "wrong_intent" },
    { plan: "max" as const }, { currency: "USD" as const },
  ])("leaves balances and intent unchanged for mismatched checkout data %j", async mismatch => {
    const before = structuredClone({ wallets, intents });
    expect(await applyChargebeeSubscriptionEvent({ ...input, ...mismatch })).toMatchObject({ status: "ignored" });
    expectUnchanged(before);
  });

  it("does not rebind an already activated checkout to a different subscription", async () => {
    intents[0].status = "activated";
    const before = structuredClone({ wallets, intents });
    expect(await applyChargebeeSubscriptionEvent(input)).toMatchObject({ status: "ignored", reason: "checkout_already_reconciled" });
    expectUnchanged(before);
  });

  it("does not refill free monthly credits when checkout is cancelled", async () => {
    expect(await applyChargebeeSubscriptionEvent({ ...input, status: "cancelled" })).toMatchObject({ status: "applied" });
    expect(wallets[0]).toMatchObject({ plan: "free", balance: 12, monthlyCreditsRemaining: 2 });
    expect(intents[0].status).toBe("cancelled");
  });

  it("still creates a wallet when the verified intent owner has none", async () => {
    wallets = [];
    expect(await applyChargebeeSubscriptionEvent(input)).toMatchObject({ status: "applied", userId: 7, role: "job_seeker" });
    expect(walletInserts).toHaveBeenCalledOnce();
    expect(wallets[0]).toMatchObject({ balance: 0, plan: "pro", subscriptionId: input.subscriptionId });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { billingReviewOutbox, subscriptionCheckoutIntents, subscriptionEvents, tokenBalances, promoCreditGrants, tokenTransactions, notifications, users } from "../drizzle/schema";
import { FREE_MONTHLY_ALLOWANCE } from "../shared/subscriptionPlans";
import { planEntitlementsFor } from "../shared/planEntitlements";
import { applyChargebeeSubscriptionEvent } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

type Wallet = typeof tokenBalances.$inferSelect;
type Intent = typeof subscriptionCheckoutIntents.$inferSelect;
type Event = typeof subscriptionEvents.$inferInsert;
const dialect = new MySqlDialect();
let reviewRows: Array<Record<string, unknown>> = [];
const termStart = new Date("2026-09-01T00:00:00.000Z");
const termEnd = new Date("2026-10-01T00:00:00.000Z"); // a Start 30-day pass
const input = {
  eventId: "event_new", eventType: "subscription_created", hostedPageId: "page_new", passThruContent: "intent_new",
  subscriptionId: "subscription_new", plan: "start" as const, currency: "INR" as const, status: "active",
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
    if (table === billingReviewOutbox) return reviewRows;
    if (table === tokenBalances) return wallets;
    if (table === subscriptionCheckoutIntents) return intents;
    if (table === subscriptionEvents) return events;
    if (table === promoCreditGrants) return promoGrants;
    if (table === tokenTransactions) return promoTxns;
    if (table === notifications) return promoNotes;
    // REVIEWER-ISOLATION-1: the subscription guard looks up the subscriber's openId.
    if (table === users) return [{ id: 7, openId: "workos_member_7" }];
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
    insert: (table: unknown) => ({ values: (row: Record<string, unknown>) => {
      if (table === billingReviewOutbox) return { onDuplicateKeyUpdate: async () => { if (!reviewRows.some(r => r.obligationKey === row.obligationKey)) reviewRows.push({ ...row }); return [{ affectedRows: 1, insertId: reviewRows.length }]; } };
      return (async () => {
      if (table === tokenBalances) {
        walletInserts(row);
        if (wallets.some(wallet => wallet.userId === row.userId && wallet.role === row.role)) throw new Error("Duplicate wallet");
      }
      if (table === subscriptionEvents && events.some(event => event.provider === row.provider && event.providerEventId === row.providerEventId)) throw new Error("Duplicate event");
      rows(table).push({ id: rows(table).length + 1, ...row } as never);
      return [{ affectedRows: 1, insertId: rows(table).length }];
      })();
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
  vi.stubEnv("BILLING_ENV", "test"); vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  reviewRows = [];
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "true");
  wallets = [{ id: 1, userId: 7, role: "job_seeker", balance: 12, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-09", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: termStart }];
  intents = [{ id: 1, userId: 7, role: "job_seeker", hostedPageId: "page_new", checkoutIntentId: "intent_new", plan: "start", itemPriceId: "skipwait_start_30d-INR", amount: 29900, currency: "INR", status: "pending", createdAt: termStart, updatedAt: termStart }];
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
    // Seekers get Start's 10 credits a cycle; referrer wallets keep the pre-kit rule, Free's 3 a month (cycleRulesFor).
    const cycleCredits = role === "job_seeker" ? planEntitlementsFor("start").creditsPerMonth : FREE_MONTHLY_ALLOWANCE;
    expect(cycleCredits).toBe(role === "job_seeker" ? 10 : 3);
    expect(result).toMatchObject({ status: "applied", userId: 7, role, creditSummary: { purchasedCreditsRemaining: 12, monthlyCreditsRemaining: cycleCredits, totalAvailable: 12 + cycleCredits } });
    expect(wallets).toHaveLength(2);
    expect(wallets[0]).toMatchObject({ id: 1, userId: 7, role, plan: "start", balance: 12, subscriptionId: input.subscriptionId });
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
    expect(wallets[0]).toMatchObject({ balance: 12, subscriptionId: input.subscriptionId, subscriptionResourceVersion: 10, monthlyCreditsRemaining: planEntitlementsFor("start").creditsPerMonth });
    expect(await applyChargebeeSubscriptionEvent({ ...input, eventId: "event_stale", resourceVersion: 9 })).toEqual({ status: "stale" });
    expect(walletUpdates).toHaveBeenCalledOnce();
  });

  it("does not inherit missing metadata from an unrelated cancelled subscription", async () => {
    Object.assign(wallets[0], { subscriptionId: "subscription_cancelled", subscriptionStatus: "cancelled", subscriptionResourceVersion: 999, subscriptionCurrency: "USD", subscriptionCurrentTermStart: termStart, subscriptionCurrentTermEnd: termEnd });
    await applyChargebeeSubscriptionEvent({ ...input, currentTermStart: undefined, currentTermEnd: undefined, resourceVersion: undefined });
    expect(wallets[0]).toMatchObject({ balance: 12, subscriptionCurrency: "INR", subscriptionResourceVersion: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null });
  });

  it.each(["active", "non_renewing", "in_trial"])("does not replace another %s paid subscription", async status => {
    Object.assign(wallets[0], { plan: "momentum", subscriptionId: "subscription_other", subscriptionStatus: status });
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
    { plan: "momentum" as const }, { currency: "USD" as const },
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
    expect(wallets[0]).toMatchObject({ balance: 0, plan: "start", subscriptionId: input.subscriptionId });
  });
});

// D-067: Pro and Max are removed completely. A late provider event for one is recorded
// once as a receipt (so a redelivery is a duplicate and Chargebee stops retrying) and
// grants nothing: no wallet change, no plan cycle, no promo grant, the intent stays pending.
describe("applyChargebeeSubscriptionEvent for a retired Pro/Max subscription", () => {
  const legacyEvent = (plan: "pro" | "max", patch: Record<string, unknown> = {}) => ({ ...input, plan: undefined, itemPriceId: `skipwait_${plan}_monthly-INR`, interval: undefined, ...patch });

  it.each([["pro", "job_seeker"], ["max", "job_seeker"], ["pro", "referrer"], ["max", "referrer"]] as const)("a pending %s intent (%s) is never activated: recorded, ignored, nothing granted", async (plan, role) => {
    wallets[0].role = role;
    Object.assign(intents[0], { role, plan, itemPriceId: `skipwait_${plan}_monthly-INR`, amount: plan === "pro" ? 59_900 : 129_900 });
    const before = structuredClone({ wallets, intents });
    expect(await applyChargebeeSubscriptionEvent(legacyEvent(plan))).toEqual({ status: "ignored", reason: "plan_retired" });
    expectUnchanged(before);
    expect(intents[0].status).toBe("pending");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId });
    expect(promoGrants).toEqual([]);
    expect(promoTxns.filter(row => row.kind === "plan_grant")).toEqual([]);
    expect(await applyChargebeeSubscriptionEvent(legacyEvent(plan))).toEqual({ status: "duplicate" });
    expect(events).toHaveLength(1);
  });

  it.each([["pro", "subscription_renewed", "active"], ["max", "subscription_renewed", "active"], ["pro", "subscription_cancelled", "cancelled"], ["max", "subscription_changed", "non_renewing"]] as const)("a wallet already bound to a %s subscription gets nothing from %s", async (plan, eventType, status) => {
    Object.assign(wallets[0], { plan, subscriptionId: "sub_legacy", subscriptionStatus: "active", subscriptionCurrency: "INR", subscriptionCurrentTermStart: termStart, subscriptionCurrentTermEnd: termEnd, subscriptionResourceVersion: 10 });
    const before = structuredClone({ wallets, intents });
    const event = legacyEvent(plan, { eventId: `event_${eventType}`, eventType, status, subscriptionId: "sub_legacy", hostedPageId: undefined, passThruContent: undefined, resourceVersion: 20, currentTermStart: termEnd, currentTermEnd: new Date("2026-11-01T00:00:00.000Z") });
    expect(await applyChargebeeSubscriptionEvent(event)).toEqual({ status: "ignored", reason: "plan_retired" });
    expectUnchanged(before);
    expect(events).toHaveLength(1);
    expect(promoGrants).toEqual([]);
    expect(promoTxns).toEqual([]);
  });

  it.each(["pro", "max"] as const)("a kit wallet whose subscription is moved to a retired %s item price is never renewed by it", async plan => {
    Object.assign(wallets[0], { plan: "start", subscriptionId: "sub_kit", subscriptionStatus: "active", subscriptionCurrency: "INR", subscriptionCurrentTermStart: termStart, subscriptionCurrentTermEnd: termEnd, subscriptionResourceVersion: 10 });
    const before = structuredClone({ wallets, intents });
    const event = legacyEvent(plan, { eventId: "event_moved", eventType: "subscription_renewed", subscriptionId: "sub_kit", hostedPageId: undefined, passThruContent: undefined, resourceVersion: 20, currentTermStart: termEnd, currentTermEnd: new Date("2026-10-31T00:00:00.000Z") });
    expect(await applyChargebeeSubscriptionEvent(event)).toEqual({ status: "ignored", reason: "plan_retired" });
    expectUnchanged(before);
    expect(events).toHaveLength(1);
    expect(promoTxns).toEqual([]);
  });
  // Review round 2: the webhook tells "a retired Pro/Max subscription, cancel and refund" apart from
  // "an item price skipwait.me cannot place, review". A wallet still stored as pro/max whose event
  // names no item price is the first kind; a Free-bound wallet getting an unknown price is the second.
  it.each(["pro", "max"] as const)("a wallet still stored as %s gets nothing from an event that names no item price, as a retired plan", async plan => {
    Object.assign(wallets[0], { plan, subscriptionId: "sub_legacy", subscriptionStatus: "active", subscriptionCurrency: "INR", subscriptionCurrentTermStart: termStart, subscriptionCurrentTermEnd: termEnd, subscriptionResourceVersion: 10 });
    const before = structuredClone({ wallets, intents });
    const event = { ...input, plan: undefined, itemPriceId: undefined, interval: undefined, eventId: "event_cancel", eventType: "subscription_cancelled", status: "cancelled", subscriptionId: "sub_legacy", hostedPageId: undefined, passThruContent: undefined, resourceVersion: 20 };
    expect(await applyChargebeeSubscriptionEvent(event)).toEqual({ status: "ignored", reason: "plan_retired" });
    expectUnchanged(before);
    expect(events).toHaveLength(1);
  });

  it("a Free wallet still bound to an ended kit pass gets nothing from an unknown item price, and it is not called retired", async () => {
    Object.assign(wallets[0], { plan: "free", subscriptionId: "sub_start", subscriptionStatus: "cancelled", subscriptionCurrency: "USD", subscriptionCurrentTermStart: termStart, subscriptionCurrentTermEnd: termEnd, subscriptionResourceVersion: 10 });
    const before = structuredClone({ wallets, intents });
    const event = { ...input, plan: undefined, itemPriceId: "skipwait_start_30d_v2-USD", interval: undefined, currency: "USD" as const, eventId: "event_unknown", eventType: "subscription_changed", status: "cancelled", subscriptionId: "sub_start", hostedPageId: undefined, passThruContent: undefined, resourceVersion: 20 };
    expect(await applyChargebeeSubscriptionEvent(event)).toEqual({ status: "ignored", reason: "unsupported_plan" });
    expectUnchanged(before);
    expect(events).toHaveLength(1);
  });
});

describe("applyChargebeeSubscriptionEvent on a kit pass (0091)", () => {
  const passStart = new Date("2026-10-01T00:00:00.000Z");
  const passEnd = new Date("2026-12-30T00:00:00.000Z");
  const momentum90 = {
    eventId: "event_kit", eventType: "subscription_created", hostedPageId: "page_new", passThruContent: "intent_new",
    subscriptionId: "subscription_kit", plan: "momentum" as const, itemPriceId: "skipwait_momentum_90d-INR", interval: "90d" as const,
    currency: "INR" as const, status: "active", currentTermStart: passStart, currentTermEnd: passEnd, resourceVersion: 5,
  };
  const momentumIntent = () => Object.assign(intents[0], { plan: "momentum", itemPriceId: "skipwait_momentum_90d-INR", amount: 249_900, billingPeriod: "90d" });

  it("activates the pass with its own plan and credits, and keeps purchased credits", async () => {
    momentumIntent();
    expect(await applyChargebeeSubscriptionEvent(momentum90)).toMatchObject({ status: "applied", userId: 7, role: "job_seeker" });
    expect(wallets[0]).toMatchObject({ plan: "momentum", balance: 12, monthlyAllowance: 36, monthlyCreditsRemaining: 36, subscriptionId: "subscription_kit", subscriptionStatus: "active", subscriptionCurrentTermStart: passStart, subscriptionCurrentTermEnd: passEnd });
    expect(intents[0].status).toBe("activated");
    // The 90-day pass is one term; its later cycles open from the scheduled job.
    expect(events).toHaveLength(1);
  });

  it("refuses a delivery whose item price is a different term than the intent bought", async () => {
    momentumIntent();
    Object.assign(intents[0], { itemPriceId: "skipwait_momentum_30d-INR", billingPeriod: "30d", amount: 99_900 });
    const before = structuredClone({ wallets, intents });
    expect(await applyChargebeeSubscriptionEvent(momentum90)).toMatchObject({ status: "ignored", reason: "item_price_mismatch" });
    expectUnchanged(before);
  });

  it("refuses a kit delivery for a plan the intent did not buy", async () => {
    momentumIntent();
    const before = structuredClone({ wallets, intents });
    expect(await applyChargebeeSubscriptionEvent({ ...momentum90, plan: "land_focus" })).toMatchObject({ status: "ignored", reason: "plan_mismatch" });
    expectUnchanged(before);
  });

  it("ends the pass cleanly: a cancelled pass returns the wallet to Free and keeps purchased credits", async () => {
    momentumIntent();
    await applyChargebeeSubscriptionEvent(momentum90);
    expect(await applyChargebeeSubscriptionEvent({ ...momentum90, eventId: "event_kit_end", eventType: "subscription_cancelled", status: "cancelled", hostedPageId: undefined, passThruContent: undefined, itemPriceId: undefined, interval: undefined, resourceVersion: 6 })).toMatchObject({ status: "applied" });
    expect(wallets[0]).toMatchObject({ plan: "free", balance: 12, monthlyAllowance: planEntitlementsFor("free").creditsPerMonth });
    expect(wallets[0].subscriptionCurrentTermEnd).toEqual(passEnd);
  });

  it("refuses a subscription for a plan outside the price book", async () => {
    momentumIntent();
    const before = structuredClone({ wallets, intents });
    expect(await applyChargebeeSubscriptionEvent({ ...momentum90, plan: undefined, itemPriceId: "skipwait_unknown-INR", interval: undefined })).toMatchObject({ status: "ignored" });
    expectUnchanged(before);
  });
});

it("persists a retired event review independently for each event id, with replay dedup", async () => {
  const retired = { ...input, itemPriceId: "skipwait_pro_monthly-USD" };
  await applyChargebeeSubscriptionEvent(retired);
  await applyChargebeeSubscriptionEvent(retired);
  await applyChargebeeSubscriptionEvent({ ...retired, eventId: "second_event" });
  expect(reviewRows).toHaveLength(2);
  expect(reviewRows.every(row => JSON.parse(String(row.payload)).evidence.reason === "plan_retired")).toBe(true);
  expect(walletInserts).not.toHaveBeenCalled(); expect(walletUpdates).not.toHaveBeenCalled(); expect(promoTxns).toEqual([]);
});

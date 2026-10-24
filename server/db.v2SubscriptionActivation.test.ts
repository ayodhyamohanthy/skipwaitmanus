import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { billingReviewOutbox, operationalActivityLogs, paymentFulfillments, planCreditGrants, subscriptionCheckoutIntents, subscriptionEvents, tokenBalances, promoCreditGrants, tokenTransactions, notifications } from "../drizzle/schema";

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
const termEnd = new Date("2026-10-01T00:00:00.000Z"); // the bundle's first month
const input = {
  eventId: "event_v2_new", eventType: "subscription_created", hostedPageId: "page_v2", passThruContent: "intent_v2",
  subscriptionId: "subscription_v2", planFamily: "fast_track" as const, planFamilyRung: 25 as const, currency: "INR" as const, status: "active",
  currentTermStart: termStart, currentTermEnd: termEnd, resourceVersion: 10,
};
let wallets: Wallet[];
let intents: Intent[];
let events: Event[];
let promoGrants: Array<Record<string, unknown>>;
let planGrants: Array<Record<string, unknown>>;
let promoTxns: Array<Record<string, unknown>>;
let promoNotes: Array<Record<string, unknown>>;
let locks: Array<{ table: unknown; params: unknown[] }>;
let activityLogs: Array<Record<string, unknown>>;
let fulfillments: Array<Record<string, unknown>>;
let walletInserts: ReturnType<typeof vi.fn>;
let walletUpdates: ReturnType<typeof vi.fn>;

function matches(condition: SQL, row: object) {
  const query = dialect.sqlToQuery(condition);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` (?:=|like) \?/gi)].map(match => match[1]);
  expect(columns.length).toBe(query.params.length);
  expect(columns.length).toBeGreaterThan(0);
  return columns.every((column, index) => {
    const param = query.params[index];
    const value = (row as Record<string, unknown>)[column];
    // A LIKE parameter is a substring check without its % anchors.
    if (typeof param === "string" && param.startsWith("%")) return typeof value === "string" && value.includes(param.replaceAll("%", ""));
    return value === param;
  });
}

function fixtureDatabase() {
  const rows = (table: unknown) => {
    if (table === billingReviewOutbox) return reviewRows;
    if (table === tokenBalances) return wallets;
    if (table === subscriptionCheckoutIntents) return intents;
    if (table === subscriptionEvents) return events;
    if (table === promoCreditGrants) return promoGrants;
    if (table === planCreditGrants) return planGrants;
    if (table === tokenTransactions) return promoTxns;
    if (table === notifications) return promoNotes;
    if (table === operationalActivityLogs) return activityLogs;
    if (table === paymentFulfillments) return fulfillments;
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
      selected.forEach(row => {
        for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
          // balance += N arrives as an SQL fragment, not a plain value.
          if (value && typeof value === "object" && Array.isArray((value as { queryChunks?: unknown }).queryChunks)) {
            const amount = Number(dialect.sqlToQuery(value as SQL).params[0]);
            (row as Record<string, unknown>)[key] = Number((row as Record<string, unknown>)[key] ?? 0) + amount;
          } else (row as Record<string, unknown>)[key] = value;
        }
      });
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
    const snapshot = structuredClone({ wallets, intents, events, promoGrants, planGrants, promoTxns, promoNotes, activityLogs, fulfillments });
    try { return await callback(tx); }
    catch (error) {
      wallets = snapshot.wallets; intents = snapshot.intents; events = snapshot.events;
      promoGrants = snapshot.promoGrants; planGrants = snapshot.planGrants; promoTxns = snapshot.promoTxns; promoNotes = snapshot.promoNotes;
      activityLogs = snapshot.activityLogs; fulfillments = snapshot.fulfillments;
      throw error;
    }
  } };
}

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test"); vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  reviewRows = [];
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "true");
  wallets = [{ id: 1, userId: 7, role: "job_seeker", balance: 12, monthlyCreditsRemaining: 0, monthlyAllowance: 0, monthlyCycleKey: "fresh", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: termStart }];
  intents = [{ id: 1, userId: 7, role: "job_seeker", hostedPageId: "page_v2", checkoutIntentId: "intent_v2", plan: "fast_track", itemPriceId: "skipwait_v2plan_fast_track-INR", amount: 162400, currency: "INR", status: "pending", createdAt: termStart, updatedAt: termStart }];
  events = [];
  promoGrants = [];
  planGrants = [];
  promoTxns = [];
  promoNotes = [];
  activityLogs = [];
  fulfillments = [];
  locks = [];
  walletInserts = vi.fn();
  walletUpdates = vi.fn();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => vi.unstubAllEnvs());

describe("D-132 v2 plan-family subscription events", () => {
  it("first activation moves the wallet onto the family plan and activates the intent, without touching credits", async () => {
    const result = await applyChargebeeSubscriptionEvent(input);
    expect(result).toMatchObject({ status: "applied", plan: "fast_track" });
    const wallet = wallets[0];
    expect(wallet.plan).toBe("fast_track");
    expect(wallet.subscriptionId).toBe("subscription_v2");
    expect(wallet.subscriptionStatus).toBe("active");
    expect(wallet.subscriptionCurrency).toBe("INR");
    expect(wallet.subscriptionCurrentTermStart).toEqual(termStart);
    expect(wallet.subscriptionCurrentTermEnd).toEqual(termEnd);
    expect(wallet.subscriptionResourceVersion).toBe(10);
    // The bundle's credits arrive per paid invoice, never here: the kit cycle
    // fields and the balance stay exactly as they were.
    expect(wallet.balance).toBe(12);
    expect(wallet.monthlyCreditsRemaining).toBe(0);
    expect(wallet.monthlyAllowance).toBe(0);
    expect(wallet.monthlyCycleKey).toBe("fresh");
    expect(walletUpdates).toHaveBeenCalled();
    expect(walletInserts).not.toHaveBeenCalled();
    expect(intents[0].status).toBe("activated");
    expect(events.map(event => event.providerEventId)).toEqual(["event_v2_new"]);
    expect(reviewRows).toEqual([]);
  });

  it("a Free wallet with leftover credits upgrades normally: the free bucket empties, never blocks (D-165 (3))", async () => {
    // D-165 (3): the upgrade proceeds; the unused credits move into a carry-over
    // grant on the webhook-confirmed term (server/db.creditLedger.test.ts pins
    // the grant, its date, spending order and the expiry row), so no "blocked"
    // status and no owner alert exist here any more.
    wallets[0].monthlyAllowance = 3;
    wallets[0].monthlyCreditsRemaining = 2;
    wallets[0].monthlyCycleKey = "2026-10";
    const result = await applyChargebeeSubscriptionEvent(input);
    expect(result).toMatchObject({ status: "applied", plan: "fast_track" });
    const wallet = wallets[0];
    expect(wallet.plan).toBe("fast_track");
    expect(wallet.subscriptionId).toBe("subscription_v2");
    expect(wallet.monthlyAllowance).toBe(0);
    expect(wallet.monthlyCreditsRemaining).toBe(0);
    expect(wallet.monthlyCycleKey).toBe("2026-10");
    expect(wallet.balance).toBe(12);
    expect(intents[0].status).toBe("activated");
    expect(events.map(event => event.providerEventId)).toEqual(["event_v2_new"]);
    expect(reviewRows).toEqual([]);
  });

  it("a renewal on the same subscription needs no hosted page or intent", async () => {
    await applyChargebeeSubscriptionEvent(input);
    const renewal = { eventId: "event_v2_renewal", eventType: "subscription_changed", subscriptionId: "subscription_v2", planFamily: "fast_track" as const, planFamilyRung: 25 as const, currency: "INR" as const, status: "active", currentTermStart: termEnd, currentTermEnd: new Date("2026-11-01T00:00:00.000Z"), resourceVersion: 11 };
    const result = await applyChargebeeSubscriptionEvent(renewal);
    expect(result).toMatchObject({ status: "applied", plan: "fast_track" });
    expect(wallets[0].subscriptionCurrentTermStart).toEqual(termEnd);
    expect(wallets[0].subscriptionResourceVersion).toBe(11);
    expect(wallets[0].balance).toBe(12);
  });

  it("a stale event grants nothing", async () => {
    await applyChargebeeSubscriptionEvent(input);
    const stale = { ...input, eventId: "event_v2_stale", hostedPageId: undefined, passThruContent: undefined, resourceVersion: 9 };
    const result = await applyChargebeeSubscriptionEvent(stale);
    expect(result).toMatchObject({ status: "stale" });
    expect(wallets[0].subscriptionResourceVersion).toBe(10);
  });

  it("an event naming a different family than the intent is a plan mismatch", async () => {
    const result = await applyChargebeeSubscriptionEvent({ ...input, planFamily: "insider" as const });
    expect(result).toMatchObject({ status: "ignored", reason: "plan_mismatch" });
    expect(wallets[0].plan).toBe("free");
    expect(intents[0].status).toBe("pending");
  });

  it("cancellation returns the wallet to free while the purchased balance stays", async () => {
    await applyChargebeeSubscriptionEvent(input);
    wallets[0].balance = 37; // invoice-granted paid credits
    const result = await applyChargebeeSubscriptionEvent({ eventId: "event_v2_cancel", eventType: "subscription_cancelled", subscriptionId: "subscription_v2", planFamily: "fast_track" as const, status: "cancelled", resourceVersion: 12 });
    expect(result).toMatchObject({ status: "applied" });
    expect(wallets[0].plan).toBe("free");
    expect(wallets[0].subscriptionStatus).toBe("cancelled");
    expect(wallets[0].balance).toBe(37);
  });

  it("a v2 subscription nobody knows is recorded and ignored, never parked as unsupported_plan", async () => {
    wallets = [];
    intents = [];
    const result = await applyChargebeeSubscriptionEvent({ ...input, hostedPageId: undefined, passThruContent: undefined });
    expect(result).toMatchObject({ status: "ignored", reason: "unknown_subscription" });
    expect(reviewRows).toEqual([]);
    expect(events.map(event => event.providerEventId)).toEqual(["event_v2_new"]);
  });

  it("replays a first-invoice grant that parked while the subscription was unbound", async () => {
    // payment_succeeded arrived first: no wallet named the subscription, no
    // intent matched, nobody credited - only the durable parked receipt.
    activityLogs.push({
      id: 1,
      actorUserId: null,
      action: "billing.v2_grant_unknown_subscription",
      outcome: "failure",
      resourceType: "chargebee_invoice",
      resourceId: "inv_parked_1",
      metadata: JSON.stringify({ eventId: "ev_parked_1", subscriptionId: "subscription_v2", planFamily: "fast_track", rung: 25, amount: 162_400, currency: "INR" }),
    });
    const before = wallets[0].balance;
    const result = await applyChargebeeSubscriptionEvent(input);
    expect(result).toMatchObject({ status: "applied", plan: "fast_track" });
    // The parked grant landed with the binding: +25 rung credits, once.
    expect(wallets[0].balance).toBe(before + 25);
    expect(fulfillments).toHaveLength(1);
    expect(fulfillments[0]).toMatchObject({ providerEventId: "ev_parked_1", providerInvoiceId: "inv_parked_1", status: "credited", tokenCount: 25 });
    expect(activityLogs.some(row => row.action === "billing.v2_grant_replayed" && row.outcome === "success")).toBe(true);
    // A redelivery of the same parked event is a duplicate, never a second grant.
    const again = await applyChargebeeSubscriptionEvent({ ...input, eventId: "event_v2_new_2", resourceVersion: 11 });
    expect(again).toMatchObject({ status: "applied" });
    expect(wallets[0].balance).toBe(before + 25);
    expect(fulfillments).toHaveLength(1);
  });
});

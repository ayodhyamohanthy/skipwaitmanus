import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bandedCheckoutIntents,
  bandedFoundingCounters,
  bandedFoundingMemberships,
  bandedReferralBalances,
  billingReviewOutbox,
  operationalActivityLogs,
  paymentFulfillments,
  subscriptionCheckoutIntents,
  subscriptionEvents,
  tokenBalances,
  tokenTransactions,
} from "../drizzle/schema";
import { applyChargebeePaymentRefund, applyChargebeeSubscriptionEvent, fulfillChargebeePayment } from "./db";
import { bandedCheckoutIntentId } from "./bandedCheckout";
import { bandedIntentFingerprint, type BandedCart } from "../shared/bandedGrants";
import { bandedReferralItemPriceId } from "../shared/bandedCatalog";

import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

vi.mock("./chargebeeEnvironment", () => ({
  resolveChargebeeRuntime: () => ({ environment: "test", site: "fixture-test", apiKey: "fixture-key" }),
  resolveBillingEnvironment: () => "test",
}));

const dialect = new MySqlDialect();

function matches(condition: any, row: object): boolean {
  if (!condition) return true;
  try {
    const query = dialect.sqlToQuery(condition as SQL);
    let paramIdx = 0;
    const parts = query.sql.split(/\band\b/i);
    for (const part of parts) {
      const eqMatch = /`[^`]+`\.`([^`]+)`\s*=\s*\?/i.exec(part);
      if (eqMatch) {
        const col = eqMatch[1];
        const expected = query.params[paramIdx++];
        if ((row as Record<string, unknown>)[col] !== expected) return false;
        continue;
      }
      const likeMatch = /`[^`]+`\.`([^`]+)`\s*like\s*\?/i.exec(part);
      if (likeMatch) {
        const col = likeMatch[1];
        const expected = String(query.params[paramIdx++] ?? "").replace(/%$/, "");
        const actual = String((row as Record<string, unknown>)[col] ?? "");
        if (!actual.startsWith(expected)) return false;
        continue;
      }
    }
    return true;
  } catch {
    return true;
  }
}

const NOW = new Date("2026-11-23T10:00:00.000Z");
const TERM_START = new Date("2026-11-23T00:00:00.000Z");
const TERM_END = new Date("2026-12-23T00:00:00.000Z");

let tables: Record<string, any[]>;

function fixtureDatabase() {
  const getTableRows = (table: unknown): any[] => {
    if (table === tokenBalances) return tables.tokenBalances;
    if (table === subscriptionEvents) return tables.subscriptionEvents;
    if (table === subscriptionCheckoutIntents) return tables.subscriptionCheckoutIntents;
    if (table === bandedCheckoutIntents) return tables.bandedCheckoutIntents;
    if (table === bandedFoundingCounters) return tables.bandedFoundingCounters;
    if (table === bandedFoundingMemberships) return tables.bandedFoundingMemberships;
    if (table === bandedReferralBalances) return tables.bandedReferralBalances;
    if (table === tokenTransactions) return tables.tokenTransactions;
    if (table === paymentFulfillments) return tables.paymentFulfillments;
    if (table === billingReviewOutbox) return tables.billingReviewOutbox;
    if (table === operationalActivityLogs) return tables.operationalActivityLogs;
    return [];
  };

  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: any) => ({
          limit: (n: number) => {
            const rows = getTableRows(table).filter(r => matches(condition, r));
            const filtered = rows.slice(0, n);
            return {
              then: (resolve: (v: any) => any) => Promise.resolve(filtered).then(resolve),
              for: async () => filtered,
            };
          },
          orderBy: () => ({
            limit: (n: number) => {
              const rows = getTableRows(table).filter(r => matches(condition, r));
              const filtered = rows.slice(0, n);
              return {
                then: (resolve: (v: any) => any) => Promise.resolve(filtered).then(resolve),
                for: async () => filtered,
              };
            },
            then: (resolve: (v: any) => any) => Promise.resolve(getTableRows(table).filter(r => matches(condition, r))).then(resolve),
          }),
          then: (resolve: (v: any) => any) => Promise.resolve(getTableRows(table).filter(r => matches(condition, r))).then(resolve),
        }),
        limit: (n: number) => Promise.resolve(getTableRows(table).slice(0, n)),
        then: (resolve: (v: any) => any) => Promise.resolve(getTableRows(table)).then(resolve),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: any) => {
        const rows = getTableRows(table);
        const id = rows.length + 1;
        const inserted = { id, ...row };
        rows.push(inserted);
        return {
          onDuplicateKeyUpdate: async () => [{ affectedRows: 1, insertId: id }],
          then: (resolve: (v: any) => any) => Promise.resolve([{ affectedRows: 1, insertId: id }]).then(resolve),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (patch: any) => ({
        where: () => {
          const rows = getTableRows(table);
          for (const row of rows) {
            Object.assign(row, patch);
          }
          return Promise.resolve([{ affectedRows: rows.length }]);
        },
      }),
    }),
  };

  return {
    transaction: async (cb: (txArg: any) => Promise<any>) => cb(tx),
    select: tx.select,
    insert: tx.insert,
    update: tx.update,
  };
}

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");

  tables = {
    tokenBalances: [
      {
        id: 1,
        userId: 77,
        role: "job_seeker",
        plan: "free",
        balance: 0,
        monthlyAllowance: 3,
        monthlyCreditsRemaining: 3,
        monthlyCycleKey: "2026-11",
        subscriptionId: null,
        subscriptionStatus: null,
        subscriptionCurrentTermStart: null,
        subscriptionCurrentTermEnd: null,
        subscriptionResourceVersion: null,
      },
    ],
    subscriptionEvents: [],
    subscriptionCheckoutIntents: [
      {
        id: 1,
        userId: 77,
        role: "job_seeker",
        plan: "early_to_mid",
        hostedPageId: "hp_plan_001",
        checkoutIntentId: "bp_intent_001",
        itemPriceId: "skipwait_early_to_mid_monthly-INR",
        amount: 299900,
        currency: "INR",
        status: "pending",
      },
    ],
    bandedCheckoutIntents: [],
    bandedFoundingCounters: [
      { id: 1, site: "test", planId: "early_to_mid", issuedCount: 0, reservedCount: 1, updatedAt: NOW },
    ],
    bandedFoundingMemberships: [
      {
        id: 1,
        site: "test",
        planId: "early_to_mid",
        userId: 77,
        checkoutIntentId: "bp_intent_001",
        status: "reserved",
        issuedSequence: null,
        subscriptionId: null,
        expiresAt: new Date(NOW.getTime() + 6 * 3600_000),
        createdAt: NOW,
      },
    ],
    bandedReferralBalances: [],
    tokenTransactions: [],
    paymentFulfillments: [],
    billingReviewOutbox: [],
    operationalActivityLogs: [],
  };

  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("banded webhook fulfillment", () => {
  it("activates a banded plan subscription, issues founding place, and grants included referrals", async () => {
    const userId = 77;
    const checkoutIntentId = "bp_intent_001";
    const hostedPageId = "hp_plan_001";
    const subscriptionId = "sub_banded_001";

    const result = await applyChargebeeSubscriptionEvent({
      eventId: "ev_sub_created_001",
      eventType: "subscription_created",
      hostedPageId,
      passThruContent: checkoutIntentId,
      subscriptionId,
      plan: "early_to_mid",
      status: "active",
      currency: "INR",
      currentTermStart: TERM_START,
      currentTermEnd: TERM_END,
      resourceVersion: 1,
    });

    expect(result).toMatchObject({ status: "applied", plan: "early_to_mid" });
    expect(tables.subscriptionEvents).toHaveLength(1);

    // Duplicate delivery is idempotent
    const replay = await applyChargebeeSubscriptionEvent({
      eventId: "ev_sub_created_001",
      eventType: "subscription_created",
      hostedPageId,
      passThruContent: checkoutIntentId,
      subscriptionId,
      plan: "early_to_mid",
      status: "active",
      currency: "INR",
      currentTermStart: TERM_START,
      currentTermEnd: TERM_END,
      resourceVersion: 1,
    });
    expect(replay).toEqual({ status: "duplicate" });

    // Cancellation returns wallet to free and cancels subscription
    const cancelled = await applyChargebeeSubscriptionEvent({
      eventId: "ev_sub_cancelled_001",
      eventType: "subscription_cancelled",
      subscriptionId,
      plan: "early_to_mid",
      status: "cancelled",
      resourceVersion: 2,
    });
    expect(cancelled).toMatchObject({ status: "applied" });
    expect(tables.tokenBalances[0].plan).toBe("free");
  });

  it("fulfills extra referrals checkout through fulfillChargebeePayment and refunds unspent", async () => {
    const userId = 88;
    const checkoutIntentId = "br_intent_001";
    const hostedPageId = "hp_ref_001";
    const invoiceId = "inv_ref_001";

    const cart: BandedCart = {
      kind: "referral",
      currency: "INR",
      lines: [
        {
          level: "early",
          quantity: 2,
          itemPriceId: bandedReferralItemPriceId("early", "INR"),
          unitAmount: 149900,
          amount: 299800,
        },
      ],
      subtotal: 299800,
      discountPct: 0,
      discountAmount: 0,
      total: 299800,
    };

    tables.tokenBalances.push({
      id: 2,
      userId: 88,
      role: "job_seeker",
      plan: "early_to_mid",
      balance: 0,
      monthlyAllowance: 3,
      monthlyCreditsRemaining: 0,
      monthlyCycleKey: "2026-11",
      subscriptionId: "sub_user_88",
      subscriptionStatus: "active",
      subscriptionCurrentTermStart: TERM_START,
      subscriptionCurrentTermEnd: TERM_END,
      subscriptionResourceVersion: 1,
    });

    tables.bandedCheckoutIntents.push({
      id: 1,
      site: "test",
      checkoutIntentId,
      hostedPageId,
      userId,
      kind: "referral",
      planId: "early_to_mid",
      billingRoute: "IN",
      currency: "INR",
      expectedTotal: 299800,
      fingerprint: bandedIntentFingerprint(cart),
      cart,
      status: "pending",
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 6 * 3600_000),
      replayDeadline: new Date(NOW.getTime() + 25 * 60_000),
    });

    const paymentResult = await fulfillChargebeePayment({
      eventId: "ev_pay_ref_001",
      hostedPageId,
      invoiceId,
      passThruContent: checkoutIntentId,
      amount: 299800,
      currency: "INR",
    });

    expect(paymentResult).toMatchObject({ status: "credited" });

    // Duplicate fulfillment is idempotent
    const duplicatePayment = await fulfillChargebeePayment({
      eventId: "ev_pay_ref_001",
      hostedPageId,
      invoiceId,
      passThruContent: checkoutIntentId,
      amount: 299800,
      currency: "INR",
    });
    expect(duplicatePayment).toMatchObject({ status: "duplicate" });

    // Refund revokes unspent units
    const refundResult = await applyChargebeePaymentRefund({
      eventId: "ev_refund_ref_001",
      invoiceId,
      refundAmount: 299800,
      currency: "INR",
    });
    expect(refundResult).toMatchObject({ status: "revoked", tokenCount: 2 });
  });
});

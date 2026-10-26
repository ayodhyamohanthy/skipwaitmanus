import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasUserMadePayment, recordSubscriptionPaymentEvidence } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

// D-155 paid evidence: the /share gate reads a credited fulfillment or the
// wallet's lastPaidAt stamp. The stamp is written only from a verified
// nonzero payment_succeeded webhook tied to the wallet's provider
// subscriptionId, deduped by event id, and backfilled when the payment
// arrived before the activation that linked the wallet. Run against the
// disposable ledger fixture (real drizzle predicates, real unique keys and
// transaction rollback), not hand mocks.
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), capture: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

const fixture = createLedgerFixture();
const db = fixture.tables;

const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-23T05:00:00Z");
const PAID_FIRST = at("2026-10-20T10:00:00Z");
const PAID_LATER = at("2026-10-21T10:00:00Z");
const SEEKER = 7;

const wallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "start", subscriptionId: "sub_123", subscriptionStatus: "active", subscriptionCurrency: "INR", subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, cardValidatedAt: null, lastPaidAt: null, updatedAt: NOW, ...patch });
const paidEvent = (eventId: string, patch: Row = {}): Row => ({ id: 1, provider: "chargebee_paid", providerEventId: eventId, subscriptionId: "sub_123", resourceVersion: null, eventType: "paid_evidence", createdAt: NOW, ...patch });
const fulfillment = (status: string, patch: Row = {}): Row => ({ id: 41, provider: "chargebee", providerEventId: "evt_pack_1", providerInvoiceId: "inv_41", providerHostedPageId: "hp_41", checkoutIntentId: "intent_41", userId: SEEKER, role: "job_seeker", tokenCount: 5, amount: 50000, currency: "INR", status, reconciliationReason: null, lastCheckedAt: null, creditedAt: PAID_FIRST, createdAt: PAID_FIRST, ...patch });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  mocks.capture.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fixture.reset({ wallets: [], events: [], payments: [] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("recordSubscriptionPaymentEvidence", () => {
  it("stamps the wallet matched by provider subscriptionId and records the event", async () => {
    fixture.reset({ wallets: [wallet()] });
    const result = await recordSubscriptionPaymentEvidence({ eventId: "evt_pay_1", subscriptionId: "sub_123", occurredAt: PAID_FIRST });
    expect(result).toEqual({ status: "recorded", reason: "stamped" });
    expect(db.wallets[0].lastPaidAt).toEqual(PAID_FIRST);
    expect(db.events.filter(row => row.eventType === "paid_evidence")).toHaveLength(1);
  });

  it("treats a redelivered event as a duplicate and never moves the stamp", async () => {
    fixture.reset({ wallets: [wallet({ lastPaidAt: PAID_FIRST })], events: [paidEvent("evt_pay_1")] });
    const result = await recordSubscriptionPaymentEvidence({ eventId: "evt_pay_1", subscriptionId: "sub_123", occurredAt: PAID_LATER });
    expect(result).toEqual({ status: "duplicate" });
    expect(db.wallets[0].lastPaidAt).toEqual(PAID_FIRST);
    expect(db.events).toHaveLength(1);
  });

  it("keeps the earliest payment: a later renewal never moves the stamp forward", async () => {
    fixture.reset({ wallets: [wallet({ lastPaidAt: PAID_FIRST })] });
    await recordSubscriptionPaymentEvidence({ eventId: "evt_pay_2", subscriptionId: "sub_123", occurredAt: PAID_LATER });
    expect(db.wallets[0].lastPaidAt).toEqual(PAID_FIRST);
  });

  it("an earlier event backfills the stamp backwards to the first payment", async () => {
    fixture.reset({ wallets: [wallet({ lastPaidAt: PAID_LATER })] });
    await recordSubscriptionPaymentEvidence({ eventId: "evt_pay_3", subscriptionId: "sub_123", occurredAt: PAID_FIRST });
    expect(db.wallets[0].lastPaidAt).toEqual(PAID_FIRST);
  });

  it("records but cannot stamp when no wallet is linked yet (payment before activation)", async () => {
    fixture.reset({ wallets: [] });
    const result = await recordSubscriptionPaymentEvidence({ eventId: "evt_pay_4", subscriptionId: "sub_123", occurredAt: PAID_FIRST });
    expect(result).toEqual({ status: "recorded", reason: "wallet_not_linked_yet" });
    expect(db.events.filter(row => row.eventType === "paid_evidence")).toHaveLength(1);
  });
});

describe("hasUserMadePayment (D-155 /share gate)", () => {
  it("unlocks on a credited one-time fulfillment", async () => {
    fixture.reset({ wallets: [wallet()], payments: [fulfillment("credited")] });
    await expect(hasUserMadePayment(SEEKER)).resolves.toBe(true);
  });

  it("does NOT unlock on a refunded-only fulfillment (policy open, D-155)", async () => {
    fixture.reset({ wallets: [wallet()], payments: [fulfillment("refunded")] });
    await expect(hasUserMadePayment(SEEKER)).resolves.toBe(false);
  });

  it("does NOT unlock on pending, requires_review, or rejected fulfillments", async () => {
    for (const status of ["pending", "requires_review", "rejected"]) {
      fixture.reset({ wallets: [wallet()], payments: [fulfillment(status)] });
      await expect(hasUserMadePayment(SEEKER)).resolves.toBe(false);
    }
  });

  it("does NOT unlock on subscription activation alone (no paid stamp)", async () => {
    fixture.reset({ wallets: [wallet({ subscriptionStatus: "active" })] });
    await expect(hasUserMadePayment(SEEKER)).resolves.toBe(false);
  });

  it("unlocks on the wallet's paid stamp", async () => {
    fixture.reset({ wallets: [wallet({ lastPaidAt: PAID_FIRST })] });
    await expect(hasUserMadePayment(SEEKER)).resolves.toBe(true);
  });

  it("backfills the stamp when the payment arrived before activation linked the wallet", async () => {
    fixture.reset({ wallets: [wallet()], events: [paidEvent("evt_pay_4")] });
    await expect(hasUserMadePayment(SEEKER)).resolves.toBe(true);
    expect(db.wallets[0].lastPaidAt).toEqual(NOW);
  });

  it("stays locked for a wallet with no payment, no stamp, and no subscription", async () => {
    fixture.reset({ wallets: [wallet({ subscriptionId: null })] });
    await expect(hasUserMadePayment(SEEKER)).resolves.toBe(false);
  });
});

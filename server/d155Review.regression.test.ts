import { afterEach, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { applyChargebeePaymentRefund, applyChargebeeSubscriptionEvent, hasUserMadePayment, recordSubscriptionPaymentEvidence } from "./db";
import { registerChargebeeRoutes } from "./chargebeeRoutes";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
const fixture = createLedgerFixture();
const paidAt = new Date("2026-10-20T10:00:00Z");
const wallet = (patch: Row = {}): Row => ({ id: 1, userId: 7, role: "job_seeker", balance: 5, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", subscriptionId: null, lastPaidAt: null, updatedAt: paidAt, ...patch });
const payment = (): Row => ({ id: 41, provider: "chargebee", providerEventId: "evt_pack_1", providerInvoiceId: "inv_41", providerHostedPageId: "hp_41", checkoutIntentId: "intent_41", userId: 7, role: "job_seeker", tokenCount: 5, amount: 50000, currency: "INR", status: "credited", creditedAt: paidAt, createdAt: paidAt });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  fixture.reset({ wallets: [wallet()], payments: [payment()] });
});
afterEach(() => { vi.unstubAllEnvs(); });

it("keeps an already-unlocked paid seeker eligible after a full provider refund", async () => {
  await expect(hasUserMadePayment(7)).resolves.toBe(true);
  const result = await applyChargebeePaymentRefund({ eventId: "evt_refund_1", invoiceId: "inv_41", refundAmount: 50000, currency: "INR" });
  expect(result.status).toBe("revoked");
  expect(fixture.tables.payments[0].status).toBe("refunded");
  await expect(hasUserMadePayment(7)).resolves.toBe(true);
});

it("keeps a paid seeker eligible when a partial refund is parked for review", async () => {
  await expect(hasUserMadePayment(7)).resolves.toBe(true);
  const result = await applyChargebeePaymentRefund({ eventId: "evt_refund_partial", invoiceId: "inv_41", refundAmount: 10000, currency: "INR" });
  expect(result).toMatchObject({ status: "review", reason: "refund_partial" });
  await expect(hasUserMadePayment(7)).resolves.toBe(true);
});

it("finds settled seeker subscription evidence even if the same person's referrer wallet comes first", async () => {
  fixture.reset({ wallets: [wallet({ id: 1, role: "referrer", balance: 0 }), wallet({ id: 2, role: "job_seeker", subscriptionId: "sub_paid", lastPaidAt: paidAt })], payments: [] });
  await expect(hasUserMadePayment(7)).resolves.toBe(true);
});

for (const conflict of [false, true]) {
  it(`does not unlock from a ${conflict ? "conflicting-subscription" : "zero-amount"} event stored by the subscription handler`, async () => {
    vi.stubEnv("BILLING_ENV", "test");
    vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
    vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", "local-review-secret");
    fixture.reset({ wallets: [wallet({ plan: "start", subscriptionId: "sub_paid", subscriptionResourceVersion: 10 })], payments: [] });
    const app = express(); app.use(express.json());
    const evidence = vi.fn(recordSubscriptionPaymentEvidence);
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => undefined,
      createPaymentIntent: async () => undefined,
      fulfillPayment: async () => ({ status: "duplicate" }),
      applySubscriptionEvent: applyChargebeeSubscriptionEvent,
      recordSubscriptionPaymentEvidence: evidence,
    });
    const response = await request(app).post("/api/chargebee/webhook")
      .set("Authorization", `Basic ${Buffer.from("skipwait:local-review-secret").toString("base64")}`)
      .send({ id: conflict ? "evt_identity_conflict" : "evt_zero", event_type: "payment_succeeded", content: {
        transaction: { amount: conflict ? 9900 : 0, currency_code: "INR" },
        invoice: { id: "inv_zero", subscription_id: conflict ? "sub_someone_else" : "sub_paid" },
        subscription: { id: "sub_paid", status: "active", currency_code: "INR", resource_version: 1 },
      } });
    expect(response.status).toBe(200);
    expect(evidence).not.toHaveBeenCalled();
    expect(fixture.tables.events).toHaveLength(1);
    expect(fixture.tables.wallets[0].lastPaidAt).toBeNull();
    await expect(hasUserMadePayment(7)).resolves.toBe(false);
  });
}

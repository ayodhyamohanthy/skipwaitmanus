import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyChargebeePaymentRefund, fulfillChargebeePayment, markChargebeePaymentForReview, resolveRequiresReviewPayment } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

// Review round 2 of P0-refund-review-double-credit: a payment refunded in full must
// never be credited by the admin's review, whichever way it came to be held.
// (1) Credit recovery held it before the paid webhook arrived: the refund webhook
//     finds it only by invoice id, so the hold records the invoice and what was paid.
// (2) It was refunded under the code before this branch, which left the old reason:
//     the credit decision reads the payment's recorded refunds under its row lock.
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const fixture = createLedgerFixture();
const db = fixture.tables;
const NOW = new Date("2026-10-18T09:00:00Z");
const SEEKER = 7, PAYMENT = 41, PACK = 5;
const wallet = (balance: number): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: NOW });
const payment = (patch: Row = {}): Row => ({ id: PAYMENT, provider: "chargebee", providerEventId: "pending:hp_41", providerInvoiceId: null, providerHostedPageId: "hp_41", checkoutIntentId: "intent_41", userId: SEEKER, role: "job_seeker", tokenCount: PACK, amount: 50000, currency: "INR", status: "pending", reconciliationReason: null, lastCheckedAt: null, creditedAt: null, createdAt: NOW, ...patch });
const log = (id: number, action: string, metadata: Record<string, unknown>): Row => ({ id, actorUserId: SEEKER, action, outcome: "failure", resourceType: "payment_fulfillment", resourceId: String(PAYMENT), metadata: JSON.stringify(metadata), createdAt: NOW });
const seed = (rows: { payments: Row[]; activity?: Row[] }) => fixture.reset({ users: [{ id: SEEKER, canonicalPersonId: 1 }], wallets: [wallet(0)], ...rows });
const paidWebhook = (amount: number) => fulfillChargebeePayment({ eventId: "ev_paid", hostedPageId: "hp_41", invoiceId: "inv_41", passThruContent: "intent_41", amount, currency: "INR" });
const credit = () => resolveRequiresReviewPayment(99, PAYMENT, "credited").catch((error: unknown) => error);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers(); vi.setSystemTime(NOW);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("a payment held by credit recovery, then refunded", () => {
  it("records the invoice and what was paid when recovery holds it, so a full refund closes it and the credit is refused", async () => {
    seed({ payments: [payment()] });
    await markChargebeePaymentForReview(PAYMENT, "provider_page_mismatch", { invoiceId: "inv_41", paidAmount: 59000, paidCurrency: "INR" });
    expect(db.payments[0]).toMatchObject({ status: "requires_review", reconciliationReason: "provider_page_mismatch", providerInvoiceId: "inv_41" });
    const refund = await applyChargebeePaymentRefund({ eventId: "ev_refund", invoiceId: "inv_41", refundAmount: 59000, currency: "INR" });
    expect(refund).toMatchObject({ status: "review", reason: "refund_of_uncredited_payment" });
    expect(db.payments[0].reconciliationReason).toBe("refund_of_uncredited_payment");
    expect(await credit()).toBeInstanceOf(Error);
    expect(db.wallets[0].balance).toBe(0);
  });

  it("lets the paid webhook fill in the invoice and the paid amount on a payment recovery held without them", async () => {
    seed({ payments: [payment()] });
    await markChargebeePaymentForReview(PAYMENT, "provider_page_incomplete");
    expect(await paidWebhook(59000)).toEqual({ status: "ignored", reason: "payment_already_reconciled" });
    expect(db.payments[0].providerInvoiceId).toBe("inv_41");
    const refund = await applyChargebeePaymentRefund({ eventId: "ev_refund", invoiceId: "inv_41", refundAmount: 59000, currency: "INR" });
    expect(refund).toMatchObject({ status: "review", reason: "refund_of_uncredited_payment" });
    expect(await credit()).toBeInstanceOf(Error);
    expect(db.wallets[0].balance).toBe(0);
  });

  it("the reviewer's order: recovery holds it with its evidence, the paid webhook arrives, a full refund follows", async () => {
    seed({ payments: [payment()] });
    await markChargebeePaymentForReview(PAYMENT, "provider_page_mismatch", { invoiceId: "inv_41", paidAmount: 59000, paidCurrency: "INR" });
    expect(await paidWebhook(59000)).toEqual({ status: "ignored", reason: "payment_already_reconciled" });
    await applyChargebeePaymentRefund({ eventId: "ev_refund", invoiceId: "inv_41", refundAmount: 59000, currency: "INR" });
    expect(await credit()).toBeInstanceOf(Error);
    expect(db.wallets[0].balance).toBe(0);
    // The paid amount is recorded once, whichever path saw it first.
    expect(db.activity.filter(row => row.action === "billing.payment_paid_evidence")).toHaveLength(1);
  });

  it("still lets the admin credit a held payment with a partial refund (the overcharge), once", async () => {
    seed({ payments: [payment()] });
    await markChargebeePaymentForReview(PAYMENT, "provider_page_mismatch", { invoiceId: "inv_41", paidAmount: 59000, paidCurrency: "INR" });
    await applyChargebeePaymentRefund({ eventId: "ev_refund", invoiceId: "inv_41", refundAmount: 9000, currency: "INR" });
    expect(db.payments[0].reconciliationReason).toBe("refund_not_full_before_credit");
    expect(await credit()).toMatchObject({ decision: "credited", tokenCount: PACK });
    expect(db.wallets[0].balance).toBe(PACK);
  });

  it("never overwrites an invoice id the payment already carries", async () => {
    seed({ payments: [payment({ providerInvoiceId: "inv_original" })] });
    await markChargebeePaymentForReview(PAYMENT, "provider_page_mismatch", { invoiceId: "inv_other", paidAmount: 59000, paidCurrency: "INR" });
    expect(db.payments[0].providerInvoiceId).toBe("inv_original");
  });

  it("changes nothing when the payment is no longer pending", async () => {
    seed({ payments: [payment({ status: "credited", providerEventId: "ev_paid", providerInvoiceId: "inv_41", creditedAt: NOW })] });
    await markChargebeePaymentForReview(PAYMENT, "provider_page_mismatch", { invoiceId: "inv_41", paidAmount: 59000, paidCurrency: "INR" });
    expect(db.payments[0].status).toBe("credited");
    expect(db.activity.filter(row => row.action === "billing.payment_paid_evidence")).toHaveLength(0);
  });
});

describe("a payment refunded under the code before this branch", () => {
  const paidLog = () => log(900, "billing.payment_amount_mismatch", { role: "job_seeker", expectedAmount: 50000, expectedCurrency: "INR", paidAmount: 59000, paidCurrency: "INR", invoiceId: "inv_41" });
  const legacyRefund = (id: number, eventId: string, refundAmount: number) => log(id, "billing.refund_needs_review", { reason: "refund_of_uncredited_payment", eventId, invoiceId: "inv_41", refundAmount, amount: 50000, currency: "INR", tokenCount: PACK });
  const heldForMismatch = () => payment({ providerEventId: "ev_paid", providerInvoiceId: "inv_41", status: "requires_review", reconciliationReason: "checkout_amount_mismatch" });

  it("refuses the credit when its recorded refunds cover what the buyer paid, even after a replay of that refund", async () => {
    seed({ payments: [heldForMismatch()], activity: [paidLog(), legacyRefund(901, "ev_refund_old", 59000)] });
    expect(await applyChargebeePaymentRefund({ eventId: "ev_refund_old", invoiceId: "inv_41", refundAmount: 59000, currency: "INR" })).toMatchObject({ status: "duplicate" });
    const outcome = await credit();
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/refunded in full/);
    expect(db.wallets[0].balance).toBe(0);
    expect(db.payments[0].status).toBe("requires_review");
  });

  it("adds refunds up across events before deciding", async () => {
    seed({ payments: [heldForMismatch()], activity: [paidLog(), legacyRefund(901, "ev_a", 30000), legacyRefund(902, "ev_b", 29000)] });
    expect(await credit()).toBeInstanceOf(Error);
    expect(db.wallets[0].balance).toBe(0);
  });

  it("still credits once when the recorded refund was only the overcharge", async () => {
    seed({ payments: [heldForMismatch()], activity: [paidLog(), legacyRefund(901, "ev_refund_old", 9000)] });
    expect(await credit()).toMatchObject({ decision: "credited" });
    expect(db.wallets[0].balance).toBe(PACK);
  });

  it("lets the admin reject a fully refunded payment to close it", async () => {
    seed({ payments: [heldForMismatch()], activity: [paidLog(), legacyRefund(901, "ev_refund_old", 59000)] });
    expect(await resolveRequiresReviewPayment(99, PAYMENT, "rejected")).toMatchObject({ decision: "rejected" });
    expect(db.wallets[0].balance).toBe(0);
  });
});

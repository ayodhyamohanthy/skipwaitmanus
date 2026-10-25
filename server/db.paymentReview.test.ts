import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyChargebeePaymentRefund, fulfillChargebeePayment, getCreditLedgerAudit, resolveRequiresReviewPayment } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

// P0-refund-review-double-credit. A refund parks a credited pack payment as
// requires_review, the status an amount mismatch also uses. The admin review must
// tell them apart: a pack the webhook already added can never be added again
// (only its unused credits taken back, never below zero, once per payment), and a
// pack never added can be credited exactly once. Synthetic fixtures only.
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), capture: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

const fixture = createLedgerFixture();
const db = fixture.tables;

const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-18T09:00:00Z");
const PAID_AT = at("2026-10-10T00:00:00Z");
const ADMIN = 99;
const SEEKER = 7;
const PAYMENT = 41;
const PACK = 5;
const REFUSED = { name: "PaymentReviewRefusedError" };

const wallet = (balance: number): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: NOW });
const payment = (patch: Row = {}): Row => ({ id: PAYMENT, provider: "chargebee", providerEventId: "evt_paid_41", providerInvoiceId: "inv_41", providerHostedPageId: "hp_41", checkoutIntentId: "intent_41", userId: SEEKER, role: "job_seeker", tokenCount: PACK, amount: 50000, currency: "INR", status: "requires_review", reconciliationReason: "refund_credits_spent", lastCheckedAt: at("2026-10-12T00:00:00Z"), creditedAt: PAID_AT, createdAt: PAID_AT, ...patch });
const pending = (patch: Row = {}): Row => payment({ providerEventId: "pending:hp_41", providerInvoiceId: null, status: "pending", reconciliationReason: null, lastCheckedAt: null, creditedAt: null, ...patch });
/** A pre-fix webhook credit: the purchase row carries no payment reference. */
const legacyPurchase = (id: number, tokenCount = PACK): Row => ({ id, userId: SEEKER, role: "job_seeker", tokenCount, kind: "purchase", source: null, referenceType: null, referenceId: null, idempotencyKey: null, createdAt: PAID_AT });
const taggedPurchase = (id: number, paymentId: number, tokenCount = PACK): Row => ({ id, userId: SEEKER, role: "job_seeker", tokenCount, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(paymentId), idempotencyKey: `payment-credit-${paymentId}`, createdAt: PAID_AT });
const purchasedSpend = (id: number, credits: number): Row => ({ id, userId: SEEKER, role: "job_seeker", tokenCount: -credits, kind: "credit_spend", source: "purchased_balance", referenceType: "credit_spend", referenceId: `spend-${id}`, idempotencyKey: `spend-${id}`, createdAt: at("2026-10-11T00:00:00Z") });
/** Credits held outside the purchased balance; a take-back must never touch them. */
const carryoverGrant = (): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", source: "carryover", grantKey: "carry:7:2026-09", planId: "momentum", subscriptionId: null, cycleKey: "2026-09", tokenCount: 4, creditsRemaining: 4, status: "active", grantedAt: at("2026-10-01T00:00:00Z"), expiresAt: at("2026-12-01T00:00:00Z"), closedAt: null });
const carryoverRow = (id: number): Row => ({ id, userId: SEEKER, role: "job_seeker", tokenCount: 4, kind: "plan_credit_carryover", source: "carryover_grant", sourceCycleKey: "2026-10", referenceType: "plan_credit_grant", referenceId: "carry:7:2026-09", idempotencyKey: "carry:7:2026-09", creditGrantId: 1, createdAt: at("2026-10-01T00:00:00Z") });
const promoGrant = (): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", tokenCount: 3, creditsRemaining: 3, status: "active", source: "first_paid_invoice", providerRef: "inv_old", grantedAt: PAID_AT, expiresAt: at("2026-11-10T00:00:00Z"), consumedAt: null, revokedAt: null, revokedReason: null, createdAt: PAID_AT });

/** Purchased-balance history that adds up to `balance` with this payment's pack credited by the old untagged webhook row. */
function refundParked(balance: number, patch: Row = {}) {
  const txns = balance >= PACK ? [legacyPurchase(1), ...(balance > PACK ? [taggedPurchase(2, 40, balance - PACK)] : [])] : [legacyPurchase(1), purchasedSpend(2, PACK - balance)];
  fixture.reset({ users: [{ id: SEEKER, canonicalPersonId: 1 }], wallets: [wallet(balance)], payments: [payment(patch)], txns: [...txns, carryoverRow(10)], grants: [carryoverGrant()], promo: [promoGrant()] });
}
/** The record fulfillChargebeePayment writes when it parks a paid invoice whose amount disagrees with the checkout. */
const mismatchLog = (paidAmount: number, paidCurrency = "INR", expectedAmount = 50000): Row => ({ id: 900, actorUserId: SEEKER, action: "billing.payment_amount_mismatch", outcome: "failure", resourceType: "payment_fulfillment", resourceId: String(PAYMENT), metadata: JSON.stringify({ role: "job_seeker", expectedAmount, expectedCurrency: "INR", paidAmount, paidCurrency, invoiceId: "inv_41" }), createdAt: PAID_AT });
const paymentRow = () => db.payments.find(row => row.id === PAYMENT) as Row;
const paymentTxns = (kind?: string) => db.txns.filter(row => row.referenceType === "payment_fulfillment" && row.referenceId === String(PAYMENT) && (!kind || row.kind === kind));
const activity = (action: string) => db.activity.filter(row => row.action === action);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  mocks.capture.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("a payment refunded after its credits were added", () => {
  it("cannot be credited or rejected, so the pack is never added twice", async () => {
    refundParked(1);
    const before = structuredClone(db);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toMatchObject(REFUSED);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "rejected")).rejects.toMatchObject(REFUSED);
    expect(db).toEqual(before);
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_credits_spent", creditedAt: PAID_AT });
  });

  it("is refused the same way for a legacy refund row with no credit time recorded", async () => {
    refundParked(1, { reconciliationReason: "refund_partial", creditedAt: null });
    const before = structuredClone(db);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toMatchObject(REFUSED);
    expect(db).toEqual(before);
  });

  it.each([
    { balance: 7, revoked: 5, unrecovered: 0, after: 2 },
    { balance: 3, revoked: 3, unrecovered: 2, after: 0 },
    { balance: 0, revoked: 0, unrecovered: 5, after: 0 },
  ])("take back from a balance of $balance removes $revoked credits, never below zero, and records $unrecovered as unrecoverable", async ({ balance, revoked, unrecovered, after }) => {
    refundParked(balance);
    const outcome = await resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused", "refunded in Chargebee");
    expect(outcome).toMatchObject({ paymentId: PAYMENT, decision: "revoke_unused", tokenCount: PACK, requested: PACK, revoked, unrecovered, balanceBefore: balance, balanceAfter: after });
    expect(db.wallets[0]).toMatchObject({ balance: after, monthlyCreditsRemaining: 2 });
    expect(db.grants[0]).toMatchObject({ creditsRemaining: 4, status: "active" });
    expect(db.promo[0]).toMatchObject({ creditsRemaining: 3, status: "active" });
    expect(paymentRow()).toMatchObject({ status: "refunded", reconciliationReason: "refund_reviewed_revoked", creditedAt: PAID_AT });
    if (revoked > 0) expect(paymentTxns()).toEqual([expect.objectContaining({ kind: "admin_adjustment", source: "purchased_balance", tokenCount: -revoked, referenceType: "payment_fulfillment", referenceId: String(PAYMENT), idempotencyKey: `payment-refund-${PAYMENT}`, balanceAfter: after })]);
    else expect(paymentTxns()).toEqual([]);
    const [entry] = activity("payment.review_revoke_unused");
    expect(JSON.parse(String(entry.metadata))).toMatchObject({ reason: "refund_credits_spent", packCredits: PACK, requested: PACK, revoked, unrecovered, balanceBefore: balance, balanceAfter: after, note: "refunded in Chargebee" });
    expect(entry).toMatchObject({ actorUserId: ADMIN, outcome: "success", resourceType: "payment_fulfillment", resourceId: String(PAYMENT) });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("take back is idempotent: a retry is already resolved and the wallet is debited once", async () => {
    refundParked(7);
    await resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused");
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused")).rejects.toThrow(/already resolved/);
    expect(db.wallets[0].balance).toBe(2);
    expect(paymentTxns("admin_adjustment")).toHaveLength(1);
  });

  it("a take-back after an earlier one for the same payment takes at most the rest of the pack, under its own ledger key", async () => {
    refundParked(7, { reconciliationReason: "refund_repeated" });
    db.txns.push({ id: 30, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "admin_adjustment", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(PAYMENT), idempotencyKey: `payment-refund-${PAYMENT}`, createdAt: PAID_AT });
    db.wallets[0].balance = 6;
    const before = structuredClone(db);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused", undefined, PACK)).rejects.toThrow("You can take back at most 4 more credits for this payment: 1 of its 5 was already taken back.");
    expect(db).toEqual(before);
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused")).toMatchObject({ requested: 4, revoked: 4, unrecovered: 0, balanceBefore: 6, balanceAfter: 2 });
    expect(paymentTxns("admin_adjustment")).toHaveLength(1);
    expect(db.txns.filter(row => row.referenceType === "payment_refund_review")).toEqual([expect.objectContaining({ kind: "admin_adjustment", source: "purchased_balance", tokenCount: -4, referenceId: `${PAYMENT}:2`, idempotencyKey: `payment-refund-${PAYMENT}-2`, balanceAfter: 2 })]);
    expect(JSON.parse(String(activity("payment.review_revoke_unused")[0].metadata))).toMatchObject({ takenBackBefore: 1, requested: 4, revoked: 4 });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("a database refusal of the take-back row is reported and rolls everything back", async () => {
    refundParked(7);
    // An unrelated row already holds this payment's take-back key: the unique index refuses the new one.
    db.txns.push({ id: 30, userId: SEEKER, role: "job_seeker", tokenCount: 0, kind: "admin_adjustment", source: "admin_recovery", referenceType: "admin_token_adjustment", referenceId: "9", idempotencyKey: `payment-refund-${PAYMENT}`, createdAt: PAID_AT });
    const before = structuredClone(db);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused")).rejects.toMatchObject(REFUSED);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(db).toEqual(before);
  });

  it("honours the admin's credit cap and refuses a cap above the pack", async () => {
    refundParked(7, { reconciliationReason: "refund_partial" });
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused", undefined, PACK + 1)).rejects.toMatchObject(REFUSED);
    expect(db.wallets[0].balance).toBe(7);
    expect(paymentRow().status).toBe("requires_review");
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused", undefined, 2)).toMatchObject({ requested: 2, revoked: 2, unrecovered: 0, balanceAfter: 5 });
    expect(db.wallets[0].balance).toBe(5);
    expect(paymentTxns()).toEqual([expect.objectContaining({ tokenCount: -2, idempotencyKey: `payment-refund-${PAYMENT}` })]);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("keep credits closes the payment and leaves the wallet alone", async () => {
    refundParked(7);
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "keep_credits", "goodwill")).toMatchObject({ decision: "keep_credits", paymentId: PAYMENT });
    expect(paymentRow()).toMatchObject({ status: "refunded", reconciliationReason: "refund_reviewed_kept", creditedAt: PAID_AT });
    expect(db.wallets[0].balance).toBe(7);
    expect(paymentTxns()).toEqual([]);
    expect(activity("payment.review_keep_credits")).toHaveLength(1);
  });

  it("a full refund the webhook already took back cannot be taken back again", async () => {
    refundParked(7, { status: "credited", reconciliationReason: null });
    expect(await applyChargebeePaymentRefund({ eventId: "evt_refund_full", invoiceId: "inv_41", refundAmount: 50000, currency: "INR" })).toMatchObject({ status: "revoked" });
    expect(paymentRow().status).toBe("refunded");
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused")).rejects.toThrow(/already resolved/);
    expect(paymentTxns("admin_adjustment")).toHaveLength(1);
    expect(db.wallets[0].balance).toBe(2);
  });
});

describe("a payment the webhook never credited", () => {
  const mismatch = (balance = 2) => fixture.reset({ users: [{ id: SEEKER, canonicalPersonId: 1 }], wallets: [wallet(balance)], payments: [payment({ reconciliationReason: "checkout_amount_mismatch", creditedAt: null })], txns: balance ? [taggedPurchase(1, 40, balance)] : [], activity: [mismatchLog(50000)] });

  it("is credited exactly once, even on retry", async () => {
    mismatch();
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited", "tax added by Chargebee")).toMatchObject({ decision: "credited", tokenCount: PACK, paymentId: PAYMENT });
    expect(db.wallets[0].balance).toBe(2 + PACK);
    expect(paymentTxns()).toEqual([expect.objectContaining({ kind: "purchase", tokenCount: PACK, source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(PAYMENT), idempotencyKey: `payment-credit-${PAYMENT}`, balanceAfter: 2 + PACK })]);
    expect(paymentRow()).toMatchObject({ status: "credited", creditedAt: NOW });
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toThrow(/already resolved/);
    expect(db.wallets[0].balance).toBe(2 + PACK);
    expect(paymentTxns()).toHaveLength(1);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("a second credit for the same payment is refused by the database and rolled back", async () => {
    fixture.reset({ users: [{ id: SEEKER, canonicalPersonId: 1 }], wallets: [wallet(PACK)], payments: [payment({ reconciliationReason: "checkout_amount_mismatch", creditedAt: null })], txns: [taggedPurchase(1, PAYMENT)] });
    const before = structuredClone(db);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toMatchObject(REFUSED);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(db).toEqual(before);
    expect(paymentRow()).toMatchObject({ status: "requires_review", creditedAt: null });
    expect(paymentTxns("purchase")).toHaveLength(1);
  });

  it.each([["checkout_amount_mismatch"], ["refund_of_uncredited_payment"]])("%s: take back and keep credits are refused, nothing changes", async reason => {
    fixture.reset({ users: [{ id: SEEKER, canonicalPersonId: 1 }], wallets: [wallet(2)], payments: [payment({ reconciliationReason: reason, creditedAt: null })], txns: [taggedPurchase(1, 40, 2)] });
    const before = structuredClone(db);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused")).rejects.toMatchObject(REFUSED);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "keep_credits")).rejects.toMatchObject(REFUSED);
    expect(db).toEqual(before);
  });

  it("a refund of everything paid, arriving while it is parked, blocks crediting it; it can only be closed", async () => {
    mismatch();
    expect(await applyChargebeePaymentRefund({ eventId: "evt_refund_1", invoiceId: "inv_41", refundAmount: 50000, currency: "INR" })).toMatchObject({ status: "review", reason: "refund_of_uncredited_payment", paymentId: PAYMENT });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_of_uncredited_payment", creditedAt: null });
    expect(await applyChargebeePaymentRefund({ eventId: "evt_refund_1", invoiceId: "inv_41", refundAmount: 50000, currency: "INR" })).toMatchObject({ status: "duplicate" });
    expect(activity("billing.refund_needs_review")).toHaveLength(1);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toMatchObject(REFUSED);
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "rejected")).toMatchObject({ decision: "rejected" });
    expect(paymentRow()).toMatchObject({ status: "rejected", creditedAt: null });
    expect(db.wallets[0].balance).toBe(2);
    expect(paymentTxns()).toEqual([]);
  });
});

// Review round 1: only a refund of everything the buyer paid closes a payment that is
// still waiting for its credit. A refund of the overcharge on an amount mismatch is the
// usual fix, and the buyer has still paid for the pack: it stays creditable, once.
describe("a refund of a payment still waiting for its credit", () => {
  const CHECKOUT = 39600;
  const PAID = 45000;
  const awaitingRefund = (records: Row[] = [mismatchLog(PAID, "INR", CHECKOUT)]) => fixture.reset({ users: [{ id: SEEKER, canonicalPersonId: 1 }], wallets: [wallet(2)], payments: [payment({ amount: CHECKOUT, reconciliationReason: "checkout_amount_mismatch", creditedAt: null })], txns: [taggedPurchase(1, 40, 2)], activity: records });
  const refund = (patch: Partial<Parameters<typeof applyChargebeePaymentRefund>[0]> = {}) => applyChargebeePaymentRefund({ eventId: "evt_refund_1", invoiceId: "inv_41", refundAmount: PAID, currency: "INR", ...patch });
  const refundLogs = () => activity("billing.refund_needs_review").map(entry => JSON.parse(String(entry.metadata)) as Record<string, unknown>);
  const creditsOnce = async () => {
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited", "overcharge refunded in Chargebee")).toMatchObject({ decision: "credited", tokenCount: PACK });
    expect(db.wallets[0].balance).toBe(2 + PACK);
    expect(paymentTxns()).toEqual([expect.objectContaining({ kind: "purchase", tokenCount: PACK, idempotencyKey: `payment-credit-${PAYMENT}` })]);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toThrow(/already resolved/);
    expect(db.wallets[0].balance).toBe(2 + PACK);
  };

  it("a refund of everything the buyer paid closes it for good", async () => {
    awaitingRefund();
    expect(await refund()).toMatchObject({ status: "review", reason: "refund_of_uncredited_payment", paymentId: PAYMENT });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_of_uncredited_payment", creditedAt: null });
    expect(refundLogs()).toEqual([expect.objectContaining({ reason: "refund_of_uncredited_payment", eventId: "evt_refund_1", refundAmount: PAID, refundCurrency: "INR", refundedTotal: PAID, paidAmount: PAID, paidCurrency: "INR" })]);
    expect(await refund()).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(refundLogs()).toHaveLength(1);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toMatchObject(REFUSED);
    expect(db.wallets[0].balance).toBe(2);
  });

  it("a refund of only the overcharge leaves the pack to the admin, who can add it once", async () => {
    awaitingRefund();
    expect(await refund({ refundAmount: PAID - CHECKOUT })).toMatchObject({ status: "review", reason: "refund_not_full_before_credit", paymentId: PAYMENT });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_not_full_before_credit", creditedAt: null });
    expect(db.wallets[0].balance).toBe(2);
    expect(refundLogs()).toEqual([expect.objectContaining({ reason: "refund_not_full_before_credit", eventId: "evt_refund_1", refundAmount: PAID - CHECKOUT, refundCurrency: "INR", refundedTotal: PAID - CHECKOUT, paidAmount: PAID })]);
    expect(await refund({ refundAmount: PAID - CHECKOUT })).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(refundLogs()).toHaveLength(1);
    await creditsOnce();
    expect(paymentRow()).toMatchObject({ status: "credited", creditedAt: NOW });
  });

  it.each([
    ["an unreadable amount", { refundAmount: undefined }],
    ["another currency", { currency: "USD" }],
    ["no currency", { currency: undefined }],
    ["the checkout price, when the buyer paid more", { refundAmount: CHECKOUT }],
  ])("a refund of %s is not treated as a full refund: the admin decides, once", async (_case, patch) => {
    awaitingRefund();
    expect(await refund(patch)).toMatchObject({ status: "review", reason: "refund_not_full_before_credit" });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_not_full_before_credit" });
    expect(await refund(patch)).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(refundLogs()).toHaveLength(1);
    await creditsOnce();
  });

  it("refunds that add up to what was paid close it, and only readable refunds in its currency count", async () => {
    awaitingRefund();
    expect(await refund({ eventId: "evt_refund_1", refundAmount: PAID, currency: "USD" })).toMatchObject({ reason: "refund_not_full_before_credit" });
    expect(await refund({ eventId: "evt_refund_2", refundAmount: 5400 })).toMatchObject({ reason: "refund_not_full_before_credit" });
    expect(await refund({ eventId: "evt_refund_3", refundAmount: undefined })).toMatchObject({ reason: "refund_not_full_before_credit" });
    expect(paymentRow().reconciliationReason).toBe("refund_not_full_before_credit");
    expect(await refund({ eventId: "evt_refund_4", refundAmount: PAID - 5400 })).toMatchObject({ status: "review", reason: "refund_of_uncredited_payment" });
    expect(paymentRow().reconciliationReason).toBe("refund_of_uncredited_payment");
    expect(refundLogs().map(entry => entry.refundedTotal)).toEqual([0, 5400, 5400, PAID]);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toMatchObject(REFUSED);
  });

  it("a refund recorded before the credit and replayed after the admin added the pack is a duplicate, not a new refund", async () => {
    awaitingRefund();
    expect(await refund({ refundAmount: PAID - CHECKOUT })).toMatchObject({ reason: "refund_not_full_before_credit" });
    await creditsOnce();
    const credited = structuredClone(db);
    expect(await refund({ refundAmount: PAID - CHECKOUT })).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(db).toEqual(credited);
    // A refund Chargebee makes after the credit is new, and the credited payment's policy applies.
    expect(await refund({ eventId: "evt_refund_2", refundAmount: 1000 })).toMatchObject({ status: "review", reason: "refund_partial" });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_partial" });
  });

  it("without a record of what was paid, no refund is treated as full", async () => {
    awaitingRefund([]);
    expect(await refund({ refundAmount: 50000 })).toMatchObject({ status: "review", reason: "refund_not_full_before_credit" });
    expect(refundLogs()).toEqual([expect.objectContaining({ paidAmount: null, refundAmount: 50000 })]);
    await creditsOnce();
  });
});

// Review round 1: a refund that arrives after the review closed the payment, or while it
// is still parked, is never dropped: it re-opens the payment for review and alerts. A take-
// back in a later round is capped by what earlier rounds took, so a pack is never taken
// back beyond its size, and a redelivered refund event is a duplicate.
describe("a later refund of a payment whose credits were added", () => {
  const credited = (balance = 7) => refundParked(balance, { status: "credited", reconciliationReason: null });
  const refund = (eventId: string, refundAmount: number) => applyChargebeePaymentRefund({ eventId, invoiceId: "inv_41", refundAmount, currency: "INR" });
  const refundLogs = () => activity("billing.refund_needs_review").map(entry => JSON.parse(String(entry.metadata)) as Record<string, unknown>);

  it("after a take-back, a second refund re-opens the payment, and the next take-back stays within the pack", async () => {
    credited();
    expect(await refund("evt_ref_1", 20000)).toMatchObject({ status: "review", reason: "refund_partial" });
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused", undefined, 2)).toMatchObject({ revoked: 2, balanceAfter: 5 });
    expect(paymentRow()).toMatchObject({ status: "refunded", reconciliationReason: "refund_reviewed_revoked" });

    expect(await refund("evt_ref_2", 30000)).toEqual({ status: "review", reason: "refund_repeated", paymentId: PAYMENT, expectedAmount: 50000, currency: "INR" });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_repeated", creditedAt: PAID_AT });
    expect(db.wallets[0].balance).toBe(5);
    expect(refundLogs()).toEqual([expect.objectContaining({ eventId: "evt_ref_1" }), expect.objectContaining({ reason: "refund_repeated", eventId: "evt_ref_2", refundAmount: 30000, refundCurrency: "INR", previousStatus: "refunded", previousReason: "refund_reviewed_revoked" })]);
    expect(await refund("evt_ref_2", 30000)).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(await refund("evt_ref_1", 20000)).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(refundLogs()).toHaveLength(2);

    const parked = structuredClone(db);
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused", undefined, 4)).rejects.toMatchObject(REFUSED);
    expect(db).toEqual(parked);
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused", undefined, 3)).toMatchObject({ requested: 3, revoked: 3, unrecovered: 0, balanceBefore: 5, balanceAfter: 2 });
    expect(paymentRow()).toMatchObject({ status: "refunded", reconciliationReason: "refund_reviewed_revoked" });
    expect(db.txns.filter(row => row.kind === "admin_adjustment").map(row => [row.referenceType, row.referenceId, row.idempotencyKey, row.tokenCount])).toEqual([["payment_fulfillment", String(PAYMENT), `payment-refund-${PAYMENT}`, -2], ["payment_refund_review", `${PAYMENT}:2`, `payment-refund-${PAYMENT}-2`, -3]]);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);

    // The whole pack is taken back: a third refund still re-opens it, but nothing more can be taken.
    expect(await refund("evt_ref_3", 100)).toMatchObject({ status: "review", reason: "refund_repeated" });
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused")).rejects.toThrow("All 5 credits from this payment were already taken back, so there is nothing more to take back. Close it with Keep credits and close.");
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "keep_credits")).toMatchObject({ decision: "keep_credits" });
    expect(db.wallets[0].balance).toBe(2);
  });

  it("after keep credits, a second refund re-opens the payment and its first take-back uses the payment's own key", async () => {
    credited();
    await refund("evt_ref_1", 20000);
    await resolveRequiresReviewPayment(ADMIN, PAYMENT, "keep_credits");
    expect(await refund("evt_ref_2", 30000)).toMatchObject({ status: "review", reason: "refund_repeated" });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_repeated", creditedAt: PAID_AT });
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toMatchObject(REFUSED);
    expect(await resolveRequiresReviewPayment(ADMIN, PAYMENT, "revoke_unused", undefined, 5)).toMatchObject({ revoked: 5, balanceAfter: 2 });
    expect(paymentTxns("admin_adjustment")).toEqual([expect.objectContaining({ idempotencyKey: `payment-refund-${PAYMENT}`, tokenCount: -5 })]);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("a second refund while the payment is still parked is recorded and alerted, not dropped", async () => {
    credited(3);
    expect(await refund("evt_ref_1", 50000)).toMatchObject({ status: "review", reason: "refund_credits_spent" });
    expect(await refund("evt_ref_2", 100)).toMatchObject({ status: "review", reason: "refund_repeated" });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "refund_repeated" });
    expect(await refund("evt_ref_2", 100)).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(refundLogs().map(entry => entry.eventId)).toEqual(["evt_ref_1", "evt_ref_2"]);
    expect(db.wallets[0].balance).toBe(3);
  });

  it("a refund event on a payment already refunded in full is recorded and alerted without changing it", async () => {
    credited();
    expect(await refund("evt_ref_1", 50000)).toMatchObject({ status: "revoked" });
    expect(await refund("evt_ref_1", 50000)).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(refundLogs()).toEqual([]);
    expect(await refund("evt_ref_2", 50000)).toMatchObject({ status: "review", reason: "refund_repeated" });
    expect(paymentRow()).toMatchObject({ status: "refunded", reconciliationReason: "refunded_by_provider" });
    expect(db.wallets[0].balance).toBe(2);
    expect(refundLogs()).toEqual([expect.objectContaining({ eventId: "evt_ref_2", previousStatus: "refunded" })]);
  });

  it("a refund of a rejected payment alerts once per refund event", async () => {
    refundParked(2, { status: "rejected", reconciliationReason: "checkout_amount_mismatch", creditedAt: null });
    expect(await refund("evt_ref_1", 50000)).toMatchObject({ status: "review", reason: "refund_of_uncredited_payment" });
    expect(await refund("evt_ref_1", 50000)).toEqual({ status: "duplicate", paymentId: PAYMENT });
    expect(await refund("evt_ref_2", 50000)).toMatchObject({ status: "review", reason: "refund_repeated" });
    expect(paymentRow()).toMatchObject({ status: "rejected", creditedAt: null });
    expect(refundLogs()).toHaveLength(2);
    expect(db.wallets[0].balance).toBe(2);
  });
});

describe("the webhook's pack credit", () => {
  const paid = (patch: Partial<Parameters<typeof fulfillChargebeePayment>[0]> = {}) => fulfillChargebeePayment({ eventId: "evt_paid_41", hostedPageId: "hp_41", invoiceId: "inv_41", passThruContent: "intent_41", amount: 50000, currency: "INR", ...patch });
  const fresh = (rows: Row[] = [pending()]) => fixture.reset({ users: [{ id: SEEKER, canonicalPersonId: 1 }], wallets: [wallet(2)], payments: rows, txns: [taggedPurchase(1, 40, 2)] });

  it("is tagged with its payment, so an admin credit of the same payment is refused", async () => {
    fresh();
    expect(await paid()).toMatchObject({ status: "credited", tokenCount: PACK });
    expect(paymentTxns()).toEqual([expect.objectContaining({ kind: "purchase", tokenCount: PACK, source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(PAYMENT), idempotencyKey: `payment-credit-${PAYMENT}` })]);
    Object.assign(paymentRow(), { status: "requires_review", reconciliationReason: "checkout_amount_mismatch", creditedAt: null });
    await expect(resolveRequiresReviewPayment(ADMIN, PAYMENT, "credited")).rejects.toMatchObject(REFUSED);
    expect(db.wallets[0].balance).toBe(2 + PACK);
    expect(paymentTxns("purchase")).toHaveLength(1);
  });

  it("keeps the normal purchase path: credit once, replay is a duplicate, a mismatched amount parks with no credit", async () => {
    fresh([pending(), pending({ id: 42, providerEventId: "pending:hp_42", providerHostedPageId: "hp_42", checkoutIntentId: "intent_42" })]);
    expect(await paid()).toMatchObject({ status: "credited", tokenCount: PACK, userId: SEEKER, role: "job_seeker" });
    expect(paymentRow()).toMatchObject({ status: "credited", providerEventId: "evt_paid_41", providerInvoiceId: "inv_41", creditedAt: NOW, reconciliationReason: null });
    expect(db.wallets[0].balance).toBe(2 + PACK);
    const settled = structuredClone(db);
    expect(await paid()).toMatchObject({ status: "duplicate", tokenCount: PACK });
    expect(db).toEqual(settled);
    expect(await fulfillChargebeePayment({ eventId: "evt_paid_42", hostedPageId: "hp_42", invoiceId: "inv_42", passThruContent: "intent_42", amount: 58000, currency: "INR" })).toMatchObject({ status: "requires_review", reason: "checkout_amount_mismatch", paymentId: 42 });
    expect(db.payments.find(row => row.id === 42)).toMatchObject({ status: "requires_review", reconciliationReason: "checkout_amount_mismatch", creditedAt: null });
    expect(db.wallets[0].balance).toBe(2 + PACK);
    expect(db.txns.filter(row => row.referenceId === "42")).toEqual([]);
    expect(db.promo).toEqual([]);
    expect(db.txns.some(row => row.kind === "promo_grant")).toBe(false);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("REVIEWER-ISOLATION-1: a paid invoice on a demo review checkout parks for the owner and grants nothing", async () => {
    fixture.reset({ users: [{ id: SEEKER, canonicalPersonId: 1, openId: "reviewer_seeker" }], wallets: [wallet(2)], payments: [pending()], txns: [taggedPurchase(1, 40, 2)] });
    expect(await paid()).toMatchObject({ status: "requires_review", reason: "reviewer_account", paymentId: PAYMENT });
    expect(paymentRow()).toMatchObject({ status: "requires_review", reconciliationReason: "reviewer_account", creditedAt: null });
    expect(db.wallets[0].balance).toBe(2);
    expect(paymentTxns("purchase")).toHaveLength(0);
  });

  it("REVIEWER-ISOLATION-1: a real member's identical payment still credits normally", async () => {
    fresh();
    expect(await paid()).toMatchObject({ status: "credited", tokenCount: PACK, userId: SEEKER });
    expect(db.wallets[0].balance).toBe(2 + PACK);
  });

  it("a webhook arriving after credit recovery settled the checkout is a duplicate, not an unmatched payment", async () => {
    fresh();
    expect(await paid({ eventId: "hosted_page:hp_41" })).toMatchObject({ status: "credited" });
    expect(await paid()).toMatchObject({ status: "duplicate", tokenCount: PACK });
    expect(db.wallets[0].balance).toBe(2 + PACK);
    expect(paymentTxns("purchase")).toHaveLength(1);
    // A different invoice on the same checkout is not this payment: it still alerts as unmatched.
    expect(await paid({ eventId: "evt_other", invoiceId: "inv_other" })).toEqual({ status: "ignored", reason: "unknown_checkout" });
  });

  it("a webhook for a checkout already parked for review is not reported as unknown", async () => {
    fresh([payment({ reconciliationReason: "checkout_amount_mismatch", creditedAt: null, providerEventId: "evt_first" })]);
    expect(await paid({ eventId: "evt_second" })).toEqual({ status: "ignored", reason: "payment_already_reconciled" });
    expect(db.wallets[0].balance).toBe(2);
  });

  it("a paid event for a refunded checkout is already reconciled, never a duplicate credit the buyer would read as credited", async () => {
    fresh([payment({ status: "refunded", reconciliationReason: "refunded_by_provider", providerEventId: "evt_first" })]);
    expect(await paid({ eventId: "hosted_page:hp_41" })).toEqual({ status: "ignored", reason: "payment_already_reconciled" });
    expect(db.wallets[0].balance).toBe(2);
    expect(paymentTxns()).toEqual([]);
  });
});

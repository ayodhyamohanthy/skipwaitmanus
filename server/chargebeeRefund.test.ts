import express from "express";
import fs from "node:fs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRefundEvent } from "./chargebee";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

const secret = "refund-secret";
const auth = () => `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
beforeEach(() => { vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", secret); vi.stubEnv("BILLING_ENV", "test"); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const refundEvent = (over: Record<string, unknown> = {}) => ({ id: "ev_ref_1", event_type: "payment_refunded", content: { transaction: { id: "txn_1", type: "refund", amount: 9900, currency_code: "INR" }, invoice: { id: "inv_1" }, credit_note: { id: "cn_1", reference_invoice_id: "inv_1", total: 9900 } }, ...over });

function appWith(applyPaymentRefund?: (input: unknown) => Promise<{ status: string; paymentId?: number; reason?: string }>) {
  const alertPaymentRefund = vi.fn(async () => ({ alerted: true }));
  const record = vi.fn(async () => undefined);
  const app = express(); app.use(express.json());
  registerChargebeeRoutes(app, { resolveIdentity: vi.fn(), createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), applyPaymentRefund, alertPaymentRefund, recordActivity: record } as never);
  return { app, alertPaymentRefund, record };
}
const post = (app: express.Express, body: unknown) => request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(body as object);

describe("parseRefundEvent", () => {
  it("reads invoice, amount and currency from a payment_refunded event", () => {
    expect(parseRefundEvent(refundEvent())).toEqual({ eventId: "ev_ref_1", invoiceId: "inv_1", refundAmount: 9900, currency: "INR" });
  });
  it("falls back to the credit note and leaves unreadable fields undefined instead of guessing", () => {
    expect(parseRefundEvent({ id: "ev_2", event_type: "payment_refunded", content: { credit_note: { reference_invoice_id: "inv_9", total: 500, currency_code: "usd" } } })).toEqual({ eventId: "ev_2", invoiceId: "inv_9", refundAmount: 500, currency: "USD" });
    expect(parseRefundEvent({ id: "ev_3", event_type: "payment_refunded", content: {} })).toEqual({ eventId: "ev_3", invoiceId: undefined, refundAmount: undefined, currency: undefined });
  });
  it("ignores other event types and events without an id", () => {
    expect(parseRefundEvent({ id: "x", event_type: "payment_succeeded" })).toBeUndefined();
    expect(parseRefundEvent({ event_type: "payment_refunded" })).toBeUndefined();
  });
});

describe("refund webhook handling", () => {
  it("passes the parsed refund to the settle step and stays quiet when credits are revoked", async () => {
    const apply = vi.fn(async () => ({ status: "revoked", paymentId: 4 }));
    const { app, alertPaymentRefund } = appWith(apply);
    const response = await post(app, refundEvent());
    expect(response.status).toBe(200);
    expect(apply).toHaveBeenCalledWith({ eventId: "ev_ref_1", invoiceId: "inv_1", refundAmount: 9900, currency: "INR" });
    expect(response.body.obligations.refund).toMatchObject({ status: "revoked" });
    expect(alertPaymentRefund).not.toHaveBeenCalled();
  });
  it("treats a redelivered refund as done without alerting", async () => {
    const { app, alertPaymentRefund } = appWith(async () => ({ status: "duplicate", paymentId: 4 }));
    expect((await post(app, refundEvent())).status).toBe(200);
    expect(alertPaymentRefund).not.toHaveBeenCalled();
  });
  it("alerts the admin when credits were already spent, and still acknowledges the event", async () => {
    const { app, alertPaymentRefund, record } = appWith(async () => ({ status: "review", paymentId: 4, reason: "refund_credits_spent" }));
    const response = await post(app, refundEvent());
    expect(response.status).toBe(200);
    expect(alertPaymentRefund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 4, invoiceId: "inv_1", reason: "refund_credits_spent", refundAmount: 9900, currency: "INR" }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.refund_needs_review", outcome: "failure" }));
  });
  it("alerts when a refund arrives after the admin already closed the payment, or before its credit", async () => {
    for (const reason of ["refund_repeated", "refund_not_full_before_credit", "refund_of_uncredited_payment"]) {
      const { app, alertPaymentRefund, record } = appWith(async () => ({ status: "review", paymentId: 4, reason }));
      expect((await post(app, refundEvent())).status).toBe(200);
      expect(alertPaymentRefund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 4, reason, refundAmount: 9900, currency: "INR" }));
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.refund_needs_review", outcome: "failure" }));
    }
  });
  it("alerts when a refund maps to no credit purchase", async () => {
    const { app, alertPaymentRefund } = appWith(async () => ({ status: "unmatched", reason: "refund_invoice_unknown" }));
    await post(app, refundEvent());
    expect(alertPaymentRefund).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: "inv_1", reason: "refund_invoice_unknown" }));
  });
  it("returns 500 so Chargebee retries when settling fails", async () => {
    const { app } = appWith(async () => { throw new Error("db down"); });
    expect((await post(app, refundEvent())).status).toBe(500);
  });
  it("still rejects an unauthenticated refund event", async () => {
    const { app } = appWith(vi.fn());
    expect((await request(app).post("/api/chargebee/webhook").send(refundEvent())).status).toBe(401);
  });
});

describe("applyChargebeePaymentRefund invariants (source contract, like the other wallet tests)", () => {
  const source = fs.readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const from = source.indexOf("export async function applyChargebeePaymentRefund");
  const body = source.slice(from, source.indexOf("export async function createChargebeeSubscriptionIntent", from));
  const events = fs.readFileSync(new URL("./paymentRefundEvents.ts", import.meta.url), "utf8");
  it("locks fulfillment then wallet, never makes a balance negative, and is idempotent per refund", () => {
    expect(body.match(/\.for\("update"\)/g)).toHaveLength(2);
    expect(body).toContain('sql`${tokenBalances.balance} >= ${row.tokenCount}`');
    expect(body.indexOf("wallet[0].balance < row.tokenCount")).toBeLessThan(body.indexOf('status: "refunded"'));
    expect(body).toContain('idempotencyKey: `payment-refund-${row.id}`');
    // A payment no longer credited is settled per refund event, under the row lock and before any wallet work.
    const handoff = body.indexOf('if (row.status !== "credited") return settleRefundOfNonCreditedPaymentTx(');
    expect(handoff).toBeGreaterThan(body.indexOf('.for("update")'));
    expect(handoff).toBeLessThan(body.indexOf("tx.select().from(tokenBalances)"));
    expect(events).toContain('if (history.refunds.some(refund => refund.eventId === event.eventId)) return { status: "duplicate", paymentId: row.id };');
    // A credited payment checks the same record first, so a replayed refund from before its credit never counts again.
    expect(body.indexOf("if (await refundEventRecordedTx(tx, row.id, input.eventId)) return")).toBeGreaterThan(handoff);
    expect(body.indexOf("if (await refundEventRecordedTx(tx, row.id, input.eventId)) return")).toBeLessThan(body.indexOf("tx.select().from(tokenBalances)"));
    // Nothing on that path moves a credit: it never touches the wallet or the ledger.
    expect(events).not.toMatch(/tokenBalances|tokenTransactions/);
  });
  it("never changes the wallet for a partial refund, spent credits or a currency mismatch", () => {
    for (const reason of ["refund_partial", "refund_credits_spent", "refund_currency_mismatch", "refund_amount_unreadable"]) expect(body).toContain(`park("${reason}")`);
    expect(body.indexOf('park("refund_partial")')).toBeLessThan(body.indexOf("tx.update(tokenBalances)"));
  });
});

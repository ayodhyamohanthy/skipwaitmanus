import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { registerPaymentWebhookRoutes, type GatewayEventInput, type PayPalWebhookVerifier } from "./paymentWebhooks";
import type { ActivityInput } from "./payments";

type Deps = Parameters<typeof registerPaymentWebhookRoutes>[1];

function build(extra: Partial<Deps> = {}) {
  const app = express();
  const records: ActivityInput[] = [];
  const gatewayEvents: GatewayEventInput[] = [];
  registerPaymentWebhookRoutes(app, { record: async entry => { records.push(entry); }, recordGatewayEvent: async input => { gatewayEvents.push(input); return { matched: false }; }, ...extra });
  return { app, records, gatewayEvents };
}

function requestSignature(raw: string, secret = "rzp_test_secret") {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

describe("payment gateway webhooks", () => {
  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_SECRET;
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it("accepts a valid Razorpay HMAC, logs the captured payment, and acks unmatched deliveries with 200", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const { app, records, gatewayEvents } = build();
    const payload = { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 9900, currency: "INR", status: "captured", notes: { userId: "7" } } } } };
    const raw = JSON.stringify(payload);
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, matched: false });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ actorUserId: 7, action: "payment.razorpay_payment.captured", outcome: "success", resourceType: "payment", resourceId: "pay_1", metadata: { orderId: "order_1", amount: 9900, currency: "INR", status: "captured", verification: "hmac_verified" } });
    expect(gatewayEvents).toHaveLength(0);
  });

  it("rejects a forged Razorpay signature with 400 before any ledger write", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const { app, records } = build();
    const payload = { event: "payment.captured", payload: { payment: { entity: { id: "pay_evil", amount: 9900, currency: "INR", status: "captured" } } } };
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(JSON.stringify(payload), "attacker_secret")).send(payload);
    expect(response.status).toBe(400);
    expect(records).toHaveLength(0);
  });

  it("returns 503 when the Razorpay webhook secret is not configured", async () => {
    const { app, records } = build();
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", "deadbeef").send({ event: "payment.captured" });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Webhook not configured" });
    expect(records).toHaveLength(0);
  });

  it("records failed payments and processed refunds with the matching outcome", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const { app, records } = build();
    const rawFailed = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_fail", order_id: "order_2", amount: 19_900, currency: "INR", status: "failed" } } } });
    const rawRefund = JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 9900, currency: "INR", status: "processed" } } } });
    const failed = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(rawFailed)).send(rawFailed);
    const refund = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(rawRefund)).send(rawRefund);
    expect(failed.status).toBe(200);
    expect(refund.status).toBe(200);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ action: "payment.razorpay_payment.failed", outcome: "failure", resourceId: "pay_fail" });
    expect(records[1]).toMatchObject({ action: "payment.razorpay_refund.processed", outcome: "success", resourceId: "rfnd_1", metadata: { amount: 9900 } });
  });

  it("ignores unknown Razorpay events without touching the ledger", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const { app, records } = build();
    const raw = JSON.stringify({ event: "invoice.paid", payload: { invoice: { entity: { id: "inv_1" } } } });
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, ignored: true });
    expect(records).toHaveLength(0);
  });

  it("surfaces a checkout-intent correlation for Razorpay deliveries through recordGatewayEvent", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const correlations: GatewayEventInput[] = [];
    const { app, records } = build({ recordGatewayEvent: async input => { correlations.push(input); return input.checkoutIntentId === "intent_match" ? { matched: true } : { matched: false }; } });
    const payload = { event: "payment.captured", payload: { payment: { entity: { id: "pay_2", order_id: "order_3", amount: 9900, currency: "INR", status: "captured", notes: { userId: "7", checkoutIntentId: "intent_match" } } } } };
    const raw = JSON.stringify(payload);
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, matched: true });
    expect(correlations).toHaveLength(1);
    expect(correlations[0]).toMatchObject({ provider: "razorpay", checkoutIntentId: "intent_match", orderId: "order_3", amount: 9900 });
    expect(records).toHaveLength(1);
  });

  it("credits nothing: every gateway delivery only appends payment.* activity rows", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const { app, records } = build();
    for (const event of ["payment.captured", "payment.failed", "refund.processed"]) {
      const entity = event === "refund.processed" ? { refund: { entity: { id: "rfnd_x", amount: 9900, currency: "INR", status: "processed" } } } : { payment: { entity: { id: `pay_${event}`, amount: 9900, currency: "INR", status: "captured" } } };
      const raw = JSON.stringify({ event, payload: entity });
      await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    }
    expect(records).toHaveLength(3);
    expect(records.every(entry => entry.action.startsWith("payment."))).toBe(true);
  });

  it("verifies PayPal deliveries through the injected verifier and records verified captures", async () => {
    process.env.PAYPAL_CLIENT_ID = "pp_client";
    process.env.PAYPAL_SECRET = "pp_secret";
    process.env.PAYPAL_WEBHOOK_ID = "pp_webhook_id";
    const verifierCalls: Array<Record<string, unknown>> = [];
    const verifier: PayPalWebhookVerifier = async input => { verifierCalls.push(input as Record<string, unknown>); return "SUCCESS"; };
    const { app, records, gatewayEvents } = build({ verifyPayPalWebhook: verifier });
    const response = await request(app).post("/api/payments/paypal/webhook").send({ id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "8XC123", amount: { value: "9.90", currency_code: "USD" }, status: "COMPLETED", custom_id: "intent_pp1", supplementary_data: { related_ids: { order_id: "5OY456" } }, reference_id: "skipwait-7-123" } });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, matched: false, verification: "verified" });
    expect(verifierCalls).toHaveLength(1);
    expect(verifierCalls[0]).toMatchObject({ authAlgo: undefined, event: expect.objectContaining({ id: "WH-1" }) });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ actorUserId: 7, action: "payment.paypal_PAYMENT.CAPTURE.COMPLETED", outcome: "success", resourceType: "payment", resourceId: "8XC123", metadata: { orderId: "5OY456", amount: 9.9, currency: "USD", status: "COMPLETED", verification: "verified" } });
    expect(gatewayEvents).toHaveLength(1);
    expect(gatewayEvents[0]).toMatchObject({ provider: "paypal", checkoutIntentId: "intent_pp1", orderId: "5OY456" });
  });

  it("returns 400 and records nothing when PayPal signature verification fails", async () => {
    process.env.PAYPAL_CLIENT_ID = "pp_client";
    process.env.PAYPAL_SECRET = "pp_secret";
    process.env.PAYPAL_WEBHOOK_ID = "pp_webhook_id";
    const { app, records, gatewayEvents } = build({ verifyPayPalWebhook: async () => "FAILURE" });
    const response = await request(app).post("/api/payments/paypal/webhook").send({ id: "WH-evil", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "8XCEVIL", amount: { value: "9.90", currency_code: "USD" }, custom_id: "intent_pp1" } });
    expect(response.status).toBe(400);
    expect(records).toHaveLength(0);
    expect(gatewayEvents).toHaveLength(0);
  });

  it("fails closed with 400 when the PayPal verification API errors so the provider retries", async () => {
    process.env.PAYPAL_CLIENT_ID = "pp_client";
    process.env.PAYPAL_SECRET = "pp_secret";
    process.env.PAYPAL_WEBHOOK_ID = "pp_webhook_id";
    const { app, records } = build({ verifyPayPalWebhook: async () => { throw new Error("verify api down"); } });
    const response = await request(app).post("/api/payments/paypal/webhook").send({ id: "WH-2", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "8XC456", amount: { value: "9.90", currency_code: "USD" }, status: "REFUNDED" } });
    expect(response.status).toBe(400);
    expect(records).toHaveLength(0);
  });

  it("logs unverified PayPal deliveries as requires_review in sandbox fallback mode without crediting or correlating", async () => {
    process.env.PAYPAL_CLIENT_ID = "pp_client";
    process.env.PAYPAL_SECRET = "pp_secret";
    const { app, records, gatewayEvents } = build();
    const response = await request(app).post("/api/payments/paypal/webhook").send({ id: "WH-3", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "5OY789", status: "APPROVED", purchase_units: [{ reference_id: "skipwait-9-456", custom_id: "intent_pp3", amount: { value: "59.90", currency_code: "USD" } }] } });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ received: true, matched: false, verification: "requires_review" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ actorUserId: 9, action: "payment.paypal_CHECKOUT.ORDER.APPROVED", outcome: "denied", resourceId: "5OY789", metadata: { verification: "requires_review" } });
    expect(gatewayEvents).toHaveLength(0);
  });

  it("returns 503 for PayPal deliveries when PayPal is not configured at all", async () => {
    const { app, records } = build();
    const response = await request(app).post("/api/payments/paypal/webhook").send({ id: "WH-4", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "8XC789" } });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Webhook not configured" });
    expect(records).toHaveLength(0);
  });

  it("ignores unknown PayPal events without touching the ledger", async () => {
    process.env.PAYPAL_CLIENT_ID = "pp_client";
    process.env.PAYPAL_SECRET = "pp_secret";
    const { app, records } = build();
    const response = await request(app).post("/api/payments/paypal/webhook").send({ id: "WH-5", event_type: "CUSTOMER.DISPUTE.CREATED", resource: { id: "disp_1" } });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, ignored: true });
    expect(records).toHaveLength(0);
  });

  it("fulfills an unlock_credits capture by crediting the employer wallet once per payment id", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const fulfillments: Array<{ userId: number; pack: string; paymentId: string; orderId: string; amount: number; currency: string }> = [];
    const { app, records } = build({ fulfillUnlockCredits: async input => { fulfillments.push(input); return { status: "credited", credits: 10 }; } });
    const payload = { event: "payment.captured", payload: { payment: { entity: { id: "pay_unlock_1", order_id: "order_unlock_1", amount: 12900, currency: "INR", status: "captured", notes: { userId: "11", kind: "unlock_credits", pack: "growth" } } } } };
    const raw = JSON.stringify(payload);
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    expect(response.status).toBe(200);
    expect(fulfillments).toEqual([{ userId: 11, pack: "growth", paymentId: "pay_unlock_1", orderId: "order_unlock_1", amount: 12900, currency: "INR" }]);
    expect(records[0]).toMatchObject({ actorUserId: 11, action: "payment.razorpay_payment.captured", outcome: "success" });
    // A duplicate delivery must not re-credit: same payment id, same event.
    await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    expect(fulfillments).toHaveLength(2); // the handler always relays; idempotency lives in fulfillUnlockCreditPurchase (duplicate by eventId)
    expect(fulfillments[1]).toMatchObject({ userId: 11, paymentId: "pay_unlock_1", orderId: "order_unlock_1" });
  });

  it("returns 503 so Razorpay retries when a captured unlock cannot commit", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const { app, records } = build({ fulfillUnlockCredits: async () => { throw new Error("database unavailable"); } });
    const payload = { event: "payment.captured", payload: { payment: { entity: { id: "pay_retry", order_id: "order_retry", amount: 2900, currency: "INR", status: "captured", notes: { userId: "11", kind: "unlock_credits", pack: "starter" } } } } };
    const raw = JSON.stringify(payload);
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Payment fulfillment pending retry" });
    expect(records).toHaveLength(0);
  });

  it("marks a capture for review when provider identity fields are incomplete", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const fulfillments: unknown[] = [];
    const { app } = build({ fulfillUnlockCredits: async input => { fulfillments.push(input); } });
    const payload = { event: "payment.captured", payload: { payment: { entity: { id: "pay_no_order", amount: 2900, currency: "INR", status: "captured", notes: { userId: "11", kind: "unlock_credits", pack: "starter" } } } } };
    const raw = JSON.stringify(payload);
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, matched: false, fulfillment: "requires_review" });
    expect(fulfillments).toHaveLength(0);
  });

  it("does not invoke unlock fulfillment for captured payments without the unlock_credits note kind", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_test_secret";
    const fulfillments: unknown[] = [];
    const { app } = build({ fulfillUnlockCredits: async input => { fulfillments.push(input); } });
    const payload = { event: "payment.captured", payload: { payment: { entity: { id: "pay_seeker_1", amount: 9900, currency: "INR", status: "captured", notes: { userId: "7" } } } } };
    const raw = JSON.stringify(payload);
    const response = await request(app).post("/api/payments/razorpay/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", requestSignature(raw)).send(raw);
    expect(response.status).toBe(200);
    expect(fulfillments).toHaveLength(0);
  });
});

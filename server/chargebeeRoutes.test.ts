import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

function auth(secret: string) {
  return `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
}

describe("Chargebee webhook route", () => {
  it("accepts a valid payment and keeps duplicate delivery idempotent", async () => {
    const app = express();
    app.use(express.json());
    const secret = "test-webhook-secret";
    process.env.CHARGEBEE_WEBHOOK_SECRET = secret;
    const events = new Set<string>();
    let wallet = 3;
    let fulfillmentCalls = 0;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => undefined,
      createPaymentIntent: async () => undefined,
      fulfillPayment: async input => {
        fulfillmentCalls += 1;
        if (events.has(input.eventId)) return { status: "duplicate", tokenCount: 1 };
        events.add(input.eventId);
        wallet += input.amount === 9900 ? 1 : 0;
        return { status: "credited", tokenCount: 1, userId: 7, role: "job_seeker" };
      },
    });
    const payload = { id: "ev_paid_1", event_type: "payment_succeeded", content: { payment: { amount: 9900, currency_code: "INR", hosted_page_id: "hp_test", invoice_id: "inv_test" }, hosted_page: { pass_thru_content: "intent_paid_1" } } };
    const first = await request(app).post("/api/chargebee/webhook").set("Authorization", auth(secret)).send(payload);
    const second = await request(app).post("/api/chargebee/webhook").set("Authorization", auth(secret)).send(payload);
    expect(first.status).toBe(200);
    expect(first.body.result.status).toBe("credited");
    expect(second.status).toBe(200);
    expect(second.body.result.status).toBe("duplicate");
    expect(wallet).toBe(4);
    expect(fulfillmentCalls).toBe(2);
    delete process.env.CHARGEBEE_WEBHOOK_SECRET;
  });

  it("connects a checkout intent to a verified paid event and wallet refresh", async () => {
    const app = express();
    app.use(express.json());
    const secret = "flow-secret";
    process.env.CHARGEBEE_WEBHOOK_SECRET = secret;
    let intent: { hostedPageId: string; checkoutIntentId: string; tokenCount: number } | undefined;
    let wallet = 3;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "clerk_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
      createCheckout: async () => ({ checkoutUrl: "https://chargebee.test/hp_flow", hostedPageId: "hp_flow", checkoutIntentId: "intent_flow" }),
      createPaymentIntent: async input => { intent = { hostedPageId: input.hostedPageId, checkoutIntentId: input.checkoutIntentId, tokenCount: input.tokenCount }; },
      fulfillPayment: async input => { if (intent?.hostedPageId !== input.hostedPageId || intent?.checkoutIntentId !== input.passThruContent) return { status: "ignored" }; wallet += intent.tokenCount; return { status: "credited", tokenCount: intent.tokenCount }; },
    });
    const checkout = await request(app).post("/api/chargebee/checkout").send({ itemPriceId: "skipwait_token_1-INR", billingCountry: "IN", role: "job_seeker" });
    const intlCheckout = await request(app).post("/api/chargebee/checkout").send({ itemPriceId: "skipwait_token_1-USD", billingCountry: "INTL", role: "job_seeker" });
    const webhook = await request(app).post("/api/chargebee/webhook").set("Authorization", auth(secret)).send({ id: "ev_flow", event_type: "payment_succeeded", content: { payment: { amount: 9900, currency_code: "INR", hosted_page_id: "hp_flow" }, hosted_page: { pass_thru_content: "intent_flow" } } });
    expect(checkout.status).toBe(200);
    expect(intlCheckout.status).toBe(200);
    expect(checkout.body.checkoutUrl).toBe("https://chargebee.test/hp_flow");
    const rejectedCurrency = await request(app).post("/api/chargebee/checkout").send({ itemPriceId: "skipwait_token_1-USD", billingCountry: "IN", role: "job_seeker" });
    const rejectedInternationalInr = await request(app).post("/api/chargebee/checkout").send({ itemPriceId: "skipwait_token_1-INR", billingCountry: "INTL", role: "job_seeker" });
    expect(rejectedCurrency.status).toBe(400);
    expect(rejectedInternationalInr.status).toBe(400);
    expect(webhook.status).toBe(200);
    expect(webhook.body.result.status).toBe("credited");
    expect(wallet).toBe(4);
    delete process.env.CHARGEBEE_WEBHOOK_SECRET;
  });

  it("rejects unsigned payment delivery before any fulfillment call", async () => {
    const app = express();
    app.use(express.json());
    let called = false;
    registerChargebeeRoutes(app, { resolveIdentity: async () => undefined, createPaymentIntent: async () => undefined, fulfillPayment: async () => { called = true; return { status: "credited" }; } });
    const response = await request(app).post("/api/chargebee/webhook").send({ id: "ev_unsigned", event_type: "payment_succeeded", content: { payment: { amount: 9900, currency_code: "INR", hosted_page_id: "hp_test" } } });
    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  it("does not credit a paid event when the hosted page matches but pass-through intent does not", async () => {
    const app = express();
    app.use(express.json());
    const secret = "mismatch-secret";
    process.env.CHARGEBEE_WEBHOOK_SECRET = secret;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => undefined,
      createPaymentIntent: async () => undefined,
      fulfillPayment: async input => input.passThruContent === "expected_intent" ? { status: "credited" } : { status: "ignored", reason: "unknown_checkout" },
    });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth(secret)).send({ id: "ev_mismatch", event_type: "payment_succeeded", content: { payment: { amount: 9900, currency_code: "INR", hosted_page_id: "hp_test" }, hosted_page: { pass_thru_content: "wrong_intent" } } });
    expect(response.status).toBe(200);
    expect(response.body.result.status).toBe("ignored");
    delete process.env.CHARGEBEE_WEBHOOK_SECRET;
  });

  it("resolves a Chargebee v2 payment event through a verified successful hosted page before fulfillment", async () => {
    const app = express();
    app.use(express.json());
    const secret = "v2-flow-secret";
    process.env.CHARGEBEE_WEBHOOK_SECRET = secret;
    let resolved = 0;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => undefined,
      createPaymentIntent: async () => undefined,
      resolveHostedPage: async input => {
        resolved += 1;
        expect(input).toEqual({ invoiceId: "inv_v2", amount: 9900, currency: "INR" });
        return { hostedPageId: "hp_v2", invoiceId: "inv_v2", passThruContent: "intent_v2", amount: 9900, currency: "INR" };
      },
      fulfillPayment: async input => {
        expect(input).toMatchObject({ eventId: "ev_v2", invoiceId: "inv_v2", hostedPageId: "hp_v2", passThruContent: "intent_v2", amount: 9900, currency: "INR" });
        return { status: "credited", tokenCount: 1 };
      },
    });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth(secret)).send({ id: "ev_v2", event_type: "payment_succeeded", api_version: "v2", content: { transaction: { amount: 9900, currency_code: "INR" }, invoice: { id: "inv_v2", total: 9900, currency_code: "INR" } } });
    expect(response.status).toBe(200);
    expect(response.body.result.status).toBe("credited");
    expect(resolved).toBe(1);
    delete process.env.CHARGEBEE_WEBHOOK_SECRET;
  });
});

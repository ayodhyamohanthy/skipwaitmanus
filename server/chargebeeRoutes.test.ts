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
    const activity: Array<{ action: string; actorUserId?: number; metadata?: Record<string, unknown> }> = [];
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "clerk_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
      recordActivity: async input => { activity.push(input); },
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
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: 7, action: "billing.credit_checkout_started", metadata: expect.objectContaining({ currency: "INR", billingCountry: "IN", tokenCount: 1 }) }));
    delete process.env.CHARGEBEE_WEBHOOK_SECRET;
  });

  it("persists the requested whole-token quantity and rejects an invalid quantity before checkout", async () => {
    const app = express();
    app.use(express.json());
    let checkoutQuantity = 0;
    let paymentIntent: { tokenCount: number; amount: number; currency: string } | undefined;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "clerk_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
      createCheckout: async input => { checkoutQuantity = input.quantity ?? 1; return { checkoutUrl: "https://chargebee.test/hp_quantity", hostedPageId: "hp_quantity", checkoutIntentId: "intent_quantity" }; },
      createPaymentIntent: async input => { paymentIntent = { tokenCount: input.tokenCount, amount: input.amount, currency: input.currency }; },
      fulfillPayment: async () => ({ status: "credited" }),
    });
    const checkout = await request(app).post("/api/chargebee/checkout").send({ itemPriceId: "skipwait_token_1-INR", billingCountry: "IN", role: "job_seeker", quantity: 4 });
    expect(checkout.status).toBe(200);
    expect(checkoutQuantity).toBe(4);
    expect(paymentIntent).toEqual({ tokenCount: 4, amount: 39_600, currency: "INR" });
    expect((await request(app).post("/api/chargebee/checkout").send({ itemPriceId: "skipwait_token_1-INR", billingCountry: "IN", quantity: 1.5 })).status).toBe(400);
    expect((await request(app).post("/api/chargebee/checkout").send({ itemPriceId: "skipwait_token_1-INR", billingCountry: "IN", quantity: 1001 })).status).toBe(400);
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

  it("reports the selected runtime only for an explicit credential-free deployment diagnostic", async () => {
    const app = express();
    app.use(express.json());
    process.env.CHARGEBEE_LIVE_ENABLED = "true";
    process.env.CHARGEBEE_LIVE_DOMAIN = "skipwait.me";
    process.env.CHARGEBEE_LIVE_WEBHOOK_SECRET = "live-diagnostic-secret";
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => undefined,
      createPaymentIntent: async () => undefined,
      fulfillPayment: async () => ({ status: "credited" }),
    });

    const response = await request(app)
      .post("/api/chargebee/webhook")
      .set("Host", "bridgeref-ybuthfmw.manus.space")
      .set("X-Skipwait-Webhook-Diagnostic", "boundary")
      .set("Authorization", auth("live-diagnostic-secret"))
      .send({});

    expect(response.status).toBe(202);
    expect(response.header["x-skipwait-webhook-runtime"]).toBe("live");
    expect(response.header["x-skipwait-webhook-host"]).toBe("bridgeref-ybuthfmw.manus.space");
    delete process.env.CHARGEBEE_LIVE_ENABLED;
    delete process.env.CHARGEBEE_LIVE_DOMAIN;
    delete process.env.CHARGEBEE_LIVE_WEBHOOK_SECRET;
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

  it("reconciles a returning account’s own succeeded hosted page server-side and refuses a mismatched provider record", async () => {
    const app = express();
    app.use(express.json());
    const reviewReasons: string[] = [];
    let fulfilled = 0;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "clerk_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
      createPaymentIntent: async () => undefined,
      fulfillPayment: async input => { fulfilled += 1; expect(input).toMatchObject({ eventId: "hosted_page:hp_recovery", hostedPageId: "hp_recovery", passThruContent: "intent_recovery", amount: 9900, currency: "INR" }); return { status: "credited", tokenCount: 1 }; },
      getPaymentRecovery: async (_userId, _role, hostedPageId) => hostedPageId === "hp_recovery" ? { id: 41, status: "pending", hostedPageId, checkoutIntentId: "intent_recovery", tokenCount: 1, amount: 9900, currency: "INR", reconciliationReason: null } : { id: 42, status: "pending", hostedPageId, checkoutIntentId: "intent_expected", tokenCount: 1, amount: 9900, currency: "INR", reconciliationReason: null },
      retrieveHostedPage: async hostedPageId => hostedPageId === "hp_recovery" ? { hostedPageId, invoiceId: "inv_recovery", passThruContent: "intent_recovery", amount: 9900, currency: "INR" } : { hostedPageId, invoiceId: "inv_mismatch", passThruContent: "wrong_intent", amount: 9900, currency: "INR" },
      markPaymentForReview: async (_paymentId, reason) => { reviewReasons.push(reason); },
      getCreditSummary: async () => ({ totalAvailable: 4 }),
    });
    const recovered = await request(app).post("/api/chargebee/credit-recovery").send({ role: "job_seeker", hostedPageId: "hp_recovery" });
    const mismatched = await request(app).post("/api/chargebee/credit-recovery").send({ role: "job_seeker", hostedPageId: "hp_mismatch" });
    expect(recovered.status).toBe(200);
    expect(recovered.body).toMatchObject({ status: "credited", tokenCount: 1, summary: { totalAvailable: 4 } });
    expect(mismatched.status).toBe(200);
    expect(mismatched.body.status).toBe("requires_review");
    expect(fulfilled).toBe(1);
    expect(reviewReasons).toEqual(["provider_page_mismatch"]);
  });

  it("creates a Pro subscription checkout with the approved INR plan price and synchronizes its verified lifecycle event", async () => {
    const app = express();
    app.use(express.json());
    const secret = "subscription-flow-secret";
    process.env.CHARGEBEE_WEBHOOK_SECRET = secret;
    let storedIntent: Record<string, unknown> | undefined;
    let appliedEvent: Record<string, unknown> | undefined;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "clerk_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
      createPaymentIntent: async () => undefined,
      fulfillPayment: async () => ({ status: "credited" }),
      createSubscriptionCheckout: async input => { expect(input.plan).toBe("pro"); expect(input.currency).toBe("INR"); return { checkoutUrl: "https://chargebee.test/hp_pro", hostedPageId: "hp_pro", checkoutIntentId: "intent_pro" }; },
      createSubscriptionIntent: async input => { storedIntent = input; },
      applySubscriptionEvent: async input => { appliedEvent = input; return { status: "applied", plan: "pro" }; },
    });
    const checkout = await request(app).post("/api/chargebee/subscription-checkout").send({ plan: "pro", currency: "INR", billingCountry: "IN", role: "job_seeker" });
    const webhook = await request(app).post("/api/chargebee/webhook").set("Authorization", auth(secret)).send({ id: "ev_pro_active", event_type: "subscription_created", content: { hosted_page: { id: "hp_pro", pass_thru_content: "intent_pro" }, subscription: { id: "sub_pro_1", status: "active", currency_code: "INR", resource_version: 10, current_term_start: 1_786_900_000, current_term_end: 1_789_500_000, subscription_items: [{ item_price_id: "skipwait_pro_monthly-INR" }] } } });
    expect(checkout.status).toBe(200);
    expect(storedIntent).toMatchObject({ hostedPageId: "hp_pro", checkoutIntentId: "intent_pro", plan: "pro", itemPriceId: "skipwait_pro_monthly-INR", amount: 59_900, currency: "INR" });
    expect(webhook.status).toBe(200);
    expect(webhook.body.result).toMatchObject({ status: "applied", plan: "pro" });
    expect(appliedEvent).toMatchObject({ subscriptionId: "sub_pro_1", plan: "pro", status: "active", currency: "INR" });
    delete process.env.CHARGEBEE_WEBHOOK_SECRET;
  });

  it("only schedules end-of-term cancellation for the signed-in account’s own subscription", async () => {
    const app = express();
    app.use(express.json());
    let persisted: Record<string, unknown> | undefined;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "clerk_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
      createPaymentIntent: async () => undefined,
      fulfillPayment: async () => ({ status: "credited" }),
      getUserSubscription: async (userId, role) => { expect(userId).toBe(7); expect(role).toBe("job_seeker"); return { subscriptionId: "sub_owned", status: "active" }; },
      cancelSubscription: async input => { expect(input.subscriptionId).toBe("sub_owned"); return { status: "non_renewing", currentTermEnd: new Date("2026-09-18T00:00:00.000Z") }; },
      markSubscriptionNonRenewing: async (userId, role, subscriptionId) => { persisted = { userId, role, subscriptionId }; return { status: "non_renewing" }; },
    });
    const response = await request(app).post("/api/chargebee/subscription-cancel").send({ role: "job_seeker" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("non_renewing");
    expect(persisted).toEqual({ userId: 7, role: "job_seeker", subscriptionId: "sub_owned" });
  });
});

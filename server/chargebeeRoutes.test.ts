import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

function auth(secret: string) {
  return `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
}

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
  vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Chargebee checkout readiness", () => {
  it("does not create a provider page without subscription intent storage", async () => {
    const app = express(); app.use(express.json());
    const createSubscriptionCheckout = vi.fn();
    registerChargebeeRoutes(app, { resolveIdentity: async () => ({ account: { id: 7 } }), createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), createSubscriptionCheckout });
    const response = await request(app).post("/api/chargebee/subscription-checkout").send({ plan: "pro", currency: "USD", billingCountry: "INTL" });
    expect(response.status).toBe(503);
    expect(createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it.each(["IN", "INTL"])("prefills only the known country for the %s credit route", async billingCountry => {
    const app = express(); app.use(express.json());
    const createCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/tokens", hostedPageId: "hp_tokens", checkoutIntentId: "intent_tokens" }));
    registerChargebeeRoutes(app, { resolveIdentity: async () => ({ account: { id: 7 } }), createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), createCheckout });
    const response = await request(app).post("/api/chargebee/checkout").send({ itemPriceId: `skipwait_token_1-${billingCountry === "IN" ? "INR" : "USD"}`, billingCountry });
    expect(response.status).toBe(200);
    expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({ billingAddress: billingCountry === "IN" ? { country: "IN" } : undefined }));
  });

  it.each(["Bearer", "Cookie"])("passes %s identity through the subscription helper and stores its intent", async transport => {
    const provider = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const form = options?.body as URLSearchParams;
      return new Response(JSON.stringify({ hosted_page: { id: "hp_plan", url: "https://checkout.example/plan" } }), { status: form.get("subscription_items[item_price_id][0]") === "skipwait_pro_monthly-INR" ? 200 : 400 });
    });
    vi.stubGlobal("fetch", provider);
    const app = express(); app.use(express.json());
    const storeIntent = vi.fn();
    registerChargebeeRoutes(app, {
      resolveIdentity: async req => req.header(transport === "Bearer" ? "authorization" : "cookie") ? { account: { id: 7, email: "member@example.com" } } : undefined,
      createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), createSubscriptionIntent: storeIntent,
    });
    const response = await request(app).post("/api/chargebee/subscription-checkout").set(transport === "Bearer" ? "Authorization" : "Cookie", transport === "Bearer" ? "Bearer fixture-token" : "app_session_id=fixture-session").send({ plan: "pro", currency: "INR", billingCountry: "IN", role: "referrer" });
    expect(response.status).toBe(200);
    const form = provider.mock.calls[0][1]?.body as URLSearchParams;
    expect(form.get("billing_address[country]")).toBe("IN");
    expect(form.get("customer[email]")).toBe("member@example.com");
    expect(storeIntent).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, role: "referrer", hostedPageId: "hp_plan", checkoutIntentId: form.get("pass_thru_content"), amount: 59_900 }));
  });

  it.each(["/api/chargebee/checkout", "/api/chargebee/subscription-checkout"])("returns unavailable without provider access when configuration is missing at %s", async path => {
    vi.stubEnv("CHARGEBEE_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    const app = express(); app.use(express.json());
    registerChargebeeRoutes(app, { resolveIdentity: async () => ({ account: { id: 7 } }), createPaymentIntent: vi.fn(), createSubscriptionIntent: vi.fn(), fulfillPayment: vi.fn() });
    expect((await request(app).post(path).send({ itemPriceId: "skipwait_token_1-INR", plan: "pro", currency: "INR", billingCountry: "IN" })).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("Chargebee webhook route", () => {
  it.each(["test", "live"])("forwards the configured %s runtime regardless of request host", async environment => {
    vi.stubEnv("BILLING_ENV", environment);
    vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", "test-secret");
    vi.stubEnv("CHARGEBEE_LIVE_SITE", "fixture-live");
    vi.stubEnv("CHARGEBEE_LIVE_API_KEY", "live-key");
    vi.stubEnv("CHARGEBEE_LIVE_WEBHOOK_SECRET", "live-secret");
    const app = express(); app.use(express.json());
    const resolveHostedPage = vi.fn(async () => ({ hostedPageId: "hp_runtime", passThruContent: "intent_runtime", pageState: "succeeded", paid: true }));
    const fulfillPayment = vi.fn(async () => ({ status: "credited" }));
    registerChargebeeRoutes(app, { resolveIdentity: vi.fn(), createPaymentIntent: vi.fn(), resolveHostedPage, fulfillPayment });
    const payload = { id: "ev_runtime", event_type: "payment_succeeded", content: { transaction: { amount: 9900, currency_code: "INR" }, invoice: { id: "inv_runtime" } } };
    const response = await request(app).post("/api/chargebee/webhook").set("Host", "untrusted.example").set("Authorization", auth(`${environment}-secret`)).send(payload);
    expect(response.status).toBe(200);
    expect(resolveHostedPage).toHaveBeenCalledExactlyOnceWith({ invoiceId: "inv_runtime", amount: 9900, currency: "INR", site: environment === "live" ? "fixture-live" : "fixture-test", apiKey: environment === "live" ? "live-key" : "fixture-key" });
    expect(fulfillPayment).toHaveBeenCalledExactlyOnceWith({ eventId: "ev_runtime", invoiceId: "inv_runtime", amount: 9900, currency: "INR", hostedPageId: "hp_runtime", passThruContent: "intent_runtime" });
  });

  it("retries without test credential fallback when the configured live key is missing", async () => {
    vi.stubEnv("BILLING_ENV", "live");
    vi.stubEnv("CHARGEBEE_LIVE_SITE", "fixture-live");
    vi.stubEnv("CHARGEBEE_LIVE_API_KEY", "");
    vi.stubEnv("CHARGEBEE_LIVE_WEBHOOK_SECRET", "live-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express(); app.use(express.json());
    const resolveHostedPage = vi.fn(), fulfillPayment = vi.fn();
    registerChargebeeRoutes(app, { resolveIdentity: vi.fn(), createPaymentIntent: vi.fn(), resolveHostedPage, fulfillPayment });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth("live-secret")).send({ id: "ev_missing", event_type: "payment_succeeded", content: { transaction: { amount: 9900, currency_code: "INR" }, invoice: { id: "inv_missing" } } });
    expect(response.status).toBe(500);
    expect(resolveHostedPage).not.toHaveBeenCalled();
    expect(fulfillPayment).not.toHaveBeenCalled();
  });
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
      resolveIdentity: async () => ({ account: { id: 7, openId: "workos_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
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
      resolveIdentity: async () => ({ account: { id: 7, openId: "workos_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
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
    expect(response.body.result).toMatchObject({ status: "requires_review", reason: "unknown_checkout" }); // #77: never credited, now parked for review
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
        expect(input).toEqual({ invoiceId: "inv_v2", amount: 9900, currency: "INR", site: "fixture-test", apiKey: "fixture-key" });
        return { hostedPageId: "hp_v2", invoiceId: "inv_v2", passThruContent: "intent_v2", amount: 9900, currency: "INR", pageState: "succeeded", paid: true };
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
      resolveIdentity: async () => ({ account: { id: 7, openId: "workos_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
      createPaymentIntent: async () => undefined,
      fulfillPayment: async input => { fulfilled += 1; expect(input).toMatchObject({ eventId: "hosted_page:hp_recovery", hostedPageId: "hp_recovery", passThruContent: "intent_recovery", amount: 9900, currency: "INR" }); return { status: "credited", tokenCount: 1 }; },
      getPaymentRecovery: async (_userId, _role, hostedPageId) => hostedPageId === "hp_recovery" ? { id: 41, status: "pending", hostedPageId, checkoutIntentId: "intent_recovery", tokenCount: 1, amount: 9900, currency: "INR", reconciliationReason: null } : { id: 42, status: "pending", hostedPageId, checkoutIntentId: "intent_expected", tokenCount: 1, amount: 9900, currency: "INR", reconciliationReason: null },
      retrieveHostedPage: async hostedPageId => hostedPageId === "hp_recovery" ? { hostedPageId, invoiceId: "inv_recovery", passThruContent: "intent_recovery", amount: 9900, currency: "INR", pageState: "succeeded", invoiceStatus: "paid", paymentStatus: "paid", paid: true } : { hostedPageId, invoiceId: "inv_mismatch", passThruContent: "wrong_intent", amount: 9900, currency: "INR", pageState: "succeeded", invoiceStatus: "paid", paymentStatus: "paid", paid: true },
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

  it.each([
    ["matching unpaid", { pageState: "succeeded", invoiceStatus: "payment_due", paid: false }],
    ["cancelled", { pageState: "cancelled", invoiceStatus: "not_paid", paid: false }],
    ["failed", { pageState: "failed", invoiceStatus: "not_paid", paid: false }],
    ["completed page with unpaid invoice", { pageState: "succeeded", invoiceStatus: "not_paid", paid: false }],
  ])("keeps %s recovery pending without fulfillment", async (_label, providerState) => {
    const app = express(); app.use(express.json()); let fulfilled = 0;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "test" } }), createPaymentIntent: async () => undefined,
      getPaymentRecovery: async () => ({ id: 51, status: "pending", hostedPageId: "hp_unpaid", checkoutIntentId: "intent_unpaid", tokenCount: 1, amount: 9900, currency: "INR", reconciliationReason: null }),
      retrieveHostedPage: async () => ({ hostedPageId: "hp_unpaid", invoiceId: "inv_unpaid", passThruContent: "intent_unpaid", amount: 9900, currency: "INR", paymentStatus: "pending", ...providerState }),
      fulfillPayment: async () => { fulfilled += 1; return { status: "credited" }; },
    });
    const response = await request(app).post("/api/chargebee/credit-recovery").send({ role: "job_seeker", hostedPageId: "hp_unpaid" });
    expect(response.body.status).toBe("pending"); expect(fulfilled).toBe(0);
  });

  it("creates a Pro subscription checkout with the approved INR plan price and synchronizes its verified lifecycle event", async () => {
    const app = express();
    app.use(express.json());
    const secret = "subscription-flow-secret";
    process.env.CHARGEBEE_WEBHOOK_SECRET = secret;
    let storedIntent: Record<string, unknown> | undefined;
    let appliedEvent: Record<string, unknown> | undefined;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "workos_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
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

  it("processes both payment and subscription obligations in one delivery", async () => {
    const app = express(); app.use(express.json()); process.env.CHARGEBEE_WEBHOOK_SECRET = "mixed-secret";
    const calls: string[] = [];
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => undefined,
      createPaymentIntent: async () => undefined,
      applySubscriptionEvent: async () => { calls.push("subscription"); return { status: "applied" }; },
      fulfillPayment: async () => { calls.push("payment"); return { status: "credited" }; },
    });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth("mixed-secret")).send({
      id: "ev_mixed", event_type: "payment_succeeded",
      content: {
        transaction: { amount: 9900, currency_code: "INR", invoice_id: "inv_mixed" },
        invoice: { id: "inv_mixed", total: 9900, currency_code: "INR" },
        hosted_page: { id: "hp_mixed", pass_thru_content: "intent_mixed" },
        subscription: { id: "sub_mixed", status: "active", currency_code: "INR", resource_version: 12, subscription_items: [{ item_price_id: "skipwait_pro_monthly-INR" }] },
      },
    });
    expect(response.status).toBe(200);
    expect(calls).toEqual(["subscription", "payment"]);
    expect(response.body.obligations).toMatchObject({ subscription: { status: "applied" }, payment: { status: "credited" } });
    delete process.env.CHARGEBEE_WEBHOOK_SECRET;
  });

  it("does not acknowledge a mixed delivery when either obligation fails", async () => {
    const app = express(); app.use(express.json()); process.env.CHARGEBEE_WEBHOOK_SECRET = "mixed-fail-secret";
    let paymentCalls = 0;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => undefined,
      createPaymentIntent: async () => undefined,
      applySubscriptionEvent: async () => { throw new Error("db unavailable"); },
      fulfillPayment: async () => { paymentCalls += 1; return { status: "credited" }; },
    });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth("mixed-fail-secret")).send({
      id: "ev_mixed_fail", event_type: "payment_succeeded",
      content: { transaction: { amount: 9900, currency_code: "INR" }, subscription: { id: "sub_mixed", status: "active", subscription_items: [{ item_price_id: "skipwait_pro_monthly-INR" }] } },
    });
    expect(response.status).toBe(500);
    expect(paymentCalls).toBe(0);
    delete process.env.CHARGEBEE_WEBHOOK_SECRET;
  });

  it("only schedules end-of-term cancellation for the signed-in account’s own subscription", async () => {
    const app = express();
    app.use(express.json());
    let persisted: Record<string, unknown> | undefined;
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "workos_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } }),
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

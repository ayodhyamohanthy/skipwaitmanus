import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRER_PURCHASES_ENABLED } from "../shared/referrerPurchases";
import { registerChargebeeRoutes } from "./chargebeeRoutes";
// These cases test selling passes, so they run with pass sales on; the shipped
// off state (D-084) is pinned in server/passSalesSwitch.test.ts.
vi.mock("../shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("../shared/planCatalog")>()), PASS_SALES_ENABLED: true }));

/*
 * D-055 follow-up (D-067 lane): referrers never pay. Every referrer-role
 * purchase is refused first, with plain words and a denied activity row,
 * before any availability probe, provider call or checkout intent. Payments
 * started before the switch-off keep recovering, crediting and cancelling.
 * Synthetic fixtures only: no provider is ever reached.
 */

type Activity = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> };

const REFUSAL = { error: "Referrers never pay on skipwait.me. Nothing has been charged.", code: "referrers_never_pay" };

function auth(secret: string) {
  return `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
}

/** Every dependency that could probe, call Chargebee or write an intent, as a spy. */
function harness(options: { signedIn?: boolean; withIntentStores?: boolean } = {}) {
  const app = express(); app.use(express.json());
  const activity: Activity[] = [];
  const spies = {
    isAvailable: vi.fn(() => true),
    createPackCheckout: vi.fn(async () => ({ checkoutUrl: "https://checkout.example/pack", hostedPageId: "hp_pack" })),
    createPlanCheckout: vi.fn(async () => ({ checkoutUrl: "https://checkout.example/plan", hostedPageId: "hp_plan" })),
    newCheckoutIntentId: vi.fn(() => "intent_fixture"),
    createCheckout: vi.fn(async () => ({ checkoutUrl: "https://checkout.example/tokens", hostedPageId: "hp_tokens", checkoutIntentId: "intent_tokens" })),
    createPaymentIntent: vi.fn(async () => undefined),
    createSubscriptionIntent: vi.fn(async () => undefined),
    fulfillPayment: vi.fn(async () => ({ status: "credited" })),
  };
  registerChargebeeRoutes(app, {
    resolveIdentity: async () => (options.signedIn === false ? undefined : { account: { id: 7, email: "referrer@acme.com", name: "Riya Referrer" } }),
    recordActivity: async input => { activity.push(input); },
    createCheckout: spies.createCheckout,
    createPaymentIntent: spies.createPaymentIntent,
    fulfillPayment: spies.fulfillPayment,
    ...(options.withIntentStores === false ? {} : { createSubscriptionIntent: spies.createSubscriptionIntent }),
    kitCheckout: { isAvailable: spies.isAvailable, createPackCheckout: spies.createPackCheckout, createPlanCheckout: spies.createPlanCheckout, newCheckoutIntentId: spies.newCheckoutIntentId },
  });
  return { app, activity, spies };
}

const PURCHASES = [
  { label: "a kit credit pack", path: "/api/chargebee/checkout", body: { packId: "pack_25", billingCountry: "INTL" }, action: "billing.credit_checkout_refused" },
  { label: "the per-credit token checkout", path: "/api/chargebee/checkout", body: { itemPriceId: "skipwait_token_1-INR", billingCountry: "IN", quantity: 3 }, action: "billing.credit_checkout_refused" },
  { label: "a kit pass", path: "/api/chargebee/subscription-checkout", body: { planId: "start", interval: "30d", currency: "USD", billingCountry: "INTL" }, action: "billing.subscription_checkout_refused" },
  { label: "Keep warm yearly", path: "/api/chargebee/subscription-checkout", body: { planId: "keep_warm", interval: "yearly", currency: "INR", billingCountry: "IN" }, action: "billing.subscription_checkout_refused" },
] as const;

let provider: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
  provider = vi.fn(async () => { throw new Error("no provider call is allowed in this test"); });
  vi.stubGlobal("fetch", provider);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function expectNothingStarted(spies: ReturnType<typeof harness>["spies"]) {
  for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
}

describe("referrer purchases are switched off (D-055, D-042)", () => {
  it("ships with referrer purchases off", () => {
    expect(REFERRER_PURCHASES_ENABLED).toBe(false);
  });

  it.each(PURCHASES)("refuses $label for the referrer role with 403 and plain words, before any probe, provider call or intent", async ({ path, body, action }) => {
    const { app, activity, spies } = harness();
    const response = await request(app).post(path).send({ ...body, role: "referrer" });
    expect(response.status).toBe(403);
    expect(response.body).toEqual(REFUSAL);
    expectNothingStarted(spies);
    expect(activity).toEqual([expect.objectContaining({ actorUserId: 7, action, outcome: "denied", metadata: { reason: "referrers_never_pay", role: "referrer" } })]);
  });

  it.each([
    ["/api/chargebee/subscription-checkout", { plan: "pro", currency: "USD", billingCountry: "INTL" }],
    ["/api/chargebee/subscription-checkout", { planId: "nope" }],
    ["/api/chargebee/checkout", { itemPriceId: "not-a-pack" }],
    ["/api/chargebee/checkout", {}],
  ])("refuses the referrer role first at %s, whatever else the body says", async (path, body) => {
    const { app, spies } = harness();
    const response = await request(app).post(path).send({ ...body, role: "referrer" });
    expect(response.status).toBe(403);
    expect(response.body).toEqual(REFUSAL);
    expectNothingStarted(spies);
  });

  it("refuses before the configuration checks, so a referrer never sees 'not configured'", async () => {
    vi.stubEnv("CHARGEBEE_API_KEY", "");
    const { app, spies } = harness({ withIntentStores: false });
    for (const { path, body } of PURCHASES) {
      const response = await request(app).post(path).send({ ...body, role: "referrer" });
      expect(response.status, path).toBe(403);
      expect(response.body).toEqual(REFUSAL);
    }
    expectNothingStarted(spies);
  });

  it("asks a signed-out visitor to sign in and starts nothing", async () => {
    const { app, activity, spies } = harness({ signedIn: false });
    for (const { path, body } of PURCHASES) expect((await request(app).post(path).send({ ...body, role: "referrer" })).status).toBe(401);
    expectNothingStarted(spies);
    expect(activity).toEqual([]);
  });

  it.each([{ role: "job_seeker" }, {}])("still opens every checkout for the seeker role (%o), so a seeker who is also a referrer can buy", async roleField => {
    const { app, spies } = harness();
    for (const { label, path, body } of PURCHASES) {
      const response = await request(app).post(path).send({ ...body, ...roleField });
      // D-036 (GO-LIVE-1): with packs on sale (the harness stubs every price available), the
      // legacy per-credit checkout is retired for everyone, seeker included - never a provider call.
      if (label === "the per-credit token checkout") {
        expect(response.status, path).toBe(410);
        expect(response.body.code).toBe("single_credit_retired");
        continue;
      }
      expect(response.status, path).toBe(200);
      expect(typeof response.body.checkoutUrl).toBe("string");
    }
    expect(spies.createPaymentIntent).toHaveBeenCalledTimes(1);
    expect(spies.createSubscriptionIntent).toHaveBeenCalledTimes(2);
    for (const [intent] of [...spies.createPaymentIntent.mock.calls, ...spies.createSubscriptionIntent.mock.calls]) expect(intent).toMatchObject({ userId: 7, role: "job_seeker" });
  });
});

describe("a referrer payment started before the switch-off keeps working (control)", () => {
  it("recovers and credits a pending referrer checkout on return", async () => {
    const app = express(); app.use(express.json());
    const fulfillPayment = vi.fn(async () => ({ status: "credited" }));
    const getPaymentRecovery = vi.fn(async () => ({ id: 61, status: "pending" as const, hostedPageId: "hp_ref", checkoutIntentId: "intent_ref", tokenCount: 2, amount: 9900, currency: "INR", reconciliationReason: null }));
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7 } }),
      createPaymentIntent: vi.fn(),
      fulfillPayment,
      getPaymentRecovery,
      retrieveHostedPage: async hostedPageId => ({ hostedPageId, invoiceId: "inv_ref", passThruContent: "intent_ref", amount: 9900, currency: "INR", pageState: "succeeded", invoiceStatus: "paid", paymentStatus: "paid", paid: true }),
      getCreditSummary: async () => ({ totalAvailable: 5 }),
    });
    const response = await request(app).post("/api/chargebee/credit-recovery").send({ role: "referrer", hostedPageId: "hp_ref" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "credited", tokenCount: 2, summary: { totalAvailable: 5 } });
    expect(getPaymentRecovery).toHaveBeenCalledWith(7, "referrer", "hp_ref");
    expect(fulfillPayment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ hostedPageId: "hp_ref", passThruContent: "intent_ref", amount: 9900, currency: "INR" }));
  });

  it("credits a referrer intent from the paid webhook, which never reads a body role", async () => {
    vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", "referrer-secret");
    const app = express(); app.use(express.json());
    const fulfillPayment = vi.fn(async () => ({ status: "credited", tokenCount: 1, userId: 7, role: "referrer" }));
    registerChargebeeRoutes(app, { resolveIdentity: async () => undefined, createPaymentIntent: vi.fn(), fulfillPayment });
    const payload = { id: "ev_ref_paid", event_type: "payment_succeeded", content: { payment: { amount: 9900, currency_code: "INR", hosted_page_id: "hp_ref", invoice_id: "inv_ref" }, hosted_page: { pass_thru_content: "intent_ref" } } };
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth("referrer-secret")).send(payload);
    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ status: "credited", role: "referrer" });
    expect(fulfillPayment).toHaveBeenCalledTimes(1);
  });

  it("still schedules a referrer subscription's cancellation", async () => {
    const app = express(); app.use(express.json());
    const cancelSubscription = vi.fn(async () => ({ status: "non_renewing", currentTermEnd: new Date("2026-11-05T00:00:00Z") }));
    const markSubscriptionNonRenewing = vi.fn(async () => undefined);
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7 } }),
      createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(),
      getUserSubscription: async (_userId, role) => (role === "referrer" ? { subscriptionId: "sub_ref", status: "active" } : undefined),
      cancelSubscription, markSubscriptionNonRenewing,
    });
    const response = await request(app).post("/api/chargebee/subscription-cancel").send({ role: "referrer" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("non_renewing");
    expect(cancelSubscription).toHaveBeenCalledExactlyOnceWith({ subscriptionId: "sub_ref" });
    expect(markSubscriptionNonRenewing).toHaveBeenCalledWith(7, "referrer", "sub_ref", new Date("2026-11-05T00:00:00Z"));
  });
});

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";
import { startKitPackCheckout, startKitPlanCheckout } from "./kitCheckout";
import { NOT_AVAILABLE_CODE } from "../shared/subscriptionManagement";
import type { CatalogPrice } from "../shared/billingCatalog";
// These cases test selling passes, so they run with pass sales on; the shipped
// off state (D-084) is pinned in server/passSalesSwitch.test.ts.
vi.mock("../shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("../shared/planCatalog")>()), PASS_SALES_ENABLED: true }));

const req = { hostname: "skipwait.me", protocol: "https", get: () => "skipwait.me" } as unknown as Parameters<typeof startKitPlanCheckout>[0]["req"];
const urls = { redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled" };
const nothingLive = () => false;

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
});

describe("kit plan checkout decision", () => {
  it("charges the catalog item price for the term and never a client amount", async () => {
    const createPlanCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/plan", hostedPageId: "hp_plan" }));
    const seen: CatalogPrice[] = [];
    const started = await startKitPlanCheckout({
      req,
      request: { planId: "momentum", interval: "90d", currency: "INR", billingCountry: "IN", role: "job_seeker" },
      customer: { email: "member@example.com", billingCountry: "IN" },
      urls,
      deps: { isAvailable: (_req, price) => { seen.push(price); return true; }, createPlanCheckout, newCheckoutIntentId: () => "intent_kit" },
    });
    expect(started).toMatchObject({ ok: true, checkoutIntentId: "intent_kit", price: { plan: "momentum", interval: "90d", currency: "INR", amount: 249_900, itemPriceId: "skipwait_momentum_90d-INR" } });
    expect(seen).toEqual([expect.objectContaining({ itemPriceId: "skipwait_momentum_90d-INR" })]);
    expect(createPlanCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ itemPriceId: "skipwait_momentum_90d-INR", checkoutIntentId: "intent_kit", redirectUrl: urls.redirectUrl, email: "member@example.com", billingCountry: "IN" }));
  });

  it("refuses a by-application plan (Land Concierge) with 403 before any availability or provider call", async () => {
    const createPlanCheckout = vi.fn();
    const isAvailable = vi.fn(() => true);
    for (const [interval, currency] of [["30d", "USD"], ["30d", "INR"], ["90d", "USD"], ["90d", "INR"]] as const) {
      const started = await startKitPlanCheckout({
        req,
        request: { planId: "land_concierge", interval, currency, billingCountry: currency === "INR" ? "IN" : "INTL", role: "job_seeker" },
        customer: {}, urls, deps: { isAvailable, createPlanCheckout },
      });
      expect(started).toMatchObject({ ok: false, status: 403, code: "application_required" });
    }
    expect(isAvailable).not.toHaveBeenCalled();
    expect(createPlanCheckout).not.toHaveBeenCalled();
  });

  it("refuses an item price that is not live yet with the code the UI branches on, before any provider call", async () => {
    const createPlanCheckout = vi.fn();
    const started = await startKitPlanCheckout({
      req,
      request: { planId: "start", interval: "30d", currency: "USD", billingCountry: "INTL", role: "job_seeker" },
      customer: {}, urls, deps: { isAvailable: nothingLive, createPlanCheckout },
    });
    expect(started).toEqual({ ok: false, status: 409, code: NOT_AVAILABLE_CODE, error: "Start is not on sale yet. Nothing has been charged." });
    expect(createPlanCheckout).not.toHaveBeenCalled();
  });

  it("refuses a term the plan does not sell", async () => {
    const started = await startKitPlanCheckout({
      req,
      request: { planId: "start", interval: "yearly", currency: "USD", billingCountry: "INTL", role: "job_seeker" },
      customer: {}, urls, deps: { isAvailable: () => true },
    });
    expect(started).toMatchObject({ ok: false, status: 400 });
  });

  it("answers 'payments unavailable' rather than opening a page when billing is not configured", async () => {
    vi.stubEnv("CHARGEBEE_API_KEY", "");
    const started = await startKitPlanCheckout({
      req, request: { planId: "keep_warm", interval: "yearly", currency: "USD", billingCountry: "INTL", role: "job_seeker" },
      customer: {}, urls, deps: { isAvailable: () => true },
    });
    expect(started).toMatchObject({ ok: false, status: 503 });
  });

  it("says payments are unavailable, not 'not on sale yet', when the provider cannot be asked", async () => {
    const createPlanCheckout = vi.fn();
    const failed = await startKitPlanCheckout({
      req, request: { planId: "momentum", interval: "90d", currency: "INR", billingCountry: "IN", role: "job_seeker" },
      customer: {}, urls,
      deps: { lookup: async () => { throw new Error("Chargebee down"); }, createPlanCheckout },
    });
    expect(failed).toEqual({ ok: false, status: 503, error: "Payments are not available right now. Please try again in a moment." });

    // A provider that never answers is bounded too, and charges nothing.
    const hung = await startKitPlanCheckout({
      req, request: { planId: "momentum", interval: "90d", currency: "INR", billingCountry: "IN", role: "job_seeker" },
      customer: {}, urls,
      deps: { probeTimeoutMs: 40, lookup: () => new Promise(() => {}), createPlanCheckout },
    });
    expect(hung).toMatchObject({ ok: false, status: 503 });
    expect(createPlanCheckout).not.toHaveBeenCalled();
  });
});

describe("kit credit pack checkout decision", () => {
  it("sells the pack for the requesting region's currency at the catalog amount", async () => {
    const createPackCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/pack", hostedPageId: "hp_pack" }));
    const india = await startKitPackCheckout({
      req, request: { packId: "pack_25", billingCountry: "IN", role: "job_seeker" }, customer: { billingCountry: "IN" }, urls,
      deps: { isAvailable: () => true, createPackCheckout, newCheckoutIntentId: () => "intent_pack" },
    });
    expect(india).toMatchObject({ ok: true, price: { packId: "pack_25", credits: 25, currency: "INR", amount: 119_900, itemPriceId: "skipwait_pack_25-INR" } });
    expect(createPackCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ itemPriceId: "skipwait_pack_25-INR", currency: "INR" }));

    const globally = await startKitPackCheckout({
      req, request: { packId: "pack_5", billingCountry: "INTL", role: "job_seeker" }, customer: {}, urls,
      deps: { isAvailable: () => true, createPackCheckout, newCheckoutIntentId: () => "intent_pack" },
    });
    expect(globally).toMatchObject({ ok: true, price: { packId: "pack_5", credits: 5, currency: "USD", amount: 500 } });
  });

  it("refuses a pack whose item price is not live", async () => {
    const createPackCheckout = vi.fn();
    const started = await startKitPackCheckout({
      req, request: { packId: "pack_150", billingCountry: "INTL", role: "job_seeker" }, customer: {}, urls,
      deps: { isAvailable: nothingLive, createPackCheckout },
    });
    expect(started).toMatchObject({ ok: false, status: 409, code: NOT_AVAILABLE_CODE });
    expect(createPackCheckout).not.toHaveBeenCalled();
  });
});

describe("kit checkout over the two money routes", () => {
  function app(deps: Record<string, unknown>) {
    const instance = express(); instance.use(express.json());
    registerChargebeeRoutes(instance, { resolveIdentity: async () => ({ account: { id: 7, email: "member@example.com", name: "Member One" } }), createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), ...deps } as never);
    return instance;
  }

  it("stores the pass intent with its plan, term and catalog amount", async () => {
    const createSubscriptionIntent = vi.fn();
    const createPlanCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/plan", hostedPageId: "hp_plan" }));
    const response = await request(app({ createSubscriptionIntent, kitCheckout: { isAvailable: () => true, createPlanCheckout, newCheckoutIntentId: () => "intent_kit" } }))
      .post("/api/chargebee/subscription-checkout")
      .send({ planId: "land_focus", interval: "30d", currency: "INR", billingCountry: "IN", role: "job_seeker" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ checkoutUrl: "https://checkout.example/plan", hostedPageId: "hp_plan" });
    expect(createSubscriptionIntent).toHaveBeenCalledWith({
      hostedPageId: "hp_plan", checkoutIntentId: "intent_kit", userId: 7, role: "job_seeker",
      plan: "land_focus", itemPriceId: "skipwait_land_focus_30d-INR", amount: 599_900, currency: "INR", billingPeriod: "30d", kind: "new",
    });
  });

  it("answers 409 not_available_yet without a provider call or an intent", async () => {
    const createSubscriptionIntent = vi.fn();
    const createPlanCheckout = vi.fn();
    const response = await request(app({ createSubscriptionIntent, kitCheckout: { isAvailable: nothingLive, createPlanCheckout } }))
      .post("/api/chargebee/subscription-checkout")
      .send({ planId: "momentum", interval: "30d", currency: "USD", billingCountry: "INTL" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Momentum is not on sale yet. Nothing has been charged.", code: NOT_AVAILABLE_CODE });
    expect(createPlanCheckout).not.toHaveBeenCalled();
    expect(createSubscriptionIntent).not.toHaveBeenCalled();
  });

  it("refuses a currency that does not match the billing country before anything else", async () => {
    const createSubscriptionIntent = vi.fn();
    const response = await request(app({ createSubscriptionIntent, kitCheckout: { isAvailable: () => true } }))
      .post("/api/chargebee/subscription-checkout")
      .send({ planId: "momentum", interval: "30d", currency: "USD", billingCountry: "IN" });
    expect(response.status).toBe(400);
    expect(response.body.error).not.toMatch(/\bPro\b|\bMax\b/);
    expect(createSubscriptionIntent).not.toHaveBeenCalled();
  });

  it("stores a kit pack intent as credits, not as a legacy token pack", async () => {
    const createPaymentIntent = vi.fn();
    const createPackCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/pack", hostedPageId: "hp_pack" }));
    const response = await request(app({ createPaymentIntent, kitCheckout: { isAvailable: () => true, createPackCheckout, newCheckoutIntentId: () => "intent_pack" } }))
      .post("/api/chargebee/checkout")
      .send({ packId: "pack_60", billingCountry: "IN" });
    expect(response.status).toBe(200);
    expect(createPaymentIntent).toHaveBeenCalledWith({ hostedPageId: "hp_pack", checkoutIntentId: "intent_pack", userId: 7, role: "job_seeker", tokenCount: 60, amount: 259_900, currency: "INR" });
  });

  // D-067: Pro and Max are removed completely. An old client that still sends the
  // pre-kit body is refused before any availability probe, provider call or intent.
  it.each([
    ["pro", "INR", "IN"],
    ["pro", "USD", "INTL"],
    ["max", "INR", "IN"],
    ["max", "USD", "INTL"],
  ] as const)("refuses the retired %s body (%s) with 410 plan_retired before any provider call or intent", async (plan, currency, billingCountry) => {
    const createSubscriptionIntent = vi.fn();
    const createSubscriptionCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/legacy", hostedPageId: "hp_legacy", checkoutIntentId: "intent_legacy" }));
    const isAvailable = vi.fn(() => true);
    const createPlanCheckout = vi.fn();
    const recordActivity = vi.fn(async () => undefined);
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    const response = await request(app({ createSubscriptionIntent, createSubscriptionCheckout, recordActivity, kitCheckout: { isAvailable, createPlanCheckout } }))
      .post("/api/chargebee/subscription-checkout")
      .send({ plan, currency, billingCountry });
    expect(response.status).toBe(410);
    expect(response.body).toEqual({ error: "That plan is no longer sold. Nothing has been charged.", code: "plan_retired" });
    expect(createSubscriptionCheckout).not.toHaveBeenCalled();
    expect(createSubscriptionIntent).not.toHaveBeenCalled();
    expect(isAvailable).not.toHaveBeenCalled();
    expect(createPlanCheckout).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalledWith(expect.objectContaining({ action: "billing.subscription_checkout_started" }));
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7, action: "billing.subscription_checkout_refused", outcome: "denied", metadata: expect.objectContaining({ reason: "plan_retired", plan }) }));
    vi.unstubAllGlobals();
  });

  it("refuses a body that is neither a kit plan nor a retired plan with a plain 400 and no intent", async () => {
    const createSubscriptionIntent = vi.fn();
    const createPlanCheckout = vi.fn();
    const response = await request(app({ createSubscriptionIntent, kitCheckout: { isAvailable: () => true, createPlanCheckout } }))
      .post("/api/chargebee/subscription-checkout")
      .send({ plan: "free", currency: "USD", billingCountry: "INTL" });
    expect(response.status).toBe(400);
    expect(response.body.error).not.toMatch(/\bPro\b|\bMax\b/);
    expect(createPlanCheckout).not.toHaveBeenCalled();
    expect(createSubscriptionIntent).not.toHaveBeenCalled();
  });
});

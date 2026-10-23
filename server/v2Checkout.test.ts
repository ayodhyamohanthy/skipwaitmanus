import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";
import { startV2PackCheckout, startV2PlanCheckout } from "./v2Checkout";
import { NOT_AVAILABLE_CODE } from "../shared/subscriptionManagement";
import type { CatalogPrice } from "../shared/billingCatalog";

const req = { hostname: "skipwait.me", protocol: "https", get: () => "skipwait.me" } as unknown as Parameters<typeof startV2PackCheckout>[0]["req"];
const urls = { redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled" };

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
  vi.stubEnv("PLAN_FAMILY_V2", "true");
});

describe("D-132 plan family checkout decision", () => {
  it("refuses everything while PLAN_FAMILY_V2 is off, before any probe or provider call", async () => {
    vi.stubEnv("PLAN_FAMILY_V2", "false");
    const isAvailable = vi.fn(() => true);
    const createPackCheckout = vi.fn();
    const pack = await startV2PackCheckout({ req, request: { v2Rung: 25, billingCountry: "IN", role: "job_seeker" }, customer: {}, urls, deps: { isAvailable, createPackCheckout } });
    expect(pack).toMatchObject({ ok: false, status: 404 });
    const plan = await startV2PlanCheckout({ req, request: { v2Plan: "fast_track", v2Rung: 0, currency: "INR", billingCountry: "IN", role: "job_seeker" }, customer: {}, urls, deps: { isAvailable } });
    expect(plan).toMatchObject({ ok: false, status: 404 });
    expect(isAvailable).not.toHaveBeenCalled();
    expect(createPackCheckout).not.toHaveBeenCalled();
  });

  it("sells a one-time top-up pack at the frozen ladder amount, never a client price", async () => {
    const createPackCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/pack", hostedPageId: "hp_pack" }));
    const seen: CatalogPrice[] = [];
    const started = await startV2PackCheckout({
      req,
      request: { v2Rung: 25, billingCountry: "IN", role: "job_seeker" },
      customer: { email: "member@example.com", billingCountry: "IN" },
      urls,
      deps: { isAvailable: (_req, price) => { seen.push(price); return true; }, createPackCheckout, newCheckoutIntentId: () => "intent_v2pack" },
    });
    expect(started).toMatchObject({ ok: true, credits: 25, amount: 112_500, currency: "INR", itemPriceId: "skipwait_v2pack_25-INR", checkoutIntentId: "intent_v2pack" });
    expect(seen).toEqual([expect.objectContaining({ itemPriceId: "skipwait_v2pack_25-INR", amount: 112_500, currency: "INR" })]);
    expect(createPackCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ itemPriceId: "skipwait_v2pack_25-INR", currency: "INR", checkoutIntentId: "intent_v2pack" }));
  });

  it("refuses a pack whose item price is not live yet, before any provider call", async () => {
    const createPackCheckout = vi.fn();
    const started = await startV2PackCheckout({ req, request: { v2Rung: 5, billingCountry: "INTL", role: "job_seeker" }, customer: {}, urls, deps: { isAvailable: () => false, createPackCheckout } });
    expect(started).toEqual({ ok: false, status: 409, code: NOT_AVAILABLE_CODE, error: "The 5-credit pack is not on sale yet. Nothing has been charged." });
    expect(createPackCheckout).not.toHaveBeenCalled();
  });

  it("sells Fast Track as a renewing bundle: plan fee + picked rung, one monthly total", async () => {
    const createBundleCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/plan", hostedPageId: "hp_plan" }));
    const seen: CatalogPrice[] = [];
    const started = await startV2PlanCheckout({
      req,
      request: { v2Plan: "fast_track", v2Rung: 25, currency: "INR", billingCountry: "IN", role: "job_seeker" },
      customer: { email: "member@example.com", billingCountry: "IN" },
      urls,
      deps: { isAvailable: (_req, price) => { seen.push(price); return true; }, createBundleCheckout, newCheckoutIntentId: () => "intent_v2plan" },
    });
    expect(started).toMatchObject({ ok: true, plan: "fast_track", rung: 25, amount: 49_900 + 112_500, currency: "INR", planItemPriceId: "skipwait_v2plan_fast_track-INR", creditsItemPriceId: "skipwait_v2credits_25-INR" });
    expect(seen.map(price => price.itemPriceId)).toEqual(["skipwait_v2plan_fast_track-INR", "skipwait_v2credits_25-INR"]);
    expect(createBundleCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ planItemPriceId: "skipwait_v2plan_fast_track-INR", creditsItemPriceId: "skipwait_v2credits_25-INR", checkoutIntentId: "intent_v2plan" }));
  });

  it("sells the plan fee alone when no rung is picked", async () => {
    const createBundleCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/plan", hostedPageId: "hp_plan" }));
    const started = await startV2PlanCheckout({ req, request: { v2Plan: "fast_track", v2Rung: 0, currency: "USD", billingCountry: "INTL", role: "job_seeker" }, customer: {}, urls, deps: { isAvailable: () => true, createBundleCheckout } });
    expect(started).toMatchObject({ ok: true, amount: 999, currency: "USD", creditsItemPriceId: undefined });
    expect(createBundleCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ planItemPriceId: "skipwait_v2plan_fast_track-USD", creditsItemPriceId: undefined }));
  });

  it("refuses Insider (by application, D-132) with 403 before any availability or provider call", async () => {
    const createBundleCheckout = vi.fn();
    const isAvailable = vi.fn(() => true);
    const started = await startV2PlanCheckout({ req, request: { v2Plan: "insider", v2Rung: 50, currency: "INR", billingCountry: "IN", role: "job_seeker" }, customer: {}, urls, deps: { isAvailable, createBundleCheckout } });
    expect(started).toMatchObject({ ok: false, status: 403, code: "application_required" });
    expect(isAvailable).not.toHaveBeenCalled();
    expect(createBundleCheckout).not.toHaveBeenCalled();
  });
});

describe("D-132 checkout over the two money routes", () => {
  function app(deps: Record<string, unknown>) {
    const instance = express(); instance.use(express.json());
    registerChargebeeRoutes(instance, { resolveIdentity: async () => ({ account: { id: 7, email: "member@example.com", name: "Member One" } }), createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), ...deps } as never);
    return instance;
  }

  it("stores the pack intent with the rung credits and frozen amount", async () => {
    const createPaymentIntent = vi.fn();
    const createPackCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/pack", hostedPageId: "hp_pack" }));
    const response = await request(app({ createPaymentIntent, v2Checkout: { isAvailable: () => true, createPackCheckout, newCheckoutIntentId: () => "intent_v2pack" } }))
      .post("/api/chargebee/checkout")
      .send({ v2Rung: 200, billingCountry: "INTL", role: "job_seeker" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ checkoutUrl: "https://checkout.example/pack", hostedPageId: "hp_pack" });
    expect(createPaymentIntent).toHaveBeenCalledWith({ hostedPageId: "hp_pack", checkoutIntentId: "intent_v2pack", userId: 7, role: "job_seeker", tokenCount: 200, amount: 16_000, currency: "USD" });
  });

  it("stores the plan intent as monthly with the bundle total", async () => {
    const createSubscriptionIntent = vi.fn();
    const createBundleCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/plan", hostedPageId: "hp_plan" }));
    const response = await request(app({ createSubscriptionIntent, v2Checkout: { isAvailable: () => true, createBundleCheckout, newCheckoutIntentId: () => "intent_v2plan" } }))
      .post("/api/chargebee/subscription-checkout")
      .send({ v2Plan: "fast_track", v2Rung: 10, currency: "INR", billingCountry: "IN", role: "job_seeker" });
    expect(response.status).toBe(200);
    expect(createSubscriptionIntent).toHaveBeenCalledWith(expect.objectContaining({ plan: "fast_track", itemPriceId: "skipwait_v2plan_fast_track-INR", amount: 49_900 + 47_000, currency: "INR", billingPeriod: "monthly", kind: "new" }));
  });

  it("refuses a referrer before any D-132 arm runs (D-055)", async () => {
    const isAvailable = vi.fn(() => true);
    const createPackCheckout = vi.fn();
    const response = await request(app({ createPaymentIntent: vi.fn(), v2Checkout: { isAvailable, createPackCheckout } }))
      .post("/api/chargebee/checkout")
      .send({ v2Rung: 25, billingCountry: "IN", role: "referrer" });
    expect(response.status).toBe(403);
    expect(isAvailable).not.toHaveBeenCalled();
    expect(createPackCheckout).not.toHaveBeenCalled();
  });
});

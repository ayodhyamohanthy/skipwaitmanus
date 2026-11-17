// P0 (CEO, Oct 20, D-084): a paid kit pass activates only when the
// subscription webhook names its checkout page, and nothing recovers it when
// it does not, so passes and Keep warm are listed but never sold until
// GO-LIVE-1b can always activate one. Credit packs keep selling.
import { describe, expect, it, vi } from "vitest";
import { PASS_SALES_ENABLED } from "../shared/planCatalog";
import { planCatalogResponse } from "../shared/billingCatalog";
import { startKitPackCheckout, startKitPlanCheckout } from "./kitCheckout";
import { NOT_AVAILABLE_CODE } from "../shared/subscriptionManagement";

const req = { hostname: "skipwait.me", protocol: "https", get: () => "skipwait.me" } as unknown as Parameters<typeof startKitPlanCheckout>[0]["req"];
const urls = { redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled" };
const customer = { email: "member@example.com", billingCountry: "INTL" as const };
const everythingLive = () => true;

describe("passes are listed but not sold until a paid pass can always be activated (D-084)", () => {
  it("ships with pass sales off", () => {
    expect(PASS_SALES_ENABLED).toBe(false);
  });

  it("the catalog reports every pass and Keep warm term unavailable even when its price is live, and packs stay on sale", () => {
    for (const region of ["IN", "INTL"] as const) {
      const catalog = planCatalogResponse({ region, available: everythingLive, usdRecurringConfirmed: false, sessionsStaffed: false, indiaGstRegistered: false });
      expect(catalog.plans.length).toBeGreaterThan(0);
      expect(catalog.plans.flatMap(plan => plan.terms).filter(term => term.available)).toEqual([]);
      expect(catalog.packs.length).toBeGreaterThan(0);
      expect(catalog.packs.every(pack => pack.available)).toBe(true);
    }
  });

  it("a pass checkout is refused with not_available_yet before any availability probe or hosted page", async () => {
    const createPlanCheckout = vi.fn();
    const isAvailable = vi.fn(() => true);
    for (const [planId, interval] of [["start", "30d"], ["momentum", "90d"], ["keep_warm", "yearly"]] as const) {
      const started = await startKitPlanCheckout({ req, request: { planId, interval, currency: "USD", billingCountry: "INTL", role: "job_seeker" }, customer, urls, deps: { isAvailable, createPlanCheckout } });
      expect(started).toMatchObject({ ok: false, status: 409, code: NOT_AVAILABLE_CODE });
      expect(started.ok === false && started.error).toContain("Nothing has been charged");
    }
    expect(isAvailable).not.toHaveBeenCalled();
    expect(createPlanCheckout).not.toHaveBeenCalled();
  });

  it("Land Concierge still answers application_required, and a credit pack still opens checkout", async () => {
    const concierge = await startKitPlanCheckout({ req, request: { planId: "land_concierge", interval: "30d", currency: "USD", billingCountry: "INTL", role: "job_seeker" }, customer, urls, deps: { isAvailable: everythingLive, createPlanCheckout: vi.fn() } });
    expect(concierge).toMatchObject({ ok: false, status: 403, code: "application_required" });
    const createPackCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/pack", hostedPageId: "hp_pack" }));
    const pack = await startKitPackCheckout({ req, request: { packId: "pack_5", billingCountry: "INTL", role: "job_seeker" }, customer, urls, deps: { isAvailable: everythingLive, createPackCheckout, newCheckoutIntentId: () => "intent_pack", packSalesPaused: false } });
    expect(pack).toMatchObject({ ok: true });
    expect(createPackCheckout).toHaveBeenCalledOnce();
  });
});

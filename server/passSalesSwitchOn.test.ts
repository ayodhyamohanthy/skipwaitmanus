// GO-LIVE-1b §6.6: with PASS_SALES_ENABLED mocked on (the switch-on commit is a
// one-line change after the §4.5 test-site evidence), the catalog and the
// checkout sell a live pass term - the GO-LIVE-1 tests already cover the off
// state, so this pins the flip needs no other code change.
import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/planCatalog", async importOriginal => {
  const original = await importOriginal<typeof import("../shared/planCatalog")>();
  return { ...original, PASS_SALES_ENABLED: true };
});

import { planCatalogResponse } from "../shared/billingCatalog";
import { startKitPlanCheckout } from "./kitCheckout";

const req = { hostname: "skipwait.me", protocol: "https", get: () => "skipwait.me" } as unknown as Parameters<typeof startKitPlanCheckout>[0]["req"];
const urls = { redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled" };
const customer = { email: "member@example.com", billingCountry: "INTL" as const };

describe("passes sell with the switch on (GO-LIVE-1b)", () => {
  it("the catalog reports a live pass term available", () => {
    const catalog = planCatalogResponse({ region: "INTL", available: () => true, usdRecurringConfirmed: false, sessionsStaffed: false, indiaGstRegistered: false });
    const availableTerms = catalog.plans.flatMap(plan => plan.terms).filter(term => term.available);
    expect(availableTerms.length).toBeGreaterThan(0);
    // A by-application plan (Land Concierge) is never self-serve, switch or not.
    const concierge = catalog.plans.find(plan => plan.id === "land_concierge");
    expect(concierge?.terms.every(term => !term.available) ?? true).toBe(true);
  });

  it("a live pass term checks out end to end", async () => {
    const createPlanCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/hp_1", hostedPageId: "hp_1" }));
    const started = await startKitPlanCheckout({ req, request: { planId: "momentum", interval: "30d", currency: "USD", billingCountry: "INTL", role: "job_seeker" }, customer, urls, deps: { isAvailable: () => true, createPlanCheckout } });
    expect(started.ok).toBe(true);
    expect(createPlanCheckout).toHaveBeenCalledTimes(1);
    const checkoutInput = createPlanCheckout.mock.calls[0][1];
    expect(checkoutInput.itemPriceId).toBe("skipwait_momentum_30d-USD");
    expect(checkoutInput.redirectUrl).toBe(urls.redirectUrl);
  });
});

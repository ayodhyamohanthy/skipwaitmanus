// GO-LIVE-1b section 4.5 evidence is in docs/plans/GO-LIVE-1b-pass-activation.md; the owner's go-live word switched passes on (Oct 22).
// Land Focus and Land Sprint are held off self-serve sale until the owner decides (PASS_SALES_HELD_PLAN_IDS).
import { describe, expect, it, vi } from "vitest";
import { PASS_SALES_ENABLED, PASS_SALES_HELD_PLAN_IDS } from "../shared/planCatalog";
import { planCatalogResponse } from "../shared/billingCatalog";
import { startKitPlanCheckout } from "./kitCheckout";

const req = { hostname: "skipwait.me", protocol: "https", get: () => "skipwait.me" } as unknown as Parameters<typeof startKitPlanCheckout>[0]["req"];
const urls = { redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled" };

describe("pass sales switch as shipped", () => {
  it("ships with pass sales on and the two Land plans held", () => {
    expect(PASS_SALES_ENABLED).toBe(true);
    expect([...PASS_SALES_HELD_PLAN_IDS].sort()).toEqual(["land_focus", "land_sprint"]);
  });

  it("with every price live, exactly Keep warm yearly plus Start and Momentum 30d/90d are buyable, in both currencies", () => {
    for (const region of ["IN", "INTL"] as const) {
      const catalog = planCatalogResponse({ region, available: () => true, usdRecurringConfirmed: false, sessionsStaffed: false, indiaGstRegistered: false });
      const buyable = catalog.plans.flatMap(plan => plan.terms.filter(term => term.available).map(term => `${plan.id}:${term.interval}`)).sort();
      expect(buyable).toEqual(["keep_warm:yearly", "momentum:30d", "momentum:90d", "start:30d", "start:90d"]);
    }
  });

  it("a held Land plan checkout is refused before any provider call", async () => {
    const createPlanCheckout = vi.fn();
    const isAvailable = vi.fn(() => true);
    const started = await startKitPlanCheckout({ req, request: { planId: "land_focus", interval: "30d", currency: "USD", billingCountry: "INTL", role: "job_seeker" }, customer: { email: "m@example.com", billingCountry: "INTL" as const }, urls, deps: { isAvailable, createPlanCheckout } as never });
    expect(started).toMatchObject({ ok: false, status: 409 });
    expect(createPlanCheckout).not.toHaveBeenCalled();
  });
});

// GO-LIVE-1b section 4.5 evidence is in docs/plans/GO-LIVE-1b-pass-activation.md; the owner's go-live word switched passes on (Oct 22).
// Land Focus and Land Sprint sell with the other passes; the hold list is empty.
import { describe, expect, it } from "vitest";
import { PASS_SALES_ENABLED, PASS_SALES_HELD_PLAN_IDS } from "../shared/planCatalog";
import { planCatalogResponse } from "../shared/billingCatalog";


describe("pass sales switch as shipped", () => {
  it("ships with pass sales on and nothing held", () => {
    expect(PASS_SALES_ENABLED).toBe(true);
    expect([...PASS_SALES_HELD_PLAN_IDS]).toEqual([]);
  });

  it("with every price live, every self-serve term (Keep warm yearly, Start, Momentum, Land Focus, Land Sprint) is buyable and Land Concierge is not, in both currencies", () => {
    for (const region of ["IN", "INTL"] as const) {
      const catalog = planCatalogResponse({ region, available: () => true, usdRecurringConfirmed: false, sessionsStaffed: false, indiaGstRegistered: false });
      const buyable = catalog.plans.flatMap(plan => plan.terms.filter(term => term.available).map(term => `${plan.id}:${term.interval}`)).sort();
      expect(buyable).toEqual(["keep_warm:yearly", "land_focus:30d", "land_focus:90d", "land_sprint:30d", "land_sprint:90d", "momentum:30d", "momentum:90d", "start:30d", "start:90d"]);
    }
  });
});

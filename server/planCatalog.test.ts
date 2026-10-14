import { describe, expect, it } from "vitest";
import { CATALOG_PLANS, CATALOG_PLAN_IDS, CREDIT_PACKS, FREE_PLAN, catalogItemPriceId, catalogPackItemPriceId, catalogPlanById, legacyPlanTarget, planDisplayName, tierAtLeast } from "../shared/planCatalog";

const plan = (id: string) => catalogPlanById(id)!;

describe("plan catalog matches the kit and the recommended numbers", () => {
  it("Start, Momentum and Land $100 follow the kit screens", () => {
    expect(plan("start")).toMatchObject({ creditsPerMonth: 10, openRequests: 8, carryover: 1 });
    expect(plan("start").prices.monthly.USD).toBe(800);
    expect(plan("start").prices.yearly.USD).toBe(8_000);
    expect(plan("momentum")).toMatchObject({ creditsPerMonth: 30, openRequests: 15, carryover: 3 });
    expect(plan("momentum").prices.monthly.USD).toBe(2_000);
    expect(plan("momentum").prices.yearly.USD).toBe(20_000);
    expect(plan("land_100")).toMatchObject({ creditsPerMonth: 120, openRequests: 30, carryover: "subscribed" });
    expect(plan("land_100").prices.yearly.USD).toBe(100_000);
  });
  it("Land levels: Sprint and Concierge follow PRICING.md (Sprint holds 50 open requests)", () => {
    expect(plan("land_200")).toMatchObject({ creditsPerMonth: 300, openRequests: 50 });
    expect(plan("land_500")).toMatchObject({ creditsPerMonth: 1_000, openRequests: null });
    expect([100, 200, 500].map(d => plan(`land_${d}`).prices.monthly.USD)).toEqual([10_000, 20_000, 50_000]);
    expect([100, 200, 500].map(d => plan(`land_${d}`).prices.yearly.USD)).toEqual([100_000, 200_000, 500_000]);
  });
  it("Land levels are named Focus, Sprint and Concierge; single-level tiers show their tier name", () => {
    expect(CATALOG_PLANS.map(planDisplayName)).toEqual(["Start", "Momentum", "Land Focus", "Land Sprint", "Land Concierge"]);
    expect(planDisplayName(FREE_PLAN)).toBe("Free");
    expect(CATALOG_PLANS.map(p => p.id)).toEqual([...CATALOG_PLAN_IDS]);
  });
  it("Free has 3 open requests and no price", () => {
    expect(FREE_PLAN.openRequests).toBe(3);
    expect(FREE_PLAN.prices.monthly.USD).toBe(0);
  });
  it("INR prices are the recommended table, yearly is 10 months", () => {
    expect(CATALOG_PLANS.map(p => p.prices.monthly.INR / 100)).toEqual([699, 1_699, 8_499, 16_999, 42_999]);
    for (const p of CATALOG_PLANS) {
      expect(p.prices.yearly.INR).toBe(p.prices.monthly.INR * 10);
      expect(p.prices.yearly.USD).toBe(p.prices.monthly.USD * 10);
    }
  });
  it("credit packs follow PRICING.md: 5/$5, 25/$22, 60/$48, 150/$105, with INR at the plan table's rate", () => {
    expect(CREDIT_PACKS.map(p => [p.id, p.credits, p.prices.USD / 100, p.prices.INR / 100])).toEqual([["pack_5", 5, 5, 429], ["pack_25", 25, 22, 1_899], ["pack_60", 60, 48, 4_099], ["pack_150", 150, 105, 8_999]]);
    expect(CREDIT_PACKS.map(p => catalogPackItemPriceId(p.id, "USD"))).toEqual(["skipwait_pack_5-USD", "skipwait_pack_25-USD", "skipwait_pack_60-USD", "skipwait_pack_150-USD"]);
  });
});

describe("structure", () => {
  it("every plan and pack has a unique id and unique Chargebee item price ids", () => {
    const ids = CATALOG_PLANS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const prices = [
      ...CATALOG_PLANS.flatMap(p => (["monthly", "yearly"] as const).flatMap(i => (["USD", "INR"] as const).map(c => catalogItemPriceId(p.id, i, c)))),
      ...CREDIT_PACKS.flatMap(p => (["USD", "INR"] as const).map(c => catalogPackItemPriceId(p.id, c))),
    ];
    expect(new Set(prices).size).toBe(prices.length);
  });
  it("item price ids never collide with the live Pro and Max ids", () => {
    const live = ["skipwait_pro_monthly-INR", "skipwait_pro_monthly-USD", "skipwait_max_monthly-INR", "skipwait_max_monthly-USD"];
    for (const p of CATALOG_PLANS) for (const i of ["monthly", "yearly"] as const) for (const c of ["USD", "INR"] as const) expect(live).not.toContain(catalogItemPriceId(p.id, i, c));
  });
  it("each higher tier is strictly richer, so upgrades never lose a limit", () => {
    for (let i = 1; i < CATALOG_PLANS.length; i++) {
      const a = CATALOG_PLANS[i - 1], b = CATALOG_PLANS[i];
      expect(b.creditsPerMonth).toBeGreaterThan(a.creditsPerMonth);
      expect(b.prices.monthly.USD).toBeGreaterThan(a.prices.monthly.USD);
      expect(b.openRequests === null || b.openRequests > (a.openRequests ?? Infinity)).toBe(true);
    }
  });
  it("tier checks follow rank, not price", () => {
    expect(tierAtLeast("land", "land")).toBe(true);
    expect(tierAtLeast("momentum", "land")).toBe(false);
    expect(tierAtLeast("free", "start")).toBe(false);
  });
  it("legacy subscribers map by rank: Pro to Start, Max to Momentum", () => {
    expect(legacyPlanTarget("pro")?.id).toBe("start");
    expect(legacyPlanTarget("max")?.id).toBe("momentum");
    expect(legacyPlanTarget("free")).toBeUndefined();
  });
});

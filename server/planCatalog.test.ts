import { describe, expect, it } from "vitest";
import { CATALOG_PLANS, CREDIT_ACTIONS, CREDIT_PACKS, FREE_PLAN, HUMAN_PRODUCTS, REGIONAL_TIERS, catalogHumanItemPriceId, catalogItemPriceId, catalogPackItemPriceId, catalogPlanById, legacyPlanTarget, regionalTierForCountry, tierAtLeast } from "../shared/planCatalog";
import { SUBSCRIPTION_PLANS, isSubscriptionInterval, subscriptionPlanFromItemPrice, subscriptionPriceForPlan } from "../shared/subscriptionPlans";

const plan = (id: string) => catalogPlanById(id)!;

describe("plan catalog matches the Kit v4 pricing spec (3.1/3.2)", () => {
  it("Keep warm is the yearly-only low tier", () => {
    expect(plan("keep_warm")).toMatchObject({ creditsPerMonth: 1, openRequests: 5, carryover: 1 });
    expect(plan("keep_warm").intervals).toEqual(["yearly"]);
    expect(plan("keep_warm").prices.yearly).toEqual({ USD: 2_900, INR: 99_900 });
  });

  it("Start, Momentum and Land Focus follow the 30-day and 90-day price table", () => {
    expect(plan("start")).toMatchObject({ creditsPerMonth: 10, openRequests: 8, carryover: 1 });
    expect(plan("start").prices.monthly).toEqual({ USD: 800, INR: 29_900 });
    expect(plan("start").prices.quarterly).toEqual({ USD: 1_900, INR: 69_900 });
    expect(plan("momentum")).toMatchObject({ creditsPerMonth: 30, openRequests: 15, carryover: 3 });
    expect(plan("momentum").prices.monthly).toEqual({ USD: 2_400, INR: 99_900 });
    expect(plan("momentum").prices.quarterly).toEqual({ USD: 5_900, INR: 249_900 });
    expect(plan("land_100")).toMatchObject({ creditsPerMonth: 120, openRequests: 30, carryover: "subscribed" });
    expect(plan("land_100").prices.monthly).toEqual({ USD: 10_000, INR: 599_900 });
    expect(plan("land_100").prices.quarterly).toEqual({ USD: 24_900, INR: 1_399_900 });
  });

  it("Land Sprint and Concierge follow the locked table", () => {
    expect(plan("land_200")).toMatchObject({ creditsPerMonth: 300, openRequests: 50 });
    expect(plan("land_200").prices.monthly).toEqual({ USD: 20_000, INR: 1_199_900 });
    expect(plan("land_200").prices.quarterly).toEqual({ USD: 49_900, INR: 2_799_900 });
    expect(plan("land_500")).toMatchObject({ creditsPerMonth: 1_000, openRequests: 75, applicationOnly: true });
    expect(plan("land_500").prices.monthly).toEqual({ USD: 75_000, INR: 3_499_900 });
    expect(plan("land_500").prices.quarterly).toEqual({ USD: 199_000, INR: 8_499_900 });
  });

  it("Land labels are Focus / Sprint / Concierge", () => {
    expect(plan("land_100").label).toBe("Land Focus");
    expect(plan("land_200").label).toBe("Land Sprint");
    expect(plan("land_500").label).toBe("Land Concierge");
  });

  it("human time is attached to Land plans and never to Start/Momentum", () => {
    expect(plan("land_100").humanIncluded).toBe("1 written review");
    expect(plan("land_200").humanIncluded).toBe("1 written review + 1 live session");
    expect(plan("land_500").humanIncluded).toContain("6 human hours");
    expect(plan("start").humanIncluded).toBe("");
    expect(plan("momentum").humanIncluded).toBe("");
  });

  it("Free has 3 open requests and no price", () => {
    expect(FREE_PLAN.openRequests).toBe(3);
    expect(FREE_PLAN.intervals).toEqual([]);
    expect(FREE_PLAN.prices).toEqual({});
  });

  it("credit packs are the per-currency table with two first packs", () => {
    const byId = new Map(CREDIT_PACKS.map(p => [p.id, p]));
    expect(byId.get("pack_5")).toMatchObject({ credits: 5, firstPack: true, prices: { USD: 500 } });
    expect(byId.get("pack_2")).toMatchObject({ credits: 2, firstPack: true, prices: { INR: 9_900 } });
    expect(byId.get("pack_25")).toMatchObject({ credits: 25, prices: { USD: 2_200, INR: 119_900 } });
    expect(byId.get("pack_60")).toMatchObject({ credits: 60, prices: { USD: 4_800, INR: 259_900 } });
    expect(byId.get("pack_150")).toMatchObject({ credits: 150, prices: { USD: 10_500, INR: 599_900 } });
  });

  it("human review and session are separate one-time products, not credits", () => {
    expect(HUMAN_PRODUCTS.map(p => [p.id, p.prices.USD, p.prices.INR])).toEqual([["review", 4_900, 79_900], ["session", 9_900, 149_900]]);
    expect(CREDIT_ACTIONS.every(action => action.cost <= 5)).toBe(true);
  });

  it("credit-action costs follow 3.1", () => {
    const cost = new Map(CREDIT_ACTIONS.map(a => [a.id, a.cost]));
    expect(cost.get("ask_rewrite")).toBe(1);
    expect(cost.get("ask_one_pager")).toBe(2);
    expect(cost.get("extra_open_ask")).toBe(2);
    expect(cost.get("company_research")).toBe(3);
    expect(cost.get("interview_dossier")).toBe(4);
    expect(cost.get("ai_mock_interview")).toBe(5);
    expect(cost.get("salary_coach")).toBe(5);
  });
});

describe("subscription plan config derives from the catalog", () => {
  it("keeps legacy Pro/Max unchanged and adds the Kit v4 plans", () => {
    expect(SUBSCRIPTION_PLANS.pro.prices.monthly?.USD.amount).toBe(700);
    expect(SUBSCRIPTION_PLANS.max.prices.monthly?.INR.amount).toBe(129_900);
    expect(SUBSCRIPTION_PLANS.keep_warm.prices.yearly?.USD.display).toBe("$29/year");
    expect(SUBSCRIPTION_PLANS.start.prices.quarterly?.USD.display).toBe("$19/quarter");
    expect(SUBSCRIPTION_PLANS.land_500.label).toBe("Land Concierge");
  });

  it("prices a plan on the requested interval and resolves single-interval plans", () => {
    expect(subscriptionPriceForPlan("start", "USD", "quarterly")).toMatchObject({ amount: 1_900, interval: "quarterly", itemPriceId: "skipwait_start_quarterly-USD" });
    expect(subscriptionPriceForPlan("keep_warm", "INR", "monthly")).toMatchObject({ amount: 99_900, interval: "yearly" });
  });

  it("maps every item price id back to its plan, currency and interval", () => {
    expect(subscriptionPlanFromItemPrice("skipwait_pro_monthly-INR")).toEqual({ plan: "pro", currency: "INR", amount: 59_900 });
    expect(subscriptionPlanFromItemPrice("skipwait_start_quarterly-USD")).toEqual({ plan: "start", currency: "USD", amount: 1_900, interval: "quarterly" });
    expect(subscriptionPlanFromItemPrice("skipwait_keep_warm_yearly-INR")).toEqual({ plan: "keep_warm", currency: "INR", amount: 99_900, interval: "yearly" });
    expect(subscriptionPlanFromItemPrice("skipwait_token_1-INR")).toBeUndefined();
  });

  it("recognises the three billing intervals", () => {
    expect(isSubscriptionInterval("monthly")).toBe(true);
    expect(isSubscriptionInterval("quarterly")).toBe(true);
    expect(isSubscriptionInterval("yearly")).toBe(true);
    expect(isSubscriptionInterval("weekly")).toBe(false);
  });
});

describe("structure", () => {
  it("every plan and pack has a unique id and unique Chargebee item price ids", () => {
    const ids = CATALOG_PLANS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const prices = [
      ...CATALOG_PLANS.flatMap(p => p.intervals.flatMap(i => (["USD", "INR"] as const).map(c => catalogItemPriceId(p.id, i, c)))),
      ...CREDIT_PACKS.flatMap(p => (["USD", "INR"] as const).filter(c => p.prices[c] !== undefined).map(c => catalogPackItemPriceId(p.id, c))),
      ...HUMAN_PRODUCTS.flatMap(p => (["USD", "INR"] as const).map(c => catalogHumanItemPriceId(p.id, c))),
    ];
    expect(new Set(prices).size).toBe(prices.length);
  });

  it("item price ids never collide with the live Pro and Max ids", () => {
    const live = ["skipwait_pro_monthly-INR", "skipwait_pro_monthly-USD", "skipwait_max_monthly-INR", "skipwait_max_monthly-USD"];
    for (const p of CATALOG_PLANS) for (const i of p.intervals) for (const c of ["USD", "INR"] as const) expect(live).not.toContain(catalogItemPriceId(p.id, i, c));
  });

  it("each higher paid tier is strictly richer, so upgrades never lose a limit", () => {
    const paid = CATALOG_PLANS.filter(p => p.id !== "keep_warm");
    for (let i = 1; i < paid.length; i++) {
      const a = paid[i - 1], b = paid[i];
      expect(b.creditsPerMonth).toBeGreaterThan(a.creditsPerMonth);
      expect(b.openRequests!).toBeGreaterThan(a.openRequests!);
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

  it("regional tiers cover India and the VPN-arbitrage floor for T4", () => {
    expect(regionalTierForCountry("IN")?.id).toBe("IN");
    expect(regionalTierForCountry("US")?.id).toBe("T1");
    expect(regionalTierForCountry("BR")?.id).toBe("T3");
    expect(REGIONAL_TIERS.find(t => t.id === "T4")?.startFloorUsd).toBe(2.99);
    expect(regionalTierForCountry(undefined)).toBeUndefined();
  });
});

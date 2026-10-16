import { describe, expect, it } from "vitest";
import { CATALOG_PLANS, CATALOG_PLAN_IDS, CREDIT_PACKS, CREDIT_TOOLS, FREE_PLAN, HUMAN_SESSIONS, MAX_OPEN_ASKS_PER_COMPANY, REVERSE_TRIAL, catalogItemPriceId, catalogPackItemPriceId, catalogPlanById, catalogSessionItemPriceId, creditToolCost, legacyPlanTarget, planDisplayName, planIntervals, tierAtLeast, type CatalogCurrency, type CatalogInterval } from "../shared/planCatalog";

const plan = (id: string) => catalogPlanById(id)!;
const price = (id: string, interval: CatalogInterval, currency: CatalogCurrency) => plan(id).prices[interval]?.[currency];

// docs/PRICING_RECOMMENDATION.md, "Owner decisions (Oct 14 2026)", sections 3.1 and 3.2.
describe("plan catalog follows the Oct 14 2026 pricing decision", () => {
  it("plan contents: open asks 3/5/8/15/30/50/75, credits per cycle and carryover", () => {
    expect([FREE_PLAN, ...CATALOG_PLANS].map(p => [p.id, p.openRequests, p.creditsPerMonth, p.carryover])).toEqual([
      ["free", 3, 3, 0],
      ["keep_warm", 5, 1, 1],
      ["start", 8, 10, 1],
      ["momentum", 15, 30, 3],
      ["land_focus", 30, 120, "subscribed"],
      ["land_sprint", 50, 300, "subscribed"],
      ["land_concierge", 75, 1_000, "subscribed"],
    ]);
  });

  it("USD prices: Keep warm $29 a year, passes 30 / 90 days", () => {
    expect(price("keep_warm", "yearly", "USD")).toBe(2_900);
    expect(CATALOG_PLANS.filter(p => p.id !== "keep_warm").map(p => [p.id, price(p.id, "30d", "USD"), price(p.id, "90d", "USD")])).toEqual([
      ["start", 800, 1_900],
      ["momentum", 2_400, 5_900],
      ["land_focus", 10_000, 24_900],
      ["land_sprint", 20_000, 49_900],
      ["land_concierge", 75_000, 199_000],
    ]);
  });

  it("INR prices include GST: Keep warm ₹999 a year, passes 30 / 90 days, nothing reaches ₹1 lakh", () => {
    expect(price("keep_warm", "yearly", "INR")).toBe(99_900);
    expect(CATALOG_PLANS.filter(p => p.id !== "keep_warm").map(p => [p.id, price(p.id, "30d", "INR")! / 100, price(p.id, "90d", "INR")! / 100])).toEqual([
      ["start", 299, 699],
      ["momentum", 999, 2_499],
      ["land_focus", 5_999, 13_999],
      ["land_sprint", 11_999, 27_999],
      ["land_concierge", 34_999, 84_999],
    ]);
    for (const p of CATALOG_PLANS) for (const interval of planIntervals(p)) expect(price(p.id, interval, "INR")!).toBeLessThan(100_000_00);
  });

  it("Keep warm is the only yearly plan; every other plan is a 30- or 90-day pass", () => {
    expect(planIntervals(plan("keep_warm"))).toEqual(["yearly"]);
    for (const p of CATALOG_PLANS.filter(candidate => candidate.id !== "keep_warm")) expect(planIntervals(p)).toEqual(["30d", "90d"]);
    expect(planIntervals(FREE_PLAN)).toEqual([]);
  });

  it("a 90-day pass costs about 2.3 to 2.65 times the 30-day price", () => {
    for (const p of CATALOG_PLANS.filter(candidate => candidate.id !== "keep_warm")) {
      for (const currency of ["USD", "INR"] as const) {
        const ratio = price(p.id, "90d", currency)! / price(p.id, "30d", currency)!;
        expect(ratio).toBeGreaterThanOrEqual(2.3);
        expect(ratio).toBeLessThan(2.66);
      }
    }
  });

  it("Concierge is sold by application; Momentum and the 25 pack are 'Recommended', nothing is 'Most chosen'", () => {
    expect(CATALOG_PLANS.filter(p => p.byApplication).map(p => p.id)).toEqual(["land_concierge"]);
    expect(CATALOG_PLANS.filter(p => p.recommended).map(p => p.id)).toEqual(["momentum"]);
    expect(CREDIT_PACKS.filter(p => p.recommended).map(p => p.id)).toEqual(["pack_25"]);
  });

  it("human time per cycle: Focus 1 written review, Sprint 1 review and 1 live session, Concierge 6 hours", () => {
    expect(CATALOG_PLANS.map(p => [p.id, p.humanTime])).toEqual([
      ["keep_warm", { writtenReviews: 0, liveSessions: 0, hours: 0 }],
      ["start", { writtenReviews: 0, liveSessions: 0, hours: 0 }],
      ["momentum", { writtenReviews: 0, liveSessions: 0, hours: 0 }],
      ["land_focus", { writtenReviews: 1, liveSessions: 0, hours: 0 }],
      ["land_sprint", { writtenReviews: 1, liveSessions: 1, hours: 0 }],
      ["land_concierge", { writtenReviews: 0, liveSessions: 0, hours: 6 }],
    ]);
  });

  it("Land levels are named Focus, Sprint and Concierge; single-level tiers show their tier name", () => {
    expect(CATALOG_PLANS.map(planDisplayName)).toEqual(["Keep warm", "Start", "Momentum", "Land Focus", "Land Sprint", "Land Concierge"]);
    expect(planDisplayName(FREE_PLAN)).toBe("Free");
    expect(CATALOG_PLANS.map(p => p.id)).toEqual([...CATALOG_PLAN_IDS]);
  });

  it("credit packs differ by currency: USD 5/$5 25/$22 60/$48 150/$105, INR 2/₹99 25/₹1,199 60/₹2,599 150/₹5,999", () => {
    const sold = (currency: CatalogCurrency) => CREDIT_PACKS.flatMap(p => (p.prices[currency] === undefined ? [] : [[p.credits, p.prices[currency]! / 100]]));
    expect(sold("USD")).toEqual([[5, 5], [25, 22], [60, 48], [150, 105]]);
    expect(sold("INR")).toEqual([[2, 99], [25, 1_199], [60, 2_599], [150, 5_999]]);
    expect(CREDIT_PACKS.filter(p => p.firstPack).map(p => [p.id, Object.keys(p.prices)])).toEqual([["pack_2", ["INR"]], ["pack_5", ["USD"]]]);
  });

  it("human sessions are one-time products: written review $49 / ₹799, live 45 minutes $99 / ₹1,499", () => {
    expect(HUMAN_SESSIONS.map(s => [s.id, s.prices.USD, s.prices.INR])).toEqual([["written_review", 4_900, 79_900], ["live_session", 9_900, 149_900]]);
  });

  it("credit costs per tool; human review is not a credit tool", () => {
    expect(CREDIT_TOOLS.map(t => [t.id, t.credits])).toEqual([
      ["ask_rewrite", 1], ["profile_check", 1], ["thank_you_pack", 1], ["ask_one_pager", 2], ["extra_open_ask", 2],
      ["company_research", 3], ["resume_overhaul", 3], ["offer_comparison", 3], ["interview_dossier", 4], ["mock_interview", 5], ["salary_coach", 5],
    ]);
    expect(creditToolCost("extra_open_ask")).toBe(2);
    expect(CREDIT_TOOLS.some(t => /review/i.test(t.label))).toBe(false);
  });

  it("fairness and the reverse trial are catalog constants", () => {
    expect(MAX_OPEN_ASKS_PER_COMPANY).toBe(2);
    expect(REVERSE_TRIAL).toEqual({ plan: "momentum", days: 14, credits: 5 });
    expect(plan(REVERSE_TRIAL.plan).openRequests).toBe(15);
  });
});

describe("structure", () => {
  it("item price ids extend the catalogItemPriceId convention for 30d, 90d and yearly, all unique", () => {
    expect(catalogItemPriceId("momentum", "90d", "INR")).toBe("skipwait_momentum_90d-INR");
    expect(catalogItemPriceId("keep_warm", "yearly", "USD")).toBe("skipwait_keep_warm_yearly-USD");
    expect(catalogPackItemPriceId("pack_2", "INR")).toBe("skipwait_pack_2-INR");
    expect(catalogSessionItemPriceId("written_review", "USD")).toBe("skipwait_written_review-USD");
    const ids = [
      ...CATALOG_PLANS.flatMap(p => planIntervals(p).flatMap(i => (["USD", "INR"] as const).map(c => catalogItemPriceId(p.id, i, c)))),
      ...CREDIT_PACKS.flatMap(p => (["USD", "INR"] as const).filter(c => p.prices[c] !== undefined).map(c => catalogPackItemPriceId(p.id, c))),
      ...HUMAN_SESSIONS.flatMap(s => (["USD", "INR"] as const).map(c => catalogSessionItemPriceId(s.id, c))),
    ];
    expect(ids).toHaveLength(22 + 8 + 4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("item price ids never collide with the live Pro and Max ids", () => {
    const live = ["skipwait_pro_monthly-INR", "skipwait_pro_monthly-USD", "skipwait_max_monthly-INR", "skipwait_max_monthly-USD"];
    for (const p of CATALOG_PLANS) for (const i of planIntervals(p)) for (const c of ["USD", "INR"] as const) expect(live).not.toContain(catalogItemPriceId(p.id, i, c));
  });

  it("each higher plan holds more open asks (and each paid plan more credits), so moving up never loses a limit", () => {
    const ladder = [FREE_PLAN, ...CATALOG_PLANS];
    for (let i = 1; i < ladder.length; i++) expect(ladder[i].openRequests).toBeGreaterThan(ladder[i - 1].openRequests);
    for (let i = 1; i < CATALOG_PLANS.length; i++) expect(CATALOG_PLANS[i].creditsPerMonth).toBeGreaterThan(CATALOG_PLANS[i - 1].creditsPerMonth);
    // Free's 3 a month beat Keep warm's 1 by decision: Keep warm sells open asks and alerts, not credits.
    expect(FREE_PLAN.creditsPerMonth).toBe(3);
    const paid = CATALOG_PLANS.filter(p => p.id !== "keep_warm");
    for (let i = 1; i < paid.length; i++) expect(price(paid[i].id, "30d", "USD")!).toBeGreaterThan(price(paid[i - 1].id, "30d", "USD")!);
  });

  it("tier checks follow rank, not price", () => {
    expect(tierAtLeast("land", "land")).toBe(true);
    expect(tierAtLeast("momentum", "land")).toBe(false);
    expect(tierAtLeast("free", "start")).toBe(false);
    expect(tierAtLeast("keep_warm", "start")).toBe(false);
    expect(tierAtLeast("keep_warm", "free")).toBe(true);
  });

  it("legacy subscribers map by rank: Pro to Start, Max to Momentum", () => {
    expect(legacyPlanTarget("pro")?.id).toBe("start");
    expect(legacyPlanTarget("max")?.id).toBe("momentum");
    expect(legacyPlanTarget("free")).toBeUndefined();
  });
});

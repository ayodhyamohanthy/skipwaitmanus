import { describe, expect, it } from "vitest";
import { CATALOG_PLAN_IDS } from "../shared/planCatalog";
import { ENTITLED_PLAN_IDS, LEGACY_SHOWCASE_PIECES, isPaidPlanActive, planEntitlementsSchema, resolvePlanEntitlements, type EntitlementWallet } from "../shared/planEntitlements";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const paid = (plan: string, patch: Partial<EntitlementWallet> = {}): EntitlementWallet => ({ plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: new Date(NOW.getTime() + 20 * DAY), ...patch });
const resolve = (wallet: EntitlementWallet | null) => resolvePlanEntitlements(wallet, NOW);

describe("plan entitlement resolver (PRICING.md, 19_plans compare table)", () => {
  it("every resolved entitlement satisfies the shared contract", () => {
    for (const plan of ENTITLED_PLAN_IDS) {
      const wallet = plan === "free" ? { plan, subscriptionStatus: null, subscriptionCurrentTermEnd: null } : paid(plan);
      expect(planEntitlementsSchema.parse(resolve(wallet)).plan).toBe(plan);
    }
    expect(planEntitlementsSchema.safeParse({ ...resolve(null), extra: true }).success).toBe(false);
  });

  it("Free: 3 open requests, no monthly credits, 3 alerts, 3 pieces, 1 pin, no assistants", () => {
    expect(resolve(null)).toEqual({
      plan: "free", planLabel: "Free", tier: "free", level: 1, legacy: false,
      openRequests: 3, creditsPerMonth: 0, carryover: 0, savedAlerts: 3,
      showcase: { pieces: 3, pins: 1 }, customLink: false, privateInsights: false, guidedWorkflows: false, assistants: false,
      tools: { preparation: "limited", uploads: "limited", research: "basic", included: [] },
    });
  });

  it("each kit plan carries its catalog numbers and tier limits", () => {
    expect(resolve(paid("start"))).toMatchObject({ planLabel: "Start", tier: "start", openRequests: 8, creditsPerMonth: 10, carryover: 1, savedAlerts: null, showcase: { pieces: 10, pins: 3 }, customLink: false, assistants: false, tools: { preparation: "expanded", research: "basic", included: ["onepager", "pack"] } });
    expect(resolve(paid("momentum"))).toMatchObject({ planLabel: "Momentum", tier: "momentum", openRequests: 15, creditsPerMonth: 30, carryover: 3, showcase: { pieces: null, pins: 6 }, customLink: true, privateInsights: true, guidedWorkflows: false, assistants: false, tools: { included: ["onepager", "salary", "dossier", "offer", "pack"] } });
    expect(resolve(paid("land_100"))).toMatchObject({ planLabel: "Land Focus", tier: "land", level: 1, openRequests: 30, creditsPerMonth: 120, carryover: "subscribed", guidedWorkflows: true, assistants: true });
    expect(resolve(paid("land_200"))).toMatchObject({ planLabel: "Land Sprint", level: 2, openRequests: 50, creditsPerMonth: 300, assistants: true });
    expect(resolve(paid("land_500"))).toMatchObject({ planLabel: "Land Concierge", level: 3, openRequests: null, creditsPerMonth: 1_000, assistants: true, tools: { preparation: "maximum", uploads: "highest", research: "maximum", included: ["onepager", "salary", "review", "dossier", "offer", "pack"] } });
  });

  it("assistants follow the Land tier, never Start or Momentum", () => {
    for (const plan of CATALOG_PLAN_IDS) expect(resolve(paid(plan)).assistants).toBe(plan.startsWith("land_"));
  });

  it("grandfathers legacy Pro at least to Start and never below what Pro gives today", () => {
    expect(resolve(paid("pro"))).toMatchObject({ plan: "pro", planLabel: "Pro", tier: "start", legacy: true, openRequests: 10, creditsPerMonth: 10, savedAlerts: null, showcase: { pieces: LEGACY_SHOWCASE_PIECES, pins: 3 }, assistants: false });
  });

  it("grandfathers legacy Max at least to Momentum and keeps its assistant access", () => {
    expect(resolve(paid("max"))).toMatchObject({ plan: "max", planLabel: "Max", tier: "momentum", legacy: true, openRequests: 30, creditsPerMonth: 30, showcase: { pieces: null, pins: 6 }, customLink: true, assistants: true });
  });

  it("legacy plans are never weaker than the tier they map to", () => {
    const pairs = [["pro", "start"], ["max", "momentum"]] as const;
    for (const [legacy, tier] of pairs) {
      const a = resolve(paid(legacy));
      const b = resolve(paid(tier));
      expect(a.openRequests === null || (b.openRequests !== null && a.openRequests >= b.openRequests)).toBe(true);
      expect(a.creditsPerMonth).toBeGreaterThanOrEqual(b.creditsPerMonth);
      expect(a.showcase.pins).toBeGreaterThanOrEqual(b.showcase.pins);
      expect(a.showcase.pieces === null || (b.showcase.pieces !== null && a.showcase.pieces >= b.showcase.pieces)).toBe(true);
      expect(a.assistants || !b.assistants).toBe(true);
    }
  });

  it("a paid plan counts only while billing inside its term (JS clock)", () => {
    expect(isPaidPlanActive(paid("max"), NOW)).toBe(true);
    expect(resolve(paid("max", { subscriptionStatus: "non_renewing" })).plan).toBe("max");
    expect(resolve(paid("max", { subscriptionStatus: "cancelled" })).plan).toBe("free");
    expect(resolve(paid("max", { subscriptionStatus: null })).plan).toBe("free");
    expect(resolve(paid("max", { subscriptionCurrentTermEnd: null })).plan).toBe("free");
    expect(resolve(paid("max", { subscriptionCurrentTermEnd: NOW })).plan).toBe("free");
    expect(resolve(paid("land_200", { subscriptionCurrentTermEnd: new Date(NOW.getTime() - 1) })).assistants).toBe(false);
  });

  it("fails closed on an unknown or free plan id", () => {
    expect(resolve(paid("enterprise")).plan).toBe("free");
    expect(resolve(paid("free")).plan).toBe("free");
    expect(resolve(paid("")).plan).toBe("free");
  });

  it("hands out independent objects so a caller cannot mutate the next answer", () => {
    const first = resolve(null);
    first.showcase.pins = 99;
    first.tools.included.push("review");
    expect(resolve(null).showcase.pins).toBe(1);
    expect(resolve(null).tools.included).toEqual([]);
  });
});

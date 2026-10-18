import { describe, expect, it } from "vitest";
import { CATALOG_PLAN_IDS } from "../shared/planCatalog";
import { ENTITLED_PLAN_IDS, LEGACY_SHOWCASE_PIECES, isPaidPlanActive, isTrialActive, planEntitlementsFor, planEntitlementsSchema, resolvePlanEntitlements, type EntitlementWallet } from "../shared/planEntitlements";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const paid = (plan: string, patch: Partial<EntitlementWallet> = {}): EntitlementWallet => ({ plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: new Date(NOW.getTime() + 20 * DAY), ...patch });
const resolve = (wallet: EntitlementWallet | null) => resolvePlanEntitlements(wallet, NOW);

const NO_HUMAN = { writtenReviews: 0, liveSessions: 0, hours: 0 };

describe("plan entitlement resolver (Oct 14 2026 pricing decision, 19_plans compare table)", () => {
  it("every resolved entitlement satisfies the shared contract", () => {
    for (const plan of ENTITLED_PLAN_IDS) {
      const wallet = plan === "free" ? { plan, subscriptionStatus: null, subscriptionCurrentTermEnd: null } : paid(plan);
      expect(planEntitlementsSchema.parse(resolve(wallet)).plan).toBe(plan);
    }
    expect(planEntitlementsSchema.safeParse({ ...resolve(null), extra: true }).success).toBe(false);
  });

  it("Free: 3 open requests, 3 credits a month with no carryover, 3 alerts, 3 pieces, 1 pin, no assistants", () => {
    expect(resolve(null)).toEqual({
      plan: "free", planLabel: "Free", tier: "free", level: 1, legacy: false,
      openRequests: 3, creditsPerMonth: 3, carryover: 0, savedAlerts: 3,
      showcase: { pieces: 3, pins: 1 }, customLink: false, privateInsights: false, guidedWorkflows: false, assistants: false,
      tools: { preparation: "limited", uploads: "limited", research: "basic", included: [] },
      humanTime: NO_HUMAN, paidThrough: null, trialEndsAt: null,
    });
  });

  it("each kit plan carries its catalog numbers and tier limits", () => {
    expect(resolve(paid("start"))).toMatchObject({ planLabel: "Start", tier: "start", openRequests: 8, creditsPerMonth: 10, carryover: 1, savedAlerts: null, showcase: { pieces: 10, pins: 3 }, customLink: false, assistants: false, tools: { preparation: "expanded", research: "basic", included: ["onepager", "pack"] } });
    expect(resolve(paid("momentum"))).toMatchObject({ planLabel: "Momentum", tier: "momentum", openRequests: 15, creditsPerMonth: 36, carryover: 3, showcase: { pieces: null, pins: 6 }, customLink: true, privateInsights: true, guidedWorkflows: false, assistants: false, tools: { included: ["onepager", "salary", "dossier", "offer", "pack"] } });
    expect(resolve(paid("land_focus"))).toMatchObject({ planLabel: "Land Focus", tier: "land", level: 1, openRequests: 30, creditsPerMonth: 120, carryover: "subscribed", guidedWorkflows: true, assistants: true, humanTime: { writtenReviews: 1, liveSessions: 0, hours: 0 } });
    expect(resolve(paid("land_sprint"))).toMatchObject({ planLabel: "Land Sprint", level: 2, openRequests: 50, creditsPerMonth: 300, assistants: true, humanTime: { writtenReviews: 1, liveSessions: 1, hours: 0 } });
    expect(resolve(paid("land_concierge"))).toMatchObject({ planLabel: "Land Concierge", level: 3, openRequests: 75, creditsPerMonth: 1_000, assistants: true, humanTime: { writtenReviews: 0, liveSessions: 0, hours: 6 }, tools: { preparation: "maximum", uploads: "highest", research: "maximum", included: ["onepager", "salary", "dossier", "offer", "pack"] } });
  });

  it("Keep warm: 5 open asks, 4 credits a cycle kept a month, Free's tools and showcase, unlimited alerts", () => {
    expect(resolve(paid("keep_warm"))).toMatchObject({ plan: "keep_warm", planLabel: "Keep warm", tier: "keep_warm", openRequests: 5, creditsPerMonth: 4, carryover: 1, savedAlerts: null, showcase: { pieces: 3, pins: 1 }, assistants: false, tools: { preparation: "limited", included: [] }, humanTime: NO_HUMAN });
  });

  it("human expert review is a session, never an included credit tool", () => {
    for (const plan of ENTITLED_PLAN_IDS) expect(planEntitlementsFor(plan).tools.included.map(String)).not.toContain("review");
  });

  it("assistants follow the Land tier, never Start or Momentum", () => {
    for (const plan of CATALOG_PLAN_IDS) expect(resolve(paid(plan)).assistants).toBe(plan.startsWith("land_"));
    for (const reserved of ["land_100", "land_200", "land_500"]) expect(resolve(paid(reserved))).toMatchObject({ plan: "free", assistants: false, paidThrough: null });
  });

  // D-067 (owner, Oct 18 2026): Pro/Max are removed with no grandfathering. A
  // wallet still marked pro/max reads as Free — no label, no perk, no term — even
  // while the provider still reports it active, because nothing can bill it again.
  it("a stored Pro or Max wallet reads as Free, with no grandfathering left", () => {
    for (const legacy of ["pro", "max"]) {
      expect(resolve(paid(legacy))).toMatchObject({ plan: "free", planLabel: "Free", tier: "free", legacy: false, openRequests: 3, creditsPerMonth: 3, assistants: false, paidThrough: null });
      expect(resolve(paid(legacy, { subscriptionStatus: "non_renewing" })).plan).toBe("free");
    }
  });

  it("a paid plan counts only while billing inside its term (JS clock)", () => {
    expect(isPaidPlanActive(paid("momentum"), NOW)).toBe(true);
    expect(resolve(paid("momentum", { subscriptionStatus: "non_renewing" })).plan).toBe("momentum");
    expect(resolve(paid("momentum", { subscriptionStatus: "cancelled" })).plan).toBe("free");
    expect(resolve(paid("momentum", { subscriptionStatus: null })).plan).toBe("free");
    expect(resolve(paid("momentum", { subscriptionCurrentTermEnd: null })).plan).toBe("free");
    expect(resolve(paid("momentum", { subscriptionCurrentTermEnd: NOW })).plan).toBe("free");
    expect(resolve(paid("land_sprint", { subscriptionCurrentTermEnd: new Date(NOW.getTime() - 1) })).assistants).toBe(false);
  });

  it("a pass carries its end and ends cleanly: the plan in force reads as Free from the term end on", () => {
    const end = new Date(NOW.getTime() + 5 * DAY);
    expect(resolve(paid("momentum", { subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: end }))).toMatchObject({ plan: "momentum", openRequests: 15, paidThrough: end.toISOString() });
    expect(resolvePlanEntitlements(paid("momentum", { subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: end }), end)).toMatchObject({ plan: "free", openRequests: 3, paidThrough: null });
    expect(planEntitlementsFor("momentum").paidThrough).toBeNull();
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

describe("reverse trial (one-time, 14 days, Momentum's open asks)", () => {
  const free = (trialEndsAt: Date | null): EntitlementWallet => ({ plan: "free", subscriptionStatus: null, subscriptionCurrentTermEnd: null, trialEndsAt });

  it("lifts a Free seeker to 15 open asks while it runs, and nothing else", () => {
    const end = new Date(NOW.getTime() + 10 * DAY);
    const trial = resolve(free(end));
    expect(trial).toMatchObject({ plan: "free", planLabel: "Momentum trial", tier: "free", openRequests: 15, creditsPerMonth: 3, savedAlerts: 3, assistants: false, paidThrough: null, trialEndsAt: end.toISOString() });
    expect(trial.tools.included).toEqual([]);
    expect(planEntitlementsSchema.parse(trial).trialEndsAt).toBe(end.toISOString());
    expect(isTrialActive(free(end), NOW)).toBe(true);
  });

  it("ends at its end date and never applies before it is started", () => {
    expect(resolve(free(NOW))).toMatchObject({ planLabel: "Free", openRequests: 3, trialEndsAt: null });
    expect(resolve(free(null))).toMatchObject({ openRequests: 3, trialEndsAt: null });
    expect(resolve({ plan: "free", subscriptionStatus: null, subscriptionCurrentTermEnd: null })).toMatchObject({ openRequests: 3, trialEndsAt: null });
  });

  it("never lowers a paid plan: a weaker pass bought mid-trial keeps 15 open asks until the trial ends", () => {
    const end = new Date(NOW.getTime() + 3 * DAY);
    expect(resolve(paid("start", { trialEndsAt: end }))).toMatchObject({ plan: "start", openRequests: 15, creditsPerMonth: 10, trialEndsAt: end.toISOString() });
    expect(resolve(paid("land_focus", { trialEndsAt: end }))).toMatchObject({ plan: "land_focus", openRequests: 30, trialEndsAt: null });
  });
});

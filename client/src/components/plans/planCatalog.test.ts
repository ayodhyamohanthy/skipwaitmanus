import { describe, expect, it } from "vitest";
import { CATALOG_PLANS, FREE_PLAN } from "@shared/planCatalog";
import { activePaidPlan, fairnessRules, planCards, planFaqs, planLimits } from "./planCatalog";

// D-012 item 3: messages with a referrer open only after that referrer accepts,
// on every plan, so no plan copy may sell messaging referrers or faster answers.
const PERK_PROMISE = /message (verified )?referrers|referrers directly|direct messag|\bDMs?\b|answers faster/i;
// D-067 removed Pro and Max completely: no screen may name them or their prices.
const RETIRED = /\bPro\b|\bMax\b|\$7\b|\$15\b|₹599|₹1,299/;

const start = CATALOG_PLANS.find(plan => plan.id === "start")!;
const momentum = CATALOG_PLANS.find(plan => plan.id === "momentum")!;

describe("plan catalog copy after D-012 item 3 and D-067", () => {
  for (const currency of ["USD", "INR"] as const) {
    it(`never sells messaging referrers (${currency})`, () => {
      const copy = [
        ...planCards(currency, start).flatMap(card => [card.name, card.tagline, card.price, card.per, ...card.features, card.cta]),
        ...fairnessRules,
        ...planFaqs().flat(),
      ];
      for (const line of copy) expect(line).not.toMatch(PERK_PROMISE);
    });

    it(`never names a retired plan (${currency})`, () => {
      const copy = [...planCards(currency, start).flatMap(card => [card.name, card.tagline, ...card.features, card.cta]), ...fairnessRules, ...planFaqs().flat()];
      for (const line of copy) expect(line).not.toMatch(RETIRED);
    });
  }

  it("states the D-063 money sentence in the fairness band and never calls referrals free", () => {
    expect(fairnessRules).toContain("3 asks free every month; more use credits.");
    expect(fairnessRules).toContain("Referrers are never paid and never ask you for money.");
    for (const line of [...fairnessRules, ...planFaqs().flat()]) expect(line).not.toMatch(/always free|free\.\s*always|referrals (?:are|stay) free/i);
  });

  it("renders Free alone, and Free plus the account's own catalog plan", () => {
    expect(planCards("USD").map(card => card.id)).toEqual(["free"]);
    const [, pass] = planCards("USD", start);
    expect(pass.id).toBe("start");
    expect(pass.features).toEqual([
      "8 referral requests open at once",
      "10 credits every month",
      "Unused plan credits carry over 1 month",
      "Cancel anytime; access stays through the paid cycle",
      "Same referrer queue as every plan",
    ]);
    expect(planCards("USD", start)[0].features).toContain("3 referral requests open at once");
  });

  it("prices a pass from the shared catalog, never from copy written here", () => {
    expect(planCards("USD", start)[1].price).toBe("$8");
    expect(planCards("INR", start)[1].price).toBe("₹299");
    expect(planCards("USD", start)[1].per).toBe("for 30 days");
    expect(planCards("USD")[0].price).toBe("$0");
    // The numbers on the card are the enforced limits, not a copy of them.
    expect(planLimits("start")).toEqual({ openRequests: start.openRequests, creditsPerMonth: start.creditsPerMonth, carryover: start.carryover });
    expect(planLimits("momentum").openRequests).toBe(momentum.openRequests);
    expect(planLimits("free").openRequests).toBe(FREE_PLAN.openRequests);
  });

  it("reads a retired or unknown stored plan as Free", () => {
    for (const plan of ["pro", "max", "land_100"]) {
      const summary = { plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z" } as never;
      expect(activePaidPlan(summary)).toBeNull();
    }
    const held = { plan: "start", subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z" } as never;
    expect(activePaidPlan(held)?.id).toBe("start");
  });
});

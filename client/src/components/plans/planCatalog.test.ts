import { describe, expect, it } from "vitest";
import { CATALOG_PLANS, FREE_PLAN } from "@shared/planCatalog";
import { activePaidPlan, creditFrom, fairnessRules, planCards, planFaqs, planLimits } from "./planCatalog";

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
      ].filter((line): line is string => line !== null);
      for (const line of copy) expect(line).not.toMatch(PERK_PROMISE);
    });

    it(`never names a retired plan (${currency})`, () => {
      const copy = [...planCards(currency, start).flatMap(card => [card.name, card.tagline, ...card.features, card.cta]), ...fairnessRules, ...planFaqs().flat()];
      for (const line of copy) expect(line).not.toMatch(RETIRED);
    });
  }

  it("states the D-063 money sentence in the fairness band and never calls referrals free", () => {
    expect(fairnessRules).toContain("3 free referrals every month; extra asks use credits.");
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

  // Review round 2 (D-067): the credit summary carries no term or subscription currency, so the
  // account's own plan card states no price (a 90-day Momentum holder is never shown "$24 for 30
  // days", nor a USD subscriber a rupee price). Free still shows its own price and term.
  it("prices Free from the shared catalog and states no price on the account's own plan", () => {
    for (const currency of ["USD", "INR"] as const) {
      for (const plan of [start, momentum]) {
        const [, own] = planCards(currency, plan);
        expect(own.price).toBeNull();
        expect(own.per).toBeNull();
      }
    }
    expect(planCards("USD")[0].price).toBe("$0");
    expect(planCards("INR")[0].price).toBe("₹0");
    expect(planCards("USD")[0].per).toBe("always");
    // The numbers on the card are the enforced limits, not a copy of them.
    expect(planLimits("start")).toEqual({ openRequests: start.openRequests, creditsPerMonth: start.creditsPerMonth, carryover: start.carryover });
    expect(planLimits("momentum").openRequests).toBe(momentum.openRequests);
    expect(planLimits("free").openRequests).toBe(FREE_PLAN.openRequests);
  });

  // Review round 2 (D-063/D-042): buying credits never changes the open-ask limit (the cap follows
  // the plan, and no plan is on sale), so no answer may say paying gives more open requests.
  it("never says paying gives more open requests", () => {
    const answer = planFaqs().find(([question]) => question === "Does paying help me get referred?")?.[1] ?? "";
    expect(answer).toBe("No. Referrers see the same queue whatever you have paid for. Credits you buy pay for asks and tools; they never change how many requests you can have open or your place in the queue. The decision to refer stays human.");
    for (const [, line] of planFaqs()) expect(line).not.toMatch(/more open requests/i);
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

describe("creditFrom: the per-credit line comes only from live packs", () => {
  const packs = [
    { credits: 2, amount: 9_900, available: true },
    { credits: 25, amount: 119_900, available: true },
    { credits: 150, amount: 599_900, available: true },
  ];
  it("is the cheapest to dearest pack price per credit, from the catalog amounts", () => {
    expect(creditFrom({ currency: "INR", packs })).toBe("₹39.99 to ₹49.50");
    expect(creditFrom({ currency: "USD", packs: [{ credits: 5, amount: 500, available: true }, { credits: 150, amount: 10_500, available: true }] })).toBe("$0.70 to $1.00");
  });
  it("ignores packs off sale and is null with no pack or no catalog", () => {
    expect(creditFrom({ currency: "INR", packs: packs.map(p => (p.credits === 150 ? { ...p, available: false } : p)) })).toBe("₹47.96 to ₹49.50");
    expect(creditFrom({ currency: "INR", packs: packs.map(p => ({ ...p, available: false })) })).toBeNull();
    expect(creditFrom(null)).toBeNull();
  });
});

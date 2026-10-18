import { describe, expect, it } from "vitest";
import { compareRows, fairnessRules, planCards, planFaqs } from "./planCatalog";

// D-012 item 3: messages with a referrer open only after that referrer accepts,
// on every plan, so no plan copy may sell messaging referrers or faster answers.
const PERK_PROMISE = /message (verified )?referrers|referrers directly|direct messag|\bDMs?\b|answers faster/i;

describe("plan catalog copy after D-012 item 3", () => {
  for (const currency of ["USD", "INR"] as const) {
    it(`never sells messaging referrers (${currency})`, () => {
      const copy = [
        ...planCards(currency).flatMap(card => [card.tagline, ...card.features, card.cta]),
        ...compareRows(currency).map(([feature]) => feature),
        ...fairnessRules,
        ...planFaqs().flat(),
      ];
      for (const line of copy) expect(line).not.toMatch(PERK_PROMISE);
    });
  }

  it("states the D-063 money sentence in the fairness band and never calls referrals free", () => {
    expect(fairnessRules).toContain("3 asks free every month; more use credits.");
    expect(fairnessRules).toContain("Referrers are never paid and never ask you for money.");
    for (const line of [...fairnessRules, ...planFaqs().flat()]) expect(line).not.toMatch(/always free|free\.\s*always|referrals (?:are|stay) free/i);
  });

  it("keeps every other Pro and Max feature, stated as the server enforces it", () => {
    // The copy reads the enforced entitlements (shared/planEntitlements.ts), so a
    // grandfathered Pro keeps at least what it pays for: 10 open asks at once,
    // 10 credits a month and 1 month of credit carryover (Max: 30/30/3).
    const [, pro, max] = planCards("USD");
    expect(pro.features).toEqual(["10 referral requests open at once", "10 credits every month", "Unused plan credits carry over 1 month", "Cancel anytime; access stays through the paid cycle", "Same referrer queue as every plan"]);
    expect(max.features).toContain("30 referral requests open at once");
    expect(max.features).toContain("Unused plan credits carry over up to 3 months");
    expect(max.features).toContain("Connect ChatGPT, Claude or your own tools (you approve every send)");
    expect(compareRows("USD").map(([feature]) => feature)).toContain("Connect an AI assistant");
  });
});

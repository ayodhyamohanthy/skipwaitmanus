import { describe, expect, it } from "vitest";
import { fairnessRules, freePlanCard, planFaqs, planLabel, planLimits } from "./planCatalog";

// D-012 item 3: messages with a referrer open only after that referrer accepts,
// on every plan, so no copy may sell messaging referrers or faster answers.
const PERK_PROMISE = /message (verified )?referrers|referrers directly|direct messag|\bDMs?\b|answers faster/i;

// D-067 (owner, Oct 18 2026): Pro/Max are removed. No screen copy may name a
// retired plan, a retired price or a perk that no longer exists.
const RETIRED = /\bPro\b|\bMax\b|Pro\/Max|\$7|\$15|₹599|₹1,299/;

describe("plan catalog copy after D-067", () => {
  for (const currency of ["USD", "INR"] as const) {
    it(`never sells messaging referrers or a retired plan (${currency})`, () => {
      const card = freePlanCard(currency);
      const copy = [card.name, card.tagline, ...card.features, card.cta, ...fairnessRules, ...planFaqs().flat()];
      for (const line of copy) {
        expect(line).not.toMatch(PERK_PROMISE);
        expect(line).not.toMatch(RETIRED);
      }
    });
  }

  it("states the D-063 money sentence in the fairness band and never calls referrals free", () => {
    expect(fairnessRules).toContain("3 asks free every month; more use credits.");
    expect(fairnessRules).toContain("Referrers are never paid and never ask you for money.");
    for (const line of [...fairnessRules, ...planFaqs().flat()]) expect(line).not.toMatch(/always free|free\.\s*always|referrals (?:are|stay) free/i);
  });

  it("states the free allowance exactly as the server enforces it", () => {
    const free = planLimits("free");
    const card = freePlanCard("USD");
    expect(card.features[0]).toBe(`${free.openRequests} referral requests open at once`);
    expect(card.features[1]).toBe(`${free.creditsPerMonth} credits every month, then buy more as you need them`);
    expect(card.features).toContain("Add credits anytime, $1 each");
  });

  it("reads a stored pro/max wallet as Free instead of naming it", () => {
    // D-067 keeps the ENUM members for history; the label must not leak them.
    expect(planLabel("pro")).toBe("Free");
    expect(planLabel("max")).toBe("Free");
    expect(planLabel("free")).toBe("Free");
  });
});

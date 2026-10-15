import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_PLANS } from "@shared/subscriptionPlans";
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

  it("keeps every other Pro and Max feature", () => {
    const [, pro, max] = planCards("USD");
    expect(pro.features).toEqual([`${SUBSCRIPTION_PLANS.pro.monthlyAllowance} referral requests every month`, "Monthly credits reset with your plan cycle", "Cancel anytime; access stays through the paid cycle", "Same referrer queue as every plan"]);
    expect(max.features).toContain(`${SUBSCRIPTION_PLANS.max.monthlyAllowance} referral requests every month`);
    expect(max.features).toContain("Connect ChatGPT, Claude or your own tools (you approve every send)");
    expect(compareRows("USD").map(([feature]) => feature)).toContain("Connect an AI assistant");
  });
});

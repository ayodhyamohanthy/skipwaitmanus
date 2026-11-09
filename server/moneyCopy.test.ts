import { describe, expect, it } from "vitest";
import { ASK_COST_SENTENCE, FREE_ASKS_CHIP, FREE_ASKS_PER_MONTH, MONEY_SENTENCE, MONEY_SENTENCE_SHORT, REFERRER_MONEY_SENTENCE, REFERRERS_NEVER_PAID } from "../shared/moneyCopy";
import { FREE_PLAN } from "../shared/planCatalog";
import { FREE_MONTHLY_ALLOWANCE } from "../shared/subscriptionPlans";

// D-063: every surface that says what asking costs renders these strings, so
// they are pinned here against the owner's words and against what the ledger
// actually grants.
describe("D-063 money copy", () => {
  it("is the owner's sentence, verbatim", () => {
    expect(MONEY_SENTENCE).toBe("3 free referrals every month; extra asks use credits. Referrers are never paid and never ask you for money.");
    expect(MONEY_SENTENCE).toBe(`${ASK_COST_SENTENCE} ${REFERRER_MONEY_SENTENCE}`);
  });

  it("takes its number from the allowance the ledger grants a Free seeker each month", () => {
    expect(FREE_ASKS_PER_MONTH).toBe(FREE_PLAN.creditsPerMonth);
    expect(FREE_ASKS_PER_MONTH).toBe(FREE_MONTHLY_ALLOWANCE);
  });

  it("keeps both facts in the shorter form", () => {
    expect(MONEY_SENTENCE_SHORT).toBe("3 free referrals every month; extra asks use credits. Referrers are never paid.");
    expect(MONEY_SENTENCE_SHORT).toContain(ASK_COST_SENTENCE);
    expect(MONEY_SENTENCE_SHORT).toContain(REFERRERS_NEVER_PAID);
    expect(FREE_ASKS_CHIP).toBe("3 free referrals every month");
  });

  it("never calls referrals free without the monthly limit", () => {
    for (const line of [ASK_COST_SENTENCE, REFERRER_MONEY_SENTENCE, MONEY_SENTENCE, MONEY_SENTENCE_SHORT, FREE_ASKS_CHIP]) {
      expect(line).not.toMatch(/always free|free[.,]?\s+always|referrals? (?:are|is|stay|stays) free|free (?:job )?referrals(?! every month)/i);
    }
  });
});

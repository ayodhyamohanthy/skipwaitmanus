// Live plan facts for the kit v4 /plans and /billing screens.
//
// D-067 (owner, Oct 18 2026) removed Pro/Max completely, so Free is the only
// plan and a credit is the only thing for sale. Everything a screen states here
// comes from the same contract the server enforces: open requests and cycle
// credits from shared/planEntitlements.ts, the credit price from /premium. No
// screen may quote a plan or a price that checkout cannot charge.
import { ASK_COST_SENTENCE, CREDIT_RULE_SHORT, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { billingPlanLabel } from "@shared/billingCatalog";
import { planEntitlementsFor } from "@shared/planEntitlements";
import type { SubscriptionCurrency } from "@shared/subscriptionPlans";
import type { CreditSummary } from "./billingApi";

export type { CreditSummary } from "./billingApi";

/** One extra pack credit, as sold on /premium. */
export const CREDIT_PRICE: Record<SubscriptionCurrency, string> = { USD: "$1", INR: "₹99" };

/**
 * A plan's display name. A stored pro/max wallet reads as Free (D-067), exactly
 * like an unknown id, because planEntitlementsFor resolves it that way.
 */
export function planLabel(plan: string): string {
  return billingPlanLabel(plan);
}

/** Open requests at once ("Unlimited" when uncapped) and the cycle credits a plan grants, as the server enforces them. */
export function planLimits(plan: string) {
  const entitlements = planEntitlementsFor(plan);
  return { openRequests: entitlements.openRequests, creditsPerMonth: entitlements.creditsPerMonth, carryover: entitlements.carryover };
}

export function openRequestsLabel(openRequests: number | null): string {
  return openRequests === null ? "Unlimited" : String(openRequests);
}

/** A plan the account is paying for right now (renewing, or ending at term end). */
export function hasActivePaidPlan(summary: CreditSummary | null): boolean {
  return Boolean(summary && summary.plan !== "free" && (summary.subscriptionStatus === "active" || summary.subscriptionStatus === "non_renewing"));
}

/** The Free card: the one plan every account is on, stated from the enforced entitlements. */
export function freePlanCard(currency: SubscriptionCurrency): { name: string; tagline: string; features: string[]; cta: string } {
  const free = planLimits("free");
  return {
    name: planLabel("free"),
    tagline: "Everything you need to ask: private requests, one referrer queue.",
    features: [
      `${openRequestsLabel(free.openRequests)} referral requests open at once`,
      `${free.creditsPerMonth} credits every month, then buy more as you need them`,
      "Track every request in one place",
      ...(CREDIT_PACKS_ON_SALE ? [`Add credits anytime, ${CREDIT_PRICE[currency]} each`] : []),
      "Same referrer queue as everyone",
    ],
    cta: "Ask for a referral",
  };
}

// D-063: the band carries the whole money sentence, one half per rule.
export const fairnessRules = [
  ASK_COST_SENTENCE,
  "Paying never moves you up a referrer's queue.",
  REFERRER_MONEY_SENTENCE,
  "No commissions on hires. No paid priority.",
];

export function planFaqs(): Array<readonly [string, string]> {
  const free = planLimits("free");
  return [
    ["Does paying help me get referred?", "No. Referrers see the same queue whatever you spend. Credits buy more asks; the decision stays human."],
    ["How many referral requests can I have open?", `${openRequestsLabel(free.openRequests)} at a time on Free. A request that's answered, passed, withdrawn or expired frees its slot.`],
    ["What are credits for?", `1 credit = ${CREDIT_PRICE.USD} = one finished piece of work from SkipWait's tools. Each referral request uses 1 credit; ${CREDIT_RULE_SHORT}. Free includes ${free.creditsPerMonth} credits a month; extra credits are ${CREDIT_PRICE.USD} each (${CREDIT_PRICE.INR} in India).`],
    ["Do unused credits expire?", "Credits you buy never expire. Your free credits reset each month and do not carry over."],
    ["Can I cancel?", "There is nothing to cancel: Free has no subscription and credits are bought one at a time."],
    ["Do referrers pay?", "No. Referrers never pay to review requests, SkipWait never pays them, and they never ask you for money."],
    ["Is pricing local?", `Yes. In India a credit is ${CREDIT_PRICE.INR}; elsewhere it is ${CREDIT_PRICE.USD}. The price is shown before checkout.`],
  ];
}

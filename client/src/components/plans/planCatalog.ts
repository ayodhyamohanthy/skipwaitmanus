// Live plan catalog for the kit v4 /plans and /billing screens.
// Every price derives from shared/subscriptionPlans.ts (the same contract the
// server charges against); open requests, monthly credits and carryover come
// from shared/planEntitlements.ts (legacy Pro/Max grandfathered), the rules the
// server enforces. Kit tier names and example prices are not used here: live
// checkout still sells Free / Pro / Max.
import { CREDIT_PACKS_ON_SALE, type Carryover } from "@shared/planCatalog";
import { planEntitlementsFor } from "@shared/planEntitlements";
import { SUBSCRIPTION_PLANS, isPaidSubscriptionPlan, type PaidSubscriptionPlan, type SubscriptionCurrency } from "@shared/subscriptionPlans";
import type { CreditSummary } from "./billingApi";

export type PlanId = "free" | PaidSubscriptionPlan;

export type { CreditSummary } from "./billingApi";

export const PAID_PLANS: readonly PaidSubscriptionPlan[] = ["pro", "max"];

/** One extra pack credit, as sold on /premium. */
export const CREDIT_PRICE: Record<SubscriptionCurrency, string> = { USD: "$1", INR: "₹99" };

export function planLabel(plan: string): string {
  if (plan === "pro" || plan === "max") return SUBSCRIPTION_PLANS[plan].label;
  if (plan === "free") return "Free";
  return plan;
}

/** "$7/month" → "$7"; the cadence is rendered separately in the kit card. */
export function planAmount(plan: PlanId, currency: SubscriptionCurrency): string {
  if (plan === "free") return currency === "INR" ? "₹0" : "$0";
  return SUBSCRIPTION_PLANS[plan].prices[currency].display.replace(/\/month$/, "");
}

export function planPriceDisplay(plan: PaidSubscriptionPlan, currency: SubscriptionCurrency): string {
  return SUBSCRIPTION_PLANS[plan].prices[currency].display;
}

/** Open requests at once ("Unlimited" when uncapped), plan credits a month and carryover, as the server enforces them. */
export function planLimits(plan: PlanId) {
  const entitlements = planEntitlementsFor(plan);
  return { openRequests: entitlements.openRequests, creditsPerMonth: entitlements.creditsPerMonth, carryover: entitlements.carryover };
}

export function openRequestsLabel(openRequests: number | null): string {
  return openRequests === null ? "Unlimited" : String(openRequests);
}

/** "1 month", "3 months", "Rolls over" (while subscribed) or "—" (none). */
export function carryoverLabel(carryover: Carryover): string {
  if (carryover === "subscribed") return "Rolls over";
  return carryover === 0 ? "—" : `${carryover} month${carryover === 1 ? "" : "s"}`;
}

function carryoverFeature(carryover: Carryover): string {
  if (carryover === "subscribed") return "Unused plan credits roll over while you're subscribed";
  return carryover === 0 ? "Unused plan credits end with the cycle" : `Unused plan credits carry over ${carryover === 1 ? "1 month" : `up to ${carryover} months`}`;
}

/** A plan the account is paying for right now (renewing, or ending at term end). */
export function hasActivePaidPlan(summary: CreditSummary | null): boolean {
  return Boolean(summary && summary.plan !== "free" && (summary.subscriptionStatus === "active" || summary.subscriptionStatus === "non_renewing"));
}

/** The paid plan the account is on right now, or null on Free. */
export function activePaidPlan(summary: CreditSummary | null): PaidSubscriptionPlan | null {
  return summary && hasActivePaidPlan(summary) && isPaidSubscriptionPlan(summary.plan) ? summary.plan : null;
}

/** The next plan up with a larger monthly allowance (Free → Pro → Max), or null on Max. */
export function nextPlanUp(plan: string): PaidSubscriptionPlan | null {
  if (plan === "max") return null;
  return plan === "pro" ? "max" : "pro";
}

export type PlanCardCopy = { id: PlanId; name: string; tagline: string; features: string[]; cta: string };

export function planCards(currency: SubscriptionCurrency): PlanCardCopy[] {
  const free = planLimits("free");
  const pro = planLimits("pro");
  const max = planLimits("max");
  return [
    {
      id: "free",
      name: "Free",
      tagline: "For getting started: a few private asks at a time.",
      features: [`${openRequestsLabel(free.openRequests)} referral requests open at once`, "Track every request in one place", ...(CREDIT_PACKS_ON_SALE ? [`Add credits anytime, ${CREDIT_PRICE[currency]} each`] : []), "Same referrer queue as every plan"],
      cta: "Ask for a referral",
    },
    {
      id: "pro",
      name: SUBSCRIPTION_PLANS.pro.label,
      tagline: "For a focused search: more open asks and monthly credits.",
      features: [`${openRequestsLabel(pro.openRequests)} referral requests open at once`, `${pro.creditsPerMonth} credits every month`, carryoverFeature(pro.carryover), "Cancel anytime; access stays through the paid cycle", "Same referrer queue as every plan"],
      cta: `Upgrade to ${SUBSCRIPTION_PLANS.pro.label}`,
    },
    {
      id: "max",
      name: SUBSCRIPTION_PLANS.max.label,
      tagline: "For a search that is your full-time job: the most open asks and your own assistant.",
      features: [`Everything in ${SUBSCRIPTION_PLANS.pro.label}`, `${openRequestsLabel(max.openRequests)} referral requests open at once`, `${max.creditsPerMonth} credits every month`, "Connect ChatGPT, Claude or your own tools (you approve every send)", carryoverFeature(max.carryover), "Same referrer queue as every plan"],
      cta: `Upgrade to ${SUBSCRIPTION_PLANS.max.label}`,
    },
  ];
}

export type CompareValue = boolean | string;

export function compareRows(currency: SubscriptionCurrency): Array<readonly [string, CompareValue, CompareValue, CompareValue]> {
  const credit = `${CREDIT_PRICE[currency]} each`;
  const [free, pro, max] = (["free", "pro", "max"] as const).map(planLimits);
  const monthly = (credits: number) => (credits > 0 ? String(credits) : "—");
  return [
    ["Ask for referrals", true, true, true],
    ["Open requests at once", openRequestsLabel(free.openRequests), openRequestsLabel(pro.openRequests), openRequestsLabel(max.openRequests)],
    ["Place in referrer queue", "Equal", "Equal", "Equal"],
    ["Credits every month", monthly(free.creditsPerMonth), monthly(pro.creditsPerMonth), monthly(max.creditsPerMonth)],
    ["Extra credits", credit, credit, credit],
    ["Connect an AI assistant", false, false, true],
    ["Monthly credit carryover", carryoverLabel(free.carryover), carryoverLabel(pro.carryover), carryoverLabel(max.carryover)],
    ["Bought credits expire", "Never", "Never", "Never"],
  ];
}

export const fairnessRules = [
  "Every account gets free referral credits each month.",
  "Paying never moves you up a referrer's queue.",
  "Referrers never pay to review requests.",
  "No commissions on hires. No paid priority.",
];

export function planFaqs(): Array<readonly [string, string]> {
  const pro = SUBSCRIPTION_PLANS.pro;
  const max = SUBSCRIPTION_PLANS.max;
  const [free, proLimits, maxLimits] = (["free", "pro", "max"] as const).map(planLimits);
  const carry = (carryover: Carryover) => (carryover === "subscribed" ? "while you're subscribed" : carryover === 1 ? "1 month" : `up to ${carryover} months`);
  return [
    ["Does paying help me get referred?", "No. Referrers see the same queue whatever plan you are on. Paid plans add more open requests at once and monthly credits; the decision stays human."],
    ["How many referral requests can I have open?", `Free includes ${openRequestsLabel(free.openRequests)} open requests at a time. ${pro.label} raises it to ${openRequestsLabel(proLimits.openRequests)} and ${max.label} to ${openRequestsLabel(maxLimits.openRequests)}. A request that's answered, passed, withdrawn or expired frees its slot. Every plan shares the same queue.`],
    ["What are credits for?", `1 credit = ${CREDIT_PRICE.USD} = one finished piece of work from SkipWait's tools. Each referral request uses 1 credit, returned if you withdraw before pickup or it expires. ${pro.label} includes ${proLimits.creditsPerMonth} credits a month and ${max.label} ${maxLimits.creditsPerMonth}; extra credits are ${CREDIT_PRICE.USD} each (${CREDIT_PRICE.INR} in India).`],
    ["Do unused credits expire?", `Credits you buy never expire — even if you cancel. Monthly plan credits carry over ${carry(proLimits.carryover)} on ${pro.label} and ${carry(maxLimits.carryover)} on ${max.label}, and end when the paid plan ends.`],
    ["Can I cancel?", "Anytime, from Manage plan. Paid access stays through the current cycle, then your account returns to Free."],
    ["Do referrers pay?", "Never to review requests. Referrers are always free."],
    ["Is pricing local?", `Yes. In India plans are charged in rupees (${pro.label} ${pro.prices.INR.display}, ${max.label} ${max.prices.INR.display}); elsewhere in US dollars (${pro.prices.USD.display}, ${max.prices.USD.display}).`],
  ];
}

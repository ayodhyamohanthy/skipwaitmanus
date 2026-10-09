// Live plan catalog for the kit v4 /plans and /billing screens.
// Every price and allowance derives from shared/subscriptionPlans.ts (the same
// contract the server charges against). Kit tier names and example prices are
// deliberately not used: live pricing stays Free / Pro / Max (founder call).
import { FREE_MONTHLY_ALLOWANCE, SUBSCRIPTION_PLANS, isPaidSubscriptionPlan, type PaidSubscriptionPlan, type SubscriptionCurrency } from "@shared/subscriptionPlans";
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

export function monthlyAllowance(plan: PlanId): number {
  return plan === "free" ? FREE_MONTHLY_ALLOWANCE : SUBSCRIPTION_PLANS[plan].monthlyAllowance;
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
  return [
    {
      id: "free",
      name: "Free",
      tagline: "For getting started: a few private asks every month.",
      features: [`${FREE_MONTHLY_ALLOWANCE} referral requests every month`, "Track every request in one place", `Add credits anytime, ${CREDIT_PRICE[currency]} each`, "Same referrer queue as every plan"],
      cta: "Ask for a referral",
    },
    {
      id: "pro",
      name: SUBSCRIPTION_PLANS.pro.label,
      tagline: "For a focused search: more asks every month and direct messages.",
      features: [`${SUBSCRIPTION_PLANS.pro.monthlyAllowance} referral requests every month`, "Message referrers directly", "Monthly credits reset with your plan cycle", "Cancel anytime; access stays through the paid cycle", "Same referrer queue as every plan"],
      cta: `Upgrade to ${SUBSCRIPTION_PLANS.pro.label}`,
    },
    {
      id: "max",
      name: SUBSCRIPTION_PLANS.max.label,
      tagline: "For a search that is your full-time job: the most asks and your own assistant.",
      features: [`Everything in ${SUBSCRIPTION_PLANS.pro.label}`, `${SUBSCRIPTION_PLANS.max.monthlyAllowance} referral requests every month`, "Connect ChatGPT, Claude or your own tools (you approve every send)", "Monthly credits reset with your plan cycle", "Same referrer queue as every plan"],
      cta: `Upgrade to ${SUBSCRIPTION_PLANS.max.label}`,
    },
  ];
}

export type CompareValue = boolean | string;

export function compareRows(currency: SubscriptionCurrency): Array<readonly [string, CompareValue, CompareValue, CompareValue]> {
  const credit = `${CREDIT_PRICE[currency]} each`;
  return [
    ["Ask for referrals", true, true, true],
    ["Referral requests each month", String(FREE_MONTHLY_ALLOWANCE), String(SUBSCRIPTION_PLANS.pro.monthlyAllowance), String(SUBSCRIPTION_PLANS.max.monthlyAllowance)],
    ["Place in referrer queue", "Equal", "Equal", "Equal"],
    ["Extra credits", credit, credit, credit],
    ["Message referrers directly", false, true, true],
    ["Connect an AI assistant", false, false, true],
    ["Unused monthly requests", "Reset monthly", "Reset each cycle", "Reset each cycle"],
    ["Bought credits expire", "Never", "Never", "Never"],
  ];
}

export const fairnessRules = [
  `${FREE_MONTHLY_ALLOWANCE} referral requests every month are free.`,
  "Paying never moves you up a referrer's queue.",
  "Referrers never pay to review requests.",
  "No commissions on hires. No paid priority.",
];

export function planFaqs(): Array<readonly [string, string]> {
  const pro = SUBSCRIPTION_PLANS.pro;
  const max = SUBSCRIPTION_PLANS.max;
  return [
    ["Does paying help me get referred?", "No. Referrers see the same queue whatever plan you are on. Paid plans raise your monthly request allowance; the decision stays human."],
    ["How many referral requests can I send?", `Free includes ${FREE_MONTHLY_ALLOWANCE} referral requests every month. ${pro.label} raises it to ${pro.monthlyAllowance} and ${max.label} to ${max.monthlyAllowance}. Need more in a month? Add credits at ${CREDIT_PRICE.USD} each (${CREDIT_PRICE.INR} in India).`],
    ["What are credits for?", "1 credit = one private referral request. Your monthly requests are used first; credits you buy cover the rest."],
    ["Do unused credits expire?", "Credits you buy never expire — even if you cancel. Monthly plan credits reset with your plan cycle and do not carry over."],
    ["Can I cancel?", "Anytime, from Manage plan. Paid access stays through the current cycle, then your account returns to Free."],
    ["Do referrers pay?", "Never to review requests. Referrers are always free."],
    ["Is pricing local?", `Yes. In India plans are charged in rupees (${pro.label} ${pro.prices.INR.display}, ${max.label} ${max.prices.INR.display}); elsewhere in US dollars (${pro.prices.USD.display}, ${max.prices.USD.display}).`],
  ];
}

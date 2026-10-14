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
  return (SUBSCRIPTION_PLANS[plan].prices.monthly?.[currency] ?? SUBSCRIPTION_PLANS[plan].prices[SUBSCRIPTION_PLANS[plan].intervals[0]]?.[currency])!.display.replace(/\/month$/, "");
}

export function planPriceDisplay(plan: PaidSubscriptionPlan, currency: SubscriptionCurrency): string {
  return (SUBSCRIPTION_PLANS[plan].prices.monthly?.[currency] ?? SUBSCRIPTION_PLANS[plan].prices[SUBSCRIPTION_PLANS[plan].intervals[0]]?.[currency])!.display;
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

/** The next plan up the Kit ladder (Free → Start → Momentum → Land), or null at the top. */
export function nextPlanUp(plan: string): PaidSubscriptionPlan | null {
  if (plan === "start" || plan === "pro") return "momentum";
  if (plan === "momentum" || plan === "max") return "land_100";
  if (plan === "land_100" || plan === "land_200" || plan === "land_500") return null;
  return "start";
}

export type PlanCardCopy = { id: PlanId; name: string; tagline: string; features: string[]; cta: string };

/** Legacy card copy, kept only for existing Pro/Max subscribers' billing views. */
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

/** Free grants 2 tool credits every 30 days (§3.1), on top of 3 open asks. */
const FREE_PLAN_CREDITS = 2;

/** The 4-column compare table on /plans: Free, Start, Momentum, Land. */
export function compareRows(currency: SubscriptionCurrency): Array<readonly [string, CompareValue, CompareValue, CompareValue, CompareValue]> {
  const start = SUBSCRIPTION_PLANS.start;
  const momentum = SUBSCRIPTION_PLANS.momentum;
  const land = SUBSCRIPTION_PLANS.land_100;
  const credit = `${CREDIT_PRICE[currency]} each`;
  return [
    ["Ask for referrals", true, true, true, true],
    ["Open asks at once", String(FREE_MONTHLY_ALLOWANCE), String(start.openRequests), String(momentum.openRequests), String(land.openRequests)],
    ["Credits per 30 days", String(FREE_PLAN_CREDITS), String(start.monthlyAllowance), String(momentum.monthlyAllowance), String(land.monthlyAllowance)],
    ["Place in referrer queue", "Equal", "Equal", "Equal", "Equal"],
    ["Extra credits", credit, credit, credit, credit],
    ["Monthly credit carryover", "None", "1 month", "3 months", "While Land active"],
    ["Human time included", "—", "—", "—", land.humanIncluded || "1 written review"],
    ["Bought credits expire", "Never", "Never", "Never", "Never"],
  ];
}

export const fairnessRules = [
  `${FREE_MONTHLY_ALLOWANCE} referral requests every month are free.`,
  "Paying never moves you up a referrer's queue.",
  "Referrers never pay to review requests.",
  "No commissions on hires. No paid priority.",
];

export function planFaqs(): Array<readonly [string, string]> {
  const start = SUBSCRIPTION_PLANS.start;
  const momentum = SUBSCRIPTION_PLANS.momentum;
  const land = SUBSCRIPTION_PLANS.land_100;
  return [
    ["Does paying help me get referred?", "No. Referrers see the same queue whatever plan you are on. Paid plans raise your open asks and credits; the decision stays human."],
    ["How many referral requests can I have open?", `Free holds ${FREE_MONTHLY_ALLOWANCE} open at once. Start raises it to ${start.openRequests}, Momentum to ${momentum.openRequests} and Land to ${land.openRequests}. A request that is answered or passed frees its slot.`],
    ["What are credits for?", "Credits buy finished AI work — ask rewrites, research, mock interviews and more. 1 credit = 1 finished unit. Extra open asks cost 2 credits for 30 days."],
    ["Do unused credits expire?", "Credits you buy never expire. Plan credits roll over one month on Start, three months on Momentum, and while any Land pass is active."],
    ["Can I cancel?", "Anytime, from Manage plan. Paid access stays through the current cycle, then your account returns to Free."],
    ["Do referrers pay?", "Never to review requests. Referrers are always free."],
    ["Is pricing local?", `Yes. In India plans are charged in rupees (Start ${planPriceDisplay("start", "INR")}, Momentum ${planPriceDisplay("momentum", "INR")}); elsewhere in US dollars (Start ${planPriceDisplay("start", "USD")}, Momentum ${planPriceDisplay("momentum", "USD")}). India prices include GST.`],
  ];
}

// Kit v4 /plans, /billing and /pricing view model. Every value derives from the
// shared catalog (shared/planCatalog.ts + shared/subscriptionPlans.ts) — the same
// single source of truth the server charges against in Chargebee — so the client
// can never drift from the price book. Legacy Pro/Max stay in ./planCatalog.ts
// for existing subscribers until the live switch.
import {
  CATALOG_PLANS,
  CREDIT_PACKS,
  FREE_PLAN,
  HUMAN_PRODUCTS,
  catalogPlanById,
  type CatalogPlan,
  type Carryover,
} from "@shared/planCatalog";
import {
  SUBSCRIPTION_PLANS,
  subscriptionPriceForPlan,
  type PaidSubscriptionPlan,
  type SubscriptionCurrency,
  type SubscriptionInterval,
} from "@shared/subscriptionPlans";

export type KitPlanId = PaidSubscriptionPlan;

export type KitPlanCard = {
  id: string;
  plan: PaidSubscriptionPlan;
  label: string;
  tagline: string;
  creditsPerMonth: number;
  openRequests: number | null;
  carryover: Carryover;
  humanIncluded: string;
  applicationOnly: boolean;
  /** The billing periods this plan is sold on (monthly/quarterly, or yearly for Keep warm). */
  intervals: readonly SubscriptionInterval[];
  /** The featured "Most chosen" card is the middle tier, Momentum. */
  featured: boolean;
  features: string[];
  cta: string;
};

const CARRYOVER_WORD: Record<Carryover, string> = {
  0: "no carryover",
  1: "1 month",
  3: "3 months",
  subscribed: "while any Land pass is active",
};

function baseFeatures(plan: CatalogPlan): string[] {
  const carry = CARRYOVER_WORD[plan.carryover];
  const features = [
    `${plan.creditsPerMonth} credits every 30 days`,
    `${plan.openRequests ?? 0} open asks at once`,
    `Unused credits carry over: ${carry}`,
  ];
  if (plan.humanIncluded) features.push(`Human time included: ${plan.humanIncluded}`);
  return features;
}

function card(plan: CatalogPlan, overrides: Partial<KitPlanCard>): KitPlanCard {
  return {
    id: plan.id,
    plan: plan.id as PaidSubscriptionPlan,
    label: plan.label,
    tagline: "",
    creditsPerMonth: plan.creditsPerMonth,
    openRequests: plan.openRequests,
    carryover: plan.carryover,
    humanIncluded: plan.humanIncluded,
    applicationOnly: Boolean(plan.applicationOnly),
    intervals: SUBSCRIPTION_PLANS[plan.id as PaidSubscriptionPlan].intervals,
    featured: false,
    features: baseFeatures(plan),
    cta: `Upgrade to ${plan.label}`,
    ...overrides,
  };
}

/** Keep warm is the yearly-only low tier, shown apart from the main grid. */
export const KEEP_WARM_CARD: KitPlanCard = card(catalogPlanById("keep_warm")!, {
  tagline: "Keep your account warm for a year: a few asks and a credit each month.",
});

/** The three cards of the main grid: Start, Momentum (featured) and Land Focus. */
export const KIT_PLAN_CARDS: readonly KitPlanCard[] = [
  card(catalogPlanById("start")!, { tagline: "For a focused search: more asks every month and room on the tools you use daily." }),
  card(catalogPlanById("momentum")!, { featured: true, tagline: "For interviews you can see coming: deep research and tailored prep." }),
  card(catalogPlanById("land_100")!, { tagline: "For a search that is your full-time job: the most tools and hands-on human time." }),
];

/** Land has three levels (Focus / Sprint / Concierge); the grid card defaults to Focus. */
export const LAND_LEVELS: readonly KitPlanCard[] = CATALOG_PLANS
  .filter(plan => plan.tier === "land")
  .map(plan => card(plan, { tagline: plan.label }));

export function kitPlanCard(planId: string): KitPlanCard | undefined {
  if (planId === KEEP_WARM_CARD.id) return KEEP_WARM_CARD;
  return [...KIT_PLAN_CARDS, ...LAND_LEVELS].find(c => c.id === planId);
}

/** "₹299/month" / "$19/quarter" for the selected currency and billing period. */
export function kitPlanPrice(planId: string, currency: SubscriptionCurrency, interval: SubscriptionInterval): string {
  const plan = catalogPlanById(planId);
  if (!plan) return "";
  try {
    return subscriptionPriceForPlan(plan.id as PaidSubscriptionPlan, currency, interval).display;
  } catch {
    return "";
  }
}

/** The Chargebee item price the checkout will charge for this plan/currency/interval. */
export function kitPlanItemPriceId(planId: string, currency: SubscriptionCurrency, interval: SubscriptionInterval): string | undefined {
  const plan = catalogPlanById(planId);
  if (!plan) return undefined;
  try {
    return subscriptionPriceForPlan(plan.id as PaidSubscriptionPlan, currency, interval).itemPriceId;
  } catch {
    return undefined;
  }
}

export type CreditPackCard = { id: string; credits: number; display: string; firstPack: boolean };

function money(amountMinor: number, currency: SubscriptionCurrency): string {
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${(amountMinor / 100).toLocaleString(currency === "INR" ? "en-IN" : "en-US")}`;
}

/** Credit packs available in a currency (§3.2). Purchased credits never expire. */
export function creditPackCards(currency: SubscriptionCurrency): CreditPackCard[] {
  return CREDIT_PACKS
    .filter(pack => pack.prices[currency] !== undefined)
    .map(pack => ({ id: pack.id, credits: pack.credits, display: money(pack.prices[currency]!, currency), firstPack: Boolean(pack.firstPack) }));
}

export type HumanProductCard = { id: string; label: string; display: string };

/** Human review / live sessions, sold as one-time products, never as credits (§3.2). */
export function humanProductCards(currency: SubscriptionCurrency): HumanProductCard[] {
  return HUMAN_PRODUCTS.map(product => ({ id: product.id, label: product.label, display: money(product.prices[currency], currency) }));
}

/** Free-tier facts, for the /plans and /billing empty states. */
export const FREE_FACTS = {
  openRequests: FREE_PLAN.openRequests ?? 3,
  creditsPerMonth: FREE_PLAN.creditsPerMonth,
} as const;

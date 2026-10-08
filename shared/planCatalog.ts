/**
 * Kit v4 plan catalog (screens 19 plans, 20 billing). Data only: nothing reads it
 * yet, so adding it changes no live behavior. The live price book stays in
 * subscriptionPlans.ts (Pro/Max) until the founder-approved switch.
 *
 * Numbers: kit screens for Start, Momentum and Land $100 (credits, open requests,
 * carryover). Land $200 and Concierge, the credit packs and all INR prices are the
 * founder-delegated recommendation of Oct 9, 2026, and are changeable data here.
 */
export type CatalogTier = "free" | "start" | "momentum" | "land";
export type CatalogInterval = "monthly" | "yearly";
export type CatalogCurrency = "USD" | "INR";

/** Credit carryover: months unused plan credits survive; "subscribed" rolls over while the plan is active. */
export type Carryover = 0 | 1 | 3 | "subscribed";

export type CatalogPlan = {
  id: string;
  tier: CatalogTier;
  /** Land has three levels; every other tier has one. */
  level: number;
  label: string;
  creditsPerMonth: number;
  /** null means unlimited. */
  openRequests: number | null;
  carryover: Carryover;
  /** Minor units: cents for USD, paise for INR. Yearly is billed once a year. */
  prices: Record<CatalogInterval, Record<CatalogCurrency, number>>;
};

/** Yearly = 12 months for the price of 10 ("2 months free"). */
const yearly = (monthly: number) => monthly * 10;
const usd = (dollars: number) => dollars * 100;
const inr = (rupees: number) => rupees * 100;

function plan(p: Omit<CatalogPlan, "prices"> & { monthlyUsd: number; monthlyInr: number }): CatalogPlan {
  const { monthlyUsd, monthlyInr, ...rest } = p;
  return {
    ...rest,
    prices: {
      monthly: { USD: usd(monthlyUsd), INR: inr(monthlyInr) },
      yearly: { USD: usd(yearly(monthlyUsd)), INR: inr(yearly(monthlyInr)) },
    },
  };
}

export const FREE_PLAN: CatalogPlan = {
  id: "free", tier: "free", level: 1, label: "Free", creditsPerMonth: 0, openRequests: 3, carryover: 0,
  prices: { monthly: { USD: 0, INR: 0 }, yearly: { USD: 0, INR: 0 } },
};

export const CATALOG_PLANS: readonly CatalogPlan[] = [
  plan({ id: "start", tier: "start", level: 1, label: "Start", creditsPerMonth: 10, openRequests: 8, carryover: 1, monthlyUsd: 8, monthlyInr: 699 }),
  plan({ id: "momentum", tier: "momentum", level: 1, label: "Momentum", creditsPerMonth: 30, openRequests: 15, carryover: 3, monthlyUsd: 20, monthlyInr: 1_699 }),
  plan({ id: "land_100", tier: "land", level: 1, label: "Land", creditsPerMonth: 120, openRequests: 30, carryover: "subscribed", monthlyUsd: 100, monthlyInr: 8_499 }),
  plan({ id: "land_200", tier: "land", level: 2, label: "Land", creditsPerMonth: 300, openRequests: 60, carryover: "subscribed", monthlyUsd: 200, monthlyInr: 16_999 }),
  plan({ id: "land_500", tier: "land", level: 3, label: "Land Concierge", creditsPerMonth: 1_000, openRequests: null, carryover: "subscribed", monthlyUsd: 500, monthlyInr: 42_999 }),
];

export type CreditPack = { id: string; credits: number; prices: Record<CatalogCurrency, number> };

/** Purchased credits never expire and never affect referral access or queue position. */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "pack_10", credits: 10, prices: { USD: usd(9), INR: inr(799) } },
  { id: "pack_30", credits: 30, prices: { USD: usd(24), INR: inr(1_999) } },
  { id: "pack_100", credits: 100, prices: { USD: usd(69), INR: inr(5_999) } },
  { id: "pack_300", credits: 300, prices: { USD: usd(179), INR: inr(14_999) } },
];

/** Current subscribers move to the new plan of the same rank. No grandfathering. */
export const LEGACY_PLAN_MAP = { pro: "start", max: "momentum" } as const;

export const CATALOG_TIER_ORDER: readonly CatalogTier[] = ["free", "start", "momentum", "land"];

export function catalogPlanById(id: unknown): CatalogPlan | undefined {
  if (id === FREE_PLAN.id) return FREE_PLAN;
  return CATALOG_PLANS.find(p => p.id === id);
}

export function tierRank(tier: CatalogTier): number {
  return CATALOG_TIER_ORDER.indexOf(tier);
}

/** Tier-based capability check, so access follows the tier and never a price. */
export function tierAtLeast(tier: CatalogTier, minimum: CatalogTier): boolean {
  return tierRank(tier) >= tierRank(minimum);
}

/** Chargebee item price id, e.g. skipwait_land_200_yearly-USD. Test catalog only until the switch. */
export function catalogItemPriceId(planId: string, interval: CatalogInterval, currency: CatalogCurrency): string {
  return `skipwait_${planId}_${interval}-${currency}`;
}

export function catalogPackItemPriceId(packId: string, currency: CatalogCurrency): string {
  return `skipwait_${packId}-${currency}`;
}

export function legacyPlanTarget(plan: unknown): CatalogPlan | undefined {
  if (plan === "pro" || plan === "max") return catalogPlanById(LEGACY_PLAN_MAP[plan]);
  return undefined;
}

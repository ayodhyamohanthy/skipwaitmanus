/**
 * Kit v4 plan catalog — the single source of truth for plan contents (§3.1)
 * and prices (§3.2, global USD Tier 1 + India INR). Server Chargebee rails,
 * the admin billing catalog and the client /plans, /billing and /pricing
 * screens all derive from here, so a price is changed once and cannot drift
 * between surfaces.
 *
 * Billing periods (§3.1/§3.2): monthly = 30-day pass, quarterly = 90-day pass
 * (2.3–2.65× the 30-day price; a 12–22% saving), yearly = the 12-month "Keep
 * warm" plan only. INR prices are GST-inclusive, always shown "incl. GST".
 * Human expert review and live sessions are separate one-time products,
 * removed from the credit system (§3.2). Referrals stay free on every plan and
 * queue position never changes. Plan ids are internal keys; `label` is display.
 *
 * Changeable data.
 */
import { CREDIT_ACTIONS, REGIONAL_TIERS, regionalTierForCountry, type CreditAction, type RegionalTier } from "./creditCatalog";

export { CREDIT_ACTIONS, REGIONAL_TIERS, regionalTierForCountry };
export type { CreditAction, RegionalTier };

export type CatalogTier = "free" | "keep_warm" | "start" | "momentum" | "land";
export type CatalogInterval = "monthly" | "quarterly" | "yearly";
export type CatalogCurrency = "USD" | "INR";

/** Credit carryover: months unused plan credits survive; "subscribed" rolls over while the plan is active. */
export type Carryover = 0 | 1 | 3 | "subscribed";

/** Minor-unit prices per billing interval, per currency. Only offered intervals are present. */
export type CatalogPrices = Partial<Record<CatalogInterval, Record<CatalogCurrency, number>>>;

export type CatalogPlan = {
  id: string;
  tier: CatalogTier;
  /** Land has three levels; every other tier has one. */
  level: number;
  label: string;
  /** Tool credits granted each 30 days. */
  creditsPerMonth: number;
  /** Open-ask slots. null is not used: Concierge is by-application at a cap of 75. */
  openRequests: number | null;
  carryover: Carryover;
  /** Human time included with the plan (§3.1). Empty string = none. */
  humanIncluded: string;
  /** Sold only by application (Land Concierge). */
  applicationOnly?: boolean;
  /** The billing periods this plan is sold on. */
  intervals: readonly CatalogInterval[];
  prices: CatalogPrices;
};

const usd = (dollars: number) => Math.round(dollars * 100);
const inr = (rupees: number) => Math.round(rupees * 100);

export const FREE_PLAN: CatalogPlan = {
  id: "free", tier: "free", level: 1, label: "Free",
  creditsPerMonth: 2, openRequests: 3, carryover: 0, humanIncluded: "",
  intervals: [], prices: {},
};

export const CATALOG_PLANS: readonly CatalogPlan[] = [
  { id: "keep_warm", tier: "keep_warm", level: 1, label: "Keep warm",
    creditsPerMonth: 1, openRequests: 5, carryover: 1, humanIncluded: "",
    intervals: ["yearly"], prices: { yearly: { USD: usd(29), INR: inr(999) } } },
  { id: "start", tier: "start", level: 1, label: "Start",
    creditsPerMonth: 10, openRequests: 8, carryover: 1, humanIncluded: "",
    intervals: ["monthly", "quarterly"], prices: { monthly: { USD: usd(8), INR: inr(299) }, quarterly: { USD: usd(19), INR: inr(699) } } },
  { id: "momentum", tier: "momentum", level: 1, label: "Momentum",
    creditsPerMonth: 30, openRequests: 15, carryover: 3, humanIncluded: "",
    intervals: ["monthly", "quarterly"], prices: { monthly: { USD: usd(24), INR: inr(999) }, quarterly: { USD: usd(59), INR: inr(2_499) } } },
  { id: "land_100", tier: "land", level: 1, label: "Land Focus",
    creditsPerMonth: 120, openRequests: 30, carryover: "subscribed", humanIncluded: "1 written review",
    intervals: ["monthly", "quarterly"], prices: { monthly: { USD: usd(100), INR: inr(5_999) }, quarterly: { USD: usd(249), INR: inr(13_999) } } },
  { id: "land_200", tier: "land", level: 2, label: "Land Sprint",
    creditsPerMonth: 300, openRequests: 50, carryover: "subscribed", humanIncluded: "1 written review + 1 live session",
    intervals: ["monthly", "quarterly"], prices: { monthly: { USD: usd(200), INR: inr(11_999) }, quarterly: { USD: usd(499), INR: inr(27_999) } } },
  { id: "land_500", tier: "land", level: 3, label: "Land Concierge",
    creditsPerMonth: 1_000, openRequests: 75, carryover: "subscribed", humanIncluded: "6 human hours (18 per 90 days)",
    applicationOnly: true,
    intervals: ["monthly", "quarterly"], prices: { monthly: { USD: usd(750), INR: inr(34_999) }, quarterly: { USD: usd(1_990), INR: inr(84_999) } } },
];

export type CreditPack = {
  id: string;
  credits: number;
  /** Minor units per currency. A pack need not exist in both currencies. */
  prices: Partial<Record<CatalogCurrency, number>>;
  /** The one-time first pack (§3.2): 5 credits $5, or 2 credits ₹99. It never renews. */
  firstPack?: boolean;
};

/** Purchased credits never expire and never affect referral access or queue position. */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "pack_5", credits: 5, prices: { USD: usd(5) }, firstPack: true },
  { id: "pack_2", credits: 2, prices: { INR: inr(99) }, firstPack: true },
  { id: "pack_25", credits: 25, prices: { USD: usd(22), INR: inr(1_199) } },
  { id: "pack_60", credits: 60, prices: { USD: usd(48), INR: inr(2_599) } },
  { id: "pack_150", credits: 150, prices: { USD: usd(105), INR: inr(5_999) } },
];

export type HumanProduct = { id: string; label: string; prices: Record<CatalogCurrency, number> };

/** Human time sold as one-time products, separate from the credit system (§3.2). */
export const HUMAN_PRODUCTS: readonly HumanProduct[] = [
  { id: "review", label: "Written expert review (within 48h)", prices: { USD: usd(49), INR: inr(799) } },
  { id: "session", label: "Live 45-minute session", prices: { USD: usd(99), INR: inr(1_499) } },
];

/** Current subscribers move to the new plan of the same rank. No grandfathering. */
export const LEGACY_PLAN_MAP = { pro: "start", max: "momentum" } as const;

export const CATALOG_TIER_ORDER: readonly CatalogTier[] = ["free", "keep_warm", "start", "momentum", "land"];

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

/** Chargebee item price id, e.g. skipwait_start_monthly-USD / skipwait_keep_warm_yearly-INR. */
export function catalogItemPriceId(planId: string, interval: CatalogInterval, currency: CatalogCurrency): string {
  return `skipwait_${planId}_${interval}-${currency}`;
}

export function catalogPackItemPriceId(packId: string, currency: CatalogCurrency): string {
  return `skipwait_${packId}-${currency}`;
}

/** Chargebee item price id for a human one-time product, e.g. skipwait_review-USD. */
export function catalogHumanItemPriceId(productId: string, currency: CatalogCurrency): string {
  return `skipwait_${productId}-${currency}`;
}

export function legacyPlanTarget(plan: unknown): CatalogPlan | undefined {
  if (plan === "pro" || plan === "max") return catalogPlanById(LEGACY_PLAN_MAP[plan]);
  return undefined;
}

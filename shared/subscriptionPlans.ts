import {
  CATALOG_PLANS,
  FREE_PLAN,
  catalogItemPriceId,
  type Carryover,
  type CatalogInterval,
} from "./planCatalog";

export type LegacyPaidSubscriptionPlan = "pro" | "max";
export type KitPaidSubscriptionPlan = "keep_warm" | "start" | "momentum" | "land_100" | "land_200" | "land_500";
export type PaidSubscriptionPlan = LegacyPaidSubscriptionPlan | KitPaidSubscriptionPlan;
export type SubscriptionPlan = "free" | PaidSubscriptionPlan;
export type SubscriptionCurrency = "INR" | "USD";
/** monthly = 30-day pass, quarterly = 90-day pass, yearly = 12-month (Keep warm). */
export type SubscriptionInterval = CatalogInterval;

export const FREE_MONTHLY_ALLOWANCE = FREE_PLAN.openRequests ?? 3;

export type PlanPriceEntry = {
  readonly amount: number;
  readonly display: string;
  readonly itemPriceId: string;
};

export type IntervalPrices = { readonly INR: PlanPriceEntry; readonly USD: PlanPriceEntry };

export type SubscriptionPlanConfig = {
  readonly label: string;
  /** Tool credits granted each 30 days. */
  readonly monthlyAllowance: number;
  readonly openRequests: number | null;
  readonly carryover: Carryover;
  /** Human time included with the plan (§3.1). Empty string = none. */
  readonly humanIncluded: string;
  /** Sold only by application (Land Concierge). */
  readonly applicationOnly?: boolean;
  /** The billing periods this plan is sold on. */
  readonly intervals: readonly SubscriptionInterval[];
  /** Prices per offered billing interval. */
  readonly prices: Partial<Record<SubscriptionInterval, IntervalPrices>>;
};

function fmtInr(paise: number, cadence: "month" | "quarter" | "year"): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}/${cadence}`;
}

function fmtUsd(cents: number, cadence: "month" | "quarter" | "year"): string {
  return `$${(cents / 100).toLocaleString("en-US")}/${cadence}`;
}

const CADENCE_WORD: Record<SubscriptionInterval, "month" | "quarter" | "year"> = {
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

/** Derive a Kit v4 plan's config from the shared catalog (§3.1/§3.2). */
function kitPlanEntry(planId: KitPaidSubscriptionPlan, labelOverride?: string): SubscriptionPlanConfig {
  const catalog = CATALOG_PLANS.find(p => p.id === planId)!;
  const prices: Partial<Record<SubscriptionInterval, IntervalPrices>> = {};
  for (const interval of catalog.intervals) {
    const amounts = catalog.prices[interval];
    if (!amounts) continue;
    const cadence = CADENCE_WORD[interval];
    prices[interval] = {
      INR: { amount: amounts.INR, display: fmtInr(amounts.INR, cadence), itemPriceId: catalogItemPriceId(planId, interval, "INR") },
      USD: { amount: amounts.USD, display: fmtUsd(amounts.USD, cadence), itemPriceId: catalogItemPriceId(planId, interval, "USD") },
    };
  }
  return {
    label: labelOverride ?? catalog.label,
    monthlyAllowance: catalog.creditsPerMonth,
    openRequests: catalog.openRequests,
    carryover: catalog.carryover,
    humanIncluded: catalog.humanIncluded,
    ...(catalog.applicationOnly ? { applicationOnly: true } : {}),
    intervals: catalog.intervals,
    prices,
  };
}

export const SUBSCRIPTION_PLANS: Readonly<Record<PaidSubscriptionPlan, SubscriptionPlanConfig>> = {
  pro: {
    label: "Pro", monthlyAllowance: 10, openRequests: 8, carryover: 1, humanIncluded: "",
    intervals: ["monthly", "yearly"],
    prices: {
      monthly: {
        INR: { amount: 59_900, display: "₹599/month", itemPriceId: "skipwait_pro_monthly-INR" },
        USD: { amount: 700, display: "$7/month", itemPriceId: "skipwait_pro_monthly-USD" },
      },
      yearly: {
        INR: { amount: 599_000, display: "₹5,990/year", itemPriceId: "skipwait_pro_yearly-INR" },
        USD: { amount: 7_000, display: "$70/year", itemPriceId: "skipwait_pro_yearly-USD" },
      },
    },
  },
  max: {
    label: "Max", monthlyAllowance: 30, openRequests: 15, carryover: 3, humanIncluded: "",
    intervals: ["monthly", "yearly"],
    prices: {
      monthly: {
        INR: { amount: 129_900, display: "₹1,299/month", itemPriceId: "skipwait_max_monthly-INR" },
        USD: { amount: 1_500, display: "$15/month", itemPriceId: "skipwait_max_monthly-USD" },
      },
      yearly: {
        INR: { amount: 1_299_000, display: "₹12,990/year", itemPriceId: "skipwait_max_yearly-INR" },
        USD: { amount: 15_000, display: "$150/year", itemPriceId: "skipwait_max_yearly-USD" },
      },
    },
  },
  keep_warm: kitPlanEntry("keep_warm", "Keep warm"),
  start: kitPlanEntry("start"),
  momentum: kitPlanEntry("momentum"),
  land_100: kitPlanEntry("land_100", "Land Focus"),
  land_200: kitPlanEntry("land_200", "Land Sprint"),
  land_500: kitPlanEntry("land_500", "Land Concierge"),
} as const;

export const KIT_PAID_PLANS: readonly KitPaidSubscriptionPlan[] = ["keep_warm", "start", "momentum", "land_100", "land_200", "land_500"];
export const LEGACY_PAID_PLANS: readonly LegacyPaidSubscriptionPlan[] = ["pro", "max"];
export const ALL_PAID_PLANS: readonly PaidSubscriptionPlan[] = [...LEGACY_PAID_PLANS, ...KIT_PAID_PLANS];


export function currentMonthlyCycleKey(now: Date = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isPaidSubscriptionPlan(value: unknown): value is PaidSubscriptionPlan {
  return typeof value === "string" && (ALL_PAID_PLANS as readonly string[]).includes(value);
}

export function isKitPaidSubscriptionPlan(value: unknown): value is KitPaidSubscriptionPlan {
  return typeof value === "string" && (KIT_PAID_PLANS as readonly string[]).includes(value);
}

export function isSubscriptionInterval(value: unknown): value is SubscriptionInterval {
  return value === "monthly" || value === "quarterly" || value === "yearly";
}

/** The interval a plan actually charges on. A plan sold on one interval (e.g. Keep warm, yearly) resolves to it regardless of the requested cadence. */
export function resolveSubscriptionInterval(plan: PaidSubscriptionPlan, requested: SubscriptionInterval = "monthly"): SubscriptionInterval {
  const config = SUBSCRIPTION_PLANS[plan];
  return config.prices[requested] ? requested : config.intervals[0] ?? "monthly";
}

export function subscriptionPriceForPlan(
  plan: PaidSubscriptionPlan,
  currency: SubscriptionCurrency,
  interval: SubscriptionInterval = "monthly",
): PlanPriceEntry & { interval: SubscriptionInterval } {
  const resolved = resolveSubscriptionInterval(plan, interval);
  const entry = SUBSCRIPTION_PLANS[plan].prices[resolved]?.[currency];
  if (!entry) throw new Error(`Plan ${plan} is not offered in ${currency} on the ${resolved} interval`);
  return { ...entry, interval: resolved };
}

export function subscriptionPlanFromItemPrice(itemPriceId: unknown): { plan: PaidSubscriptionPlan; currency: SubscriptionCurrency; amount: number; interval?: SubscriptionInterval } | undefined {
  if (typeof itemPriceId !== "string") return undefined;
  for (const plan of ALL_PAID_PLANS) {
    for (const currency of ["INR", "USD"] as SubscriptionCurrency[]) {
      const monthly = SUBSCRIPTION_PLANS[plan].prices.monthly?.[currency];
      if (monthly?.itemPriceId === itemPriceId) return { plan, currency, amount: monthly.amount };
      for (const interval of SUBSCRIPTION_PLANS[plan].intervals) {
        const entry = SUBSCRIPTION_PLANS[plan].prices[interval]?.[currency];
        if (entry?.itemPriceId === itemPriceId) return { plan, currency, amount: entry.amount, interval };
      }
    }
  }
  return undefined;
}

export { CATALOG_PLANS, FREE_PLAN };

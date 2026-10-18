export type SubscriptionCurrency = "INR" | "USD";

export const FREE_MONTHLY_ALLOWANCE = 3;

export function currentMonthlyCycleKey(now: Date = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/*
 * D-067 (owner, Oct 18 2026): the monthly Pro and Max plans are removed
 * completely. No subscription, entitlement or credit path reads the exports
 * below any more: no checkout sells them (410 plan_retired), no item price
 * resolves to them (shared/billingCatalog.ts), and a wallet still marked pro or
 * max reads as Free (shared/planEntitlements.ts). They remain only for the
 * callers the rest of D-067 deletes: the /plans and /pricing display code, the
 * public prerender snapshot, and the member-message "premium" check in
 * server/db.ts sendDirectMessage. Do not add a new caller.
 */
export type PaidSubscriptionPlan = "pro" | "max";

export const SUBSCRIPTION_PLANS = {
  pro: {
    label: "Pro",
    monthlyAllowance: 10,
    prices: {
      INR: { amount: 59_900, display: "₹599/month", itemPriceId: "skipwait_pro_monthly-INR" },
      USD: { amount: 700, display: "$7/month", itemPriceId: "skipwait_pro_monthly-USD" },
    },
  },
  max: {
    label: "Max",
    monthlyAllowance: 30,
    prices: {
      INR: { amount: 129_900, display: "₹1,299/month", itemPriceId: "skipwait_max_monthly-INR" },
      USD: { amount: 1_500, display: "$15/month", itemPriceId: "skipwait_max_monthly-USD" },
    },
  },
} as const;

export function isPaidSubscriptionPlan(value: unknown): value is PaidSubscriptionPlan {
  return value === "pro" || value === "max";
}

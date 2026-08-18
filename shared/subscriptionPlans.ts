export type SubscriptionPlan = "free" | "pro" | "max";
export type PaidSubscriptionPlan = Exclude<SubscriptionPlan, "free">;
export type SubscriptionCurrency = "INR" | "USD";

export const FREE_MONTHLY_ALLOWANCE = 3;

export const SUBSCRIPTION_PLANS = {
  pro: {
    label: "Pro",
    monthlyAllowance: 10,
    prices: {
      INR: { amount: 59_900, display: "₹599/month", itemPriceId: "skipwait_pro_monthly-INR" },
      USD: { amount: 1_000, display: "$10/month", itemPriceId: "skipwait_pro_monthly-USD" },
    },
  },
  max: {
    label: "Max",
    monthlyAllowance: 30,
    prices: {
      INR: { amount: 129_900, display: "₹1,299/month", itemPriceId: "skipwait_max_monthly-INR" },
      USD: { amount: 2_000, display: "$20/month", itemPriceId: "skipwait_max_monthly-USD" },
    },
  },
} as const;

export function currentMonthlyCycleKey(now: Date = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isPaidSubscriptionPlan(value: unknown): value is PaidSubscriptionPlan {
  return value === "pro" || value === "max";
}

export function subscriptionPlanFromItemPrice(itemPriceId: unknown): { plan: PaidSubscriptionPlan; currency: SubscriptionCurrency; amount: number } | undefined {
  if (typeof itemPriceId !== "string") return undefined;
  for (const plan of Object.keys(SUBSCRIPTION_PLANS) as PaidSubscriptionPlan[]) {
    for (const currency of ["INR", "USD"] as SubscriptionCurrency[]) {
      const price = SUBSCRIPTION_PLANS[plan].prices[currency];
      if (price.itemPriceId === itemPriceId) return { plan, currency, amount: price.amount };
    }
  }
  return undefined;
}

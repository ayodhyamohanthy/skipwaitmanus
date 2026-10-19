/*
 * Shared billing primitives that outlived the retired monthly plans.
 *
 * D-067 (owner, Oct 18 2026) removed the monthly Pro and Max plans completely:
 * no checkout sells them (410 plan_retired), no item price resolves to them
 * (shared/billingCatalog.ts), and a wallet still marked pro or max reads as
 * Free (shared/planEntitlements.ts). The plan table went with them; the money
 * catalog lives in shared/planCatalog.ts, shared/billingCatalog.ts and
 * shared/planEntitlements.ts.
 *
 * What stays here is currency, the Free monthly allowance and the UTC
 * month key the credit ledger grants Free's credits under.
 */
export type SubscriptionCurrency = "INR" | "USD";

export const FREE_MONTHLY_ALLOWANCE = 3;

export function currentMonthlyCycleKey(now: Date = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

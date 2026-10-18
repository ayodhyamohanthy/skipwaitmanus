/**
 * The monthly-plan contract, after D-067 (owner, Oct 18 2026).
 *
 * Pro/Max were removed completely — no users, no grandfathering, no sale, no
 * notices — so nothing here prices a subscription any more. What stays is the
 * free allowance and the cycle key the credit ledger needs, plus the currency
 * type the billing contracts share.
 *
 * The DB ENUMs keep the `pro`/`max` members only because removing an ENUM member
 * is not an additive migration. Nothing new is ever written with them, and a
 * wallet still holding one reads as Free (see `planEntitlementsFor`). The kit
 * plan catalog in `shared/planCatalog.ts` is the only plan set that can be sold.
 */
export type SubscriptionPlan = "free";
export type SubscriptionCurrency = "INR" | "USD";

export const FREE_MONTHLY_ALLOWANCE = 3;

export function currentMonthlyCycleKey(now: Date = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

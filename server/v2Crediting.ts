/**
 * D-132 bundle crediting decisions (pure): what a paid v2 invoice should grant
 * and whether its amount is trustworthy. The grant itself (server/db.ts) and
 * the webhook arm (server/chargebeeRoutes.ts) call these; every money rule is
 * tested here. PAID CREDITS NEVER EXPIRE (D-132 frozen); a mismatch is parked
 * for a human, never dropped silently.
 */
import { monthlyTotal } from "../shared/planFamilyBilling";
import type { PlanFamilyId, PlanCreditRung } from "../shared/planFamily";
import type { BillingCurrency } from "../shared/planFamilyBilling";


export type V2CreditGrantDecision =
  | { ok: true; expectedAmount: number }
  | { ok: false; reason: "amount_mismatch"; expectedAmount: number };

/** The invoice total a v2 bundle month must carry: plan fee + picked rung (D-132 one monthly total). */
export function expectedBundleAmount(planFamily: PlanFamilyId, rung: PlanCreditRung, currency: BillingCurrency): number {
  return monthlyTotal(planFamily, rung, currency);
}

/** A bundle invoice without its credits rung still owes the plan fee check; a rung without a plan is a pack (handled by the pack path, refused here). */
export function decideV2BundleGrant(input: { planFamily: PlanFamilyId; rung: PlanCreditRung; amount: number; currency: BillingCurrency }): V2CreditGrantDecision {
  const expectedAmount = expectedBundleAmount(input.planFamily, input.rung, input.currency);
  return input.amount === expectedAmount ? { ok: true, expectedAmount } : { ok: false, reason: "amount_mismatch", expectedAmount };
}

/** One grant per invoice, whatever retries or redeliveries arrive. */
export function v2CreditIdempotencyKey(invoiceId: string): string {
  return `v2credits-${invoiceId}`;
}

/**
 * Chargebee item-price identities for the D-132 plan family (flag
 * PLAN_FAMILY_V2, OFF until QA + the owner's enable word). Ids, prices and
 * currencies derive from shared/planFamily.ts only (D-124 single source) -
 * never restate a number here.
 *
 * Three item-price families:
 * - plan fee (monthly subscription):        skipwait_v2plan_<plan>-<CCY>
 * - in-plan monthly credits dropdown:       skipwait_v2credits_<rung>-<CCY>
 * - one-time top-up pack (same ladder):     skipwait_v2pack_<rung>-<CCY>
 *
 * The one-time pack and the monthly dropdown share the frozen ladder prices
 * (D-132: "Monthly only; PAID CREDITS NEVER EXPIRE" - a top-up pack and a
 * month of dropdown credits cost the same; only the billing term differs).
 */
import {
  PLAN_CREDIT_LADDER,
  PLAN_CREDIT_RUNGS,
  PLAN_FAMILY,
  type PlanCreditRung,
  type PlanFamilyId,
} from "./planFamily";

export type BillingCurrency = "INR" | "USD";

export type V2ItemPriceRef =
  | { kind: "plan"; planId: PlanFamilyId; currency: BillingCurrency; amount: number; recurring: true }
  | { kind: "planCredits"; rung: PlanCreditRung; currency: BillingCurrency; amount: number; recurring: true }
  | { kind: "pack"; rung: PlanCreditRung; currency: BillingCurrency; amount: number; recurring: false };

export function planItemPriceId(planId: PlanFamilyId, currency: BillingCurrency): string {
  return `skipwait_v2plan_${planId}-${currency}`;
}

export function planCreditsItemPriceId(rung: PlanCreditRung, currency: BillingCurrency): string {
  return `skipwait_v2credits_${rung}-${currency}`;
}

export function packItemPriceId(rung: PlanCreditRung, currency: BillingCurrency): string {
  return `skipwait_v2pack_${rung}-${currency}`;
}

function amountFor(rung: PlanCreditRung, currency: BillingCurrency): number {
  const entry = PLAN_CREDIT_LADDER.find(item => item.credits === rung);
  if (!entry) throw new Error(`unknown credit rung: ${rung}`);
  return currency === "INR" ? entry.inrPaise : entry.usdCents;
}

function planAmountFor(planId: PlanFamilyId, currency: BillingCurrency): number {
  const entry = PLAN_FAMILY.find(plan => plan.id === planId);
  if (!entry) throw new Error(`unknown plan family id: ${planId}`);
  return currency === "INR" ? entry.monthlyInrPaise : entry.monthlyUsdCents;
}

const ID_PATTERN = /^skipwait_v2(plan|credits|pack)_([a-z_0-9]+)-(INR|USD)$/;

/** Parse any D-132 item price id back into its typed reference; undefined for foreign ids. */
export function parseV2ItemPriceId(id: string): V2ItemPriceRef | undefined {
  const match = ID_PATTERN.exec(id);
  if (!match) return undefined;
  const [, family, key, currency] = match as unknown as [string, "plan" | "credits" | "pack", string, BillingCurrency];
  if (family === "plan") {
    const plan = PLAN_FAMILY.find(entry => entry.id === key);
    if (!plan || plan.monthlyInrPaise === 0) return undefined; // Open Door is free: nothing to bill
    return { kind: "plan", planId: plan.id, currency, amount: planAmountFor(plan.id, currency), recurring: true };
  }
  const rung = Number(key);
  if (!(PLAN_CREDIT_RUNGS as readonly number[]).includes(rung)) return undefined;
  const amount = amountFor(rung as PlanCreditRung, currency);
  return family === "credits"
    ? { kind: "planCredits", rung: rung as PlanCreditRung, currency, amount, recurring: true }
    : { kind: "pack", rung: rung as PlanCreditRung, currency, amount, recurring: false };
}

/** Every D-132 item price id the catalog sync must create, in stable order. */
export function v2ItemPriceIds(): string[] {
  const ids: string[] = [];
  for (const currency of ["INR", "USD"] as const) {
    for (const plan of PLAN_FAMILY) if (plan.monthlyInrPaise > 0) ids.push(planItemPriceId(plan.id, currency));
    for (const rung of PLAN_CREDIT_RUNGS) ids.push(planCreditsItemPriceId(rung, currency));
    for (const rung of PLAN_CREDIT_RUNGS) ids.push(packItemPriceId(rung, currency));
  }
  return ids;
}

/** The "This month" total for a plan + picked rung (D-132): fee + credits. */
export function monthlyTotal(planId: PlanFamilyId, rung: PlanCreditRung | 0, currency: BillingCurrency): number {
  return planAmountFor(planId, currency) + (rung === 0 ? 0 : amountFor(rung, currency));
}

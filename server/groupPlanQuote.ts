/** Pure pricing primitives; these do not authorize a quote, discount or purchase. */
import { z } from "zod";
import { bandedPlanCatalogPrice, bandedReferralCatalogPrice } from "../shared/bandedCatalog";
import { PLAN_FAMILY_IDS, REFERRAL_LEVELS, type PlanPriceBook } from "../shared/planFamily";

const safeAmount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const HALF = BigInt(50);
const HUNDRED = BigInt(100);
const quantity = safeAmount.min(1);
const lineInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("plan"), plan: z.enum(PLAN_FAMILY_IDS), quantity }),
  z.strictObject({ kind: z.literal("referral"), level: z.enum(REFERRAL_LEVELS), quantity }),
]);
export type GroupPlanPriceLineInput = z.infer<typeof lineInput>;

function safeMinorUnits(value: bigint): number {
  if (value < ZERO || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Group amount exceeds the safe minor-unit range.");
  }
  return Number(value);
}

/** Uses the frozen catalog only; band/application/policy checks belong to quoteGroupPlan. */
export function priceGroupPlanLine(input: GroupPlanPriceLineInput, currency: PlanPriceBook) {
  const line = lineInput.parse(input);
  const book = z.enum(["INR", "USD"]).parse(currency);
  const price = line.kind === "plan"
    ? bandedPlanCatalogPrice(line.plan, book)
    : bandedReferralCatalogPrice(line.level, book);
  const subtotal = safeMinorUnits(BigInt(price.amount) * BigInt(line.quantity));
  return { itemPriceId: price.itemPriceId, currency: book, quantity: line.quantity, unitAmount: price.amount, subtotal };
}

/**
 * The caller supplies an explicitly approved percentage, never an inferred policy.
 * Round the aggregate discount half up once. Allocate its minor units proportionally
 * using largest remainders, with confirmed input order breaking ties. Line rounding
 * therefore cannot change the approved total. BigInt keeps intermediate math exact.
 */
export function allocateGroupPlanDiscount(amounts: readonly number[], discountPct: number) {
  const lines = z.array(safeAmount).min(1).parse(amounts);
  const pct = BigInt(z.number().int().min(0).max(100).parse(discountPct));
  const subtotal = lines.reduce((sum, amount) => sum + BigInt(amount), ZERO);
  const subtotalMinor = safeMinorUnits(subtotal);
  const discount = (subtotal * pct + HALF) / HUNDRED;
  const shares = lines.map((amount, index) => {
    const numerator = BigInt(amount) * discount;
    return { index, amount, discount: subtotal === ZERO ? ZERO : numerator / subtotal, remainder: subtotal === ZERO ? ZERO : numerator % subtotal };
  });
  let remaining = discount - shares.reduce((sum, share) => sum + share.discount, ZERO);
  const ranked = [...shares].sort((a, b) => a.remainder === b.remainder
    ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const share of ranked) {
    if (remaining === ZERO) break;
    share.discount += ONE;
    remaining -= ONE;
  }
  if (remaining !== ZERO) throw new RangeError("Group discount allocation did not reconcile.");
  return {
    subtotal: subtotalMinor, discount: safeMinorUnits(discount), total: safeMinorUnits(subtotal - discount),
    lines: shares.map(share => ({ subtotal: share.amount, discount: safeMinorUnits(share.discount), total: safeMinorUnits(BigInt(share.amount) - share.discount) })),
  };
}
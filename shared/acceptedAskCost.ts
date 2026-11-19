// D-132-item3 (packet docs/plans/D-132-item3-accepted-price.md §4): the cost a
// seeker accepted before a referral request is charged. A covered request is
// charged exactly this cost or refused with 409 `ask_price_changed` and nothing
// written (D-140, D-221). It describes what the server already charges: the
// units it debits now, the D-219 band (none until D-219 (8) is settled) and the
// buckets that pay, in the spend order the ledger already uses. It states no
// grant id or expiry date: the seeker makes no grant choice, so comparing grants
// would refuse quotes that look identical to them.
import { z } from "zod";
import { CREDIT_BUCKETS, creditBucketSchema, type CreditBucket } from "./creditLedger";

export const ASK_PRICE_CHANGED = "ask_price_changed" as const;

const units = z.number().int().min(1);
const sourceEntrySchema = z.strictObject({ bucket: creditBucketSchema, units });

export const acceptedAskCostSchema = z.strictObject({
  /** What the server debits now (`askCreditCost`). */
  units,
  /** The D-219 band; null until the owner settles D-219 (8). */
  band: z.string().min(1).nullable(),
  /** One entry per bucket that pays, in CREDIT_BUCKETS order, summing to `units`. */
  source: z.array(sourceEntrySchema).min(1),
}).superRefine((cost, ctx) => {
  const order = cost.source.map(entry => CREDIT_BUCKETS.indexOf(entry.bucket));
  if (order.some((position, index) => index > 0 && position <= order[index - 1])) ctx.addIssue({ code: "custom", path: ["source"], message: "One entry per bucket, in CREDIT_BUCKETS order" });
  if (cost.source.reduce((sum, entry) => sum + entry.units, 0) !== cost.units) ctx.addIssue({ code: "custom", path: ["source"], message: "Source units must add up to units" });
});
export type AcceptedAskCost = z.infer<typeof acceptedAskCostSchema>;

/** The 409 body of a send whose cost changed since the seeker confirmed it: the current cost to confirm again. */
export const askPriceChangedSchema = z.strictObject({ error: z.string().min(1), code: z.literal(ASK_PRICE_CHANGED), acceptedCost: acceptedAskCostSchema });
export type AskPriceChangedBody = z.infer<typeof askPriceChangedSchema>;

/** Folds a spend's allocations (`allocateSpend`) into the accepted-cost identity: one entry per bucket, canonical order. */
export function acceptedAskCostFrom(unitsTotal: number, band: string | null, allocations: ReadonlyArray<{ readonly bucket: CreditBucket; readonly credits: number }>): AcceptedAskCost {
  const byBucket = new Map<CreditBucket, number>();
  for (const allocation of allocations) byBucket.set(allocation.bucket, (byBucket.get(allocation.bucket) ?? 0) + allocation.credits);
  const source = CREDIT_BUCKETS.filter(bucket => byBucket.has(bucket)).map(bucket => ({ bucket, units: byBucket.get(bucket) ?? 0 }));
  return acceptedAskCostSchema.parse({ units: unitsTotal, band, source });
}

/** Two costs match only when every field is equal. */
export function sameAcceptedAskCost(a: AcceptedAskCost, b: AcceptedAskCost): boolean {
  return a.units === b.units && a.band === b.band && a.source.length === b.source.length
    && a.source.every((entry, index) => entry.bucket === b.source[index].bucket && entry.units === b.source[index].units);
}

/**
 * The D-219 band of a job level. The level-to-band classification is not decided
 * (D-219 (8)), so every level has none. This is the one seam an owner-approved
 * mapping replaces; nothing here may fill it.
 */
export function askBandForLevel(_level: number): string | null {
  return null;
}

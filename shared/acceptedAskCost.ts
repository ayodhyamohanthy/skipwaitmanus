import { z } from "zod";
import { PLAN_FAMILY_IDS, REFERRAL_LEVELS, SPENDING_ORDER, type PlanFamilyId } from "./planFamily";

export function isBandedPlan(plan: string): plan is PlanFamilyId {
  return PLAN_FAMILY_IDS.some(id => id === plan);
}

/** The accepted allocation, including cycle identity; counts alone cannot authorize another source. */
export const acceptedAskCostSchema = z.strictObject({
  units: z.union([z.literal(0), z.literal(1)]),
  band: z.enum(REFERRAL_LEVELS),
  source: z.array(z.strictObject({
    bucket: z.enum(SPENDING_ORDER),
    units: z.literal(1),
    cycleKey: z.string().min(1).max(128).nullable(),
  })).max(1),
}).superRefine((value, context) => {
  if (value.units !== value.source.length) context.addIssue({ code: "custom", message: "Allocation must match the referral count" });
  for (const source of value.source) {
    if ((source.bucket === "purchased") !== (source.cycleKey === null)) context.addIssue({ code: "custom", message: "Only purchased referrals have no cycle" });
  }
});
export type AcceptedAskCost = z.infer<typeof acceptedAskCostSchema>;
export const bandedAskQuoteSchema = z.strictObject({
  level: z.number().int().min(1).max(10),
  cost: z.union([z.literal(0), z.literal(1)]),
  totalAvailable: z.number().int().min(0),
  shortfall: z.union([z.literal(0), z.literal(1)]),
  coverageStatus: z.enum(["covered", "waiting_for_company_coverage"]),
  acceptedCost: acceptedAskCostSchema,
});
export type BandedAskQuote = z.infer<typeof bandedAskQuoteSchema>;

export function sameAcceptedAskCost(left: AcceptedAskCost, right: AcceptedAskCost): boolean {
  return left.units === right.units && left.band === right.band && left.source.length === right.source.length && left.source.every((source, index) => {
    const other = right.source[index];
    return other !== undefined && source.bucket === other.bucket && source.units === other.units && source.cycleKey === other.cycleKey;
  });
}

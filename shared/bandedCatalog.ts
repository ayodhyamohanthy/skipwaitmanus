// Catalog provisioning for D-219/D-367. These descriptions never make an item
// billable through the legacy checkout resolver or turn banded sales on.
import { z } from "zod";
import {
  PLAN_FAMILY_IDS,
  REFERRAL_LEVELS,
  planFeeMinor,
  topUpMinor,
  type PlanFamilyId,
  type PlanPriceBook,
  type ReferralLevel,
} from "./planFamily";

export const BANDED_CATALOG_CURRENCIES = ["INR", "USD"] as const;
export const bandedCatalogPriceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("banded_plan"),
    plan: z.enum(PLAN_FAMILY_IDS),
    interval: z.literal("monthly"),
    currency: z.enum(BANDED_CATALOG_CURRENCIES),
    amount: z.number().int().positive(),
    itemPriceId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("banded_referral"),
    level: z.enum(REFERRAL_LEVELS),
    currency: z.enum(BANDED_CATALOG_CURRENCIES),
    amount: z.number().int().positive(),
    itemPriceId: z.string().min(1),
  }),
]).superRefine((price, ctx) => {
  const expectedId = price.kind === "banded_plan"
    ? bandedPlanItemPriceId(price.plan, price.currency)
    : bandedReferralItemPriceId(price.level, price.currency);
  const expectedAmount = price.kind === "banded_plan"
    ? planFeeMinor(price.plan, price.currency)
    : topUpMinor(price.level, price.currency);
  if (price.itemPriceId !== expectedId) ctx.addIssue({ code: "custom", path: ["itemPriceId"], message: "Item price ID does not match the band or currency." });
  if (price.amount !== expectedAmount) ctx.addIssue({ code: "custom", path: ["amount"], message: "Amount does not match the frozen price book." });
});
export type BandedCatalogPrice = z.infer<typeof bandedCatalogPriceSchema>;

export function bandedPlanItemPriceId(plan: PlanFamilyId, currency: PlanPriceBook): string {
  return `skipwait_${plan}_monthly-${currency}`;
}

export function bandedReferralItemPriceId(level: ReferralLevel, currency: PlanPriceBook): string {
  return `skipwait_referral_${level}-${currency}`;
}

export function bandedPlanCatalogPrice(plan: PlanFamilyId, currency: PlanPriceBook): BandedCatalogPrice {
  return bandedCatalogPriceSchema.parse({
    kind: "banded_plan", plan, interval: "monthly", currency,
    amount: planFeeMinor(plan, currency), itemPriceId: bandedPlanItemPriceId(plan, currency),
  });
}

export function bandedReferralCatalogPrice(level: ReferralLevel, currency: PlanPriceBook): BandedCatalogPrice {
  return bandedCatalogPriceSchema.parse({
    kind: "banded_referral", level, currency,
    amount: topUpMinor(level, currency), itemPriceId: bandedReferralItemPriceId(level, currency),
  });
}

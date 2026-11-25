import { createHash } from "node:crypto";
import { z } from "zod";
import {
  includedReferralList,
  PLAN_FAMILY_IDS,
  REFERRAL_LEVELS,
  type PlanFamilyId,
  type ReferralLevel,
} from "./planFamily";

export type BandedSite = "test" | "live";
export type BandedGrantKind = "plan" | "referral";
export type BandedBillingRoute = "IN" | "INTL";
export type BandedCurrency = "INR" | "USD";

export const bandedPlanCartSchema = z.object({
  kind: z.literal("plan"),
  planId: z.enum(PLAN_FAMILY_IDS),
  itemPriceId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.enum(["INR", "USD"]),
  billingRoute: z.enum(["IN", "INTL"]).optional(),
});

export type BandedPlanCart = z.infer<typeof bandedPlanCartSchema>;

export const bandedReferralCartLineSchema = z.object({
  level: z.enum(REFERRAL_LEVELS),
  quantity: z.number().int().positive(),
  unitAmount: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative().optional(),
  lineAmount: z.number().int().nonnegative().optional(),
  itemPriceId: z.string().optional(),
});

export type BandedReferralCartLine = z.infer<typeof bandedReferralCartLineSchema>;

export const bandedReferralCartSchema = z.object({
  kind: z.literal("referral"),
  quantity: z.number().int().positive().optional(),
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative().optional(),
  discountPct: z.number().int().nonnegative().optional(),
  discountAmount: z.number().int().nonnegative().optional(),
  total: z.number().int().positive(),
  currency: z.enum(["INR", "USD"]),
  billingRoute: z.enum(["IN", "INTL"]).optional(),
  lines: z.array(bandedReferralCartLineSchema).min(1),
});

export type BandedReferralCart = z.infer<typeof bandedReferralCartSchema>;

export const bandedCartSchema = z.discriminatedUnion("kind", [
  bandedPlanCartSchema,
  bandedReferralCartSchema,
]);

export type BandedCart = z.infer<typeof bandedCartSchema>;

export function canonicalJsonString(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJsonString).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalJsonString((obj as Record<string, unknown>)[k])}`);
  return `{${pairs.join(",")}}`;
}

export function bandedIntentFingerprint(input: {
  site: BandedSite;
  userId: number;
  kind: BandedGrantKind;
  planId?: PlanFamilyId | null;
  billingRoute: BandedBillingRoute;
  currency: BandedCurrency;
  expectedTotal: number;
  cart: unknown;
}): string {
  const payload = [
    input.site,
    input.userId,
    input.kind,
    input.planId ?? "",
    input.billingRoute,
    input.currency,
    input.expectedTotal,
    canonicalJsonString(input.cart),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function bandedIncludedCycleKey(
  site: BandedSite,
  subscriptionId: string,
  termStart: Date | number,
  level: ReferralLevel
): string {
  const ts = termStart instanceof Date ? termStart.getTime() : termStart;
  return `${site}:${subscriptionId}:${ts}:${level}`;
}

export function bandedPurchasedLotKey(
  site: BandedSite,
  invoiceId: string,
  level: ReferralLevel
): string {
  return `${site}:${invoiceId}:${level}`;
}

export function bandedIncludedReferralsForPlan(planId: PlanFamilyId): { level: ReferralLevel; count: number }[] {
  return includedReferralList(planId);
}

export const bandedLedgerSource = {
  included: (level: ReferralLevel) => `banded:included:${level}`,
  purchased: (level: ReferralLevel) => `banded:purchased:${level}`,
  refund: (level: ReferralLevel) => `banded:refund:${level}`,
  free: (level: ReferralLevel) => `banded:free:${level}`,
  isBanded: (source?: string | null): boolean => typeof source === "string" && source.startsWith("banded:"),
};

export function parseBandedSource(source: string): { bucket: "included" | "purchased" | "refund" | "free"; level: ReferralLevel } | null {
  if (!source.startsWith("banded:")) return null;
  const parts = source.split(":");
  if (parts.length !== 3) return null;
  const bucket = parts[1];
  const level = parts[2];
  if (bucket !== "included" && bucket !== "purchased" && bucket !== "refund" && bucket !== "free") return null;
  if (!REFERRAL_LEVELS.includes(level as ReferralLevel)) return null;
  return { bucket, level: level as ReferralLevel };
}

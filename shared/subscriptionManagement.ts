/**
 * Plan checkout and subscription lifecycle contracts (kit 19_plans checkout,
 * 20_billing plan actions and cancel flow). Prices never come from the client:
 * a request names a plan, a pack or a reason, and the server charges the
 * catalog amount (shared/billingCatalog.ts).
 */
import { z } from "zod";
import { BILLING_CURRENCIES, BILLING_INTERVALS, planSellsInterval } from "./billingCatalog";
import { BILLING_REGIONS, currencyForRegion } from "./billingRegion";
import { CATALOG_PACK_IDS, CATALOG_PLAN_IDS, type CatalogInterval, type CatalogPlanId } from "./planCatalog";
import { PLAN_FAMILY_IDS, REFERRAL_LEVELS, topUpMinor, volumeDiscountPct, type PlanPriceBook, type ReferralLevel } from "./planFamily";

const role = z.enum(["job_seeker", "referrer"]).default("job_seeker");
/** The billing address country route; INR is charged only with an Indian billing address (shared/billingRegion.ts). */
const billingCountry = z.enum(BILLING_REGIONS);
const isoDate = z.string().datetime({ offset: true });

/** India is billed in rupees, everywhere else in US dollars. */
export function currencyForCountry(country: z.infer<typeof billingCountry>): (typeof BILLING_CURRENCIES)[number] {
  return currencyForRegion(country);
}

const currencyMatchesCountry = (value: { currency: string; billingCountry: "IN" | "INTL" }) => value.currency === currencyForCountry(value.billingCountry);
const soldForInterval = (value: { planId: CatalogPlanId; interval: CatalogInterval }) => planSellsInterval(value.planId, value.interval);
const INTERVAL_MESSAGE = "That plan is not sold for this term";

/** POST /api/chargebee/subscription-checkout for a kit plan: a 30- or 90-day pass, or Keep warm yearly. */
export const kitPlanCheckoutRequestSchema = z.object({
  planId: z.enum(CATALOG_PLAN_IDS),
  interval: z.enum(BILLING_INTERVALS),
  currency: z.enum(BILLING_CURRENCIES),
  billingCountry,
  role,
}).refine(currencyMatchesCountry, { message: "That currency is not available for the selected billing route", path: ["currency"] })
  .refine(soldForInterval, { message: INTERVAL_MESSAGE, path: ["interval"] });
export type KitPlanCheckoutRequest = z.infer<typeof kitPlanCheckoutRequestSchema>;

/** POST /api/chargebee/checkout for a kit credit pack. The /premium body ({itemPriceId, quantity}) stays as it is. */
export const packCheckoutRequestSchema = z.object({ packId: z.enum(CATALOG_PACK_IDS), billingCountry, role });
export type PackCheckoutRequest = z.infer<typeof packCheckoutRequestSchema>;

export const checkoutResponseSchema = z.object({ checkoutUrl: z.string().url(), hostedPageId: z.string().min(1).max(80) }).strict();

/** The plan or pack is in the catalog but its Chargebee item price is not live on the billing site yet. */
export const NOT_AVAILABLE_CODE = "not_available_yet" as const;

/** A by-application plan is never self-serve; the plan shows "Apply" with no checkout. */
export const APPLICATION_REQUIRED_CODE = "application_required" as const;

/**
 * D-067: the pre-kit monthly plans (a body naming `plan: "pro" | "max"`) are removed
 * completely. The checkout answers 410 with this code before any provider call or intent.
 */
export const PLAN_RETIRED_CODE = "plan_retired" as const;

/** POST /api/chargebee/subscription-change: move an active subscription to a kit plan. */
export const subscriptionChangeRequestSchema = z.object({ planId: z.enum(CATALOG_PLAN_IDS), interval: z.enum(BILLING_INTERVALS), role }).refine(soldForInterval, { message: INTERVAL_MESSAGE, path: ["interval"] });
export type SubscriptionChangeRequest = z.infer<typeof subscriptionChangeRequestSchema>;

/** An upgrade pays its prorated difference on a hosted checkout now; a switch down waits for term end. */
export const subscriptionChangeResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("checkout"), checkoutUrl: z.string().url(), hostedPageId: z.string().min(1).max(80) }).strict(),
  z.object({ status: z.literal("scheduled"), planId: z.enum(CATALOG_PLAN_IDS), interval: z.enum(BILLING_INTERVALS), effectiveAt: isoDate.nullable() }).strict(),
]);
export type SubscriptionChangeResponse = z.infer<typeof subscriptionChangeResponseSchema>;

/** Kit cancel flow reasons; "Got a job" leads to the congratulations path, the rest offer a pause first. */
export const CANCELLATION_REASONS = ["got_job", "too_expensive", "not_using", "missing_feature", "other"] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

/** POST /api/chargebee/subscription-cancel. The reason is optional for the pre-kit body ({role}). */
export const subscriptionCancelRequestSchema = z.object({ reason: z.enum(CANCELLATION_REASONS).optional(), role });

/** POST /api/chargebee/subscription-pause: "Pause for 1 month" from the end of the paid term. */
export const subscriptionPauseRequestSchema = z.object({ months: z.literal(1).default(1), reason: z.enum(CANCELLATION_REASONS).optional(), role });

/** POST /api/chargebee/subscription-reactivate and /subscription-change/cancel: role only. */
export const subscriptionRoleRequestSchema = z.object({ role });

/** The lifecycle state after a cancel, pause, reactivate or scheduled-change removal. */
export const subscriptionLifecycleResponseSchema = z.object({
  status: z.enum(["active", "non_renewing", "pause_scheduled", "paused"]),
  currentTermEnd: isoDate.nullable(),
  pausesAt: isoDate.nullable(),
  resumesAt: isoDate.nullable(),
}).strict();
export type SubscriptionLifecycleResponse = z.infer<typeof subscriptionLifecycleResponseSchema>;

/** Refusal codes the billing UI branches on (409 unless noted). */
export const SUBSCRIPTION_REFUSALS = {
  noSubscription: "no_subscription", // 404
  notAvailable: NOT_AVAILABLE_CODE,
  samePlan: "same_plan",
  paymentIssue: "payment_issue",
  cancellationScheduled: "cancellation_scheduled",
  changeScheduled: "change_scheduled",
  paused: "paused",
  pauseUnavailable: "pause_unavailable",
  nothingToReactivate: "nothing_to_reactivate",
  activeSubscription: "active_subscription",
  planRetired: PLAN_RETIRED_CODE, // 410
} as const;

// ---- BANDED-checkout (D-219 prices, D-367 answers, D-370 approval) ----
// Behind BANDED_SALES_ENABLED (default off). The client names a plan or a cart
// of levels; every amount comes from shared/planFamily.ts, never the client.

/** Refusal codes the banded plans UI branches on (409 unless noted). */
export const BANDED_REFUSALS = {
  notOnSale: "not_on_sale",
  applicationRequired: APPLICATION_REQUIRED_CODE, // 403
  foundingFull: "founding_full",
  activeSubscription: "active_subscription",
  noPlan: "no_plan",
  outsideBand: "outside_band",
  notAvailable: NOT_AVAILABLE_CODE,
  checkoutKeyUsed: "checkout_key_used",
} as const;

/** Most referral requests one extra-referral checkout may buy (the legacy per-credit limit). */
export const BANDED_MAX_REFERRALS_PER_CHECKOUT = 1_000;

/** One key per checkout attempt from the client; a retry with the same key reuses the same page and founding place. */
const idempotencyKey = z.string().uuid();

/** POST /api/chargebee/banded/plan-checkout. */
export const bandedPlanCheckoutRequestSchema = z.strictObject({ planId: z.enum(PLAN_FAMILY_IDS), billingCountry, idempotencyKey });
export type BandedPlanCheckoutRequest = z.infer<typeof bandedPlanCheckoutRequestSchema>;

const bandedCartLine = z.strictObject({ level: z.enum(REFERRAL_LEVELS), quantity: z.number().int().min(1).max(BANDED_MAX_REFERRALS_PER_CHECKOUT) });

/** POST /api/chargebee/banded/referral-checkout: distinct levels, whole quantities, bounded in total. */
export const bandedReferralCheckoutRequestSchema = z.strictObject({
  items: z.array(bandedCartLine).min(1).max(REFERRAL_LEVELS.length)
    .refine(items => new Set(items.map(item => item.level)).size === items.length, { message: "List each level once" })
    .refine(items => items.reduce((sum, item) => sum + item.quantity, 0) <= BANDED_MAX_REFERRALS_PER_CHECKOUT, { message: "Too many referral requests for one checkout" }),
  billingCountry,
  idempotencyKey,
});
export type BandedReferralCheckoutRequest = z.infer<typeof bandedReferralCheckoutRequestSchema>;

export type BandedReferralQuote = {
  currency: PlanPriceBook;
  lines: Array<{ level: ReferralLevel; quantity: number; unitAmount: number; amount: number }>;
  quantity: number;
  subtotal: number;
  discountPct: number;
  discount: number;
  total: number;
};

/**
 * The extra-referral price shown before checkout and charged on the hosted page:
 * frozen per-level top-up prices in level order, the frozen volume discount on
 * the cart's total quantity, rounded half up to a whole minor unit.
 */
export function bandedReferralQuote(items: ReadonlyArray<{ level: ReferralLevel; quantity: number }>, currency: PlanPriceBook): BandedReferralQuote {
  const lines = REFERRAL_LEVELS.flatMap(level => {
    const quantity = items.filter(item => item.level === level).reduce((sum, item) => sum + item.quantity, 0);
    if (quantity === 0) return [];
    const unitAmount = topUpMinor(level, currency);
    return [{ level, quantity, unitAmount, amount: unitAmount * quantity }];
  });
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const discountPct = volumeDiscountPct(quantity);
  const discount = Math.floor((subtotal * discountPct + 50) / 100);
  return { currency, lines, quantity, subtotal, discountPct, discount, total: subtotal - discount };
}

/** GET /api/chargebee/banded/offer: what the plans page may sell right now; places left come only from the real count. */
export const bandedOfferResponseSchema = z.discriminatedUnion("onSale", [
  z.strictObject({ onSale: z.literal(false) }),
  z.strictObject({
    onSale: z.literal(true),
    memberPlan: z.enum(PLAN_FAMILY_IDS).nullable(),
    plans: z.array(z.strictObject({ planId: z.enum(PLAN_FAMILY_IDS), byApplication: z.boolean(), foundingPlacesLeft: z.number().int().min(0) })),
  }),
]);
export type BandedOfferResponse = z.infer<typeof bandedOfferResponseSchema>;

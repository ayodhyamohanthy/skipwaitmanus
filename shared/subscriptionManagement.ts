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

// ---------------------------------------------------------------------------
// D-132 plan family (flag PLAN_FAMILY_V2; OFF until QA's payment-path check
// passes and main relays the owner's enable word). Prices never come from the
// client: a request names a plan, a credits rung and a billing route, and the
// server charges the planFamily amount (shared/planFamilyBilling.ts).
const v2PaidRung = z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(50), z.literal(100), z.literal(200)]);

/** POST /api/chargebee/subscription-checkout for a D-132 plan: the fee plus an optional in-plan monthly credits rung (one monthly total). */
export const v2PlanCheckoutRequestSchema = z.object({
  v2Plan: z.enum(["fast_track", "insider"]),
  v2Rung: v2PaidRung.or(z.literal(0)).default(0),
  currency: z.enum(BILLING_CURRENCIES),
  billingCountry,
  role,
}).refine(currencyMatchesCountry, { message: "That currency is not available for the selected billing route", path: ["currency"] });
export type V2PlanCheckoutRequest = z.infer<typeof v2PlanCheckoutRequestSchema>;

/** POST /api/chargebee/checkout for a D-132 one-time top-up pack (same frozen ladder prices as the monthly dropdown). */
export const v2PackCheckoutRequestSchema = z.object({ v2Rung: v2PaidRung, billingCountry, role });
export type V2PackCheckoutRequest = z.infer<typeof v2PackCheckoutRequestSchema>;

export const checkoutResponseSchema = z.object({ checkoutUrl: z.string().url(), hostedPageId: z.string().min(1).max(80) }).strict();

/** The plan or pack is in the catalog but its Chargebee item price is not live on the billing site yet. */
export const NOT_AVAILABLE_CODE = "not_available_yet" as const;

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

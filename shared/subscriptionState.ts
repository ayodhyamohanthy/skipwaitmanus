/**
 * The subscription block of GET /api/credits/summary (kit 20_billing): what
 * the member pays for, a switch waiting for term end, a pause, a failed renewal
 * and which plan actions the server will accept now. Derived purely from the
 * wallet row the webhooks keep (server/db.ts applyChargebeeSubscriptionEvent);
 * a lapsed plan reads as Free, exactly like the entitlement resolver.
 */
import { z } from "zod";
import { PAYMENT_FAILURE_REASONS, isPaymentFailureReason } from "./billingAccount";
import { BILLABLE_PLAN_IDS, BILLING_CURRENCIES, BILLING_PERIODS, WALLET_PLAN_IDS, adjacentPlans, billingPlanLabel, isBillablePlanId, isBillingPeriod, planPrice, resolvePlanItemPrice, type BillablePlanId } from "./billingCatalog";
import { CATALOG_PLAN_IDS, type CatalogPlanId } from "./planCatalog";
import { isPaidPlanActive } from "./planEntitlements";

const isoDate = z.string().datetime({ offset: true });

export const SUBSCRIPTION_STATES = ["free", "active", "non_renewing", "pause_scheduled", "paused"] as const;
export type SubscriptionStateName = (typeof SUBSCRIPTION_STATES)[number];

const planRef = z.object({ plan: z.enum(CATALOG_PLAN_IDS), planLabel: z.string().min(1) }).strict();

export const subscriptionStateSchema = z.object({
  plan: z.enum(WALLET_PLAN_IDS),
  planLabel: z.string().min(1),
  state: z.enum(SUBSCRIPTION_STATES),
  legacy: z.boolean(),
  billingPeriod: z.enum(BILLING_PERIODS).nullable(),
  currency: z.enum(BILLING_CURRENCIES).nullable(),
  /** Minor units per billing period (cents or paise). */
  amount: z.number().int().nonnegative().nullable(),
  currentTermEnd: isoDate.nullable(),
  pendingChange: z.object({ plan: z.enum(BILLABLE_PLAN_IDS), planLabel: z.string().min(1), billingPeriod: z.enum(BILLING_PERIODS).nullable(), effectiveAt: isoDate.nullable() }).strict().nullable(),
  pause: z.object({ pausesAt: isoDate.nullable(), resumesAt: isoDate.nullable() }).strict().nullable(),
  /** A renewal the provider could not collect. The plan stays until the provider ends it. */
  paymentIssue: z.object({ dueSince: isoDate, invoiceId: z.string().nullable(), amountDue: z.number().int().nonnegative().nullable(), nextRetryAt: isoDate.nullable(), reason: z.enum(PAYMENT_FAILURE_REASONS).nullable() }).strict().nullable(),
  changes: z.object({ up: planRef.nullable(), down: planRef.nullable() }).strict(),
  actions: z.object({ changePlan: z.boolean(), cancel: z.boolean(), pause: z.boolean(), reactivate: z.boolean(), retryPayment: z.boolean(), cancelScheduledChange: z.boolean() }).strict(),
}).strict();
export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;

/** The tokenBalances fields this reads. Columns added by 0080 are optional so a pre-migration row still reads. */
export type SubscriptionWallet = {
  plan: string;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionCurrency: string | null;
  subscriptionCurrentTermEnd: Date | null;
  subscriptionItemPriceId?: string | null;
  subscriptionBillingPeriod?: string | null;
  subscriptionAmount?: number | null;
  pendingPlan?: string | null;
  pendingBillingPeriod?: string | null;
  pendingPlanEffectiveAt?: Date | null;
  subscriptionPauseAt?: Date | null;
  subscriptionResumeAt?: Date | null;
  paymentDueSince?: Date | null;
  paymentDueInvoiceId?: string | null;
  paymentDueAmount?: number | null;
  paymentNextRetryAt?: Date | null;
  paymentFailureReason?: string | null;
};

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);
const interval = (value: string | null | undefined) => (isBillingPeriod(value) ? value : null);
const currencyOf = (value: string | null | undefined) => (value === "USD" || value === "INR" ? value : null);

const NO_ACTIONS = { changePlan: false, cancel: false, pause: false, reactivate: false, retryPayment: false, cancelScheduledChange: false };

const FREE_STATE: SubscriptionState = {
  plan: "free", planLabel: "Free", state: "free", legacy: false, billingPeriod: null, currency: null, amount: null, currentTermEnd: null,
  pendingChange: null, pause: null, paymentIssue: null, changes: { up: null, down: null }, actions: NO_ACTIONS,
};

/** True while a paid plan is paused by the provider (no entitlements, plan credits frozen). */
export function isSubscriptionPaused(wallet: Pick<SubscriptionWallet, "plan" | "subscriptionId" | "subscriptionStatus">): boolean {
  return wallet.plan !== "free" && wallet.subscriptionId !== null && wallet.subscriptionStatus === "paused";
}

function stateName(wallet: SubscriptionWallet, now: Date): SubscriptionStateName {
  if (isSubscriptionPaused(wallet)) return "paused";
  if (!isPaidPlanActive(wallet, now)) return "free";
  if (wallet.subscriptionStatus === "non_renewing") return "non_renewing";
  return wallet.subscriptionPauseAt && wallet.subscriptionPauseAt.getTime() > now.getTime() ? "pause_scheduled" : "active";
}

function planRefOf(plan: CatalogPlanId | null) {
  return plan ? { plan, planLabel: billingPlanLabel(plan) } : null;
}

export function subscriptionStateFor(wallet: SubscriptionWallet | null | undefined, now: Date = new Date()): SubscriptionState {
  if (!wallet || !isBillablePlanId(wallet.plan)) return FREE_STATE;
  const state = stateName(wallet, now);
  if (state === "free") return FREE_STATE;
  const plan: BillablePlanId = wallet.plan;
  const legacy = plan === "pro" || plan === "max";
  const resolved = resolvePlanItemPrice(wallet.subscriptionItemPriceId);
  const currency = currencyOf(wallet.subscriptionCurrency) ?? resolved?.currency ?? null;
  const billingPeriod = interval(wallet.subscriptionBillingPeriod) ?? resolved?.interval ?? (legacy ? "monthly" : null);
  const catalogAmount = currency && billingPeriod ? planPrice(plan, billingPeriod, currency)?.amount ?? null : null;
  const pendingPlan = wallet.pendingPlan && isBillablePlanId(wallet.pendingPlan) ? wallet.pendingPlan : null;
  const paymentIssue = wallet.paymentDueSince
    ? { dueSince: wallet.paymentDueSince.toISOString(), invoiceId: wallet.paymentDueInvoiceId ?? null, amountDue: wallet.paymentDueAmount ?? null, nextRetryAt: iso(wallet.paymentNextRetryAt), reason: isPaymentFailureReason(wallet.paymentFailureReason) ? wallet.paymentFailureReason : null }
    : null;
  const pause = state === "paused" || state === "pause_scheduled" ? { pausesAt: iso(wallet.subscriptionPauseAt), resumesAt: iso(wallet.subscriptionResumeAt) } : null;
  const adjacent = adjacentPlans(plan);
  const active = state === "active";
  return subscriptionStateSchema.parse({
    plan,
    planLabel: billingPlanLabel(plan),
    state,
    legacy,
    billingPeriod,
    currency,
    amount: wallet.subscriptionAmount ?? resolved?.amount ?? catalogAmount,
    currentTermEnd: iso(wallet.subscriptionCurrentTermEnd),
    pendingChange: pendingPlan ? { plan: pendingPlan, planLabel: billingPlanLabel(pendingPlan), billingPeriod: interval(wallet.pendingBillingPeriod), effectiveAt: iso(wallet.pendingPlanEffectiveAt) } : null,
    pause,
    paymentIssue,
    changes: { up: planRefOf(adjacent.up), down: planRefOf(adjacent.down) },
    actions: {
      changePlan: active && !paymentIssue,
      cancel: active,
      pause: active && !pendingPlan && !paymentIssue,
      reactivate: state === "non_renewing" || state === "pause_scheduled" || state === "paused",
      retryPayment: Boolean(paymentIssue?.invoiceId) && state !== "paused",
      cancelScheduledChange: active && Boolean(pendingPlan),
    },
  });
}

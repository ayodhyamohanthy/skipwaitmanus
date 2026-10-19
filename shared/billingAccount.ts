/**
 * Billing account contracts (kit 20_billing, 33_app-states payment failed):
 * saved payment methods, receipts, a checkout's outcome and a payment retry.
 * SkipWait never handles card data: methods are labels read from Chargebee,
 * and every change happens on a Chargebee hosted page.
 */
import { z } from "zod";

const isoDate = z.string().datetime({ offset: true });

/** Why a payment did not go through, mapped from the provider's error code. Drives the kit copy. */
export const PAYMENT_FAILURE_REASONS = ["card_declined", "international_blocked", "insufficient_funds", "authentication_failed", "upi_timeout", "unknown"] as const;
export type PaymentFailureReason = (typeof PAYMENT_FAILURE_REASONS)[number];

const FAILURE_PATTERNS: ReadonlyArray<readonly [PaymentFailureReason, RegExp]> = [
  ["insufficient_funds", /insufficient|not_sufficient|nsf/i],
  ["international_blocked", /international|cross[ _-]?border|foreign|currency_not_supported|not_enabled_for_currency/i],
  ["upi_timeout", /upi.*(time.?out|expired)|(time.?out|expired).*upi|collect.*expired/i],
  ["authentication_failed", /authenticat|3d.?s|otp|authoriz(ation)?_failed|verification_failed/i],
  ["card_declined", /declin|do_not_honou?r|restricted|lost|stolen|pick_?up|expired_card|card.*expired|invalid_card|card_not_supported/i],
];

/** Maps a provider or gateway error code and text to a failure reason; unknown when nothing matches. */
export function paymentFailureReasonFrom(code?: string | null, text?: string | null): PaymentFailureReason {
  const subject = `${code ?? ""} ${text ?? ""}`;
  for (const [reason, pattern] of FAILURE_PATTERNS) if (pattern.test(subject)) return reason;
  return "unknown";
}

export function isPaymentFailureReason(value: unknown): value is PaymentFailureReason {
  return typeof value === "string" && (PAYMENT_FAILURE_REASONS as readonly string[]).includes(value);
}

export const PAYMENT_METHOD_TYPES = ["card", "upi", "paypal", "netbanking", "other"] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

/** One saved method: "Visa •••• 4242" / "Default · expires 08/28". */
export const paymentMethodSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(PAYMENT_METHOD_TYPES),
  label: z.string().min(1).max(80),
  detail: z.string().max(120).nullable(),
  isDefault: z.boolean(),
}).strict();
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** GET /api/billing/payment-methods. `customer` is false before any checkout created a billing customer. */
export const paymentMethodsResponseSchema = z.object({ methods: z.array(paymentMethodSchema).max(20), customer: z.boolean() }).strict();
export type PaymentMethodsResponse = z.infer<typeof paymentMethodsResponseSchema>;

/** POST /api/billing/payment-methods/session: where the hosted page returns. */
export const paymentMethodSessionRequestSchema = z.object({ returnTo: z.enum(["methods", "payment"]).default("methods") });
export const hostedSessionResponseSchema = z.object({ url: z.string().url() }).strict();

export const RECEIPT_KINDS = ["subscription", "credit_pack"] as const;
export const RECEIPT_STATUSES = ["paid", "refunded", "partially_refunded"] as const;

/** A settled payment: "Momentum · monthly" or "25 credits". `downloadable` when the provider has an invoice PDF. */
export const receiptSchema = z.object({
  id: z.string().regex(/^(inv|pay)_\d+$/),
  kind: z.enum(RECEIPT_KINDS),
  description: z.string().min(1).max(80),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: z.enum(RECEIPT_STATUSES),
  paidAt: isoDate,
  downloadable: z.boolean(),
}).strict();
export type Receipt = z.infer<typeof receiptSchema>;
export const receiptsResponseSchema = z.object({ receipts: z.array(receiptSchema).max(100) }).strict();

/** A receipt id names its source row: inv_<billingInvoices.id> or pay_<paymentFulfillments.id>. */
export function parseReceiptId(id: string): { source: "invoice" | "payment"; rowId: number } | null {
  const match = /^(inv|pay)_(\d{1,10})$/.exec(id);
  if (!match) return null;
  const rowId = Number(match[2]);
  return Number.isSafeInteger(rowId) && rowId > 0 ? { source: match[1] === "inv" ? "invoice" : "payment", rowId } : null;
}

export const CHECKOUT_INTENT_STATES = ["pending", "paid", "failed", "cancelled"] as const;

/**
 * GET /api/billing/checkout-intents/:hostedPageId, the caller's own checkout.
 * `charged` and `planChanged` are true only when a provider-confirmed payment or
 * plan change exists; a failed checkout reports both false.
 */
export const checkoutIntentStateSchema = z.object({
  kind: z.enum(["plan", "pack"]),
  state: z.enum(CHECKOUT_INTENT_STATES),
  failureReason: z.enum(PAYMENT_FAILURE_REASONS).nullable(),
  charged: z.boolean(),
  planChanged: z.boolean(),
}).strict();
export type CheckoutIntentState = z.infer<typeof checkoutIntentStateSchema>;

/** POST /api/billing/retry-payment: the provider's answer to collecting the due invoice now. */
export const retryPaymentResponseSchema = z.object({
  status: z.enum(["paid", "failed", "pending"]),
  failureReason: z.enum(PAYMENT_FAILURE_REASONS).nullable(),
}).strict();
export type RetryPaymentResponse = z.infer<typeof retryPaymentResponseSchema>;

/** A retry of the same due invoice is refused for this long after the last one (durable, per wallet). */
export const PAYMENT_RETRY_COOLDOWN_MS = 10 * 60 * 1000;

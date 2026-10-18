// Administrator review of a parked credit-pack payment (paymentFulfillments with
// status requires_review). Contract for the server guard (server/db.ts
// resolveRequiresReviewPayment, server/paymentRefundReview.ts), the route
// (POST /api/admin/payments/review/:paymentId) and the admin page
// (client/src/pages/AdminPaymentsReview.tsx). Tests: server/paymentReviewContract.test.ts.
//
// Why a payment is parked decides what may happen to it:
// - awaiting_credit: the webhook never added the pack (amount mismatch, an
//   incomplete or mismatched hosted page, a rejected reconciliation). It may be
//   credited once, or rejected.
// - refunded_after_credit: the pack was added and the payment was then refunded
//   at the provider (partial refund, credits already used, unreadable amount,
//   currency mismatch). Crediting it again would pay the pack twice, so the only
//   choices are to take back the credits still unused or to keep them and close.
// - refunded_before_credit: refunded in full while still waiting for its credit.
//   There is nothing to add or take back; it can only be closed. A refund that
//   does not cover what the buyer paid (a refunded overcharge, an unreadable or
//   other-currency amount) leaves it awaiting_credit: the admin checks Chargebee.
import { z } from "zod";

export const PAYMENT_REVIEW_DECISIONS = ["credited", "rejected", "revoke_unused", "keep_credits"] as const;
export type PaymentReviewDecision = (typeof PAYMENT_REVIEW_DECISIONS)[number];

export const PAYMENT_REVIEW_KINDS = ["awaiting_credit", "refunded_after_credit", "refunded_before_credit"] as const;
export type PaymentReviewKind = (typeof PAYMENT_REVIEW_KINDS)[number];

/** Written by the refund webhook when a payment still waiting for its credit is refunded in full (what was paid, in its currency). */
export const REFUND_OF_UNCREDITED_PAYMENT = "refund_of_uncredited_payment";
/** Written when a payment still waiting for its credit gets refunds that are not shown to cover what was paid: it may still be credited, once. */
export const REFUND_NOT_FULL_BEFORE_CREDIT = "refund_not_full_before_credit";
/** Written when another refund arrives for a payment whose credits were added and that already had a refund handled (parked, or closed by review): it goes back to review. */
export const REFUND_REPEATED = "refund_repeated";
/** Why the refund webhook parked or recorded a payment for review (ChargebeeRefundOutcome "review" in server/db.ts). */
export type RefundReviewReason = "refund_partial" | "refund_credits_spent" | "refund_currency_mismatch" | "refund_amount_unreadable" | typeof REFUND_OF_UNCREDITED_PAYMENT | typeof REFUND_NOT_FULL_BEFORE_CREDIT | typeof REFUND_REPEATED;
/** Closing reasons an administrator's review writes on a refunded payment (status refunded). */
export const REFUND_REVIEWED_REVOKED = "refund_reviewed_revoked";
export const REFUND_REVIEWED_KEPT = "refund_reviewed_kept";
export const PAYMENT_REVIEW_NOTE_MAX = 500;

export type PaymentReviewRow = { readonly reconciliationReason: string | null; readonly creditedAt: Date | string | null };

/**
 * A recorded credit time, or a refund reason other than the two written before
 * any credit (a refund otherwise only parks a credited payment), means the pack
 * was already added. Legacy rows credited before creditedAt was written still
 * carry their refund reason, so both are checked.
 */
export function paymentReviewKind(row: PaymentReviewRow): PaymentReviewKind {
  if (row.creditedAt !== null && row.creditedAt !== undefined) return "refunded_after_credit";
  const reason = row.reconciliationReason ?? "";
  if (reason === REFUND_OF_UNCREDITED_PAYMENT) return "refunded_before_credit";
  if (reason === REFUND_NOT_FULL_BEFORE_CREDIT) return "awaiting_credit";
  if (reason.startsWith("refund_")) return "refunded_after_credit";
  return "awaiting_credit";
}

export const DECISIONS_BY_KIND: Readonly<Record<PaymentReviewKind, readonly PaymentReviewDecision[]>> = {
  awaiting_credit: ["credited", "rejected"],
  refunded_after_credit: ["revoke_unused", "keep_credits"],
  refunded_before_credit: ["rejected"],
};

const REFUSALS: Readonly<Record<PaymentReviewKind, string>> = {
  awaiting_credit: "No credits were added for this payment, so there is nothing to take back or keep. Add the credits or reject it.",
  refunded_after_credit: "This payment's credits were already added before it was refunded, so it cannot be credited again or rejected. Take back the unused credits, or keep them and close it.",
  refunded_before_credit: "This payment was refunded before any credits were added, so there is nothing to add or take back. Close it without adding credits.",
};

/** The plain-words reason a decision is refused for this kind of parked payment, or null when it is allowed. */
export function paymentReviewRefusal(kind: PaymentReviewKind, decision: PaymentReviewDecision): string | null {
  return DECISIONS_BY_KIND[kind].includes(decision) ? null : REFUSALS[kind];
}

export function parsePaymentReviewKind(value: unknown): PaymentReviewKind | undefined {
  return PAYMENT_REVIEW_KINDS.find(kind => kind === value);
}

const note = z.string().transform(value => value.trim().slice(0, PAYMENT_REVIEW_NOTE_MAX)).optional();

/** POST /api/admin/payments/review/:paymentId. `credits` caps a take-back (required by the page for a partial refund). */
export const paymentReviewRequestSchema = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("credited"), note }),
  z.strictObject({ decision: z.literal("rejected"), note }),
  z.strictObject({ decision: z.literal("revoke_unused"), note, credits: z.number().int().positive().optional() }),
  z.strictObject({ decision: z.literal("keep_credits"), note }),
]);
export type PaymentReviewRequest = z.infer<typeof paymentReviewRequestSchema>;
/** The body the admin page sends (before the server trims the note). */
export type PaymentReviewRequestBody = z.input<typeof paymentReviewRequestSchema>;

const outcomeBase = { paymentId: z.number().int().positive(), tokenCount: z.number().int().nonnegative(), userId: z.number().int().positive(), role: z.enum(["job_seeker", "referrer"]) };

/** What the review did. A take-back reports what it removed and what was already used (unrecovered). */
export const paymentReviewOutcomeSchema = z.discriminatedUnion("decision", [
  z.object({ ...outcomeBase, decision: z.literal("credited") }),
  z.object({ ...outcomeBase, decision: z.literal("rejected") }),
  z.object({ ...outcomeBase, decision: z.literal("keep_credits") }),
  z.object({ ...outcomeBase, decision: z.literal("revoke_unused"), requested: z.number().int().positive(), revoked: z.number().int().nonnegative(), unrecovered: z.number().int().nonnegative(), balanceBefore: z.number().int(), balanceAfter: z.number().int() }),
]);
export type PaymentReviewOutcome = z.infer<typeof paymentReviewOutcomeSchema>;

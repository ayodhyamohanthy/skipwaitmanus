// Plain words for the admin payment review queue (client/src/pages/AdminPaymentsReview.tsx).
// Contract: shared/paymentReview.ts. Raw reason codes never reach the page.
import type { PaymentReviewDecision, PaymentReviewKind, PaymentReviewOutcome } from "@shared/paymentReview";

export const creditCount = (count: number) => `${count} credit${count === 1 ? "" : "s"}`;
export const displayPaymentRef = (id: number) => `Ref-PMT-${1000 + id}`;

export function formatAmount(amount: number, currency: string) {
  const major = amount / 100;
  return `${currency} ${major % 1 === 0 ? major.toFixed(0) : major.toFixed(2)}`;
}

export function compactDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

const REASONS: Readonly<Record<string, string>> = {
  checkout_amount_mismatch: "The amount paid did not match the checkout price, so no credits were added.",
  provider_page_mismatch: "Chargebee's payment page did not match this checkout, so no credits were added.",
  provider_page_incomplete: "Chargebee's payment page was missing details, so no credits were added.",
  reconciliation_rejected: "The automatic credit check did not go through, so no credits were added.",
  refund_partial: "Part of this payment was refunded in Chargebee after its credits were added.",
  refund_credits_spent: "This payment was refunded in Chargebee after some of its credits were used.",
  refund_currency_mismatch: "A refund in another currency was recorded after this payment's credits were added.",
  refund_amount_unreadable: "A refund was recorded after this payment's credits were added, but its amount could not be read.",
  refund_of_uncredited_payment: "This payment was refunded in full in Chargebee before any credits were added.",
  refund_not_full_before_credit: "Chargebee recorded a refund before any credits were added, but it did not cover the whole payment. Check the refunds in Chargebee, and add the credits only if the buyer still paid for the pack.",
};

export function reviewReasonText(reason: string | null): string {
  return (reason && REASONS[reason]) || "Held for a manual check.";
}

export function decisionLabel(decision: PaymentReviewDecision, kind: PaymentReviewKind, tokenCount: number): string {
  if (decision === "credited") return `Add ${creditCount(tokenCount)}`;
  if (decision === "rejected") return kind === "refunded_before_credit" ? "Close, nothing to add" : "Reject, add nothing";
  if (decision === "revoke_unused") return "Take back unused credits";
  return "Keep credits and close";
}

export function outcomeText(outcome: PaymentReviewOutcome): string {
  if (outcome.decision === "credited") return `Added ${creditCount(outcome.tokenCount)} to the wallet.`;
  if (outcome.decision === "rejected") return "Closed. No credits were added.";
  if (outcome.decision === "keep_credits") return "Closed. Nothing was taken back from the wallet.";
  const taken = `Took back ${outcome.revoked} of ${creditCount(outcome.requested)}.`;
  return outcome.unrecovered > 0 ? `${taken} ${outcome.unrecovered} had already been used and cannot be taken back.` : taken;
}

export function outcomeBadge(decision: PaymentReviewDecision): { label: string; tone: "green" | "red" | "slate" } {
  if (decision === "credited") return { label: "Credited", tone: "green" };
  if (decision === "rejected") return { label: "Closed", tone: "red" };
  if (decision === "revoke_unused") return { label: "Taken back", tone: "slate" };
  return { label: "Closed", tone: "slate" };
}

/** A whole number from 1 to the pack size, or null. */
export function parseTakeBackCount(value: string, packCredits: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const count = Number(value.trim());
  return count >= 1 && count <= packCredits ? count : null;
}

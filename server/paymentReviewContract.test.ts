import { describe, expect, it } from "vitest";
import { DECISIONS_BY_KIND, PAYMENT_REVIEW_DECISIONS, parsePaymentReviewKind, paymentReviewKind, paymentReviewOutcomeSchema, paymentReviewRefusal, paymentReviewRequestSchema, type PaymentReviewKind } from "../shared/paymentReview";

// Contract for shared/paymentReview.ts (vitest does not collect shared/**, so the
// contract test lives beside the server that enforces it). Why a payment is parked
// decides what an administrator may do with it: a pack the webhook already added
// can never be added again, and a pack never added has nothing to take back.
const CREDITED_AT = new Date("2026-10-10T00:00:00.000Z");

describe("why a parked payment is under review", () => {
  it.each(["checkout_amount_mismatch", "provider_page_mismatch", "provider_page_incomplete", "reconciliation_rejected", null])("%s with no credit recorded is awaiting its credit", reason => {
    expect(paymentReviewKind({ reconciliationReason: reason, creditedAt: null })).toBe("awaiting_credit");
  });

  it.each(["refund_partial", "refund_credits_spent", "refund_currency_mismatch", "refund_amount_unreadable", "refund_repeated"])("%s was refunded after its credits were added, with or without a recorded credit time", reason => {
    expect(paymentReviewKind({ reconciliationReason: reason, creditedAt: CREDITED_AT })).toBe("refunded_after_credit");
    expect(paymentReviewKind({ reconciliationReason: reason, creditedAt: null })).toBe("refunded_after_credit");
  });

  it("a refund of a payment that was never credited only closes it", () => {
    expect(paymentReviewKind({ reconciliationReason: "refund_of_uncredited_payment", creditedAt: null })).toBe("refunded_before_credit");
  });

  it("a refund that does not cover what was paid leaves a never-credited payment waiting for its credit", () => {
    expect(paymentReviewKind({ reconciliationReason: "refund_not_full_before_credit", creditedAt: null })).toBe("awaiting_credit");
    expect(paymentReviewKind({ reconciliationReason: "refund_not_full_before_credit", creditedAt: CREDITED_AT })).toBe("refunded_after_credit");
  });

  it.each(["checkout_amount_mismatch", "provider_page_mismatch", "refund_of_uncredited_payment", null])("any row with a recorded credit (%s) was credited, so it can never be credited again", reason => {
    expect(paymentReviewKind({ reconciliationReason: reason, creditedAt: CREDITED_AT })).toBe("refunded_after_credit");
    expect(paymentReviewKind({ reconciliationReason: reason, creditedAt: CREDITED_AT.toISOString() })).toBe("refunded_after_credit");
  });

  it("allows exactly these decisions per kind, and refuses every other one in plain words", () => {
    expect(DECISIONS_BY_KIND).toEqual({ awaiting_credit: ["credited", "rejected"], refunded_after_credit: ["revoke_unused", "keep_credits"], refunded_before_credit: ["rejected"] });
    for (const kind of Object.keys(DECISIONS_BY_KIND) as PaymentReviewKind[]) {
      for (const decision of PAYMENT_REVIEW_DECISIONS) {
        const refusal = paymentReviewRefusal(kind, decision);
        if (DECISIONS_BY_KIND[kind].includes(decision)) expect(refusal).toBeNull();
        else expect(refusal).toMatch(/^[A-Z][^_]+\.$/);
      }
    }
    expect(paymentReviewRefusal("refunded_after_credit", "credited")).toMatch(/already added/i);
  });

  it("reads a review kind from untrusted input and nothing else", () => {
    expect(parsePaymentReviewKind("awaiting_credit")).toBe("awaiting_credit");
    expect(parsePaymentReviewKind("refunded_after_credit")).toBe("refunded_after_credit");
    expect(parsePaymentReviewKind("credited")).toBeUndefined();
    expect(parsePaymentReviewKind(undefined)).toBeUndefined();
    expect(parsePaymentReviewKind(3)).toBeUndefined();
  });
});

describe("payment review request body", () => {
  it("refuses unknown decisions, extra fields and bad credit counts", () => {
    for (const body of [
      { decision: "refund" },
      { decision: "credited", extra: true },
      { decision: "credited", credits: 2 },
      { decision: "rejected", credits: 2 },
      { decision: "keep_credits", credits: 2 },
      { decision: "revoke_unused", credits: 0 },
      { decision: "revoke_unused", credits: -1 },
      { decision: "revoke_unused", credits: 1.5 },
      { decision: "revoke_unused", credits: "3" },
      { decision: "credited", note: 7 },
      {},
    ]) expect(paymentReviewRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
  });

  it("accepts each decision, an optional credit cap on take-back only, and trims a long note to 500 characters", () => {
    expect(paymentReviewRequestSchema.parse({ decision: "revoke_unused", credits: 3, note: "  partial refund INR 200  " })).toEqual({ decision: "revoke_unused", credits: 3, note: "partial refund INR 200" });
    expect(paymentReviewRequestSchema.parse({ decision: "revoke_unused" })).toEqual({ decision: "revoke_unused" });
    expect(paymentReviewRequestSchema.parse({ decision: "credited" })).toEqual({ decision: "credited" });
    expect(paymentReviewRequestSchema.parse({ decision: "keep_credits", note: "goodwill" })).toEqual({ decision: "keep_credits", note: "goodwill" });
    const long = paymentReviewRequestSchema.parse({ decision: "rejected", note: `  ${"x".repeat(900)}` });
    expect(long.note).toHaveLength(500);
  });
});

describe("payment review outcome", () => {
  it("carries the take-back numbers for revoke_unused and the plain result otherwise", () => {
    const base = { paymentId: 41, tokenCount: 5, userId: 7, role: "job_seeker" };
    expect(paymentReviewOutcomeSchema.parse({ ...base, decision: "revoke_unused", requested: 4, revoked: 1, unrecovered: 3, balanceBefore: 1, balanceAfter: 0 })).toMatchObject({ requested: 4, revoked: 1, unrecovered: 3 });
    expect(paymentReviewOutcomeSchema.safeParse({ ...base, decision: "revoke_unused" }).success).toBe(false);
    expect(paymentReviewOutcomeSchema.parse({ ...base, decision: "credited" })).toMatchObject({ decision: "credited", tokenCount: 5 });
    expect(paymentReviewOutcomeSchema.safeParse({ ...base, decision: "refund" }).success).toBe(false);
  });
});

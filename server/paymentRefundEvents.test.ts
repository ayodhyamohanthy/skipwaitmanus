import { describe, expect, it } from "vitest";
import { summariseRecordedRefunds } from "./paymentRefundEvents";
import { paymentRefundSummarySchema } from "../shared/paymentReview";

// The review queue shows what Chargebee refunded for each held payment, read from the
// refund records the webhook writes (billing.refund_needs_review). Records from before
// the refund currency was saved fall back to the payment's currency, except a currency
// mismatch; a record that cannot be read is left out rather than guessed.
const record = (id: number, paymentId: number, metadata: Record<string, unknown> | string) => ({ id, resourceId: String(paymentId), metadata: typeof metadata === "string" ? metadata : JSON.stringify(metadata) });

describe("refund summaries for the payment review queue", () => {
  it("counts each refund event once and reports the latest amount and currency per payment", () => {
    const summaries = summariseRecordedRefunds([
      record(1, 41, { reason: "refund_partial", eventId: "evt_1", refundAmount: 20000, refundCurrency: "INR", currency: "INR" }),
      record(3, 41, { reason: "refund_repeated", eventId: "evt_2", refundAmount: 30000, refundCurrency: "INR", currency: "INR" }),
      record(2, 41, { reason: "refund_partial", eventId: "evt_1", refundAmount: 20000, refundCurrency: "INR", currency: "INR" }),
      record(4, 42, { reason: "refund_not_full_before_credit", eventId: "evt_9", refundAmount: null, refundCurrency: "INR", currency: "INR" }),
    ]);
    expect(summaries.get(41)).toEqual({ count: 2, latestAmount: 30000, latestCurrency: "INR" });
    expect(summaries.get(42)).toEqual({ count: 1, latestAmount: null, latestCurrency: "INR" });
    for (const summary of summaries.values()) expect(paymentRefundSummarySchema.parse(summary)).toEqual(summary);
  });

  it("falls back to the payment currency for records written before the refund currency was saved, but never for a currency mismatch", () => {
    const summaries = summariseRecordedRefunds([
      record(1, 41, { reason: "refund_credits_spent", eventId: "evt_1", refundAmount: 50000, currency: "INR" }),
      record(2, 43, { reason: "refund_currency_mismatch", eventId: "evt_3", refundAmount: 600, currency: "INR" }),
    ]);
    expect(summaries.get(41)).toEqual({ count: 1, latestAmount: 50000, latestCurrency: "INR" });
    expect(summaries.get(43)).toEqual({ count: 1, latestAmount: 600, latestCurrency: null });
  });

  it("leaves out records it cannot read", () => {
    const summaries = summariseRecordedRefunds([record(1, 41, "not json"), record(2, 41, { reason: "refund_partial" }), { id: 3, resourceId: "x", metadata: JSON.stringify({ eventId: "evt_1" }) }, { id: 4, resourceId: null, metadata: JSON.stringify({ eventId: "evt_2" }) }]);
    expect([...summaries.keys()]).toEqual([]);
  });
});

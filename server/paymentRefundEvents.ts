// A Chargebee refund (payment_refunded) of a pack payment that is still waiting
// for its credit (paymentFulfillments requires_review, shared/paymentReview.ts kind
// awaiting_credit). Runs inside applyChargebeePaymentRefund's transaction
// (server/db.ts), after it locked the fulfilment row FOR UPDATE. It never moves a
// credit: it records the refund, so a redelivered event is recognised, and decides
// whether the review may still add the pack.
//
// Only refunds that add up to what the buyer paid, in that currency, close the
// payment (refund_of_uncredited_payment: the review can only close it). A refunded
// overcharge on an amount mismatch is the usual fix and the buyer has still paid for
// the pack, so anything short of that, an unreadable amount or a refund in another
// currency leaves it creditable once (refund_not_full_before_credit) for the admin to
// check in Chargebee. What was paid comes from the record fulfillChargebeePayment
// wrote in the same transaction that parked the amount mismatch.
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { operationalActivityLogs, paymentFulfillments } from "../drizzle/schema";
import { REFUND_NOT_FULL_BEFORE_CREDIT, REFUND_OF_UNCREDITED_PAYMENT } from "../shared/paymentReview";
import type { LedgerTx } from "./creditLedger";

type FulfilmentRow = typeof paymentFulfillments.$inferSelect;
export type RefundEvent = { eventId: string; invoiceId: string; refundAmount?: number; currency?: string };
export type RefundBeforeCreditOutcome =
  | { status: "duplicate"; paymentId: number }
  | { status: "review"; paymentId: number; reason: typeof REFUND_OF_UNCREDITED_PAYMENT | typeof REFUND_NOT_FULL_BEFORE_CREDIT; expectedAmount: number; currency: string };

/** The records the refund webhook writes for a payment (resourceType payment_fulfillment), each naming its event. */
export const REFUND_RECORD_ACTIONS = ["billing.refund_needs_review", "billing.refund_credits_revoked"] as const;
const PAID_RECORD_ACTION = "billing.payment_amount_mismatch";

const refundRecordSchema = z.object({ eventId: z.string().min(1), refundAmount: z.number().int().positive().nullish(), refundCurrency: z.string().min(1).nullish() });
const paidRecordSchema = z.object({ paidAmount: z.number().int().positive(), paidCurrency: z.string().min(1) });
type RecordedRefund = z.infer<typeof refundRecordSchema>;
export type PaymentRefundHistory = { refunds: RecordedRefund[]; paid?: { amount: number; currency: string } };

function parseJson(raw: string | null): unknown {
  try { return JSON.parse(raw ?? ""); } catch { return undefined; }
}

/** This payment's own records: the refund events already handled, and what the buyer paid when it disagreed with the checkout. */
export async function readPaymentRefundHistoryTx(tx: LedgerTx, paymentId: number): Promise<PaymentRefundHistory> {
  // The transaction's first consistent read comes after the caller's row lock, so a
  // delivery that waited on that lock sees the record the one before it committed.
  const rows = await tx.select({ id: operationalActivityLogs.id, action: operationalActivityLogs.action, metadata: operationalActivityLogs.metadata }).from(operationalActivityLogs).where(and(inArray(operationalActivityLogs.action, [...REFUND_RECORD_ACTIONS, PAID_RECORD_ACTION]), eq(operationalActivityLogs.resourceType, "payment_fulfillment"), eq(operationalActivityLogs.resourceId, String(paymentId))));
  const history: PaymentRefundHistory = { refunds: [] };
  let paidRecordId = 0;
  for (const row of rows) {
    const metadata = parseJson(row.metadata);
    if (row.action === PAID_RECORD_ACTION) {
      const paid = paidRecordSchema.safeParse(metadata);
      if (paid.success && row.id > paidRecordId) { paidRecordId = row.id; history.paid = { amount: paid.data.paidAmount, currency: paid.data.paidCurrency }; }
      continue;
    }
    const refund = refundRecordSchema.safeParse(metadata);
    if (refund.success) history.refunds.push(refund.data);
  }
  return history;
}

/** How much of these refunds provably went back in this currency (an unreadable or other-currency refund counts for nothing). */
function refundedIn(currency: string, refunds: readonly RecordedRefund[]): number {
  return refunds.reduce((total, refund) => total + (refund.refundAmount && refund.refundCurrency === currency ? refund.refundAmount : 0), 0);
}

export async function settleRefundBeforeCreditTx(tx: LedgerTx, row: FulfilmentRow, event: RefundEvent): Promise<RefundBeforeCreditOutcome> {
  const history = await readPaymentRefundHistoryTx(tx, row.id);
  if (history.refunds.some(refund => refund.eventId === event.eventId)) return { status: "duplicate", paymentId: row.id };
  const thisRefund = { eventId: event.eventId, refundAmount: event.refundAmount ?? null, refundCurrency: event.currency ?? null };
  const refundedTotal = refundedIn(history.paid?.currency ?? row.currency, [...history.refunds, thisRefund]);
  // Without a record of what was paid, no refund is assumed to cover it: the admin decides.
  const reason = history.paid && refundedTotal >= history.paid.amount ? REFUND_OF_UNCREDITED_PAYMENT : REFUND_NOT_FULL_BEFORE_CREDIT;
  await tx.update(paymentFulfillments).set({ reconciliationReason: reason, lastCheckedAt: new Date() }).where(and(eq(paymentFulfillments.id, row.id), eq(paymentFulfillments.status, "requires_review")));
  await tx.insert(operationalActivityLogs).values({ actorUserId: row.userId, action: "billing.refund_needs_review", outcome: "failure", resourceType: "payment_fulfillment", resourceId: String(row.id), metadata: JSON.stringify({ reason, ...thisRefund, invoiceId: event.invoiceId, refundedTotal, paidAmount: history.paid?.amount ?? null, paidCurrency: history.paid?.currency ?? null, amount: row.amount, currency: row.currency, tokenCount: row.tokenCount }) });
  return { status: "review", paymentId: row.id, reason, expectedAmount: row.amount, currency: row.currency };
}

// A Chargebee refund (payment_refunded) of a pack payment that is not in the credited
// state. Runs inside applyChargebeePaymentRefund's transaction (server/db.ts), after it
// locked the fulfilment row FOR UPDATE; a credited payment stays with that function's
// policy. Nothing here moves a credit. Every refund is recorded on the payment
// (billing.refund_needs_review, with its event id), so a redelivered event is a
// duplicate and a new refund always reaches a human (the webhook route alerts on review):
// - still waiting for its credit (awaiting_credit): only refunds that add up to what the
//   buyer paid, in that currency, close it (refund_of_uncredited_payment: the review can
//   only close it). A refunded overcharge on an amount mismatch is the usual fix and the
//   buyer has still paid for the pack, so anything short of that, an unreadable amount or
//   a refund in another currency leaves it creditable once (refund_not_full_before_credit)
//   for the admin to check in Chargebee. What was paid comes from the record
//   fulfillChargebeePayment wrote in the same transaction that parked the amount mismatch.
// - parked after its credit, or closed by the admin's review: back to review as
//   refund_repeated, so unused credits can be taken back for this refund too, capped by
//   what earlier rounds took (server/paymentRefundReview.ts).
// - refunded in full, rejected, or anything else: left as it is, recorded and alerted.
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { operationalActivityLogs, paymentFulfillments } from "../drizzle/schema";
import { REFUND_NOT_FULL_BEFORE_CREDIT, REFUND_OF_UNCREDITED_PAYMENT, REFUND_REPEATED, REFUND_REVIEWED_KEPT, REFUND_REVIEWED_REVOKED, paymentReviewKind, type PaymentRefundSummary, type RefundReviewReason } from "../shared/paymentReview";
import type { LedgerTx } from "./creditLedger";

type FulfilmentRow = typeof paymentFulfillments.$inferSelect;
export type RefundEvent = { eventId: string; invoiceId: string; refundAmount?: number; currency?: string };
export type NonCreditedRefundOutcome =
  | { status: "duplicate"; paymentId: number }
  | { status: "review"; paymentId: number; reason: RefundReviewReason; expectedAmount: number; currency: string };

/** The records the refund webhook writes for a payment (resourceType payment_fulfillment), each naming its event. */
const REFUND_RECORD_ACTIONS = ["billing.refund_needs_review", "billing.refund_credits_revoked"] as const;
const PAID_RECORD_ACTION = "billing.payment_amount_mismatch";
const CLOSED_BY_REVIEW: ReadonlySet<string> = new Set([REFUND_REVIEWED_REVOKED, REFUND_REVIEWED_KEPT]);

const refundRecordSchema = z.object({ eventId: z.string().min(1), refundAmount: z.number().int().positive().nullish(), refundCurrency: z.string().min(1).nullish() });
const paidRecordSchema = z.object({ paidAmount: z.number().int().positive(), paidCurrency: z.string().min(1) });
type RecordedRefund = z.infer<typeof refundRecordSchema>;
type PaymentRefundHistory = { refunds: RecordedRefund[]; paid?: { amount: number; currency: string } };

function parseJson(raw: string | null): unknown {
  try { return JSON.parse(raw ?? ""); } catch { return undefined; }
}

/** This payment's own records: the refund events already handled, and what the buyer paid when it disagreed with the checkout. */
async function readPaymentRefundHistoryTx(tx: LedgerTx, paymentId: number): Promise<PaymentRefundHistory> {
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

const summaryRecordSchema = refundRecordSchema.extend({ reason: z.string().optional(), currency: z.string().min(1).optional() });

/** Per payment, from its refund records (billing.refund_needs_review): how many refund events, and the latest one's amount and currency. */
export function summariseRecordedRefunds(records: ReadonlyArray<{ id: number; resourceId: string | null; metadata: string | null }>): Map<number, PaymentRefundSummary> {
  const byPayment = new Map<number, { latestId: number; events: Set<string>; amount: number | null; currency: string | null }>();
  for (const record of records) {
    const paymentId = Number(record.resourceId);
    const parsed = summaryRecordSchema.safeParse(parseJson(record.metadata));
    if (!Number.isInteger(paymentId) || paymentId <= 0 || !parsed.success) continue;
    const { eventId, refundAmount, refundCurrency, reason, currency } = parsed.data;
    // Records from before the refund currency was saved carry the payment's; a currency mismatch is the one case they differ.
    const recordCurrency = refundCurrency !== undefined ? refundCurrency : reason === "refund_currency_mismatch" ? null : currency ?? null;
    const entry = byPayment.get(paymentId) ?? { latestId: 0, events: new Set<string>(), amount: null, currency: null };
    entry.events.add(eventId);
    if (record.id > entry.latestId) Object.assign(entry, { latestId: record.id, amount: refundAmount ?? null, currency: recordCurrency });
    byPayment.set(paymentId, entry);
  }
  return new Map(Array.from(byPayment, ([paymentId, entry]) => [paymentId, { count: entry.events.size, latestAmount: entry.amount, latestCurrency: entry.currency }]));
}

/** How much of these refunds provably went back in this currency (an unreadable or other-currency refund counts for nothing). */
function refundedIn(currency: string, refunds: readonly RecordedRefund[]): number {
  return refunds.reduce((total, refund) => total + (refund.refundAmount && refund.refundCurrency === currency ? refund.refundAmount : 0), 0);
}

async function recordRefundTx(tx: LedgerTx, row: FulfilmentRow, event: RefundEvent, reason: RefundReviewReason, details: Record<string, string | number | null>): Promise<NonCreditedRefundOutcome> {
  await tx.insert(operationalActivityLogs).values({ actorUserId: row.userId, action: "billing.refund_needs_review", outcome: "failure", resourceType: "payment_fulfillment", resourceId: String(row.id), metadata: JSON.stringify({ reason, eventId: event.eventId, refundAmount: event.refundAmount ?? null, refundCurrency: event.currency ?? null, invoiceId: event.invoiceId, ...details, amount: row.amount, currency: row.currency, tokenCount: row.tokenCount }) });
  return { status: "review", paymentId: row.id, reason, expectedAmount: row.amount, currency: row.currency };
}

export async function settleRefundOfNonCreditedPaymentTx(tx: LedgerTx, row: FulfilmentRow, event: RefundEvent): Promise<NonCreditedRefundOutcome> {
  const history = await readPaymentRefundHistoryTx(tx, row.id);
  if (history.refunds.some(refund => refund.eventId === event.eventId)) return { status: "duplicate", paymentId: row.id };
  const now = new Date();
  const kind = row.status === "requires_review" ? paymentReviewKind(row) : null;

  if (kind === "awaiting_credit") {
    const refundedTotal = refundedIn(history.paid?.currency ?? row.currency, [...history.refunds, { eventId: event.eventId, refundAmount: event.refundAmount ?? null, refundCurrency: event.currency ?? null }]);
    // Without a record of what was paid, no refund is assumed to cover it: the admin decides.
    const reason = history.paid && refundedTotal >= history.paid.amount ? REFUND_OF_UNCREDITED_PAYMENT : REFUND_NOT_FULL_BEFORE_CREDIT;
    await tx.update(paymentFulfillments).set({ reconciliationReason: reason, lastCheckedAt: now }).where(and(eq(paymentFulfillments.id, row.id), eq(paymentFulfillments.status, "requires_review")));
    return recordRefundTx(tx, row, event, reason, { refundedTotal, paidAmount: history.paid?.amount ?? null, paidCurrency: history.paid?.currency ?? null });
  }

  const details = { previousStatus: row.status, previousReason: row.reconciliationReason };
  if (kind === "refunded_after_credit") {
    await tx.update(paymentFulfillments).set({ reconciliationReason: REFUND_REPEATED, lastCheckedAt: now }).where(and(eq(paymentFulfillments.id, row.id), eq(paymentFulfillments.status, "requires_review")));
    return recordRefundTx(tx, row, event, REFUND_REPEATED, details);
  }
  if (row.status === "refunded" && CLOSED_BY_REVIEW.has(row.reconciliationReason ?? "")) {
    // The admin closed it for an earlier refund; this one may leave more unused credits to take back.
    const reopened = await tx.update(paymentFulfillments).set({ status: "requires_review", reconciliationReason: REFUND_REPEATED, lastCheckedAt: now }).where(and(eq(paymentFulfillments.id, row.id), eq(paymentFulfillments.status, "refunded")));
    if (Number(reopened[0]?.affectedRows ?? 0) !== 1) throw new Error("The payment changed while its refund was being recorded");
    return recordRefundTx(tx, row, event, REFUND_REPEATED, details);
  }
  // Refunded in full by the webhook, rejected, or another closed state: nothing to reopen.
  const firstRefund = history.refunds.length === 0 && (row.status === "rejected" || row.status === "pending");
  return recordRefundTx(tx, row, event, firstRefund ? REFUND_OF_UNCREDITED_PAYMENT : REFUND_REPEATED, details);
}

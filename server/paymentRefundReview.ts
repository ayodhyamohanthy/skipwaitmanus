// Closing a pack payment that was refunded at the provider after its credits were
// added (shared/paymentReview.ts kind "refunded_after_credit"). Runs inside
// resolveRequiresReviewPayment's transaction (server/db.ts), after it locked the
// fulfilment row FOR UPDATE and checked it is still requires_review.
//
// revoke_unused takes back up to the pack's credits that are still unused, from
// the purchased balance only (cycle, carryover, trial and promo never change),
// never below zero, and records what could not be recovered. A payment returns to
// review for each later refund (server/paymentRefundEvents.ts), so take-backs are
// counted across rounds and never exceed the pack. The first one uses the same key
// and reference slot as the refund webhook's full revocation (payment-refund-<id>,
// admin_adjustment on payment_fulfillment <id>); each later round has its own
// (payment-refund-<id>-<round>, on payment_refund_review <id>:<round>), and the
// unique ledger keys refuse a repeat of either. keep_credits closes the payment and
// leaves the wallet alone.
import { and, eq, inArray, sql } from "drizzle-orm";
import { operationalActivityLogs, paymentFulfillments, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { REFUND_REVIEWED_KEPT, REFUND_REVIEWED_REVOKED, type PaymentReviewOutcome } from "../shared/paymentReview";
import { isDuplicateKey, type LedgerTx } from "./creditLedger";
import { captureServerError } from "./sentry";

const REFUSED_NAME = "PaymentReviewRefusedError";

/** A review decision the payment's state does not allow. Nothing was written; the message is for the administrator. */
export class PaymentReviewRefusedError extends Error {
  constructor(message: string) { super(message); this.name = REFUSED_NAME; }
}

/** By name, so the routes recognise the refusal without depending on module identity. */
export function isPaymentReviewRefusal(error: unknown): error is Error {
  return error instanceof Error && error.name === REFUSED_NAME;
}

type FulfilmentRow = typeof paymentFulfillments.$inferSelect;
export type RefundedPaymentReviewInput = { adminUserId: number; row: FulfilmentRow; decision: "revoke_unused" | "keep_credits"; note: string | null; credits?: number; now: Date };

const FIRST_TAKE_BACK = "payment_fulfillment";
const LATER_TAKE_BACK = "payment_refund_review";
const credits = (count: number) => `${count} credit${count === 1 ? "" : "s"}`;

/** Credits already taken back for this payment by any path (the refund webhook, an earlier review round), and the ledger key the next take-back uses. */
async function earlierTakeBacksTx(tx: LedgerTx, row: FulfilmentRow) {
  const id = String(row.id);
  const rows = await tx.select({ tokenCount: tokenTransactions.tokenCount, referenceType: tokenTransactions.referenceType, referenceId: tokenTransactions.referenceId }).from(tokenTransactions).where(and(eq(tokenTransactions.userId, row.userId), eq(tokenTransactions.role, row.role), eq(tokenTransactions.kind, "admin_adjustment"), inArray(tokenTransactions.referenceType, [FIRST_TAKE_BACK, LATER_TAKE_BACK])));
  const first = rows.filter(entry => entry.referenceType === FIRST_TAKE_BACK && entry.referenceId === id);
  const later = rows.filter(entry => entry.referenceType === LATER_TAKE_BACK && (entry.referenceId ?? "").startsWith(`${id}:`));
  const taken = [...first, ...later].reduce((sum, entry) => sum + Math.max(0, -entry.tokenCount), 0);
  const round = later.length + 2;
  const nextKey = first.length === 0
    ? { referenceType: FIRST_TAKE_BACK, referenceId: id, idempotencyKey: `payment-refund-${id}` }
    : { referenceType: LATER_TAKE_BACK, referenceId: `${id}:${round}`, idempotencyKey: `payment-refund-${id}-${round}` };
  return { taken, nextKey };
}

export async function closeRefundedPaymentReviewTx(tx: LedgerTx, input: RefundedPaymentReviewInput): Promise<PaymentReviewOutcome> {
  const { row } = input;
  const base = { paymentId: row.id, tokenCount: row.tokenCount, userId: row.userId, role: row.role };
  const close = async (reason: string) => {
    const closed = await tx.update(paymentFulfillments).set({ status: "refunded", reconciliationReason: reason, lastCheckedAt: input.now }).where(and(eq(paymentFulfillments.id, row.id), eq(paymentFulfillments.status, "requires_review")));
    if (Number(closed[0]?.affectedRows ?? 0) !== 1) throw new Error("This payment was already resolved");
  };
  const audit = (action: string, metadata: Record<string, unknown>) => tx.insert(operationalActivityLogs).values({ actorUserId: input.adminUserId, action, outcome: "success", resourceType: "payment_fulfillment", resourceId: String(row.id), metadata: JSON.stringify({ reason: row.reconciliationReason, packCredits: row.tokenCount, ...metadata, note: input.note }) });

  if (input.decision === "keep_credits") {
    await close(REFUND_REVIEWED_KEPT);
    await audit("payment.review_keep_credits", {});
    return { ...base, decision: "keep_credits" };
  }

  // Counted under the caller's lock on the fulfilment row, so no other take-back of this payment can run meanwhile.
  const earlier = await earlierTakeBacksTx(tx, row);
  const remaining = Math.max(0, row.tokenCount - earlier.taken);
  if (remaining === 0) throw new PaymentReviewRefusedError(`${row.tokenCount === 1 ? "The 1 credit" : `All ${row.tokenCount} credits`} from this payment ${row.tokenCount === 1 ? "was" : "were"} already taken back, so there is nothing more to take back. Close it with Keep credits and close.`);
  const requested = input.credits ?? remaining;
  if (requested > remaining) throw new PaymentReviewRefusedError(earlier.taken > 0
    ? `You can take back at most ${remaining} more ${remaining === 1 ? "credit" : "credits"} for this payment: ${earlier.taken} of its ${row.tokenCount} ${earlier.taken === 1 ? "was" : "were"} already taken back.`
    : `You can take back at most ${credits(row.tokenCount)} for this payment, the size of its pack.`);
  // Fulfilment row first (locked by the caller), then the wallet: the refund webhook's order.
  const wallet = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, row.userId), eq(tokenBalances.role, row.role))).limit(1).for("update"))[0];
  const balanceBefore = wallet?.balance ?? 0;
  const revoked = Math.min(requested, Math.max(0, balanceBefore));
  const balanceAfter = balanceBefore - revoked;
  await close(REFUND_REVIEWED_REVOKED);
  if (wallet && revoked > 0) {
    const debited = await tx.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} - ${revoked}` }).where(and(eq(tokenBalances.id, wallet.id), eq(tokenBalances.balance, balanceBefore)));
    if (Number(debited[0]?.affectedRows ?? 0) !== 1) throw new Error("The wallet changed while taking back credits. Nothing was changed; try again.");
    try {
      await tx.insert(tokenTransactions).values({ userId: row.userId, role: row.role, tokenCount: -revoked, kind: "admin_adjustment", source: "purchased_balance", ...earlier.nextKey, balanceAfter });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // The ledger already holds this take-back's key: roll everything back rather than take credits twice.
      captureServerError(error, { source: "payment-review-second-revocation", paymentId: row.id });
      throw new PaymentReviewRefusedError("Credits for this payment were already taken back for this refund, so nothing more can be taken back. Nothing was changed.");
    }
  }
  const unrecovered = requested - revoked;
  await audit("payment.review_revoke_unused", { takenBackBefore: earlier.taken, requested, revoked, unrecovered, balanceBefore, balanceAfter });
  return { ...base, decision: "revoke_unused", requested, revoked, unrecovered, balanceBefore, balanceAfter };
}

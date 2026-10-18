// Closing a pack payment that was refunded at the provider after its credits were
// added (shared/paymentReview.ts kind "refunded_after_credit"). Runs inside
// resolveRequiresReviewPayment's transaction (server/db.ts), after it locked the
// fulfilment row FOR UPDATE and checked it is still requires_review.
//
// revoke_unused takes back up to the pack's credits that are still unused, from
// the purchased balance only (cycle, carryover, trial and promo never change),
// never below zero, and records what could not be recovered. Its ledger row uses
// the same key and reference slot as the refund webhook's full revocation
// (payment-refund-<id>, admin_adjustment on payment_fulfillment <id>), so a
// payment's credits are taken back at most once whichever path runs.
// keep_credits closes the payment and leaves the wallet alone.
import { and, eq, sql } from "drizzle-orm";
import { operationalActivityLogs, paymentFulfillments, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { REFUND_REVIEWED_KEPT, REFUND_REVIEWED_REVOKED, type PaymentReviewOutcome } from "../shared/paymentReview";
import type { LedgerTx } from "./creditLedger";
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

export function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === "ER_DUP_ENTRY";
}

type FulfilmentRow = typeof paymentFulfillments.$inferSelect;
export type RefundedPaymentReviewInput = { adminUserId: number; row: FulfilmentRow; decision: "revoke_unused" | "keep_credits"; note: string | null; credits?: number; now: Date };

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

  const requested = input.credits ?? row.tokenCount;
  if (requested > row.tokenCount) throw new PaymentReviewRefusedError(`You can take back at most ${row.tokenCount} credit${row.tokenCount === 1 ? "" : "s"} for this payment, the size of its pack.`);
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
      await tx.insert(tokenTransactions).values({ userId: row.userId, role: row.role, tokenCount: -revoked, kind: "admin_adjustment", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(row.id), idempotencyKey: `payment-refund-${row.id}`, balanceAfter });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      // This payment already has its take-back row (webhook full refund or an earlier revocation): roll everything back.
      captureServerError(error, { source: "payment-review-second-revocation", paymentId: row.id });
      throw new PaymentReviewRefusedError("Credits for this payment were already taken back once, so nothing more can be taken back. Nothing was changed.");
    }
  }
  const unrecovered = requested - revoked;
  await audit("payment.review_revoke_unused", { requested, revoked, unrecovered, balanceBefore, balanceAfter });
  return { ...base, decision: "revoke_unused", requested, revoked, unrecovered, balanceBefore, balanceAfter };
}

// Returning a reserved referral credit (D-012 item 2).
//
// Sending an ask reserves one credit (a `direct_request` debit). The credit
// comes back when the seeker withdraws before a claim, when the ask expires
// unclaimed, and when the ask ends as `declined`. All three use the same
// bucket math here; only the ledger kind differs so the cause stays
// auditable. A debit is reversed at most once: the reversal lookup below runs
// under the debit's row lock and the `token_transactions_reversal_unique`
// index backs it, so a replay, a race or a later backfill never refunds an
// ask twice and an ask never gets both an expiry and a decline refund.
// Refunds only ever touch the ask's own seeker's job-seeker wallet.
import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/mysql2";
import { tokenBalances, tokenTransactions } from "../drizzle/schema";

type Database = ReturnType<typeof drizzle>;
/** The transaction handle `db.transaction(async tx => …)` passes in. */
export type LedgerTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ReferralRefundKind = "withdrawal_refund" | "expiry_refund" | "decline_refund";
export type RefundableDebit = Pick<typeof tokenTransactions.$inferSelect, "id" | "source" | "sourceCycleKey">;
export type RefundWallet = Pick<typeof tokenBalances.$inferSelect, "id" | "balance" | "monthlyCreditsRemaining" | "monthlyAllowance" | "monthlyCycleKey">;

/** 1 when the credit goes back to a live bucket; 0 when it came from a monthly cycle that already rolled over. */
export function refundTokenCount(debit: RefundableDebit, wallet: RefundWallet): 0 | 1 {
  return debit.source === "monthly_allowance" && debit.sourceCycleKey !== wallet.monthlyCycleKey ? 0 : 1;
}

/**
 * Returns a reserved referral credit to its bucket. Identical math for every
 * kind (purchased balance +1; same-cycle monthly allowance +1 capped;
 * old-cycle monthly converts to nothing). Callers lock the debit and the
 * wallet and check for an existing reversal first.
 */
export async function refundReferralDebitTx(tx: LedgerTx, input: { userId: number; requestId: number; debit: RefundableDebit; wallet: RefundWallet; kind: ReferralRefundKind }) {
  const { userId, requestId, debit, wallet, kind } = input;
  const patch: { balance: number; monthlyCreditsRemaining: number } = { balance: wallet.balance, monthlyCreditsRemaining: wallet.monthlyCreditsRemaining };
  if (debit.source === "purchased_balance") patch.balance += 1;
  else if (debit.source === "monthly_allowance" && debit.sourceCycleKey === wallet.monthlyCycleKey) patch.monthlyCreditsRemaining = Math.min(wallet.monthlyAllowance, patch.monthlyCreditsRemaining + 1);
  await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, wallet.id));
  await tx.insert(tokenTransactions).values({ userId, role: "job_seeker", tokenCount: refundTokenCount(debit, wallet), kind, source: debit.source, sourceCycleKey: debit.sourceCycleKey, referenceType: "referral_request", referenceId: String(requestId), reversesTransactionId: debit.id, balanceAfter: patch.balance, monthlyCreditsAfter: patch.monthlyCreditsRemaining });
  return patch;
}

/** The ask fields a decline refund needs; `jobSeekerId` is the only wallet that can be credited. */
export type DeclinedAsk = { id: number; jobSeekerId: number; debitTransactionId: number | null };

export type DeclineRefundPlan =
  | { action: "none"; reason: "no_debit" | "already_reversed" }
  | { action: "refund"; ask: DeclinedAsk; debit: RefundableDebit; wallet: RefundWallet; tokenCount: 0 | 1 };

export class DeclineRefundWalletUnavailableError extends Error {
  constructor() { super("The reserved credit for this request could not be returned right now; try again or contact support"); this.name = "DeclineRefundWalletUnavailableError"; }
}

/**
 * Decides, under row locks, what a decline does to the seeker's credit.
 * No debit (legacy/free ask, or a debit that is not this seeker's) is a no-op;
 * an already-reversed debit (withdraw, expiry or an earlier decline) is a
 * no-op. A real, unreversed debit with no wallet throws, exactly like a
 * withdraw, so the credit is never silently lost.
 */
export async function planDeclineRefundTx(tx: LedgerTx, ask: DeclinedAsk): Promise<DeclineRefundPlan> {
  if (ask.debitTransactionId === null) return { action: "none", reason: "no_debit" };
  const debit = (await tx.select().from(tokenTransactions).where(and(eq(tokenTransactions.id, ask.debitTransactionId), eq(tokenTransactions.userId, ask.jobSeekerId), eq(tokenTransactions.kind, "direct_request"))).limit(1).for("update"))[0];
  if (!debit || !debit.source) return { action: "none", reason: "no_debit" };
  const reversal = (await tx.select({ id: tokenTransactions.id }).from(tokenTransactions).where(eq(tokenTransactions.reversesTransactionId, debit.id)).limit(1))[0];
  if (reversal) return { action: "none", reason: "already_reversed" };
  const wallet = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, ask.jobSeekerId), eq(tokenBalances.role, "job_seeker"))).limit(1).for("update"))[0];
  if (!wallet) throw new DeclineRefundWalletUnavailableError();
  return { action: "refund", ask, debit, wallet, tokenCount: refundTokenCount(debit, wallet) };
}

export type DeclineRefundOutcome = { refunded: false; reason: "no_debit" | "already_reversed" } | { refunded: true; tokenCount: 0 | 1 };

export async function applyDeclineRefundTx(tx: LedgerTx, plan: DeclineRefundPlan): Promise<DeclineRefundOutcome> {
  if (plan.action === "none") return { refunded: false, reason: plan.reason };
  await refundReferralDebitTx(tx, { userId: plan.ask.jobSeekerId, requestId: plan.ask.id, debit: plan.debit, wallet: plan.wallet, kind: "decline_refund" });
  return { refunded: true, tokenCount: plan.tokenCount };
}

/** Plan + apply in one step, for callers that do not need the plan first. */
export async function refundDeclinedAskTx(tx: LedgerTx, ask: DeclinedAsk): Promise<DeclineRefundOutcome> {
  return applyDeclineRefundTx(tx, await planDeclineRefundTx(tx, ask));
}

const DEFAULT_DECLINE_BODY = "Your Referrer has reviewed your Referral Request.";

/**
 * The seeker's in-app notice for a decline. The credit line leads because the
 * notification card clamps long bodies, and it only claims a credit came back
 * when one actually did.
 */
export function declineNotificationCopy(plan: DeclineRefundPlan, referrerMessage?: string): { title: string; body: string } {
  const message = referrerMessage?.trim() || DEFAULT_DECLINE_BODY;
  if (plan.action !== "refund") return { title: "Referral Request declined", body: message };
  if (plan.tokenCount === 1) return { title: "Referral Request declined — credit returned", body: `Your reserved credit is back on your balance.\n\n${message}` };
  return { title: "Referral Request declined", body: `The credit this request reserved came from last month's free allowance, which has already reset, so your balance is unchanged.\n\n${message}` };
}

// Scheduled job "daily-money-check" (D-065, the payments bar under D-058).
//
// Once a day this reads the money tables and emails the owner anything that
// does not reconcile: every wallet against its ledger rows (the same bucket
// rules as the admin audit, but all wallets, not the 200 latest), one
// purchase credit per credited payment, payments parked for review, refunds
// no payment explains, and checkouts still pending after a day. It never
// writes to a wallet, payment, or ledger row; the only writes are the job's
// own run record (the runner) and one operational-activity row when an alert
// email goes out. The email carries ids, amounts, currencies and reasons —
// never names, emails, or request content.
import { and, asc, count, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { operationalActivityLogs, paymentFulfillments, tokenTransactions } from "../drizzle/schema";
import { getDb, getFullCreditLedgerAudit, recordOperationalActivity } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

/** A checkout still pending after this is stale enough to list (D-065: "checkouts older than a day"). */
export const STALE_CHECKOUT_AGE_MS = 24 * 60 * 60_000;
export const MONEY_CHECK_BATCH = 200;
/** Each check lists at most this many examples; the counts stay complete. */
export const FINDINGS_PREVIEW_LIMIT = 50;
/** The most finding lines one email carries; the subject keeps the full count. */
export const FINDINGS_EMAIL_LINE_LIMIT = 60;
const MONEY_CHECK_RECIPIENT = "ayodhya@skipwait.me";

export type WalletAuditResult = { checkedWallets: number; mismatches: Array<Record<string, unknown>>; integrity: Array<Record<string, unknown>> };
export type CreditedPaymentRow = { id: number; userId: number; role: string; tokenCount: number };
export type PaymentCreditCount = { paymentId: number; creditRows: number; creditedTokens: number };
export type ParkedPaymentRow = { id: number; amount: number; currency: string; reconciliationReason: string | null; createdAt: Date };
export type UnmatchedRefundRow = { logId: number; resourceId: string | null; createdAt: Date };
export type StaleCheckoutRow = { id: number; amount: number; currency: string; createdAt: Date };

export type DailyMoneyCheckDeps = {
  auditWallets: () => Promise<WalletAuditResult>;
  listCreditedPayments: (afterId: number, limit: number) => Promise<CreditedPaymentRow[]>;
  countPaymentCreditRows: (paymentIds: number[]) => Promise<PaymentCreditCount[]>;
  listParkedPayments: (limit: number) => Promise<ParkedPaymentRow[]>;
  listUnmatchedRefunds: (limit: number) => Promise<UnmatchedRefundRow[]>;
  listStaleCheckouts: (olderThan: Date, limit: number) => Promise<StaleCheckoutRow[]>;
  sendEmail: (input: { subject: string; text: string }) => Promise<boolean>;
  recordActivity: typeof recordOperationalActivity;
};

async function listCreditedPayments(afterId: number, limit: number): Promise<CreditedPaymentRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: paymentFulfillments.id, userId: paymentFulfillments.userId, role: paymentFulfillments.role, tokenCount: paymentFulfillments.tokenCount })
    .from(paymentFulfillments)
    .where(and(eq(paymentFulfillments.status, "credited"), gt(paymentFulfillments.id, afterId)))
    .orderBy(asc(paymentFulfillments.id)).limit(limit);
}

async function countPaymentCreditRows(paymentIds: number[]): Promise<PaymentCreditCount[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  if (paymentIds.length === 0) return [];
  const rows = await db.select({ referenceId: tokenTransactions.referenceId, creditRows: count(), creditedTokens: sql<string>`COALESCE(SUM(${tokenTransactions.tokenCount}), 0)` })
    .from(tokenTransactions)
    .where(and(eq(tokenTransactions.referenceType, "payment_fulfillment"), eq(tokenTransactions.kind, "purchase"), inArray(tokenTransactions.referenceId, paymentIds.map(String))))
    .groupBy(tokenTransactions.referenceId);
  return rows.map(row => ({ paymentId: Number(row.referenceId), creditRows: Number(row.creditRows), creditedTokens: Number(row.creditedTokens) }));
}

async function listParkedPayments(limit: number): Promise<ParkedPaymentRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: paymentFulfillments.id, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, reconciliationReason: paymentFulfillments.reconciliationReason, createdAt: paymentFulfillments.createdAt })
    .from(paymentFulfillments).where(eq(paymentFulfillments.status, "requires_review"))
    .orderBy(asc(paymentFulfillments.id)).limit(limit);
}

async function listUnmatchedRefunds(limit: number): Promise<UnmatchedRefundRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  // A refund the webhook could not match to a payment never reaches Admin >
  // Payments requiring review, so it only exists as this log row; metadata
  // paymentId null is the unmatched marker (server/chargebeeRoutes.ts).
  const rows = await db.select({ id: operationalActivityLogs.id, resourceId: operationalActivityLogs.resourceId, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt })
    .from(operationalActivityLogs).where(eq(operationalActivityLogs.action, "billing.refund_needs_review"))
    .orderBy(asc(operationalActivityLogs.id)).limit(500);
  const unmatched: UnmatchedRefundRow[] = [];
  for (const row of rows) {
    let paymentId: unknown;
    try { paymentId = row.metadata ? (JSON.parse(row.metadata) as { paymentId?: unknown }).paymentId : null; } catch { paymentId = null; }
    if (paymentId === null || paymentId === undefined) unmatched.push({ logId: row.id, resourceId: row.resourceId ?? null, createdAt: row.createdAt });
    if (unmatched.length >= limit) break;
  }
  return unmatched;
}

async function listStaleCheckouts(olderThan: Date, limit: number): Promise<StaleCheckoutRow[]> {
  const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
  return db.select({ id: paymentFulfillments.id, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, createdAt: paymentFulfillments.createdAt })
    .from(paymentFulfillments).where(and(eq(paymentFulfillments.status, "pending"), lt(paymentFulfillments.createdAt, olderThan)))
    .orderBy(asc(paymentFulfillments.id)).limit(limit);
}

async function sendMoneyCheckEmail(input: { subject: string; text: string }): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const sender = process.env.ERROR_ALERT_FROM_EMAIL;
    if (!apiKey || !sender) throw new Error("Money check email delivery is not configured");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender, to: [MONEY_CHECK_RECIPIENT], subject: input.subject, text: input.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend responded with ${response.status}`);
    return true;
  } catch (error) {
    console.warn("[DailyMoneyCheck] Unable to send the owner email", error instanceof Error ? error.message : error);
    return false;
  }
}

export function createDailyMoneyCheck(deps: DailyMoneyCheckDeps = {
  auditWallets: getFullCreditLedgerAudit,
  listCreditedPayments,
  countPaymentCreditRows,
  listParkedPayments,
  listUnmatchedRefunds,
  listStaleCheckouts,
  sendEmail: sendMoneyCheckEmail,
  recordActivity: recordOperationalActivity,
}) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const findings: string[] = [];

    const audit = await deps.auditWallets();
    for (const mismatch of audit.mismatches) findings.push(`wallet mismatch: ${JSON.stringify(mismatch)}`);
    for (const item of audit.integrity) findings.push(`wallet integrity: ${JSON.stringify(item)}`);

    // One purchase credit per payment: a credited payment holds exactly one
    // purchase ledger row for its token count (unique idempotency keys refuse
    // a second; a missing or short row means the buyer paid for credits they
    // do not have).
    let afterId = 0;
    let checkedPayments = 0;
    for (;;) {
      const payments = await deps.listCreditedPayments(afterId, MONEY_CHECK_BATCH);
      if (payments.length === 0) break;
      const counts = new Map((await deps.countPaymentCreditRows(payments.map(row => row.id))).map(row => [row.paymentId, row]));
      for (const payment of payments) {
        const credit = counts.get(payment.id);
        if (!credit || credit.creditRows !== 1 || credit.creditedTokens !== payment.tokenCount) {
          findings.push(`payment credit mismatch: payment #${payment.id} expects one purchase row for ${payment.tokenCount} credits, found ${credit?.creditRows ?? 0} row(s) totaling ${credit?.creditedTokens ?? 0}`);
        }
      }
      checkedPayments += payments.length;
      afterId = payments[payments.length - 1]!.id;
      if (payments.length < MONEY_CHECK_BATCH) break;
    }

    const parked = await deps.listParkedPayments(FINDINGS_PREVIEW_LIMIT);
    for (const payment of parked) findings.push(`parked payment: #${payment.id} ${payment.amount} ${payment.currency} (${payment.reconciliationReason ?? "no reason recorded"}, since ${payment.createdAt.toISOString()})`);

    const refunds = await deps.listUnmatchedRefunds(FINDINGS_PREVIEW_LIMIT);
    for (const refund of refunds) findings.push(`unmatched refund: log #${refund.logId} (${refund.resourceId ?? "no invoice id"}, ${refund.createdAt.toISOString()})`);

    const stale = await deps.listStaleCheckouts(new Date(nowMs - STALE_CHECKOUT_AGE_MS), FINDINGS_PREVIEW_LIMIT);
    for (const checkout of stale) findings.push(`stale checkout: payment #${checkout.id} ${checkout.amount} ${checkout.currency} pending since ${checkout.createdAt.toISOString()}`);

    const output: JobRunOutput = { processed: audit.checkedWallets + checkedPayments, failed: 0 };
    if (findings.length === 0) return output;

    const subject = `skipwait.me daily money check · ${findings.length} finding${findings.length === 1 ? "" : "s"}`;
    const shown = findings.slice(0, FINDINGS_EMAIL_LINE_LIMIT);
    const text = [
      "The daily read-only money check found entries that do not reconcile. Nothing was written; each line needs a human look.",
      "",
      `Wallets checked: ${audit.checkedWallets}. Credited payments checked: ${checkedPayments}.`,
      "",
      ...shown,
      ...(findings.length > shown.length ? [`...and ${findings.length - shown.length} more finding(s) not shown here.`] : []),
      "",
      "Only ids, amounts, currencies and reasons are listed — no names, emails, or request content.",
    ].join("\n");
    const sent = await deps.sendEmail({ subject, text });
    await deps.recordActivity({ action: "billing.daily_money_check_alert", outcome: sent ? "success" : "failure", resourceType: "scheduled_job", resourceId: "daily-money-check", metadata: { findings: findings.length, checkedWallets: audit.checkedWallets, checkedPayments } }).catch(() => undefined);
    if (!sent) {
      // Fail the window so it is retried and reaches Sentry: a money mismatch
      // the owner never hears about is worse than a noisy retry.
      output.failed = 1;
      output.firstError = new Error(`The daily money check found ${findings.length} finding(s) but the owner email could not be sent`);
    }
    return output;
  };
}

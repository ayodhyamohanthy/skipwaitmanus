// Closing out abandoned checkout pages (founder-approved 2026-10-22).
//
// A checkout page that was opened and never paid stays "pending" forever. After 7 days it is marked with a reason
// and left out of the daily money check. Nothing is deleted. The row STAYS pending on purpose: if that buyer ever
// did pay, the payment webhook and the reconciler still find the row and credit it. Undo = clear the reason.
import { and, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { paymentFulfillments } from "../drizzle/schema";
import { getDb } from "./db";

export const ABANDONED_CHECKOUT_REASON = "abandoned_checkout_expired";
export const ABANDONED_CHECKOUT_AGE_MS = 7 * 24 * 60 * 60_000;

export type AbandonedCheckoutPlan = { cutoff: string; candidates: number; accounts: number; oldest: string | null; newest: string | null; byCurrency: Array<{ currency: string; count: number }> };
export type AbandonedCheckoutResult = AbandonedCheckoutPlan & { applied: boolean; closed: number };

const candidateWhere = (cutoff: Date) => and(
  eq(paymentFulfillments.status, "pending"),
  isNull(paymentFulfillments.providerInvoiceId),
  isNull(paymentFulfillments.reconciliationReason),
  isNull(paymentFulfillments.creditedAt),
  lt(paymentFulfillments.createdAt, cutoff),
);

export async function closeAbandonedCheckouts(nowMs: number, options: { apply: boolean }): Promise<AbandonedCheckoutResult> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const cutoff = new Date(nowMs - ABANDONED_CHECKOUT_AGE_MS);
  const [totals] = await db.select({ total: count(), accounts: sql<number>`COUNT(DISTINCT ${paymentFulfillments.userId})`, oldest: sql<Date | null>`MIN(${paymentFulfillments.createdAt})`, newest: sql<Date | null>`MAX(${paymentFulfillments.createdAt})` }).from(paymentFulfillments).where(candidateWhere(cutoff));
  const byCurrency = await db.select({ currency: paymentFulfillments.currency, count: count() }).from(paymentFulfillments).where(candidateWhere(cutoff)).groupBy(paymentFulfillments.currency);
  const plan: AbandonedCheckoutPlan = {
    cutoff: cutoff.toISOString(), candidates: Number(totals?.total ?? 0), accounts: Number(totals?.accounts ?? 0),
    oldest: totals?.oldest ? new Date(totals.oldest).toISOString() : null, newest: totals?.newest ? new Date(totals.newest).toISOString() : null,
    byCurrency: byCurrency.map(row => ({ currency: row.currency, count: Number(row.count) })),
  };
  if (!options.apply || plan.candidates === 0) return { ...plan, applied: false, closed: 0 };
  const ids = (await db.select({ id: paymentFulfillments.id }).from(paymentFulfillments).where(candidateWhere(cutoff))).map(row => row.id);
  let closed = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    // Re-check the conditions in the UPDATE itself so a row paid in between is never touched.
    const [res] = await db.update(paymentFulfillments).set({ reconciliationReason: ABANDONED_CHECKOUT_REASON }).where(and(candidateWhere(cutoff), inArray(paymentFulfillments.id, slice))) as unknown as [{ affectedRows?: number }];
    closed += Number(res?.affectedRows ?? 0);
  }
  return { ...plan, applied: true, closed };
}

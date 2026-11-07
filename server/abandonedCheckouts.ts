// Closing out abandoned checkout pages. (A repo record says the closeout was
// founder-approved 2026-10-22; that record is not re-verified here and is not
// execution permission - apply mode requires the per-row provider verification
// below regardless.)
//
// A checkout page that was opened and never paid stays "pending" forever. After 7 days it is marked with a reason
// and left out of the daily money check. Nothing is deleted. The row STAYS pending on purpose: if that buyer ever
// did pay, the payment webhook and the reconciler still find the row and credit it. Undo = clear the reason.
//
// Apply mode verifies every candidate against the provider before marking. Age
// plus a "requested"/"created" page state alone does NOT prove a checkout can
// never be paid: Chargebee's documented hosted-page states are only created,
// requested, succeeded, cancelled and acknowledged - there is no "expired"
// state. The documented terminal-unpayable fact is the page's own expires_at:
// after it, the page URL can no longer be accessed (checkout_new/_existing/
// _one_time URLs expire 3 hours after creation; source:
// https://apidocs.chargebee.com/docs/api/hosted_pages). A row is markable only
// when the provider shows (a) state "cancelled" (the buyer ended the checkout)
// or (b) a non-success state whose expires_at has passed. Success states
// (succeeded/acknowledged) are left to the webhook/reconciler and review, gone
// (404) and unreadable (auth/outage/timeout) pages are never marked, and a run
// where the provider faults for every candidate aborts instead of stamping an
// outage as abandonment.
import { and, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { paymentFulfillments } from "../drizzle/schema";
import { getDb } from "./db";
import { probeChargebeeHostedPage, type HostedPageProbe } from "./chargebee";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";

export const ABANDONED_CHECKOUT_REASON = "abandoned_checkout_expired";
export const ABANDONED_CHECKOUT_AGE_MS = 7 * 24 * 60 * 60_000;
/** Verify at most this many candidates per apply run (one provider read each); the rest wait for the next run. */
export const ABANDONED_VERIFY_BATCH = 200;
/** This many provider faults with nothing readable at all looks like a broken key, site or outage, not abandonment. */
export const ABANDONED_UNVERIFIABLE_ABORT_MIN = 3;
/** States where the buyer or the provider's own expiry ended the checkout's payability. "expired" is NOT a documented Chargebee hosted-page state; expiry comes from expires_at, not the state string. */
export const ABANDONED_CANCELLED_PAGE_STATE = "cancelled";
export const ABANDONED_SUCCESS_PAGE_STATES: ReadonlySet<string> = new Set(["succeeded", "acknowledged"]);

export type AbandonedCheckoutPlan = { cutoff: string; candidates: number; accounts: number; oldest: string | null; newest: string | null; byCurrency: Array<{ currency: string; count: number }> };
export type AbandonedCheckoutResult = AbandonedCheckoutPlan & { applied: boolean; closed: number; skippedNonTerminal: number; skippedNotFound: number; skippedFault: number; skippedPaid: number; skippedOverBatch: number; aborted: string | null };

export type AbandonedCandidate = { id: number; hostedPageId: string | null };
export type AbandonedCloseDeps = {
  listCandidates: (cutoff: Date) => Promise<AbandonedCandidate[]>;
  summarize: (cutoff: Date) => Promise<AbandonedCheckoutPlan>;
  markAbandoned: (ids: number[], cutoff: Date) => Promise<number>;
  probeHostedPage: (hostedPageId: string) => Promise<HostedPageProbe>;
};

const candidateWhere = (cutoff: Date) => and(
  eq(paymentFulfillments.status, "pending"),
  isNull(paymentFulfillments.providerInvoiceId),
  isNull(paymentFulfillments.reconciliationReason),
  isNull(paymentFulfillments.creditedAt),
  lt(paymentFulfillments.createdAt, cutoff),
);

async function summarizeCandidates(cutoff: Date): Promise<AbandonedCheckoutPlan> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [totals] = await db.select({ total: count(), accounts: sql<number>`COUNT(DISTINCT ${paymentFulfillments.userId})`, oldest: sql<Date | null>`MIN(${paymentFulfillments.createdAt})`, newest: sql<Date | null>`MAX(${paymentFulfillments.createdAt})` }).from(paymentFulfillments).where(candidateWhere(cutoff));
  const byCurrency = await db.select({ currency: paymentFulfillments.currency, count: count() }).from(paymentFulfillments).where(candidateWhere(cutoff)).groupBy(paymentFulfillments.currency);
  return {
    cutoff: cutoff.toISOString(), candidates: Number(totals?.total ?? 0), accounts: Number(totals?.accounts ?? 0),
    oldest: totals?.oldest ? new Date(totals.oldest).toISOString() : null, newest: totals?.newest ? new Date(totals.newest).toISOString() : null,
    byCurrency: byCurrency.map(row => ({ currency: row.currency, count: Number(row.count) })),
  };
}

async function listCandidateRows(cutoff: Date): Promise<AbandonedCandidate[]> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ id: paymentFulfillments.id, hostedPageId: paymentFulfillments.providerHostedPageId }).from(paymentFulfillments).where(candidateWhere(cutoff)).orderBy(paymentFulfillments.createdAt, paymentFulfillments.id);
  return rows.map(row => ({ id: row.id, hostedPageId: row.hostedPageId }));
}

async function markAbandonedRows(ids: number[], cutoff: Date): Promise<number> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  let closed = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    // Re-check the conditions in the UPDATE itself so a row paid in between is never touched.
    const [res] = await db.update(paymentFulfillments).set({ reconciliationReason: ABANDONED_CHECKOUT_REASON }).where(and(candidateWhere(cutoff), inArray(paymentFulfillments.id, slice))) as unknown as [{ affectedRows?: number }];
    closed += Number(res?.affectedRows ?? 0);
  }
  return closed;
}

async function probeFromConfiguredSite(hostedPageId: string): Promise<HostedPageProbe> {
  const runtime = resolveChargebeeRuntime(undefined);
  return probeChargebeeHostedPage(hostedPageId, { site: runtime.site, apiKey: runtime.apiKey });
}

export function createAbandonedCheckoutCloser(deps: AbandonedCloseDeps) {
  return async function runAbandonedCheckoutClose(nowMs: number, options: { apply: boolean }): Promise<AbandonedCheckoutResult> {
    const cutoff = new Date(nowMs - ABANDONED_CHECKOUT_AGE_MS);
    const plan = await deps.summarize(cutoff);
    const empty = { applied: false, closed: 0, skippedNonTerminal: 0, skippedNotFound: 0, skippedFault: 0, skippedPaid: 0, skippedOverBatch: 0, aborted: null };
    if (!options.apply || plan.candidates === 0) return { ...plan, ...empty };
    const candidates = await deps.listCandidates(cutoff);
    const eligible: number[] = [];
    let skippedNonTerminal = 0;
    let skippedNotFound = 0;
    let skippedFault = 0;
    let skippedPaid = 0;
    const toVerify = candidates.slice(0, ABANDONED_VERIFY_BATCH);
    const skippedOverBatch = candidates.length - toVerify.length;
    for (const candidate of toVerify) {
      let probe: HostedPageProbe;
      try {
        probe = candidate.hostedPageId ? await deps.probeHostedPage(candidate.hostedPageId) : { outcome: "not_found" };
      } catch {
        probe = { outcome: "fault" };
      }
      if (probe.outcome === "fault") { skippedFault += 1; continue; }
      if (probe.outcome === "not_found") { skippedNotFound += 1; continue; }
      // Success states mean the checkout reached the provider's paid path;
      // they belong to the webhook, the reconciler and review, never here.
      if (probe.paid || ABANDONED_SUCCESS_PAGE_STATES.has(probe.pageState)) { skippedPaid += 1; continue; }
      const expired = probe.expiresAtMs !== undefined && probe.expiresAtMs <= nowMs;
      if (probe.pageState !== ABANDONED_CANCELLED_PAGE_STATE && !expired) { skippedNonTerminal += 1; continue; }
      eligible.push(candidate.id);
    }
    // The provider faulting for every candidate points at a wrong key, site or
    // outage: close nothing rather than stamping a provider failure as
    // abandonment. Pages that are simply gone do not trip this guard.
    if (skippedFault >= ABANDONED_UNVERIFIABLE_ABORT_MIN && eligible.length === 0 && skippedNonTerminal === 0 && skippedNotFound === 0 && skippedPaid === 0) {
      return { ...plan, ...empty, skippedFault, skippedOverBatch, aborted: `provider unreadable for all ${skippedFault} probed candidates; nothing was marked` };
    }
    const closed = eligible.length > 0 ? await deps.markAbandoned(eligible, cutoff) : 0;
    return { ...plan, applied: true, closed, skippedNonTerminal, skippedNotFound, skippedFault, skippedPaid, skippedOverBatch, aborted: null };
  };
}

const defaultCloser = () => createAbandonedCheckoutCloser({ listCandidates: listCandidateRows, summarize: summarizeCandidates, markAbandoned: markAbandonedRows, probeHostedPage: probeFromConfiguredSite });

export async function closeAbandonedCheckouts(nowMs: number, options: { apply: boolean }): Promise<AbandonedCheckoutResult> {
  return defaultCloser()(nowMs, options);
}

// Scheduled job "chargebee-pending-reconcile": a missed webhook can no longer
// leave a paid checkout without its credits.
//
// Chargebee retries a failed webhook up to 7 times over about 3 days, but the
// app only credited early when the buyer came back (credit-recovery). This job
// finds checkouts still pending after a grace period, re-reads the hosted page
// and invoice from Chargebee (read only), and credits through the same safe
// path as the webhook (fulfillChargebeePayment: one transaction, idempotent by
// event id and by the single pending row). It never credits on its own
// judgement: only a succeeded page with a fully paid invoice whose checkout
// intent, amount and currency match the pending row.
// Anything that is paid but cannot be matched is parked as requires_review and
// the administrator is alerted, exactly like the webhook and credit-recovery.
// Unpaid pending rows are normal (abandoned checkouts) and are only re-checked.
import { and, asc, eq, gt, isNull, lt, like, or } from "drizzle-orm";
import { paymentFulfillments } from "../drizzle/schema";
import { retrieveChargebeeHostedPage } from "./chargebee";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";
import { applyChargebeeSubscriptionEvent, fulfillChargebeePayment, getDb, listPendingSubscriptionCheckoutIntents, markChargebeePaymentForReview, markSubscriptionCheckoutIntentCancelled } from "./db";
import { createPaymentReviewAlerter, createRetiredPlanAlerter } from "./errorAlerting";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";
import { retrieveCheckoutSubscription, subscriptionEventFromCheckoutPage, type RetrievedCheckoutSubscription } from "./chargebeeSubscriptionApi";
import type { TokenRole } from "./chargebee";

/** Wait this long after checkout: the webhook and Chargebee's first retries (2 and 8 minutes) normally land first. */
export const PENDING_GRACE_MS = 15 * 60_000;
/** Pending rows older than this are no longer re-checked automatically (admin review and credit-recovery still work). */
export const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** One row is re-read from Chargebee at most this often (under the hourly cron period so every tick can re-check). */
export const PENDING_RECHECK_MS = 45 * 60_000;
export const PENDING_RECONCILE_BATCH = 50;
/** A batch where this many rows or more cannot be read from Chargebee at all looks like a broken key or site, not abandoned checkouts. */
export const UNVERIFIABLE_ALARM_MIN = 3;

export type PendingPayment = { id: number; hostedPageId: string; checkoutIntentId: string; amount: number; currency: string };
export type ReconciledHostedPage = { hostedPageId: string; invoiceId?: string; passThruContent?: string; amount?: number; currency?: string; paid: boolean };
export type ReviewReason = "provider_page_mismatch" | "provider_page_incomplete" | "reconciliation_rejected";

export type PendingReconcileDeps = {
  listPending: (olderThan: Date, newerThan: Date, recheckBefore: Date, limit: number) => Promise<PendingPayment[]>;
  retrieveHostedPage: (hostedPageId: string) => Promise<ReconciledHostedPage | undefined>;
  fulfill: (input: { eventId: string; hostedPageId: string; invoiceId?: string; passThruContent: string; amount: number; currency: string }) => Promise<{ status: string }>;
  markReview: (paymentId: number, reason: ReviewReason) => Promise<void>;
  touch: (paymentId: number, checkedAt: Date) => Promise<void>;
  alert: (input: { paymentId: number; reason: string; expectedAmount: number; expectedCurrency: string; paidAmount: number; paidCurrency: string }) => Promise<unknown>;
};

export async function listPendingChargebeePayments(olderThan: Date, newerThan: Date, recheckBefore: Date, limit: number): Promise<PendingPayment[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const rows = await db.select({ id: paymentFulfillments.id, hostedPageId: paymentFulfillments.providerHostedPageId, checkoutIntentId: paymentFulfillments.checkoutIntentId, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency })
    .from(paymentFulfillments)
    .where(and(
      eq(paymentFulfillments.provider, "chargebee"),
      eq(paymentFulfillments.status, "pending"),
      like(paymentFulfillments.providerEventId, "pending:%"),
      lt(paymentFulfillments.createdAt, olderThan),
      gt(paymentFulfillments.createdAt, newerThan),
      or(isNull(paymentFulfillments.lastCheckedAt), lt(paymentFulfillments.lastCheckedAt, recheckBefore)),
    ))
    .orderBy(asc(paymentFulfillments.createdAt), asc(paymentFulfillments.id))
    .limit(limit);
  return rows.flatMap(row => row.hostedPageId && row.checkoutIntentId ? [{ id: row.id, hostedPageId: row.hostedPageId, checkoutIntentId: row.checkoutIntentId, amount: row.amount, currency: row.currency }] : []);
}

async function touchPending(paymentId: number, checkedAt: Date) {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  await db.update(paymentFulfillments).set({ lastCheckedAt: checkedAt }).where(and(eq(paymentFulfillments.id, paymentId), eq(paymentFulfillments.status, "pending")));
}

async function retrieveFromConfiguredSite(hostedPageId: string): Promise<ReconciledHostedPage | undefined> {
  const runtime = resolveChargebeeRuntime(undefined);
  return retrieveChargebeeHostedPage(hostedPageId, { site: runtime.site, apiKey: runtime.apiKey });
}

export function createChargebeePendingReconcile(deps: PendingReconcileDeps = {
  listPending: listPendingChargebeePayments,
  retrieveHostedPage: retrieveFromConfiguredSite,
  fulfill: fulfillChargebeePayment,
  markReview: markChargebeePaymentForReview,
  touch: touchPending,
  alert: createPaymentReviewAlerter(),
}) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const now = new Date(nowMs);
    const pending = await deps.listPending(new Date(nowMs - PENDING_GRACE_MS), new Date(nowMs - PENDING_MAX_AGE_MS), new Date(nowMs - PENDING_RECHECK_MS), PENDING_RECONCILE_BATCH);
    const output: JobRunOutput = { processed: 0, failed: 0 };
    let unverifiable = 0;
    const fail = (error: unknown) => { output.failed += 1; if (output.firstError === undefined) output.firstError = error; };
    for (const row of pending) {
      try {
        const page = await deps.retrieveHostedPage(row.hostedPageId);
        if (!page) { unverifiable += 1; await deps.touch(row.id, now); continue; }
        if (!page.paid) { await deps.touch(row.id, now); continue; }
        if (!page.passThruContent || !Number.isInteger(page.amount) || !page.currency) {
          await deps.markReview(row.id, "provider_page_incomplete");
          void deps.alert({ paymentId: row.id, reason: "provider_page_incomplete", expectedAmount: row.amount, expectedCurrency: row.currency, paidAmount: page.amount ?? 0, paidCurrency: page.currency ?? "" });
          continue;
        }
        if (page.passThruContent !== row.checkoutIntentId || page.amount !== row.amount || page.currency !== row.currency) {
          await deps.markReview(row.id, "provider_page_mismatch");
          void deps.alert({ paymentId: row.id, reason: "provider_page_mismatch", expectedAmount: row.amount, expectedCurrency: row.currency, paidAmount: page.amount as number, paidCurrency: page.currency });
          continue;
        }
        const result = await deps.fulfill({ eventId: `hosted_page:${page.hostedPageId}`, hostedPageId: page.hostedPageId, invoiceId: page.invoiceId, passThruContent: page.passThruContent, amount: page.amount as number, currency: page.currency });
        if (result.status === "credited") output.processed += 1;
        else if (result.status !== "duplicate") {
          await deps.markReview(row.id, "reconciliation_rejected");
          void deps.alert({ paymentId: row.id, reason: "reconciliation_rejected", expectedAmount: row.amount, expectedCurrency: row.currency, paidAmount: page.amount as number, paidCurrency: page.currency });
        }
      } catch (error) {
        fail(error);
      }
    }
    // Every row unreadable at once points at a wrong key, site or an outage:
    // fail the window so it is retried and reaches Sentry instead of looking clean.
    if (unverifiable >= UNVERIFIABLE_ALARM_MIN && unverifiable === pending.length) fail(new Error(`Chargebee could not be read for ${unverifiable} pending checkouts in one window; check the API key, site and BILLING_ENV`));
    return output;
  };
}

// ---- GO-LIVE-1b ruling 3: pending pass checkouts reconcile the same way ----

export const SUBSCRIPTION_PENDING_GRACE_MS = 10 * 60_000; // >10 minutes old
export const SUBSCRIPTION_PENDING_MAX_AGE_MS = 3 * 86_400_000; // <3 days old
export const SUBSCRIPTION_RECONCILE_BATCH = 25; // <=25 per run

export type PendingSubscriptionIntentRow = {
  id: number;
  hostedPageId: string;
  checkoutIntentId: string;
  userId: number;
  role: TokenRole;
  plan: string;
  itemPriceId: string;
  currency: string;
};

export type SubscriptionReconcileDeps = {
  listPendingIntents: (olderThan: Date, newerThan: Date, limit: number) => Promise<PendingSubscriptionIntentRow[]>;
  retrieveCheckout: (hostedPageId: string) => Promise<RetrievedCheckoutSubscription | null>;
  applySubscriptionEvent: (input: NonNullable<ReturnType<typeof subscriptionEventFromCheckoutPage>>) => Promise<{ status?: string; reason?: string }>;
  cancelIntent: (hostedPageId: string, failureReason: string) => Promise<void>;
  alert: (input: { eventId?: string; eventType?: string; subscriptionId?: string; itemPriceId?: string }) => Promise<unknown>;
};

async function retrieveCheckoutFromConfiguredSite(hostedPageId: string) {
  const runtime = resolveChargebeeRuntime(undefined);
  return retrieveCheckoutSubscription(runtime, hostedPageId);
}

/**
 * GO-LIVE-1b: the safety net under a missed webhook. Pending pass checkouts
 * older than 10 minutes (the return page recovers fresher ones) and younger
 * than 3 days re-check their provider checkout page: a paid one activates
 * through the same single activation path, an expired unpaid one marks its
 * intent cancelled, a disagreement alerts the owner, and one failure never
 * stops the run. The 3-day window is a hard bound: a paid pass never sits
 * unactivated beyond it without the webhook alert (GO-LIVE-1b ruling 4).
 */
export function createSubscriptionPendingReconcile(deps: SubscriptionReconcileDeps = {
  listPendingIntents: (olderThan, newerThan, limit) => listPendingSubscriptionCheckoutIntents(olderThan, newerThan, limit),
  retrieveCheckout: retrieveCheckoutFromConfiguredSite,
  applySubscriptionEvent: applyChargebeeSubscriptionEvent,
  cancelIntent: markSubscriptionCheckoutIntentCancelled,
  alert: input => createRetiredPlanAlerter()({ ...input, reason: "unlinked_subscription" }),
}) {
  return async function runSubscriptionPendingReconcile({ nowMs }: JobRunContext): Promise<JobRunOutput> {
    let firstError: unknown;
    const current = new Date(nowMs);
    const olderThan = new Date(current.getTime() - SUBSCRIPTION_PENDING_GRACE_MS);
    const newerThan = new Date(current.getTime() - SUBSCRIPTION_PENDING_MAX_AGE_MS);
    const intents = await deps.listPendingIntents(olderThan, newerThan, SUBSCRIPTION_RECONCILE_BATCH);
    let activated = 0, cancelled = 0, stillPending = 0, review = 0, failed = 0;
    for (const intent of intents) {
      try {
        const page = await deps.retrieveCheckout(intent.hostedPageId);
        if (!page) { stillPending += 1; continue; }
        if (page.state === "cancelled" || page.state === "expired") {
          await deps.cancelIntent(intent.hostedPageId, "checkout_expired");
          cancelled += 1;
          continue;
        }
        if (page.state !== "succeeded") { stillPending += 1; continue; }
        const event = subscriptionEventFromCheckoutPage(page);
        const mismatched = !event || page.passThruContent !== intent.checkoutIntentId
          || (event.itemPriceId && event.itemPriceId !== intent.itemPriceId)
          || (event.currency && event.currency !== intent.currency);
        if (mismatched) {
          review += 1;
          void deps.alert({ eventId: event?.eventId ?? `hosted_page:${intent.hostedPageId}`, eventType: "subscription_reconcile", subscriptionId: event?.subscriptionId, itemPriceId: event?.itemPriceId }).catch(() => undefined);
          continue;
        }
        const result = await deps.applySubscriptionEvent(event);
        if (result?.status === "applied" || result?.status === "duplicate") { activated += 1; continue; }
        review += 1;
        void deps.alert({ eventId: event.eventId, eventType: "subscription_reconcile", subscriptionId: event.subscriptionId, itemPriceId: event.itemPriceId }).catch(() => undefined);
      } catch (error) {
        failed += 1;
        if (firstError === undefined) firstError = error;
        console.error("[Chargebee] subscription reconcile intent failed", { hostedPageId: intent.hostedPageId, error });
      }
    }
    console.log(`[Chargebee] subscription reconcile: ${activated} activated, ${cancelled} expired, ${stillPending} pending, ${review} review, ${failed} failed of ${intents.length}`);
    return { processed: intents.length, failed, firstError };
  };
}

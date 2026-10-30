// Scheduled job "review-delivery-retry" (REL-review-email-retry, D-212).
//
// A referrer's review email is sent once, fire-and-forget, when the ask is
// created (server/referralReviewDispatch.ts). A failed or unknown send is
// stored with a backed-off nextAttemptAt, a container restart can leave a row
// `pending`, and a crash mid-send leaves it `leased` with an expired lease.
// Nothing retried those rows, so the referrer never heard of the request.
//
// Each hourly window this job reads up to 50 due email rows (attemptCount < 5,
// oldest first) whose request is still open and whose review link is unused
// and unexpired, then per request calls prepareReferrerReviewEmailNotifications
// once. That call re-issues and revokes nothing: it returns each still-eligible
// referrer's existing token and re-applies the eligibility rules (request still
// pending, not paused or opted out, not passed, first look, assigned referrer,
// blocked pairs). Only the due row's own referrer is sent to, with that
// referrer's own token, through the same claim/complete lease as the first
// attempt, so two runs never send twice. The job writes no token and never
// rotates a grant. When the fifth attempt fails the owner is emailed once.
import { and, asc, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { referralRequests, referralReviewDeliveries, referrerReviewEmailLinks } from "../drizzle/schema";
import { configuredPublicOrigin } from "./_core/authPostGuard";
import { claimReferralReviewDelivery, completeReferralReviewDelivery, getDb, prepareReferrerReviewEmailNotifications } from "./db";
import type { TransactionalEmailResult } from "./emailDelivery";
import { sendAdminAlertEmail } from "./errorAlerting";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { sendReferrerReviewEmail } from "./referrerReviewEmail";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const REVIEW_DELIVERY_RETRY_BATCH = 50;
/** The same cap claimReferralReviewDelivery enforces. */
export const REVIEW_DELIVERY_MAX_ATTEMPTS = 5;
/** A `pending` row younger than this may still be in its first dispatch. */
export const REVIEW_DELIVERY_PENDING_GRACE_MS = 10 * 60_000;

export type DueReviewDelivery = { id: number; requestId: number; referrerId: number; attemptCount: number };
type ReviewLink = { referrerId: number; email: string; linkToken: string; companyDomain: string };
type CompleteResult = { status: "sent" | "failed" | "unknown"; providerMessageId?: string; error?: string };

export type ReviewDeliveryRetryDeps = {
  listDue: (now: Date, limit: number) => Promise<DueReviewDelivery[]>;
  prepare: (requestId: number) => Promise<ReviewLink[]>;
  claim: (requestId: number, referrerId: number, channel: "email", leaseOwner: string) => Promise<{ id: number; attemptCount: number } | undefined>;
  complete: (id: number, leaseOwner: string, result: CompleteResult) => Promise<{ recorded: boolean }>;
  send: (input: { to: string; companyDomain: string; reviewUrl: string }) => Promise<TransactionalEmailResult>;
  alertOwner: (input: { subject: string; text: string }) => Promise<{ sent: boolean }>;
  origin: () => string | undefined;
  newLeaseOwner: () => string;
};

/** Due email rows, oldest first: the three ways a send can be left undone, for a request a referrer can still review. */
export async function listDueReviewEmailDeliveries(now: Date, limit: number): Promise<DueReviewDelivery[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const pendingBefore = new Date(now.getTime() - REVIEW_DELIVERY_PENDING_GRACE_MS);
  return db.select({ id: referralReviewDeliveries.id, requestId: referralReviewDeliveries.referralRequestId, referrerId: referralReviewDeliveries.referrerId, attemptCount: referralReviewDeliveries.attemptCount })
    .from(referralReviewDeliveries)
    .innerJoin(referralRequests, eq(referralRequests.id, referralReviewDeliveries.referralRequestId))
    .innerJoin(referrerReviewEmailLinks, and(
      eq(referrerReviewEmailLinks.referralRequestId, referralReviewDeliveries.referralRequestId),
      eq(referrerReviewEmailLinks.referrerId, referralReviewDeliveries.referrerId),
      eq(referrerReviewEmailLinks.grantVersion, referralReviewDeliveries.grantVersion),
    ))
    .where(and(
      eq(referralReviewDeliveries.channel, "email"),
      lt(referralReviewDeliveries.attemptCount, REVIEW_DELIVERY_MAX_ATTEMPTS),
      eq(referralRequests.status, "pending"),
      isNull(referrerReviewEmailLinks.consumedAt),
      gt(referrerReviewEmailLinks.expiresAt, now),
      or(
        and(inArray(referralReviewDeliveries.status, ["failed", "unknown"]), lte(referralReviewDeliveries.nextAttemptAt, now)),
        and(eq(referralReviewDeliveries.status, "pending"), lte(referralReviewDeliveries.createdAt, pendingBefore)),
        and(eq(referralReviewDeliveries.status, "leased"), lt(referralReviewDeliveries.leaseExpiresAt, now)),
      ),
    ))
    .orderBy(asc(referralReviewDeliveries.createdAt), asc(referralReviewDeliveries.id))
    .limit(limit);
}

const defaultDeps: ReviewDeliveryRetryDeps = {
  listDue: listDueReviewEmailDeliveries,
  prepare: prepareReferrerReviewEmailNotifications,
  claim: claimReferralReviewDelivery,
  complete: completeReferralReviewDelivery,
  send: sendReferrerReviewEmail,
  alertOwner: input => sendAdminAlertEmail(undefined, input),
  origin: configuredPublicOrigin,
  newLeaseOwner: () => randomUUID(),
};

/** "<reason>:<providerStatus>" when the provider answered non-2xx, else the reason. */
export function deliveryError(result: TransactionalEmailResult): string {
  return result.providerStatus === undefined ? result.reason : `${result.reason}:${result.providerStatus}`;
}

export class ReviewDeliveryOriginMissingError extends Error {
  constructor() { super("Public origin is not configured (PUBLIC_BASE_URL or WORKOS_REDIRECT_URI); review emails cannot be retried"); this.name = "ReviewDeliveryOriginMissingError"; }
}

export function createReviewDeliveryRetry(overrides: Partial<ReviewDeliveryRetryDeps> = {}) {
  const deps: ReviewDeliveryRetryDeps = { ...defaultDeps, ...overrides };
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const due = await deps.listDue(new Date(nowMs), REVIEW_DELIVERY_RETRY_BATCH);
    const output: JobRunOutput = { processed: 0, failed: 0 };
    if (due.length === 0) return output;
    // A due row and no origin to build its link from: fail the window loudly rather than skip silently.
    const origin = deps.origin();
    if (!origin) throw new ReviewDeliveryOriginMissingError();
    const fail = (error: unknown) => { output.failed += 1; if (output.firstError === undefined) output.firstError = error; };
    const byRequest = new Map<number, DueReviewDelivery[]>();
    for (const row of due) byRequest.set(row.requestId, [...(byRequest.get(row.requestId) ?? []), row]);
    for (const [requestId, rows] of Array.from(byRequest.entries())) {
      let links: ReviewLink[];
      try { links = await deps.prepare(requestId); } catch (error) { for (let i = 0; i < rows.length; i += 1) fail(error); continue; }
      for (const row of rows) {
        // Not returned means no longer eligible (closed, passed, paused, blocked, first look): skip, never send.
        const link = links.find(item => item.referrerId === row.referrerId);
        if (!link) continue;
        const leaseOwner = deps.newLeaseOwner();
        let claim: { id: number; attemptCount: number } | undefined;
        try { claim = await deps.claim(requestId, row.referrerId, "email", leaseOwner); } catch (error) { fail(error); continue; }
        if (!claim) continue; // another runner holds it, or it is no longer due
        const attempt = claim.attemptCount + 1;
        let result: CompleteResult;
        try {
          const sent = await deps.send({ to: link.email, companyDomain: link.companyDomain, reviewUrl: `${origin}/email-review/${encodeURIComponent(link.linkToken)}` });
          result = sent.sent ? { status: "sent" } : { status: "failed", error: deliveryError(sent) };
        } catch (error) {
          result = { status: "unknown", error: error instanceof Error ? error.message : "delivery interrupted" };
        }
        try {
          const recorded = await deps.complete(claim.id, leaseOwner, result);
          if (result.status === "sent") { output.processed += 1; continue; }
          fail(new Error(`review email retry ${result.status}: ${result.error ?? "unknown"}`));
          if (recorded.recorded && attempt >= REVIEW_DELIVERY_MAX_ATTEMPTS) {
            await deps.alertOwner({
              subject: "Referrer review email gave up after 5 attempts",
              text: [`A referrer's review email for referral request ${requestId} (channel: email) failed ${REVIEW_DELIVERY_MAX_ATTEMPTS} times and will not be retried.`, `Last error: ${result.error ?? "unknown"}`, "The referrer has not been told about this request by email."].join("\n"),
            });
          }
        } catch (error) { fail(error); }
      }
    }
    return output;
  };
}

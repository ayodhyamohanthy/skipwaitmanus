// Scheduled job "pool-review-email" (D-174-pool-nudges part 2, D-193 §5.9, D-384).
//
// A request delivered from the waiting pool gets its referrer's review grant in
// the delivery transaction (writeReviewGrantTx in server/db.ts) but no email
// delivery row: review-delivery-retry sends any `pending` row older than 10
// minutes, which would bypass D-060's one-email-a-day cap. This hourly job is
// the only writer of that row for pool deliveries.
//
// Each window it reads pool deliveries from the last 72 hours that are still
// pending with their referrer, whose grant is unused and unexpired, and that
// have no email delivery row yet, oldest first. A referrer who already has an
// email delivery row created this UTC day is skipped (D-060); the next run
// picks up the rest. For each one it sends, it calls
// prepareReferrerReviewEmailNotifications, which re-checks eligibility (pending,
// assigned referrer, not paused, opted in, not passed, blocked pairs either
// way) and writes the `pending` row, then follows the same claim, send and
// complete lease sequence as review-delivery-retry, with the public origin from
// PUBLIC_BASE_URL. A failed or unknown send is retried by review-delivery-retry
// (five attempts, then the owner alert). Off while POOL_NUDGES_ENABLED is false.
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { referralRequests, referralReviewDeliveries, referrerReviewEmailLinks } from "../drizzle/schema";
import { POOL_NUDGES_ENABLED } from "../shared/poolNudges";
import { configuredPublicOrigin } from "./_core/authPostGuard";
import { claimReferralReviewDelivery, completeReferralReviewDelivery, getDb, prepareReferrerReviewEmailNotifications } from "./db";
import type { TransactionalEmailResult } from "./emailDelivery";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { sendReferrerReviewEmail } from "./referrerReviewEmail";
import { deliveryError } from "./reviewDeliveryRetry";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

/** Pool deliveries older than this are left to the in-app notice they already got. */
export const POOL_REVIEW_EMAIL_LOOKBACK_MS = 72 * 3_600_000;
export const POOL_REVIEW_EMAIL_BATCH = 100;

export type PoolReviewCandidate = { requestId: number; referrerId: number; visibleAtMs: number };
type ReviewLink = { referrerId: number; email: string; linkToken: string; companyDomain: string };
type CompleteResult = { status: "sent" | "failed" | "unknown"; providerMessageId?: string; error?: string };

export type PoolReviewEmailDeps = {
  enabled: () => boolean;
  listCandidates: (now: Date, limit: number) => Promise<PoolReviewCandidate[]>;
  /** Referrers among `referrerIds` with an email delivery row created at or after `dayStart`. */
  emailedSince: (referrerIds: readonly number[], dayStart: Date) => Promise<Set<number>>;
  prepare: (requestId: number) => Promise<ReviewLink[]>;
  claim: (requestId: number, referrerId: number, channel: "email", leaseOwner: string) => Promise<{ id: number; attemptCount: number } | undefined>;
  complete: (id: number, leaseOwner: string, result: CompleteResult) => Promise<{ recorded: boolean }>;
  send: (input: { to: string; companyDomain: string; reviewUrl: string }) => Promise<TransactionalEmailResult>;
  origin: () => string | undefined;
  newLeaseOwner: () => string;
};

const toMs = (value: Date | string | null): number => (value instanceof Date ? value.getTime() : value ? Date.parse(value) : Number.NaN);

/** Pool deliveries still waiting for their review email, oldest first. */
export async function listPoolReviewEmailCandidates(now: Date, limit: number): Promise<PoolReviewCandidate[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const since = new Date(now.getTime() - POOL_REVIEW_EMAIL_LOOKBACK_MS);
  const rows = await db.select({ requestId: referralRequests.id, referrerId: referralRequests.referrerId, visibleAt: referralRequests.coverageVisibleAt })
    .from(referralRequests)
    .innerJoin(referrerReviewEmailLinks, and(eq(referrerReviewEmailLinks.referralRequestId, referralRequests.id), eq(referrerReviewEmailLinks.referrerId, referralRequests.referrerId)))
    .leftJoin(referralReviewDeliveries, and(eq(referralReviewDeliveries.referralRequestId, referralRequests.id), eq(referralReviewDeliveries.referrerId, referralRequests.referrerId), eq(referralReviewDeliveries.channel, "email")))
    .where(and(
      eq(referralRequests.status, "pending"),
      eq(referralRequests.waitingForCoverage, false),
      isNotNull(referralRequests.referrerId),
      gte(referralRequests.coverageVisibleAt, since),
      isNull(referrerReviewEmailLinks.consumedAt),
      gt(referrerReviewEmailLinks.expiresAt, now),
      isNull(referralReviewDeliveries.id),
    ))
    .orderBy(asc(referralRequests.coverageVisibleAt), asc(referralRequests.id))
    .limit(limit);
  return rows.flatMap(row => (row.referrerId === null ? [] : [{ requestId: row.requestId, referrerId: row.referrerId, visibleAtMs: toMs(row.visibleAt) }]));
}

/** D-060: referrers who already have an email delivery row created this UTC day. */
export async function referrersEmailedSince(referrerIds: readonly number[], dayStart: Date): Promise<Set<number>> {
  if (!referrerIds.length) return new Set();
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  // The cap compares the row's database-set createdAt with a day start computed here: a clock skew of
  // seconds can move one email across midnight, which D-060's courtesy cap tolerates (no money moves).
  const rows = await db.select({ referrerId: referralReviewDeliveries.referrerId }).from(referralReviewDeliveries)
    .where(and(eq(referralReviewDeliveries.channel, "email"), inArray(referralReviewDeliveries.referrerId, [...referrerIds]), gte(referralReviewDeliveries.createdAt, dayStart)));
  return new Set(rows.map(row => row.referrerId));
}

const utcDayStart = (nowMs: number) => { const now = new Date(nowMs); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); };

const defaultDeps: PoolReviewEmailDeps = {
  enabled: () => POOL_NUDGES_ENABLED,
  listCandidates: listPoolReviewEmailCandidates,
  emailedSince: referrersEmailedSince,
  prepare: prepareReferrerReviewEmailNotifications,
  claim: claimReferralReviewDelivery,
  complete: completeReferralReviewDelivery,
  send: sendReferrerReviewEmail,
  origin: configuredPublicOrigin,
  newLeaseOwner: () => randomUUID(),
};

export class PoolReviewEmailOriginMissingError extends Error {
  constructor() { super("Public origin is not configured (PUBLIC_BASE_URL or WORKOS_REDIRECT_URI); pool review emails cannot be sent"); this.name = "PoolReviewEmailOriginMissingError"; }
}

export function createPoolReviewEmail(overrides: Partial<PoolReviewEmailDeps> = {}) {
  const deps: PoolReviewEmailDeps = { ...defaultDeps, ...overrides };
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const output: JobRunOutput = { processed: 0, failed: 0 };
    if (!deps.enabled()) return output;
    const candidates = (await deps.listCandidates(new Date(nowMs), POOL_REVIEW_EMAIL_BATCH))
      .slice().sort((a, b) => a.visibleAtMs - b.visibleAtMs || a.requestId - b.requestId);
    if (!candidates.length) return output;
    // A missing origin fails the run loudly before any row is written, as review-delivery-retry does.
    const origin = deps.origin();
    if (!origin) throw new PoolReviewEmailOriginMissingError();
    const fail = (error: unknown) => { output.failed += 1; if (output.firstError === undefined) output.firstError = error; };
    const emailedToday = await deps.emailedSince(Array.from(new Set(candidates.map(item => item.referrerId))), utcDayStart(nowMs));
    for (const candidate of candidates) {
      if (emailedToday.has(candidate.referrerId)) continue;
      let links: ReviewLink[];
      try { links = await deps.prepare(candidate.requestId); } catch (error) { fail(error); continue; }
      // Not returned means not eligible now (paused, opted out, passed, blocked, no longer assigned): send nothing.
      const link = links.find(item => item.referrerId === candidate.referrerId);
      if (!link) continue;
      // prepare wrote today's email row for this referrer, so D-060 counts it whatever happens next.
      emailedToday.add(candidate.referrerId);
      const leaseOwner = deps.newLeaseOwner();
      let claim: { id: number; attemptCount: number } | undefined;
      try { claim = await deps.claim(candidate.requestId, candidate.referrerId, "email", leaseOwner); } catch (error) { fail(error); continue; }
      if (!claim) continue; // another runner holds it
      let result: CompleteResult;
      try {
        const sent = await deps.send({ to: link.email, companyDomain: link.companyDomain, reviewUrl: `${origin}/email-review/${encodeURIComponent(link.linkToken)}` });
        result = sent.sent ? { status: "sent" } : { status: "failed", error: deliveryError(sent) };
      } catch (error) {
        result = { status: "unknown", error: error instanceof Error ? error.message : "delivery interrupted" };
      }
      try {
        const recorded = await deps.complete(claim.id, leaseOwner, result);
        if (!recorded.recorded) { fail(new Error("Pool review email could not record its delivery outcome")); continue; }
        if (result.status === "sent") { output.processed += 1; continue; }
        fail(new Error(`pool review email ${result.status}: ${result.error ?? "unknown"}`));
      } catch (error) { fail(error); }
    }
    return output;
  };
}

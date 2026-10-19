import { and, eq, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { referralDocumentAccessGrants, referralRequests, referralTransitionEvents } from "../drizzle/schema";

/*
 * When a referrer may see a Job Seeker's name and open their files (D-019(e);
 * Terms: "Before acceptance, a Referrer sees neither the Job Seeker's name nor
 * resume. On acceptance ... the Referrer receives the resume").
 *
 * - A claim grants nothing. Only the referrer's own acceptance writes a
 *   document grant, in the acceptance transaction (transitionReferralRequestTx
 *   calls openAcceptanceDocumentGrantTx), valid DOCUMENT_GRANT_TTL_MS. An
 *   administrator can never accept a claimed ask (adminReferralApproval.ts).
 * - Only the referrer's own recorded acceptance counts: their transition event
 *   that resulted in approved (logged since migration 0058, before grants
 *   existed). It opens a 30-day window; an unrevoked grant can only extend it;
 *   a revoked grant always wins and is never reopened. A grant alone opens
 *   nothing: before ee226f3 an administrator could approve a claimed ask,
 *   which left the claimant's claim-era grant and no acceptance by them.
 * - Rows written before this rule are read, never rewritten (no backfill).
 * - The Job Seeker who uploaded a file always has it (checked by the caller).
 *
 * GET /api/documents/:id and the assigned referrer's detail view both use these
 * functions, so a file link is shown exactly when it opens.
 */

/** Accepted and unfinished. Never the claimed-but-pending state, never closed. */
export const REFERRER_DOCUMENT_ACCESS_STATUSES = ["approved", "referred", "intro_made", "interview", "offer"] as const;
const ACCESS_STATUSES: ReadonlySet<string> = new Set(REFERRER_DOCUMENT_ACCESS_STATUSES);

export const DOCUMENT_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The transaction every grant writer runs in, under the ask's row lock (same shape as creditLedger's LedgerTx). */
export type ReferralTx = Parameters<Parameters<MySql2Database<Record<string, unknown>>["transaction"]>[0]>[0];

/** The actor's grant row on the ask, or null when none exists. */
export type ReferrerDocumentGrant = { readonly revokedAt: Date | null; readonly expiresAt: Date | null };

export type ReferrerAskAccessInput = {
  readonly actorUserId: number;
  readonly referrerId: number | null | undefined;
  readonly requestStatus: string | null | undefined;
  readonly passedByActor: boolean;
  readonly grant: ReferrerDocumentGrant | null;
  /** When the actor's own acceptance of the ask was recorded; a missing value counts as none. */
  readonly acceptedByActorAt: Date | null | undefined;
  readonly now: Date;
};

export function isReferrerDocumentAccessStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && ACCESS_STATUSES.has(status);
}

const timeOf = (value: Date | null | undefined): number | null => (value instanceof Date && Number.isFinite(value.getTime()) ? value.getTime() : null);

/** The referrer the ask is assigned to, who accepted it themselves and never passed: may see the seeker's name and file names. A grant is not an acceptance. */
export function isAcceptingReferrer(input: ReferrerAskAccessInput): boolean {
  if (!isReferrerDocumentAccessStatus(input.requestStatus) || input.referrerId !== input.actorUserId || input.passedByActor) return false;
  return timeOf(input.acceptedByActorAt) !== null;
}

/** May open the files now: an accepting referrer, no revoked grant, inside the later of their acceptance + 30 days and their grant's expiry. */
export function isReferrerDocumentAccessActive(input: ReferrerAskAccessInput): boolean {
  if (!isAcceptingReferrer(input) || (input.grant !== null && input.grant.revokedAt !== null)) return false;
  const nowMs = input.now.getTime();
  const grantEndsMs = input.grant === null ? null : timeOf(input.grant.expiresAt);
  const acceptedMs = timeOf(input.acceptedByActorAt);
  return (grantEndsMs !== null && grantEndsMs > nowMs) || (acceptedMs !== null && acceptedMs + DOCUMENT_GRANT_TTL_MS > nowMs);
}

/** A left-joined grant row as drizzle returns it: every column null when the actor has no grant on the ask. */
export function grantFromJoin(row: { readonly grantId?: number | null; readonly grantRevokedAt?: Date | null; readonly grantExpiresAt?: Date | null }): ReferrerDocumentGrant | null {
  if (row.grantId === null || row.grantId === undefined) return null;
  return { revokedAt: row.grantRevokedAt ?? null, expiresAt: row.grantExpiresAt ?? null };
}

/**
 * Left-join condition for the actor's own acceptance event on the ask (select
 * its createdAt as acceptedByActorAt). An ask reaches approved once, only from
 * pending, so the join adds at most one row.
 */
export function actorAcceptanceEventOn(actorUserId: number) {
  return and(eq(referralTransitionEvents.referralRequestId, referralRequests.id), eq(referralTransitionEvents.actorUserId, actorUserId), eq(referralTransitionEvents.resultingStatus, "approved"));
}

export type AcceptanceGrantOutcome = "opened" | "refreshed" | "kept_revoked";

/**
 * Opens the accepting referrer's document access, inside the acceptance
 * transaction and under the ask's row lock (every grant writer holds it, so a
 * plain read is current; a locking read on a missing key would gap-lock
 * neighbouring asks). No row: insert one. An unrevoked row (a claim written
 * before D-019(e)): refresh its window. A revoked row (a pass or an ended ask)
 * is never reopened; the caller reports it. Replays never reach this.
 */
export async function openAcceptanceDocumentGrantTx(tx: ReferralTx, input: { readonly requestId: number; readonly referrerId: number; readonly revision: number; readonly now: Date }): Promise<AcceptanceGrantOutcome> {
  const expiresAt = new Date(input.now.getTime() + DOCUMENT_GRANT_TTL_MS);
  const existing = (await tx.select({ id: referralDocumentAccessGrants.id, revokedAt: referralDocumentAccessGrants.revokedAt }).from(referralDocumentAccessGrants)
    .where(and(eq(referralDocumentAccessGrants.referralRequestId, input.requestId), eq(referralDocumentAccessGrants.referrerId, input.referrerId))).limit(1))[0];
  if (!existing) {
    await tx.insert(referralDocumentAccessGrants).values({ referralRequestId: input.requestId, referrerId: input.referrerId, requestRevision: input.revision, grantVersion: 1, grantedAt: input.now, expiresAt });
    return "opened";
  }
  if (existing.revokedAt !== null) return "kept_revoked";
  const refreshed = await tx.update(referralDocumentAccessGrants).set({ requestRevision: input.revision, grantVersion: sql`${referralDocumentAccessGrants.grantVersion} + 1`, grantedAt: input.now, expiresAt })
    .where(and(eq(referralDocumentAccessGrants.id, existing.id), isNull(referralDocumentAccessGrants.revokedAt)));
  return Number(refreshed[0]?.affectedRows ?? 0) === 1 ? "refreshed" : "kept_revoked";
}

import { sql } from "drizzle-orm";
import { referralDocumentAccessGrants } from "../drizzle/schema";

/*
 * When a referrer may open a Job Seeker's files (D-019(e); Privacy: "documents
 * remain private until a request is accepted"; Terms: "On acceptance ... the
 * Referrer receives the resume").
 *
 * - A claim grants nothing. Only acceptance writes a document grant (every
 *   accept path: one-click/queue, email review, thread review, admin approval),
 *   in the same transaction as the status change, valid DOCUMENT_GRANT_TTL_MS.
 * - Access needs all of: the ask is accepted and not finished
 *   (REFERRER_DOCUMENT_ACCESS_STATUSES), it is assigned to this referrer, they
 *   have not passed on it, and their grant is active (not revoked, not expired).
 * - An accepted ask with no grant row at all for its referrer was accepted
 *   before acceptance wrote one (one-click acceptance created none). Access
 *   for it is derived from the accepted state, so those referrers keep the
 *   resume without a production backfill; terminal states still end it.
 * - The Job Seeker who uploaded a file always has it (checked by the caller).
 *
 * GET /api/documents/:id and the assigned referrer's detail view both use
 * isReferrerDocumentAccessActive, so a link is shown exactly when it opens.
 */

export const REFERRER_DOCUMENT_ACCESS_STATUSES = ["approved", "intro_made", "interview", "offer"] as const;
const ACCESS_STATUSES: ReadonlySet<string> = new Set(REFERRER_DOCUMENT_ACCESS_STATUSES);

export const DOCUMENT_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The actor's grant row on the ask, or null when none exists. */
export type ReferrerDocumentGrant = { readonly revokedAt: Date | null; readonly expiresAt: Date | null };

export type ReferrerDocumentAccessInput = {
  readonly actorUserId: number;
  readonly referrerId: number | null;
  readonly requestStatus: string | null;
  readonly passedByActor: boolean;
  readonly grant: ReferrerDocumentGrant | null;
  readonly now: Date;
};

export function isReferrerDocumentAccessStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && ACCESS_STATUSES.has(status);
}

export function isReferrerDocumentAccessActive(input: ReferrerDocumentAccessInput): boolean {
  if (input.referrerId === null || input.referrerId !== input.actorUserId) return false;
  if (!isReferrerDocumentAccessStatus(input.requestStatus)) return false;
  if (input.passedByActor) return false;
  if (input.grant === null) return true;
  return input.grant.revokedAt === null && input.grant.expiresAt !== null && input.grant.expiresAt.getTime() > input.now.getTime();
}

/**
 * A left-joined grant row as drizzle returns it: every column null when the
 * actor has no grant on the ask. `grantId` tells "no row" apart from a row.
 */
export function grantFromJoin(row: { readonly grantId: number | null; readonly grantRevokedAt: Date | null; readonly grantExpiresAt: Date | null }): ReferrerDocumentGrant | null {
  return row.grantId === null ? null : { revokedAt: row.grantRevokedAt, expiresAt: row.grantExpiresAt };
}

/**
 * The upsert that opens the accepting referrer's document access. Inserting
 * over an existing row for the same (ask, referrer), e.g. one written by a
 * claim before D-019(e), restarts it: fresh window, revocation cleared.
 */
export function acceptanceDocumentGrant(input: { readonly requestId: number; readonly referrerId: number; readonly revision: number; readonly now: Date }) {
  const expiresAt = new Date(input.now.getTime() + DOCUMENT_GRANT_TTL_MS);
  return {
    values: { referralRequestId: input.requestId, referrerId: input.referrerId, requestRevision: input.revision, grantVersion: 1, grantedAt: input.now, expiresAt },
    set: { requestRevision: input.revision, grantVersion: sql`${referralDocumentAccessGrants.grantVersion}+1`, grantedAt: input.now, expiresAt, revokedAt: null, revokeReason: null },
  };
}

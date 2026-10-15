import { describe, expect, it } from "vitest";
import { referralStatuses } from "../shared/referral";
import { DOCUMENT_GRANT_TTL_MS, REFERRER_DOCUMENT_ACCESS_STATUSES, acceptanceDocumentGrant, grantFromJoin, isReferrerDocumentAccessActive, type ReferrerDocumentAccessInput } from "./referrerDocumentAccess";

/*
 * D-019(e): the one rule GET /api/documents/:id and the referrer's detail view
 * share. A claim never opens a file; acceptance does, for the referrer it is
 * assigned to, while their grant is active. Asks accepted before acceptance
 * wrote grants (no row) keep access from the accepted state.
 */

const NOW = new Date("2026-10-15T12:00:00Z");
const LATER = new Date(NOW.getTime() + 60_000);
const EARLIER = new Date(NOW.getTime() - 60_000);
const accepted: ReferrerDocumentAccessInput = { actorUserId: 2, referrerId: 2, requestStatus: "approved", passedByActor: false, grant: { revokedAt: null, expiresAt: LATER }, now: NOW };

describe("isReferrerDocumentAccessActive", () => {
  it("opens for the assigned referrer of an accepted ask with an active grant, in every accepted, unfinished state", () => {
    for (const status of ["approved", "intro_made", "interview", "offer"]) expect(isReferrerDocumentAccessActive({ ...accepted, requestStatus: status })).toBe(true);
  });

  it("never opens before acceptance, even with an active grant (a claim written before D-019(e))", () => {
    expect(isReferrerDocumentAccessActive({ ...accepted, requestStatus: "pending" })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...accepted, requestStatus: "pending", grant: null })).toBe(false);
  });

  it("closes in every terminal state, with or without a grant row", () => {
    for (const status of ["declined", "withdrawn", "closed"]) {
      expect(isReferrerDocumentAccessActive({ ...accepted, requestStatus: status })).toBe(false);
      expect(isReferrerDocumentAccessActive({ ...accepted, requestStatus: status, grant: null })).toBe(false);
    }
    expect(isReferrerDocumentAccessActive({ ...accepted, requestStatus: null })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...accepted, requestStatus: "unknown" })).toBe(false);
  });

  it("only the referrer the ask is assigned to; never another referrer or a non-party", () => {
    expect(isReferrerDocumentAccessActive({ ...accepted, actorUserId: 3 })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...accepted, actorUserId: 3, grant: null })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...accepted, referrerId: null, grant: null })).toBe(false);
  });

  it("a referrer who passed on the ask gets nothing", () => {
    expect(isReferrerDocumentAccessActive({ ...accepted, passedByActor: true })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...accepted, passedByActor: true, grant: null })).toBe(false);
  });

  it("a revoked or expired grant ends access", () => {
    expect(isReferrerDocumentAccessActive({ ...accepted, grant: { revokedAt: EARLIER, expiresAt: LATER } })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...accepted, grant: { revokedAt: null, expiresAt: EARLIER } })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...accepted, grant: { revokedAt: null, expiresAt: NOW } })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...accepted, grant: { revokedAt: null, expiresAt: null } })).toBe(false);
  });

  it("an ask accepted before acceptance wrote grants (no row) keeps access from its accepted state", () => {
    expect(isReferrerDocumentAccessActive({ ...accepted, grant: null })).toBe(true);
  });

  it("the access statuses are the accepted, unfinished subset of the referral statuses", () => {
    for (const status of REFERRER_DOCUMENT_ACCESS_STATUSES) expect(referralStatuses).toContain(status);
    expect(REFERRER_DOCUMENT_ACCESS_STATUSES).not.toContain("pending");
  });
});

describe("grantFromJoin", () => {
  it("tells a missing grant row apart from a row with nulls", () => {
    expect(grantFromJoin({ grantId: null, grantRevokedAt: null, grantExpiresAt: null })).toBeNull();
    expect(grantFromJoin({ grantId: 4, grantRevokedAt: null, grantExpiresAt: LATER })).toEqual({ revokedAt: null, expiresAt: LATER });
  });
});

describe("acceptanceDocumentGrant", () => {
  it("opens a fresh window for the accepting referrer and clears an earlier revocation on the same row", () => {
    const grant = acceptanceDocumentGrant({ requestId: 501, referrerId: 2, revision: 4, now: NOW });
    expect(grant.values).toEqual({ referralRequestId: 501, referrerId: 2, requestRevision: 4, grantVersion: 1, grantedAt: NOW, expiresAt: new Date(NOW.getTime() + DOCUMENT_GRANT_TTL_MS) });
    expect(grant.set).toMatchObject({ requestRevision: 4, grantedAt: NOW, expiresAt: new Date(NOW.getTime() + DOCUMENT_GRANT_TTL_MS), revokedAt: null, revokeReason: null });
    expect(DOCUMENT_GRANT_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

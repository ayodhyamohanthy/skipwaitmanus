import { describe, expect, it } from "vitest";
import { referralStatuses } from "../shared/referral";
import { DOCUMENT_GRANT_TTL_MS, REFERRER_DOCUMENT_ACCESS_STATUSES, grantFromJoin, isAcceptingReferrer, isReferrerDocumentAccessActive, isReferrerDocumentAccessStatus, type ReferrerAskAccessInput } from "./referrerDocumentAccess";

/*
 * D-019(e) rule (e): the one decision GET /api/documents/:id and the
 * referrer's detail view share. A claim never opens a file; only the assigned
 * referrer's own recorded acceptance does. Rows from before the fix are
 * derived on read: that acceptance opens a 30-day window, an unrevoked grant
 * can only extend it, a revoked grant always wins, and a grant alone (what an
 * administrator's approval of a claimed ask left before ee226f3) opens nothing.
 */

const NOW = new Date("2026-10-18T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const LATER = new Date(NOW.getTime() + 60_000);
const EARLIER = new Date(NOW.getTime() - 60_000);
const ago = (ms: number) => new Date(NOW.getTime() - ms);
/** Accepted by the actor a day ago, assigned to them, with the active grant that acceptance wrote. */
const granted: ReferrerAskAccessInput = { actorUserId: 2, referrerId: 2, requestStatus: "approved", passedByActor: false, grant: { revokedAt: null, expiresAt: LATER }, acceptedByActorAt: ago(DAY), now: NOW };
/** Accepted a day ago by the actor, before acceptance wrote grants (no row). */
const legacy: ReferrerAskAccessInput = { ...granted, grant: null };
/** What an administrator's approval of a claimed ask left before ee226f3: the claimant's unrevoked claim-era grant and no acceptance by them. */
const adminApproved: ReferrerAskAccessInput = { ...granted, acceptedByActorAt: null };

describe("accepted statuses", () => {
  it("are exactly approved, intro_made, interview and offer; never pending or closed", () => {
    expect([...REFERRER_DOCUMENT_ACCESS_STATUSES]).toEqual(["approved", "intro_made", "interview", "offer"]);
    for (const status of REFERRER_DOCUMENT_ACCESS_STATUSES) expect(referralStatuses).toContain(status);
    for (const status of ["pending", "closed", "declined", "withdrawn", "unknown", null, undefined]) expect(isReferrerDocumentAccessStatus(status)).toBe(false);
  });
});

describe("isReferrerDocumentAccessActive", () => {
  it("opens with an active grant in every accepted status", () => {
    for (const status of REFERRER_DOCUMENT_ACCESS_STATUSES) expect(isReferrerDocumentAccessActive({ ...granted, requestStatus: status })).toBe(true);
  });

  it("never opens before acceptance, even with an active grant (a claim-era row)", () => {
    expect(isReferrerDocumentAccessActive({ ...granted, requestStatus: "pending" })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...legacy, requestStatus: "pending" })).toBe(false);
  });

  it("only for the referrer the ask is assigned to", () => {
    expect(isReferrerDocumentAccessActive({ ...granted, actorUserId: 3 })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...legacy, referrerId: null })).toBe(false);
  });

  it("never for a referrer who passed", () => {
    expect(isReferrerDocumentAccessActive({ ...granted, passedByActor: true })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...legacy, passedByActor: true })).toBe(false);
  });

  it("a revoked grant wins, even over a recent acceptance", () => {
    expect(isReferrerDocumentAccessActive({ ...granted, grant: { revokedAt: EARLIER, expiresAt: LATER } })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...legacy, grant: { revokedAt: EARLIER, expiresAt: LATER } })).toBe(false);
  });

  it("a grant alone opens nothing: without the referrer's own recorded acceptance there is no access", () => {
    expect(isReferrerDocumentAccessActive(adminApproved)).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...adminApproved, acceptedByActorAt: undefined })).toBe(false);
    for (const status of REFERRER_DOCUMENT_ACCESS_STATUSES) expect(isReferrerDocumentAccessActive({ ...adminApproved, requestStatus: status })).toBe(false);
  });

  it("without a grant row, the referrer's own acceptance opens a 30-day window that then closes", () => {
    expect(isReferrerDocumentAccessActive(legacy)).toBe(true);
    expect(isReferrerDocumentAccessActive({ ...legacy, acceptedByActorAt: ago(DOCUMENT_GRANT_TTL_MS - 60_000) })).toBe(true);
    expect(isReferrerDocumentAccessActive({ ...legacy, acceptedByActorAt: ago(DOCUMENT_GRANT_TTL_MS) })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...legacy, acceptedByActorAt: ago(90 * DAY) })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...legacy, acceptedByActorAt: null })).toBe(false);
  });

  it("an expired grant still opens within 30 days of the referrer's own acceptance, and not after", () => {
    const expired = { ...granted, grant: { revokedAt: null, expiresAt: EARLIER } };
    expect(isReferrerDocumentAccessActive({ ...expired, acceptedByActorAt: ago(2 * DAY) })).toBe(true);
    expect(isReferrerDocumentAccessActive({ ...expired, acceptedByActorAt: ago(31 * DAY) })).toBe(false);
    expect(isReferrerDocumentAccessActive({ ...granted, acceptedByActorAt: ago(31 * DAY), grant: { revokedAt: null, expiresAt: NOW } })).toBe(false);
  });

  it("an unrevoked grant can extend an accepting referrer's window, never open one by itself", () => {
    expect(isReferrerDocumentAccessActive({ ...granted, acceptedByActorAt: ago(40 * DAY) })).toBe(true);
    expect(isReferrerDocumentAccessActive({ ...granted, acceptedByActorAt: null })).toBe(false);
  });

  it("treats a missing acceptance time as none, without throwing", () => {
    const missing = { ...legacy, acceptedByActorAt: undefined };
    expect(() => isReferrerDocumentAccessActive(missing)).not.toThrow();
    expect(isReferrerDocumentAccessActive(missing)).toBe(false);
  });
});

describe("isAcceptingReferrer (may see the name and file names)", () => {
  it("needs an accepted status, the assignment, no pass, and the referrer's own recorded acceptance", () => {
    expect(isAcceptingReferrer(legacy)).toBe(true);
    expect(isAcceptingReferrer(granted)).toBe(true);
    // The name stays with the referrer who accepted, after their file access has ended.
    expect(isAcceptingReferrer({ ...granted, acceptedByActorAt: ago(90 * DAY), grant: { revokedAt: null, expiresAt: EARLIER } })).toBe(true);
    expect(isAcceptingReferrer({ ...granted, grant: null, acceptedByActorAt: null })).toBe(false);
    expect(isAcceptingReferrer({ ...legacy, requestStatus: "pending" })).toBe(false);
    expect(isAcceptingReferrer({ ...legacy, actorUserId: 3 })).toBe(false);
    expect(isAcceptingReferrer({ ...legacy, passedByActor: true })).toBe(false);
    expect(isAcceptingReferrer({ ...legacy, acceptedByActorAt: undefined, grant: null })).toBe(false);
  });

  it("a grant is not an acceptance, whether it is active, expired or revoked", () => {
    expect(isAcceptingReferrer(adminApproved)).toBe(false);
    expect(isAcceptingReferrer({ ...adminApproved, grant: { revokedAt: null, expiresAt: EARLIER } })).toBe(false);
    expect(isAcceptingReferrer({ ...adminApproved, grant: { revokedAt: EARLIER, expiresAt: LATER } })).toBe(false);
  });
});

describe("grantFromJoin", () => {
  it("tells a missing grant row apart from a row of nulls", () => {
    expect(grantFromJoin({ grantId: null, grantRevokedAt: null, grantExpiresAt: null })).toBeNull();
    expect(grantFromJoin({ grantId: undefined, grantRevokedAt: undefined, grantExpiresAt: undefined })).toBeNull();
    expect(grantFromJoin({ grantId: 4, grantRevokedAt: null, grantExpiresAt: LATER })).toEqual({ revokedAt: null, expiresAt: LATER });
    expect(grantFromJoin({ grantId: 4, grantRevokedAt: undefined, grantExpiresAt: undefined })).toEqual({ revokedAt: null, expiresAt: null });
  });
});

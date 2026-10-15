import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralDocumentAccessGrants, referralRequests } from "../drizzle/schema";
import { ASK_TTL_MS } from "../shared/referral";
import { COLLEAGUE, REFERRER, REQUEST_ID, RESUME_ID, SEEKER, claimEraGrant, resetStore, store } from "./documentAccess.testkit";
import { claimCompanyReferralRequest, expireStalePendingReferralRequest, getAccessibleReferralAttachment, getClaimedCompanyReferralDetail, oneClickReviewReferralRequest, resolveAdminApproval, reviewReferralRequest, updateReferralProgress, withdrawCompanyReferralRequest } from "./db";

/*
 * D-019(e) document grants across the ask's whole life, on the real store over
 * the in-memory database: asks accepted before acceptance wrote grants keep
 * the resume, every referrer accept path opens it (an administrator can never
 * approve a claimed ask, D-012(3), so admin approval opens it to no one), and every
 * way an ask ends (decline, close, withdraw, expiry) leaves no referrer access
 * while the seeker always keeps their own file.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  resetStore();
});
afterEach(() => { vi.unstubAllEnvs(); });

const DAY = 24 * 60 * 60 * 1000;
const opens = async (user: number) => (await getAccessibleReferralAttachment(user, RESUME_ID)) !== undefined;
const grants = () => store.rows(referralDocumentAccessGrants);
const status = () => store.rows(referralRequests)[0]?.status;

describe("asks accepted before acceptance wrote grants keep the accepted referrer's access for the grant window", () => {
  it("an accepted ask with no grant row (one-click acceptance before D-019(e)) opens, in the file route and the detail link", async () => {
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 }, acceptance: { by: REFERRER, at: new Date(Date.now() - DAY) } });
    expect(await opens(REFERRER)).toBe(true);
    expect(await getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).toMatchObject({ status: "approved", documentAccessActive: true });
    expect(await opens(COLLEAGUE)).toBe(false);
    expect(grants()).toEqual([]);
  });

  it("later stages keep it too, until the ask is closed", async () => {
    resetStore({ ask: { status: "interview", referrerId: REFERRER, revision: 6 }, acceptance: { by: REFERRER, at: new Date(Date.now() - 3 * DAY) } });
    expect(await opens(REFERRER)).toBe(true);
    await updateReferralProgress(REFERRER, { requestId: REQUEST_ID, status: "closed" });
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(SEEKER)).toBe(true);
  });

  it("with no grant row, access ends 30 days after that referrer's acceptance; the detail then shows the file unlinked", async () => {
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 }, acceptance: { by: REFERRER, at: new Date(Date.now() - 31 * DAY) } });
    expect(await opens(REFERRER)).toBe(false);
    expect(await getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).toMatchObject({ status: "approved", documentAccessActive: false });
    expect(await opens(SEEKER)).toBe(true);
  });

  it("with no grant row, a referrer assigned to an accepted ask they never accepted gets nothing", async () => {
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 } });
    expect(await opens(REFERRER)).toBe(false);
    expect(await getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).toMatchObject({ documentAccessActive: false });
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 }, acceptance: { by: COLLEAGUE, at: new Date(Date.now() - DAY) } });
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(COLLEAGUE)).toBe(false);
  });

  it("an accepted ask whose grant came from a claim keeps that grant's window; once it ends the detail shows the file unlinked", async () => {
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 5 }, grants: [claimEraGrant(new Date(Date.now() + DAY))] });
    expect(await opens(REFERRER)).toBe(true);
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 5 }, grants: [claimEraGrant(new Date(Date.now() - DAY))] });
    expect(await opens(REFERRER)).toBe(false);
    expect(await getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).toMatchObject({ status: "approved", candidateName: "Avery Example", documentAccessActive: false });
  });

  it("accepting a pending ask that a claim granted before this fix restarts that grant for the accepter", async () => {
    resetStore({ ask: { referrerId: REFERRER, revision: 4 }, grants: [claimEraGrant(new Date(Date.now() - DAY))] });
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    expect(grants()).toHaveLength(1);
    const [grant] = grants();
    expect(grant).toMatchObject({ referrerId: REFERRER, requestRevision: 5, grantVersion: 2, revokedAt: null, revokeReason: null });
    expect(grant?.expiresAt instanceof Date && grant.expiresAt.getTime() > Date.now() + 29 * DAY).toBe(true);
    expect(await opens(REFERRER)).toBe(true);
  });
});

describe("admin approval never opens the resume", () => {
  it("an administrator cannot approve a claimed ask, so its claimant gets no grant and no file", async () => {
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    expect(grants()).toEqual([]);
    await expect(resolveAdminApproval(1, "referral_request", REQUEST_ID, "approved")).rejects.toThrow(/only they can accept it/);
    expect(status()).toBe("pending");
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(COLLEAGUE)).toBe(false);
  });

  it("approving an unclaimed ask grants no one", async () => {
    await resolveAdminApproval(1, "referral_request", REQUEST_ID, "approved");
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(SEEKER)).toBe(true);
  });

  it("an admin decline revokes a grant left on the ask", async () => {
    resetStore({ ask: { referrerId: REFERRER, revision: 4 }, grants: [claimEraGrant(new Date(Date.now() + DAY))] });
    await resolveAdminApproval(1, "referral_request", REQUEST_ID, "rejected");
    expect(grants()[0]).toMatchObject({ revokeReason: "terminal:declined" });
    expect(grants()[0]?.revokedAt).toBeInstanceOf(Date);
    expect(await opens(REFERRER)).toBe(false);
  });
});

describe("a referrer who passed on the ask", () => {
  it("cannot accept it afterwards", async () => {
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "declined", declineReason: "timing" });
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).rejects.toThrow(/already passed/);
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
  });

  it("never gets its files even where stored data shows them assigned to the accepted ask; the seeker still does", async () => {
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 }, passedBy: [REFERRER] });
    expect(await opens(REFERRER)).toBe(false);
    expect(await getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).toMatchObject({ documentAccessActive: false });
    expect(await opens(SEEKER)).toBe(true);
  });
});

describe("every way an ask ends leaves no referrer access; the seeker keeps their file", () => {
  it("decline after a claim: any grant on the ask is revoked", async () => {
    resetStore({ ask: { referrerId: REFERRER, revision: 4 }, grants: [claimEraGrant(new Date(Date.now() + DAY))] });
    await reviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "declined" });
    expect(status()).toBe("declined");
    expect(grants()[0]).toMatchObject({ revokeReason: "terminal:declined" });
    expect(await opens(REFERRER)).toBe(false);
    expect(await getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).toBeUndefined();
    expect(await opens(SEEKER)).toBe(true);
  });

  it("closed after acceptance: the acceptance grant is revoked", async () => {
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    expect(await opens(REFERRER)).toBe(true);
    await updateReferralProgress(REFERRER, { requestId: REQUEST_ID, status: "closed" });
    expect(grants()[0]).toMatchObject({ revokeReason: "terminal:closed" });
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(SEEKER)).toBe(true);
  });

  it("withdrawn by the seeker: no referrer ever gets the file", async () => {
    await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID);
    expect(status()).toBe("withdrawn");
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).rejects.toThrow(/no longer available/);
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(SEEKER)).toBe(true);
  });

  it("expired unclaimed: no referrer ever gets the file", async () => {
    await expect(expireStalePendingReferralRequest(SEEKER, REQUEST_ID, Date.now() + ASK_TTL_MS + DAY)).resolves.toMatchObject({ expired: true, status: "closed" });
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).rejects.toThrow(/no longer available/);
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(SEEKER)).toBe(true);
  });
});

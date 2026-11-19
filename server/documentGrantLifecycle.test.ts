import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralDocumentAccessGrants, referralRequests } from "../drizzle/schema";
import { ASK_TTL_MS } from "../shared/referral";
import { ADMIN_CANNOT_ACCEPT_CLAIMED_ERROR } from "./adminReferralApproval";
import { COLLEAGUE, DAY_MS, REFERRER, REQUEST_ID, RESUME_ID, SEEKER, claimEraGrant, documentAccessApp, resetStore, store } from "./documentAccess.testkit";
import { claimCompanyReferralRequest, expireStalePendingReferralRequest, getAccessibleReferralAttachment, getClaimedCompanyReferralDetail, oneClickReviewReferralRequest, resolveAdminApproval, updateReferralProgress, withdrawCompanyReferralRequest } from "./db";

/*
 * D-019(e) document grants across the ask's whole life, on the real store over
 * the in-memory database: every way an ask ends leaves no referrer access while
 * the seeker keeps their file; an administrator never opens the resume to
 * anyone; and rows written before the fix follow rule (e), derived on read
 * with no backfill: an ask accepted earlier opens for 30 days from that
 * referrer's own acceptance, a claim-era grant opens nothing until acceptance
 * (and nothing at all when an administrator, not the referrer, approved the
 * claimed ask before ee226f3), and a revoked grant is never reopened.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), capture: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  mocks.capture.mockReset();
  resetStore();
});
afterEach(() => { vi.unstubAllEnvs(); });

const opens = async (user: number) => (await getAccessibleReferralAttachment(user, RESUME_ID)) !== undefined;
const grants = () => store.rows(referralDocumentAccessGrants);
const status = () => store.rows(referralRequests)[0]?.status;
const fileStatus = async (user: number) => (await request(documentAccessApp()).get(`/api/documents/${RESUME_ID}`).set("x-test-user", String(user))).status;
const detailOf = (user: number) => request(documentAccessApp()).get(`/api/company-referrals/${REQUEST_ID}`).set("x-test-user", String(user));
const accepted = (at: Date, extra: Parameters<typeof resetStore>[0] = {}) => resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 }, acceptance: { by: REFERRER, at }, ...extra });

describe("every way an ask ends leaves no referrer access; the seeker keeps their file", () => {
  it("accept then close revokes the acceptance grant; the seeker keeps the file", async () => {
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    expect(await opens(REFERRER)).toBe(true);
    await updateReferralProgress(REFERRER, { requestId: REQUEST_ID, status: "closed" });
    expect(grants()[0]).toMatchObject({ revokeReason: "terminal:closed" });
    expect(grants()[0]?.revokedAt).toBeInstanceOf(Date);
    expect(await fileStatus(REFERRER)).toBe(404);
    expect(await fileStatus(SEEKER)).toBe(307);
  });

  it("a referrer who passed never gets the file or the detail, even where stored data assigns them an accepted ask", async () => {
    accepted(new Date(Date.now() - DAY_MS), { passedBy: [REFERRER], grants: [claimEraGrant(new Date(Date.now() + DAY_MS))] });
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toBeUndefined();
    await expect(getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).resolves.toBeUndefined();
    expect(await opens(SEEKER)).toBe(true);

    resetStore();
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "declined", declineReason: "timing" });
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).rejects.toThrow(/already passed/);
    expect(grants()).toEqual([]);
  });

  it("withdrawal and expiry of an unclaimed ask leave no grant and refuse a later acceptance", async () => {
    await expect(withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).resolves.toMatchObject({ withdrawn: true });
    expect(status()).toBe("withdrawn");
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).rejects.toThrow(/no longer available/);
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(SEEKER)).toBe(true);

    resetStore();
    await expect(expireStalePendingReferralRequest(SEEKER, REQUEST_ID, Date.now() + ASK_TTL_MS + DAY_MS)).resolves.toMatchObject({ expired: true, status: "closed" });
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).rejects.toThrow(/no longer available/);
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(SEEKER)).toBe(true);
  });
});

describe("admin approval never opens the resume", () => {
  it("admin approval of an unclaimed ask grants no one; admin cannot approve a claimed ask", async () => {
    await resolveAdminApproval(1, "referral_request", REQUEST_ID, "approved");
    expect(status()).toBe("approved");
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(SEEKER)).toBe(true);

    resetStore();
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    await expect(resolveAdminApproval(1, "referral_request", REQUEST_ID, "approved")).rejects.toThrow(ADMIN_CANNOT_ACCEPT_CLAIMED_ERROR);
    expect(status()).toBe("pending");
    expect(grants()).toEqual([]);
    expect(await opens(REFERRER)).toBe(false);
  });
});

describe("rule (e): rows from before the fix, derived on read", () => {
  it("an ask accepted directly before the fix (no grant row) opens for 30 days from that referrer's own acceptance", async () => {
    accepted(new Date(Date.now() - DAY_MS));
    expect(await fileStatus(REFERRER)).toBe(307);
    const detail = await detailOf(REFERRER);
    expect(detail.status).toBe(200);
    expect(detail.body.request.attachments[0]).toMatchObject({ id: RESUME_ID, url: `/api/documents/${RESUME_ID}` });
    expect(await fileStatus(COLLEAGUE)).toBe(404);
    expect(grants()).toEqual([]);
  });

  it("after 30 days it stays closed and the detail names the file without a link", async () => {
    accepted(new Date(Date.now() - 31 * DAY_MS));
    expect(await fileStatus(REFERRER)).toBe(404);
    const detail = await detailOf(REFERRER);
    expect(detail.status).toBe(200);
    expect(detail.body.request.candidateName).toBe("Avery Example");
    expect(detail.body.request.attachments).toEqual([{ id: RESUME_ID, fileName: "Avery-Example-Resume.pdf", mimeType: "application/pdf", fileSize: 2048, url: null }]);
  });

  it("a referrer assigned to an accepted ask they never accepted gets no detail and no file", async () => {
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 } });
    await expect(getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).resolves.toBeUndefined();
    expect(await opens(REFERRER)).toBe(false);
    resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 }, acceptance: { by: COLLEAGUE, at: new Date(Date.now() - DAY_MS) } });
    await expect(getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).resolves.toBeUndefined();
    expect(await opens(REFERRER)).toBe(false);
    expect(await opens(COLLEAGUE)).toBe(false);
  });

  it("a claim and its grant are not an acceptance: the claimant of an ask an administrator approved before ee226f3 gets no name and no file", async () => {
    // What resolveAdminApproval left before ee226f3: approved, the claimant assigned, their claim event and unexpired
    // claim-era grant, and no acceptance event by them (an admin approval recorded none).
    const adminApproved = (grantExpiresAt: Date) => resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 4 }, claim: { by: REFERRER, at: new Date(Date.now() - 2 * DAY_MS) }, grants: [claimEraGrant(grantExpiresAt)] });
    adminApproved(new Date(Date.now() + 20 * DAY_MS));
    const detail = await detailOf(REFERRER);
    expect(detail.status).toBe(404);
    expect(JSON.stringify(detail.body)).not.toMatch(/Avery|candidateName|\/api\/documents/);
    expect(await fileStatus(REFERRER)).toBe(404);
    expect(await opens(SEEKER)).toBe(true);
    // Nor once that grant has expired: no lasting name either.
    adminApproved(new Date(Date.now() - DAY_MS));
    await expect(getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).resolves.toBeUndefined();
    expect(await opens(REFERRER)).toBe(false);
  });

  it("a pending ask holding a claim-era grant opens nothing until accepted", async () => {
    resetStore({ ask: { referrerId: REFERRER, revision: 4 }, grants: [claimEraGrant(new Date(Date.now() + DAY_MS))] });
    expect(await fileStatus(REFERRER)).toBe(404);
    const detail = await detailOf(REFERRER);
    expect(detail.status).toBe(200);
    expect(detail.body.request).not.toHaveProperty("candidateName");
    expect(detail.body.request.attachments).toEqual([{ mimeType: "application/pdf", fileSize: 2048, availability: "after_claim" }]);
  });

  it("accepting a pending ask with a stale claim-era grant refreshes that row and opens the file", async () => {
    resetStore({ ask: { referrerId: REFERRER, revision: 4 }, grants: [claimEraGrant(new Date(Date.now() - DAY_MS))] });
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    expect(grants()).toHaveLength(1);
    expect(grants()[0]).toMatchObject({ id: 9, referrerId: REFERRER, requestRevision: 5, grantVersion: 2, revokedAt: null, revokeReason: null });
    const expiresAt = grants()[0]?.expiresAt;
    expect(expiresAt instanceof Date && expiresAt.getTime() > Date.now() + 29 * DAY_MS).toBe(true);
    expect(await fileStatus(REFERRER)).toBe(307);
  });

  it("an accepted ask whose claim-era grant expired opens within 30 days of the referrer's own acceptance", async () => {
    accepted(new Date(Date.now() - 2 * DAY_MS), { grants: [claimEraGrant(new Date(Date.now() - DAY_MS))] });
    expect(await fileStatus(REFERRER)).toBe(307);
    expect((await detailOf(REFERRER)).body.request.attachments[0]).toMatchObject({ url: `/api/documents/${RESUME_ID}` });
  });

  it("a revoked grant is never reopened by a read or by an acceptance", async () => {
    const revoked = { ...claimEraGrant(new Date(Date.now() + DAY_MS)), revokedAt: new Date(Date.now() - DAY_MS), revokeReason: "passed" };
    accepted(new Date(Date.now() - DAY_MS), { grants: [revoked] });
    expect(await fileStatus(REFERRER)).toBe(404);

    resetStore({ ask: { referrerId: REFERRER, revision: 4 }, grants: [revoked] });
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).resolves.toMatchObject({ status: "approved" });
    expect(grants()).toEqual([revoked]);
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ message: "Acceptance left a revoked document grant closed" }), { requestId: REQUEST_ID, referrerId: REFERRER });
    expect(await fileStatus(REFERRER)).toBe(404);
  });
});

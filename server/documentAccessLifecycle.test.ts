import request from "supertest";
import type express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifications, referralDocumentAccessGrants, referralTransitionEvents, referrerReviewEmailLinks } from "../drizzle/schema";
import { COLLEAGUE, DAY_MS, OUTSIDER, REFERRER, REQUEST_ID, RESUME_ID, REVIEW_LINK_TOKEN, SEEKER, blockPair, documentAccessApp, resetStore, store, type RecordedActivity } from "./documentAccess.testkit";
import { claimCompanyReferralRequest, getAccessibleReferralAttachment, oneClickReviewReferralRequest } from "./db";

/*
 * D-019(e) privacy promise (Terms: "Before acceptance, a Referrer sees neither
 * the Job Seeker's name nor resume. On acceptance ... the Referrer receives the
 * resume"). The real store (server/db.ts) runs against an in-memory database
 * through the real routes, so the where clauses, the grant written at
 * acceptance and the block lookup are under test, not a stub's opinion of them.
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

const getDocument = (server: express.Express, user: number, id = RESUME_ID) => request(server).get(`/api/documents/${id}`).set("x-test-user", String(user));
const getDetail = (server: express.Express, user: number) => request(server).get(`/api/company-referrals/${REQUEST_ID}`).set("x-test-user", String(user));
const claim = (server: express.Express, user: number) => request(server).post(`/api/company-referrals/${REQUEST_ID}/claim`).set("x-test-user", String(user));
const oneClickAccept = (server: express.Express, user: number) => request(server).post(`/api/company-referrals/${REQUEST_ID}/one-click-review`).set("x-test-user", String(user)).send({ decision: "approved" });
const review = (server: express.Express, user: number) => request(server).post(`/api/company-referrals/${REQUEST_ID}/review`).set("x-test-user", String(user)).send({ decision: "approved" });
const grants = () => store.rows(referralDocumentAccessGrants);
const detailViews = (activity: readonly RecordedActivity[]) => activity.filter(entry => entry.action === "company_referral.claimed_detail_viewed").map(entry => entry.metadata);
/** Whether the referrer's acceptance event (one-click "approve" or legacy "review") carries the app clock's time (AGENTS invariant 5). */
const acceptanceStampedNow = (action: "approve" | "review") => {
  const at = store.rows(referralTransitionEvents).find(event => event.action === action && event.actorUserId === REFERRER && event.resultingStatus === "approved")?.createdAt;
  return at instanceof Date && Math.abs(at.getTime() - Date.now()) < 60_000;
};
const OPEN_RESUME = { id: RESUME_ID, fileName: "Avery-Example-Resume.pdf", mimeType: "application/pdf", fileSize: 2048, url: `/api/documents/${RESUME_ID}` };

describe("a claim never opens the resume (D-019(e))", () => {
  it("claiming writes no grant; the claimant gets 404 for the file and a locked, anonymous detail", async () => {
    const activity: RecordedActivity[] = [];
    const server = documentAccessApp(activity);
    expect((await claim(server, REFERRER)).status).toBe(200);
    expect(grants()).toEqual([]);

    const file = await getDocument(server, REFERRER);
    expect(file.status).toBe(404);
    expect(file.headers["content-disposition"]).toBeUndefined();
    expect(file.headers.location).toBeUndefined();

    const detail = await getDetail(server, REFERRER);
    expect(detail.status).toBe(200);
    expect(detail.headers["cache-control"]).toBe("private, no-store");
    expect(detail.body.request.status).toBe("pending");
    expect(detail.body.request).not.toHaveProperty("candidateName");
    expect(detail.body.request.attachments).toEqual([{ mimeType: "application/pdf", fileSize: 2048, availability: "after_claim" }]);
    expect(JSON.stringify(detail.body)).not.toMatch(/Avery|\/api\/documents|jobSeekerId|grant|fileKey/);
    expect(detailViews(activity)).toEqual([{ attachmentCount: 1, accepted: false, documentLinks: 0 }]);
  });

  it("a replayed claim still grants nothing", async () => {
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    await expect(claimCompanyReferralRequest(REFERRER, REQUEST_ID)).resolves.toMatchObject({ replayed: true });
    expect(grants()).toEqual([]);
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toBeUndefined();
  });
});

describe("acceptance opens the resume to the accepting referrer only", () => {
  it("one-click accept without a claim opens the resume to the accepter only", async () => {
    const activity: RecordedActivity[] = [];
    const server = documentAccessApp(activity);
    const accepted = await oneClickAccept(server, REFERRER);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ status: "approved" });
    expect(grants()).toEqual([expect.objectContaining({ referralRequestId: REQUEST_ID, referrerId: REFERRER, grantVersion: 1, revokedAt: null })]);
    const expiresAt = grants()[0]?.expiresAt;
    expect(expiresAt instanceof Date && Math.abs(expiresAt.getTime() - (Date.now() + 30 * DAY_MS)) < 60_000).toBe(true);
    // Access is decided from this acceptance event, so its time comes from the app, as the grant's does.
    expect(acceptanceStampedNow("approve")).toBe(true);

    const file = await getDocument(server, REFERRER);
    expect(file.status).toBe(307);
    expect(file.headers.location).toBe("https://signed.example/private/avery.pdf");
    const detail = await getDetail(server, REFERRER);
    expect(detail.status).toBe(200);
    expect(detail.body.request).toMatchObject({ status: "approved", candidateName: "Avery Example" });
    expect(detail.body.request.attachments).toEqual([OPEN_RESUME]);
    expect(JSON.stringify(detail.body)).not.toMatch(/jobSeekerId|grant|fileKey|documentAccessActive/);
    expect(detailViews(activity)).toEqual([{ attachmentCount: 1, accepted: true, documentLinks: 1 }]);
  });

  it("a replayed one-click accept grants nothing twice", async () => {
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).resolves.toMatchObject({ replayed: true });
    expect(grants()).toHaveLength(1);
    expect(grants()[0]).toMatchObject({ referrerId: REFERRER, grantVersion: 1 });
    expect(store.rows(referralTransitionEvents).filter(event => event.action === "approve")).toHaveLength(1);
    expect(store.rows(notifications).filter(notice => notice.userId === SEEKER)).toHaveLength(1);
  });

  it("accepting through the private email review link opens the resume (db level)", async () => {
    resetStore({ reviewLinkFor: REFERRER });
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved", reviewLinkToken: REVIEW_LINK_TOKEN });
    expect(store.rows(referrerReviewEmailLinks)[0]?.consumedAt).toBeInstanceOf(Date);
    expect(grants()).toEqual([expect.objectContaining({ referrerId: REFERRER, revokedAt: null })]);
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toMatchObject({ id: RESUME_ID });
  });

  it("the poster accepting inside the D-022 first look opens the resume; a colleague is refused first", async () => {
    resetStore({ ask: { firstLookReferrerId: REFERRER, firstLookUntil: new Date(Date.now() + DAY_MS) } });
    await expect(oneClickReviewReferralRequest(COLLEAGUE, { requestId: REQUEST_ID, decision: "approved" })).rejects.toThrow(/first look/);
    expect(grants()).toEqual([]);
    const server = documentAccessApp();
    expect((await oneClickAccept(server, REFERRER)).status).toBe(200);
    expect(grants()).toEqual([expect.objectContaining({ referrerId: REFERRER, revokedAt: null })]);
    expect((await getDocument(server, REFERRER)).status).toBe(307);
    expect((await getDetail(server, REFERRER)).body.request).toMatchObject({ status: "approved", candidateName: "Avery Example" });
  });

  it("an assigned referrer who never claimed accepts through /review and opens the resume", async () => {
    resetStore({ ask: { referrerId: REFERRER } });
    const server = documentAccessApp();
    expect((await review(server, REFERRER)).status).toBe(200);
    expect(grants()).toEqual([expect.objectContaining({ referrerId: REFERRER, revokedAt: null })]);
    expect(acceptanceStampedNow("review")).toBe(true);
    expect((await getDocument(server, REFERRER)).status).toBe(307);
  });

  it("claim then /review acceptance still opens the resume", async () => {
    const server = documentAccessApp();
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    expect((await review(server, REFERRER)).status).toBe(200);
    expect(grants()).toEqual([expect.objectContaining({ referrerId: REFERRER, revokedAt: null })]);
    expect((await getDocument(server, REFERRER)).status).toBe(307);
  });

  it("after acceptance a colleague, an outsider and a signed-out caller get nothing; a late colleague accept is 409", async () => {
    const server = documentAccessApp();
    expect((await oneClickAccept(server, REFERRER)).status).toBe(200);
    for (const user of [COLLEAGUE, OUTSIDER]) {
      expect((await getDocument(server, user)).status).toBe(404);
      expect((await getDetail(server, user)).status).toBe(404);
    }
    expect((await getDocument(server, 999)).status).toBe(401);
    expect((await oneClickAccept(server, COLLEAGUE)).status).toBe(409);
    expect(grants().map(grant => grant.referrerId)).toEqual([REFERRER]);
  });

  it("an accepted referrer who owns an earlier upload still gets the seeker's resume (row order does not decide access)", async () => {
    resetStore({ extraAttachments: [{ id: 5, ownerId: REFERRER, referralRequestId: null, fileName: "Riya-Resume.pdf", fileKey: "private/riya.pdf", mimeType: "application/pdf", fileSize: 1024 }] });
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toMatchObject({ id: RESUME_ID, fileKey: "private/avery.pdf" });
    await expect(getAccessibleReferralAttachment(REFERRER, 5)).resolves.toMatchObject({ id: 5, fileKey: "private/riya.pdf" });
    await expect(getAccessibleReferralAttachment(SEEKER, 5)).resolves.toBeUndefined();
  });

  it("the seeker opens their own resume before the claim, after it and after acceptance", async () => {
    const server = documentAccessApp();
    expect((await getDocument(server, SEEKER)).status).toBe(307);
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    expect((await getDocument(server, SEEKER)).status).toBe(307);
    expect((await oneClickAccept(server, REFERRER)).status).toBe(200);
    expect((await getDocument(server, SEEKER)).status).toBe(307);
  });
});

describe("a block between the seeker and the referrer closes the resume to the referrer, never to the seeker", () => {
  it("a referrer the seeker blocks after accepting gets the same 404 as no access; the seeker keeps the file", async () => {
    const activity: RecordedActivity[] = [];
    const server = documentAccessApp(activity);
    expect((await oneClickAccept(server, REFERRER)).status).toBe(200);
    expect((await getDocument(server, REFERRER)).status).toBe(307);
    const noAccess = await getDocument(server, COLLEAGUE);
    await blockPair(SEEKER, REFERRER);

    const blocked = await getDocument(server, REFERRER);
    expect(blocked.status).toBe(404);
    // Neutral: the same body and type as a file the caller may not open, so a block cannot be told apart.
    expect([blocked.text, blocked.headers["content-type"]]).toEqual([noAccess.text, noAccess.headers["content-type"]]);
    expect(blocked.headers.location).toBeUndefined();
    expect(blocked.headers["content-disposition"]).toBeUndefined();
    expect((await getDocument(server, SEEKER)).status).toBe(307);
    expect(activity.filter(entry => entry.action === "company_referral.blocked_denied")).toEqual([expect.objectContaining({ actorUserId: REFERRER, outcome: "denied", resourceType: "referral_request", resourceId: REQUEST_ID })]);
    expect(activity.filter(entry => entry.action === "document.accessed").map(entry => entry.actorUserId)).toEqual([REFERRER, SEEKER]);
  });

  it("a referrer who blocked the seeker is refused the same way; the blocked seeker keeps their own file", async () => {
    const server = documentAccessApp();
    expect((await oneClickAccept(server, REFERRER)).status).toBe(200);
    await blockPair(REFERRER, SEEKER);
    expect((await getDocument(server, REFERRER)).status).toBe(404);
    expect((await getDocument(server, SEEKER)).status).toBe(307);
  });

  it("an accepted referrer still opens the file when the block check itself fails (fail-open, like every referral surface)", async () => {
    const server = documentAccessApp([], { getBlockedReferralRequestIds: async () => { throw new Error("userBlocks missing"); } });
    expect((await oneClickAccept(server, REFERRER)).status).toBe(200);
    expect((await getDocument(server, REFERRER)).status).toBe(307);
  });
});

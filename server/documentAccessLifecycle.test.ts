import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs, profiles, referralAttachments, referralDocumentAccessGrants, referralRequests, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { claimCompanyReferralRequest, getAccessibleReferralAttachment, getClaimedCompanyReferralDetail, oneClickReviewReferralRequest } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

/*
 * D-019 privacy promise (Terms and Privacy): "Before acceptance, a Referrer sees
 * neither the Job Seeker's name nor resume". The resume bytes follow the same
 * rule as the JSON views: a referrer who has only claimed an ask gets 404 from
 * GET /api/documents/:id, and gets the file once they accept. These tests run
 * the real store (server/db.ts) against an in-memory database through the real
 * routes, so the where clauses and the grant written at acceptance are what is
 * under test, not a stub's opinion of them.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const SEEKER = 7;
const REFERRER = 2;
const OUTSIDER = 3;
const REQUEST_ID = 501;
const RESUME_ID = 77;

type RequiredDepName = { [K in keyof PrivateReferralRouteDeps]-?: undefined extends PrivateReferralRouteDeps[K] ? never : K }[keyof PrivateReferralRouteDeps];
const unusedDep = (name: RequiredDepName) => (): never => { throw new Error(`documentAccessLifecycle: the route reached ${name}, which this test does not provide`); };

function seedRows(extraAttachments: readonly Row[] = []) {
  const verifiedAt = new Date("2026-09-01T00:00:00Z");
  return [
    [users, [{ id: SEEKER, name: "Avery Example" }, { id: REFERRER, name: "Riya Referrer" }, { id: OUTSIDER, name: "Other Person" }]],
    [profiles, [{ id: 31, userId: REFERRER, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: verifiedAt }, { id: 32, userId: OUTSIDER, accountType: "referrer", workEmailDomain: "other.com", workEmailVerifiedAt: verifiedAt }]],
    [jobs, [{ id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", jobFunction: null }]],
    [referralRequests, [{ id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: null, status: "pending", revision: 3, personalPitch: "I led a measurable product design launch.", referrerMessage: null, createdAt: new Date() }]],
    [referralAttachments, [...extraAttachments, { id: RESUME_ID, ownerId: SEEKER, referralRequestId: REQUEST_ID, fileName: "Avery-Example-Resume.pdf", fileKey: "private/avery.pdf", mimeType: "application/pdf", fileSize: 2048 }]],
  ] as const;
}

const store = createInMemoryDrizzle();
const useStore = (extraAttachments: readonly Row[] = []) => store.reset(seedRows(extraAttachments));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  useStore();
});
afterEach(() => { vi.unstubAllEnvs(); });

function app() {
  const server = express();
  server.use(express.json());
  const identities = new Map([[String(SEEKER), SEEKER], [String(REFERRER), REFERRER], [String(OUTSIDER), OUTSIDER]]);
  registerPrivateReferralRoutes(server, {
    dataUrlToBuffer: unusedDep("dataUrlToBuffer"), sanitizeDocumentName: unusedDep("sanitizeDocumentName"), storagePut: unusedDep("storagePut"),
    createReferralAttachment: unusedDep("createReferralAttachment"), saveVerifiedWorkEmail: unusedDep("saveVerifiedWorkEmail"),
    createCompanyReferralRequest: unusedDep("createCompanyReferralRequest"), listCompanyReferralInbox: unusedDep("listCompanyReferralInbox"),
    listPublicCompanyOpportunities: unusedDep("listPublicCompanyOpportunities"), publishCompanyOpportunity: unusedDep("publishCompanyOpportunity"),
    resolveIdentity: async req => { const id = identities.get(String(req.header("x-test-user"))); return id ? { account: { id, openId: `user-${id}` } } : undefined; },
    getBlockedReferralRequestIds: async () => new Set<number>(),
    storageGetSignedUrl: async key => `https://signed.example/${key}`,
    getAccessibleReferralAttachment, claimCompanyReferralRequest, getClaimedCompanyReferralDetail, oneClickReviewReferralRequest,
  });
  return server;
}

const getDocument = (server: express.Express, user: number, id = RESUME_ID) => request(server).get(`/api/documents/${id}`).set("x-test-user", String(user));

describe("resume access follows acceptance, not the claim (D-019)", () => {
  it("a referrer who only claimed gets 404 for the resume; after one-click acceptance the same request opens it", async () => {
    const server = app();
    expect((await request(server).post(`/api/company-referrals/${REQUEST_ID}/claim`).set("x-test-user", String(REFERRER))).status).toBe(200);
    expect(store.rows(referralDocumentAccessGrants)).toHaveLength(1);

    const beforeAcceptance = await getDocument(server, REFERRER);
    expect(beforeAcceptance.status).toBe(404);
    expect(beforeAcceptance.headers["content-disposition"]).toBeUndefined();
    expect(beforeAcceptance.headers.location).toBeUndefined();
    expect(beforeAcceptance.text).not.toContain("Avery");

    const accepted = await request(server).post(`/api/company-referrals/${REQUEST_ID}/one-click-review`).set("x-test-user", String(REFERRER)).send({ decision: "approved" });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ status: "approved" });

    const afterAcceptance = await getDocument(server, REFERRER);
    expect(afterAcceptance.status).toBe(307);
    expect(afterAcceptance.headers.location).toBe("https://signed.example/private/avery.pdf");
  });

  it("one-click acceptance without a claim opens the resume too", async () => {
    const server = app();
    expect((await getDocument(server, REFERRER)).status).toBe(404);
    expect((await request(server).post(`/api/company-referrals/${REQUEST_ID}/one-click-review`).set("x-test-user", String(REFERRER)).send({ decision: "approved" })).status).toBe(200);
    expect((await getDocument(server, REFERRER)).status).toBe(307);
  });

  it("the seeker always opens their own resume; an unrelated referrer never does", async () => {
    const server = app();
    expect((await getDocument(server, SEEKER)).status).toBe(307);
    expect((await request(server).post(`/api/company-referrals/${REQUEST_ID}/one-click-review`).set("x-test-user", String(REFERRER)).send({ decision: "approved" })).status).toBe(200);
    expect((await getDocument(server, OUTSIDER)).status).toBe(404);
  });

  it("the store refuses a pending claimant directly as well", async () => {
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toBeUndefined();
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toMatchObject({ id: RESUME_ID, fileKey: "private/avery.pdf" });
  });

  it("an accepted referrer who owns an earlier upload still gets the seeker's resume (row order does not decide access)", async () => {
    // The referrer is also a seeker elsewhere: their own resume has a lower id and is stored first.
    useStore([{ id: 5, ownerId: REFERRER, referralRequestId: null, fileName: "Riya-Resume.pdf", fileKey: "private/riya.pdf", mimeType: "application/pdf", fileSize: 1024 }]);
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toMatchObject({ id: RESUME_ID, fileKey: "private/avery.pdf" });
    await expect(getAccessibleReferralAttachment(REFERRER, 5)).resolves.toMatchObject({ id: 5, fileKey: "private/riya.pdf" });
    await expect(getAccessibleReferralAttachment(SEEKER, 5)).resolves.toBeUndefined();
  });
});

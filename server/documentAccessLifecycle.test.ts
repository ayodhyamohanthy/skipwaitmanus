import request from "supertest";
import type express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralDocumentAccessGrants } from "../drizzle/schema";
import { COLLEAGUE, OUTSIDER, REFERRER, REQUEST_ID, RESUME_ID, SEEKER, claimEraGrant, documentAccessApp, resetStore, store } from "./documentAccess.testkit";
import { claimCompanyReferralRequest, getAccessibleReferralAttachment, oneClickReviewReferralRequest } from "./db";

/*
 * D-019(e) privacy promise (Privacy: "documents remain private until a request
 * is accepted"; Terms: "On acceptance ... the Referrer receives the resume").
 * The real store (server/db.ts) runs against an in-memory database through the
 * real routes, so the where clauses and the grant written at acceptance are
 * under test, not a stub's opinion of them.
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
const oneClickAccept = (server: express.Express, user: number) => request(server).post(`/api/company-referrals/${REQUEST_ID}/one-click-review`).set("x-test-user", String(user)).send({ decision: "approved" });
const grants = () => store.rows(referralDocumentAccessGrants);

describe("a claim never opens the resume (D-019(e))", () => {
  it("claiming writes no grant; the claimant gets 404 for the file and a locked, anonymous detail", async () => {
    const server = documentAccessApp();
    expect((await request(server).post(`/api/company-referrals/${REQUEST_ID}/claim`).set("x-test-user", String(REFERRER))).status).toBe(200);
    expect(grants()).toEqual([]);

    const file = await getDocument(server, REFERRER);
    expect(file.status).toBe(404);
    expect(file.headers["content-disposition"]).toBeUndefined();
    expect(file.headers.location).toBeUndefined();

    const detail = await getDetail(server, REFERRER);
    expect(detail.status).toBe(200);
    expect(detail.body.request.status).toBe("pending");
    expect(detail.body.request).not.toHaveProperty("candidateName");
    expect(detail.body.request.attachments).toEqual([{ mimeType: "application/pdf", fileSize: 2048, availability: "after_claim" }]);
    expect(JSON.stringify(detail.body)).not.toMatch(/Avery|\/api\/documents/);
  });

  it("a claim replayed by the same referrer still grants nothing", async () => {
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    expect(grants()).toEqual([]);
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toBeUndefined();
  });

  it("a grant a claim wrote before this fix does not open a still-pending ask", async () => {
    resetStore({ ask: { referrerId: REFERRER, revision: 4 }, grants: [claimEraGrant(new Date(Date.now() + 86_400_000))] });
    expect((await getDocument(documentAccessApp(), REFERRER)).status).toBe(404);
    expect((await getDetail(documentAccessApp(), REFERRER)).body.request.attachments[0]).not.toHaveProperty("url");
  });
});

describe("acceptance opens the resume to the accepting referrer only", () => {
  it("claim, then one-click accept: exactly one grant, for the accepter, and the file and its link open", async () => {
    const server = documentAccessApp();
    await request(server).post(`/api/company-referrals/${REQUEST_ID}/claim`).set("x-test-user", String(REFERRER));
    const accepted = await oneClickAccept(server, REFERRER);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ status: "approved" });
    expect(grants()).toEqual([expect.objectContaining({ referralRequestId: REQUEST_ID, referrerId: REFERRER, grantVersion: 1, revokedAt: null })]);

    const file = await getDocument(server, REFERRER);
    expect(file.status).toBe(307);
    expect(file.headers.location).toBe("https://signed.example/private/avery.pdf");
    const detail = await getDetail(server, REFERRER);
    expect(detail.body.request).toMatchObject({ status: "approved", candidateName: "Avery Example" });
    expect(detail.body.request.attachments).toEqual([{ id: RESUME_ID, fileName: "Avery-Example-Resume.pdf", mimeType: "application/pdf", fileSize: 2048, url: `/api/documents/${RESUME_ID}` }]);
  });

  it("a repeated acceptance grants nothing twice", async () => {
    const server = documentAccessApp();
    expect((await oneClickAccept(server, REFERRER)).status).toBe(200);
    expect((await oneClickAccept(server, REFERRER)).status).toBe(200);
    expect(grants()).toHaveLength(1);
    expect(grants()[0]).toMatchObject({ referrerId: REFERRER, grantVersion: 1 });
  });

  it("thread review acceptance of a claimed ask grants the claimant", async () => {
    const server = documentAccessApp();
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    expect((await request(server).post(`/api/company-referrals/${REQUEST_ID}/review`).set("x-test-user", String(REFERRER)).send({ decision: "approved" })).status).toBe(200);
    expect(grants()).toEqual([expect.objectContaining({ referrerId: REFERRER })]);
    expect((await getDocument(server, REFERRER)).status).toBe(307);
  });

  it("a colleague at the same company, an outsider and a stranger all get 404 for the file and the detail", async () => {
    const server = documentAccessApp();
    await oneClickAccept(server, REFERRER);
    for (const user of [COLLEAGUE, OUTSIDER]) {
      expect((await getDocument(server, user)).status).toBe(404);
      expect((await getDetail(server, user)).status).toBe(404);
    }
    expect((await getDocument(server, 999)).status).toBe(401);
    expect((await oneClickAccept(server, COLLEAGUE)).status).toBe(409);
    expect(grants().map(grant => grant.referrerId)).toEqual([REFERRER]);
  });

  it("an accepted referrer who owns an earlier upload still gets the seeker's resume (row order does not decide access)", async () => {
    // The referrer is also a seeker elsewhere: their own resume has a lower id and is stored first.
    resetStore({ extraAttachments: [{ id: 5, ownerId: REFERRER, referralRequestId: null, fileName: "Riya-Resume.pdf", fileKey: "private/riya.pdf", mimeType: "application/pdf", fileSize: 1024 }] });
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    await expect(getAccessibleReferralAttachment(REFERRER, RESUME_ID)).resolves.toMatchObject({ id: RESUME_ID, fileKey: "private/avery.pdf" });
    await expect(getAccessibleReferralAttachment(REFERRER, 5)).resolves.toMatchObject({ id: 5, fileKey: "private/riya.pdf" });
    await expect(getAccessibleReferralAttachment(SEEKER, 5)).resolves.toBeUndefined();
  });

  it("the seeker opens their own resume before the claim, after it, and after acceptance", async () => {
    const server = documentAccessApp();
    expect((await getDocument(server, SEEKER)).status).toBe(307);
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    expect((await getDocument(server, SEEKER)).status).toBe(307);
    await oneClickAccept(server, REFERRER);
    expect((await getDocument(server, SEEKER)).status).toBe(307);
  });
});

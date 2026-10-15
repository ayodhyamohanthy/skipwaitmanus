import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lockedAskAttachmentSchema, openAskAttachmentSchema } from "../shared/referrerAskView";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

/*
 * D-019 referrer basics + the privacy promise ("Before acceptance, a Referrer
 * sees neither the Job Seeker's name nor resume. On acceptance ... the Referrer
 * receives the resume"). The fake store below follows the db.ts access rules
 * and deliberately hands the routes MORE than db.ts selects (the seeker's name,
 * account id and email on every row) so the routes' allow-lists are what is
 * under test. askNoteProjection.test.ts pins the real store projections.
 */

const SEEKER = 7;
const REFERRER_A = 2;
const REFERRER_B = 3;
const OUTSIDER = 4;
const SEEKER_NAME = "Avery Lee";
const SEEKER_EMAIL = "avery.lee@example.com";
const RESUME_NAME = "Avery_Lee_Resume.pdf";
const NOTE = "I led the redesign of an approvals product used by 3,000 people and would value an honest fit check.";
const ROLE_URL = "https://careers.acme.com/jobs/design-1";
const LINK_TOKEN = "b".repeat(48);
const workDomain = new Map([[REFERRER_A, "acme.com"], [REFERRER_B, "acme.com"], [OUTSIDER, "other.com"]]);

type Ask = { id: number; status: "pending" | "approved"; referrerId: number | null; revision: number; grants: Set<number> };

const detailSchema = z.object({ request: z.object({ id: z.number(), title: z.string().nullable(), candidateMessage: z.string().nullable(), status: z.string(), attachments: z.array(z.union([openAskAttachmentSchema, lockedAskAttachmentSchema])) }).loose() });

function setup(initial: Partial<Ask> = {}) {
  const ask: Ask = { id: 501, status: "pending", referrerId: null, revision: 1, grants: new Set(), ...initial };
  const attachments = [{ id: 77, fileName: RESUME_NAME, mimeType: "application/pdf", fileSize: 2048, fileKey: "private/avery.pdf" }];
  const identity = { candidateName: SEEKER_NAME, jobSeekerId: SEEKER, seekerEmail: SEEKER_EMAIL };
  const atCompany = (userId: number) => workDomain.get(userId) === "acme.com";
  const accepted = () => ask.status === "approved";
  const reviewEmails: Array<Record<string, string>> = [];
  const deps = {
    resolveIdentity: async (req: express.Request) => { const user = Number(req.header("x-test-user")); return user ? { account: { id: user, openId: `workos-${user}` } } : undefined; },
    getBlockedReferralRequestIds: async () => new Set<number>(),
    resolveCompanyIdentities: async () => new Map(),
    // db.getUnclaimedCompanyReferralPreview: pending, unassigned or assigned to you, at your company.
    getUnclaimedCompanyReferralPreview: async (userId: number, requestId: number) => requestId === ask.id && ask.status === "pending" && atCompany(userId) && (ask.referrerId === null || ask.referrerId === userId)
      ? { id: ask.id, title: "Product Designer", targetRoleUrl: ROLE_URL, companyDomain: "acme.com", jobFunction: "Design", candidateMessage: NOTE, ...identity, attachments }
      : undefined,
    // db.getClaimedCompanyReferralDetail: assigned to you; pending needs your active grant, accepted does not.
    getClaimedCompanyReferralDetail: async (userId: number, requestId: number) => requestId === ask.id && ask.referrerId === userId && (accepted() || ask.grants.has(userId))
      ? { id: ask.id, title: "Product Designer", targetRoleUrl: ROLE_URL, companyDomain: "acme.com", jobFunction: "Design", candidateMessage: NOTE, referrerId: ask.referrerId, status: ask.status, revision: ask.revision, documentAccessActive: ask.grants.has(userId), ...identity, attachments }
      : undefined,
    claimCompanyReferralRequest: async (userId: number, requestId: number) => {
      if (requestId !== ask.id || ask.status !== "pending" || !atCompany(userId) || (ask.referrerId !== null && ask.referrerId !== userId)) throw new Error("This referral request is no longer available");
      ask.referrerId = userId; ask.revision += 1; ask.grants.add(userId);
      return { requestId, claimed: true, replayed: false, revision: ask.revision, jobSeekerId: SEEKER, companyDomain: "acme.com" };
    },
    // db.oneClickReviewReferralRequest + transitionReferralRequestTx: acceptance assigns the ask and grants document access.
    oneClickReviewReferralRequest: async (userId: number, input: { requestId: number; decision: "approved" | "declined" }) => {
      if (input.requestId !== ask.id || ask.status !== "pending" || !atCompany(userId) || (ask.referrerId !== null && ask.referrerId !== userId)) throw new Error("This referral request is no longer available");
      if (input.decision === "approved") { ask.status = "approved"; ask.referrerId = userId; ask.revision += 1; ask.grants.add(userId); }
      return { status: input.decision === "approved" ? "approved" : "passed", companyDomain: "acme.com", jobSeekerId: SEEKER, revision: ask.revision, replayed: false };
    },
    resolveReferrerReviewEmailLink: async (userId: number, linkToken: string) => { if (userId !== REFERRER_A || linkToken !== LINK_TOKEN || ask.status !== "pending") throw new Error("This private review link is unavailable"); return { requestId: ask.id }; },
    listCompanyReferralInbox: async () => [],
    // db.listCompanyReferralInboxByState columns (no seeker identity), plus the leak attempt.
    listCompanyReferralInboxByState: async (userId: number) => atCompany(userId) && ask.status === "pending" ? [{ id: ask.id, targetRoleUrl: ROLE_URL, companyDomain: "acme.com", status: ask.status, referrerId: ask.referrerId, attachmentCount: 1, jobTitle: "Product Designer" }] : [],
    listJobSeekerCompanyReferrals: async (userId: number) => userId === SEEKER ? [{ id: ask.id, title: "Product Designer", pitch: NOTE, targetRoleUrl: ROLE_URL, companyDomain: "acme.com", status: ask.status, referrerId: ask.referrerId, createdAt: new Date().toISOString() }] : [],
    createCompanyReferralRequest: async () => ({ requestId: ask.id, companyDomain: "acme.com", notifiedEmployees: 2, replayed: false }),
    prepareReferrerReviewEmailNotifications: async () => [{ referrerId: REFERRER_A, email: "a@acme.com", linkToken: LINK_TOKEN, companyDomain: "acme.com" }],
    sendReferrerReviewEmail: async (input: { to: string; companyDomain: string; reviewUrl: string }) => { reviewEmails.push(input); return { sent: true, reason: "sent" }; },
  };
  const app = express(); app.use(express.json());
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  const get = (path: string, user: number) => request(app).get(path).set("x-test-user", String(user));
  const post = (path: string, user: number, body: object = {}) => request(app).post(path).set("x-test-user", String(user)).send(body);
  return { app, ask, get, post, reviewEmails };
}

const leaksIdentity = (body: object) => { const text = JSON.stringify(body); return [SEEKER_NAME, "Avery", SEEKER_EMAIL, RESUME_NAME, "jobSeekerId", "seekerEmail", "candidateName", "private/avery.pdf"].filter(token => text.includes(token)); };

describe("before acceptance a referrer never receives the seeker's identity", () => {
  it("the preview carries the note, the role and a file count, but no name, file name, link or seeker id", async () => {
    const { get } = setup();
    const preview = await get("/api/company-referrals/501/preview", REFERRER_A);
    expect(preview.status).toBe(200);
    expect(leaksIdentity(preview.body)).toEqual([]);
    expect(preview.body.request).toMatchObject({ id: 501, title: "Product Designer", candidateMessage: NOTE, targetRoleUrl: ROLE_URL, jobFunction: "Design" });
    expect(preview.body.request.attachments).toEqual([{ id: 77, mimeType: "application/pdf", fileSize: 2048, availability: "after_claim" }]);
    expect(lockedAskAttachmentSchema.safeParse(preview.body.request.attachments[0]).success).toBe(true);
  });

  it("the inbox row, the email review page and the review email carry no identity", async () => {
    const { get, post, reviewEmails } = setup();
    const inbox = await get("/api/company-referrals/inbox?scope=new", REFERRER_A);
    expect(inbox.body.requests).toHaveLength(1);
    expect(leaksIdentity(inbox.body)).toEqual([]);
    const link = await get(`/api/referrer-review-links/${LINK_TOKEN}`, REFERRER_A);
    expect(link.body).toEqual({ review: { ready: true, decisions: ["approved", "role_not_a_fit", "cannot_support", "timing"] } });
    const created = await post("/api/company-referrals", SEEKER, { targetRoleUrl: ROLE_URL, attachmentIds: [77], candidateMessage: NOTE }).set("Idempotency-Key", "referrer-privacy-ask-0001");
    expect(created.status).toBe(201);
    expect(reviewEmails).toHaveLength(1);
    expect(Object.keys(reviewEmails[0]).sort()).toEqual(["companyDomain", "reviewUrl", "to"]);
    expect(leaksIdentity(reviewEmails[0])).toEqual([]);
  });

  it("a claim answers without the seeker's account id, and the claimed (still pending) detail keeps identity and files locked", async () => {
    const { get, post } = setup();
    const claimed = await post("/api/company-referrals/501/claim", REFERRER_A);
    expect(claimed.status).toBe(200);
    expect(claimed.body).toEqual({ requestId: 501, claimed: true, replayed: false, revision: 2, companyDomain: "acme.com" });
    const detail = await get("/api/company-referrals/501", REFERRER_A);
    expect(detail.status).toBe(200);
    expect(leaksIdentity(detail.body)).toEqual([]);
    expect(detail.body.request).not.toHaveProperty("candidateName");
    expect(detailSchema.parse(detail.body).request).toMatchObject({ status: "pending", candidateMessage: NOTE });
    expect(detail.body.request.attachments).toEqual([{ id: 77, mimeType: "application/pdf", fileSize: 2048, availability: "after_claim" }]);
  });
});

describe("after acceptance the accepting referrer, and only they, get the name, the note and the resume", () => {
  it("one-click acceptance answers with the status alone, then the detail reveals name, note and resume link", async () => {
    const { get, post } = setup();
    const accepted = await post("/api/company-referrals/501/one-click-review", REFERRER_A, { decision: "approved" });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ status: "approved" });
    const detail = await get("/api/company-referrals/501", REFERRER_A);
    expect(detail.status).toBe(200);
    const parsed = detailSchema.parse(detail.body).request;
    expect(parsed).toMatchObject({ status: "approved", title: "Product Designer", candidateMessage: NOTE });
    expect(detail.body.request.candidateName).toBe(SEEKER_NAME);
    expect(detail.body.request.attachments).toEqual([{ id: 77, fileName: RESUME_NAME, mimeType: "application/pdf", fileSize: 2048, url: "/api/documents/77" }]);
    // Never the seeker's account id, email or storage key, even after acceptance.
    for (const token of ["jobSeekerId", "seekerEmail", SEEKER_EMAIL, "private/avery.pdf", "fileKey", "documentAccessActive"]) expect(JSON.stringify(detail.body)).not.toContain(token);
  });

  it("an ask accepted before acceptance granted document access still opens, with the resume unlinked", async () => {
    const { get } = setup({ status: "approved", referrerId: REFERRER_A });
    const detail = await get("/api/company-referrals/501", REFERRER_A);
    expect(detail.status).toBe(200);
    expect(detail.body.request).toMatchObject({ candidateName: SEEKER_NAME, candidateMessage: NOTE });
    expect(detail.body.request.attachments).toEqual([{ id: 77, fileName: RESUME_NAME, mimeType: "application/pdf", fileSize: 2048, url: null }]);
  });

  it("another referrer at the same company, an outsider and a signed-out caller get nothing", async () => {
    const { get, post } = setup();
    expect((await post("/api/company-referrals/501/one-click-review", REFERRER_A, { decision: "approved" })).status).toBe(200);
    for (const user of [REFERRER_B, OUTSIDER]) {
      for (const path of ["/api/company-referrals/501", "/api/company-referrals/501/preview"]) {
        const denied = await get(path, user);
        expect(denied.status).toBe(404);
        expect(leaksIdentity(denied.body)).toEqual([]);
        expect(JSON.stringify(denied.body)).not.toContain("approvals product");
      }
    }
    const late = await post("/api/company-referrals/501/one-click-review", REFERRER_B, { decision: "approved" });
    expect(late.status).toBe(409);
    expect(leaksIdentity(late.body)).toEqual([]);
    expect((await request((setup()).app).get("/api/company-referrals/501")).status).toBe(401);
  });

  it("the seeker reads their own note on their list, never through the referrer detail", async () => {
    const { get, post } = setup();
    expect((await post("/api/company-referrals/501/one-click-review", REFERRER_A, { decision: "approved" })).status).toBe(200);
    expect((await get("/api/company-referrals/501", SEEKER)).status).toBe(404);
    const mine = await get("/api/company-referrals/mine", SEEKER);
    expect(mine.body.requests).toEqual([expect.objectContaining({ id: 501, pitch: NOTE, status: "approved" })]);
    expect((await get("/api/company-referrals/mine", REFERRER_A)).body.requests).toEqual([]);
  });
});

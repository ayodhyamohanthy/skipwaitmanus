import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

const seeker = { account: { id: 11, openId: "workos-seeker" } };
const referrer = { account: { id: 22, openId: "workos-referrer" } };

function appFor(blockedIds: Set<number>, overrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => (req.header("x-test-user") === "referrer" ? referrer : req.header("x-test-user") === "seeker" ? seeker : undefined),
    dataUrlToBuffer: () => Buffer.from("pdf"),
    sanitizeDocumentName: value => value,
    storagePut: async () => ({ key: "private/resume.pdf" }),
    storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }),
    getAccessibleReferralAttachment: async () => undefined,
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
    createCompanyReferralRequest: async () => ({ requestId: 601, companyDomain: "acme.com", notifiedEmployees: 1 }),
    listCompanyReferralInbox: async () => [{ id: 601 }, { id: 602 }],
    listCompanyReferralInboxByState: async () => [{ id: 601 }, { id: 602 }],
    listJobSeekerCompanyReferrals: async () => [{ id: 601, referrerId: 22 }, { id: 602, referrerId: null }],
    getUnclaimedCompanyReferralPreview: async () => ({ id: 601, attachments: [] }),
    getClaimedCompanyReferralDetail: async () => ({ id: 601, attachments: [] }),
    claimCompanyReferralRequest: async () => ({ requestId: 601, claimed: true }),
    saveCompanyReferralRequest: async () => ({ requestId: 601, saved: true }),
    withdrawCompanyReferralRequest: async () => ({ withdrawn: true, requestId: 601, status: "withdrawn", creditSummary: {} }),
    reviewReferralRequest: async () => ({ status: "approved" }),
    oneClickReviewReferralRequest: async () => ({ status: "approved", companyDomain: "acme.com" }),
    updateReferralProgress: async () => ({ status: "intro_made" as const, changed: true }),
    listReferralConversation: async () => [],
    sendReferralConversationMessage: async () => ({ id: 1 }),
    listPublicCompanyOpportunities: async () => [],
    publishCompanyOpportunity: async () => ({ id: 1 }),
    getBlockedReferralRequestIds: async (_userId: number, ids: number[]) => new Set(ids.filter(id => blockedIds.has(id))),
    recordActivity: async () => undefined,
    ...overrides,
  } as Parameters<typeof registerPrivateReferralRoutes>[1]);
  return app;
}

describe("block enforcement on referral surfaces", () => {
  it("hides blocked threads from seeker and referrer lists", async () => {
    const app = appFor(new Set([601]));
    const mine = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(mine.body.requests.map((row: { id: number }) => row.id)).toEqual([602]);
    const inbox = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "referrer");
    expect(inbox.body.requests.map((row: { id: number }) => row.id)).toEqual([602]);
  });

  it("fails open when the block check itself errors", async () => {
    const app = appFor(new Set(), {
      getBlockedReferralRequestIds: async () => { throw new Error("userBlocks missing"); },
    });
    const mine = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(mine.body.requests.map((row: { id: number }) => row.id)).toEqual([601, 602]);
  });

  it("denies blocked thread detail, preview, and conversation neutrally", async () => {
    const app = appFor(new Set([601]));
    expect((await request(app).get("/api/company-referrals/601").set("x-test-user", "seeker")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/601/preview").set("x-test-user", "referrer")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "seeker")).status).toBe(404);
    expect((await request(app).post("/api/company-referrals/601/conversation").set("x-test-user", "seeker").send({ body: "hi" })).status).toBe(404);
  });

  it("denies blocked claim, save, review, and progress while allowing withdraw", async () => {
    const app = appFor(new Set([601]));
    const auth = { "x-test-user": "referrer" } as Record<string, string>;
    const agent = request(app);
    expect((await agent.post("/api/company-referrals/601/claim").set(auth)).status).toBe(404);
    expect((await agent.post("/api/company-referrals/601/save").set(auth).send({ saved: true })).status).toBe(404);
    expect((await agent.post("/api/company-referrals/601/review").set(auth).send({ decision: "approved" })).status).toBe(404);
    expect((await agent.post("/api/company-referrals/601/one-click-review").set(auth).send({ decision: "approved" })).status).toBe(404);
    expect((await agent.post("/api/company-referrals/601/progress").set(auth).send({ status: "intro_made" })).status).toBe(404);
    const withdraw = await agent.post("/api/company-referrals/601/withdraw").set("x-test-user", "seeker");
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.withdrawn).toBe(true);
  });

  it("leaves unblocked threads untouched", async () => {
    const app = appFor(new Set());
    expect((await request(app).get("/api/company-referrals/601").set("x-test-user", "seeker")).status).toBe(200);
    expect((await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "seeker")).status).toBe(200);
    expect((await request(app).post("/api/company-referrals/601/withdraw").set("x-test-user", "seeker")).status).toBe(200);
  });

  it("records denied block traffic for the repair loop", async () => {
    const activity: Array<{ action: string }> = [];
    const app = appFor(new Set([601]), { recordActivity: async (input: { action: string }) => void activity.push(input) });
    await request(app).get("/api/company-referrals/601").set("x-test-user", "seeker");
    expect(activity.some(entry => entry.action === "company_referral.blocked_denied")).toBe(true);
  });
});

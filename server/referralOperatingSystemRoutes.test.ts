import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("referral operating-system routes", () => {
  it("returns role-scoped homes, records only a claimed referrer decision, and protects aggregate admin health", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([
      ["seeker", { account: { id: 1, openId: "seeker", role: "user" as const } }],
      ["employee", { account: { id: 2, openId: "employee", role: "user" as const } }],
      ["member", { account: { id: 3, openId: "member", role: "user" as const } }],
      ["admin", { account: { id: 4, openId: "admin", role: "admin" as const } }],
    ]);
    const savedRequests: Array<{ requestId: number; saved: boolean }> = [];
    const reviews: Array<{ userId: number; requestId: number; decision: string; message?: string }> = [];
    const listInboxByState = vi.fn(async (_userId: number, state: string) => [{ id: 18, companyDomain: "acme.com", status: state === "completed" ? "approved" : "pending", inboxState: state }]);
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value, storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 18, companyDomain: "acme.com", notifiedEmployees: 1 }),
      listCompanyReferralInbox: async () => [], listCompanyReferralInboxByState: listInboxByState, listJobSeekerCompanyReferrals: async userId => userId === 1 ? [{ id: 18, companyDomain: "acme.com", status: "pending", referrerId: null, attachmentCount: 1 }] : [],
      saveCompanyReferralRequest: async (_userId, requestId, saved) => { savedRequests.push({ requestId, saved }); return { requestId, saved }; }, claimCompanyReferralRequest: async requestId => ({ requestId, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      reviewReferralRequest: async (userId, input) => { reviews.push({ userId, requestId: input.requestId, decision: input.decision, message: input.message }); return { status: input.decision }; },
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      getReferralFlowHealth: async () => ({ funnel: { requestsCreated: 5, requestsClaimed: 3, decisionsRecorded: 2, waitingForCoverage: 2 }, coverageGaps: [{ companyDomain: "acme.com", waitingRequests: 2, verifiedCoverage: 0 }], instrumentation: { uploadedDocuments: 5, recordedFailures: 1 } }),
    });

    const seekerHome = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(seekerHome.status).toBe(200); expect(seekerHome.body.requests).toHaveLength(1); expect(seekerHome.body.requests[0]).not.toHaveProperty("personalPitch");
    expect((await request(app).get("/api/company-referrals/mine")).status).toBe(401);

    const inbox = await request(app).get("/api/company-referrals/inbox?scope=saved").set("x-test-user", "employee");
    expect(inbox.status).toBe(200); expect(inbox.body.scope).toBe("saved"); expect(listInboxByState).toHaveBeenCalledWith(2, "saved");
    const saved = await request(app).post("/api/company-referrals/18/save").set("x-test-user", "employee").send({ saved: true });
    expect(saved.status).toBe(200); expect(savedRequests).toEqual([{ requestId: 18, saved: true }]);

    const reviewed = await request(app).post("/api/company-referrals/18/review").set("x-test-user", "employee").send({ decision: "approved", message: "I can help." });
    expect(reviewed.status).toBe(200); expect(reviews).toEqual([{ userId: 2, requestId: 18, decision: "approved", message: "I can help." }]);
    expect((await request(app).post("/api/company-referrals/18/review").set("x-test-user", "employee").send({ decision: "maybe" })).status).toBe(400);

    expect((await request(app).get("/api/admin/flow-health").set("x-test-user", "member")).status).toBe(403);
    const health = await request(app).get("/api/admin/flow-health").set("x-test-user", "admin");
    expect(health.status).toBe(200); expect(health.body.health.funnel).toMatchObject({ requestsCreated: 5, waitingForCoverage: 2 }); expect(health.body.health.coverageGaps[0]).toMatchObject({ companyDomain: "acme.com", verifiedCoverage: 0 });
  });
});

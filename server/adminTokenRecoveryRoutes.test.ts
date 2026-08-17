import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("administrator token recovery routes", () => {
  it("requires administrator access and explicit review confirmation before recording an auditable recovery grant", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([
      ["admin", { account: { id: 7, openId: "admin", role: "admin" as const } }],
      ["member", { account: { id: 8, openId: "member", role: "user" as const } }],
    ]);
    const grantAdminTokenAdjustment = vi.fn(async (_adminUserId: number, input: { recipientUserId: number; role: "job_seeker" | "referrer"; tokenCount: number; caseReference: string; reason: string }) => {
      if (input.caseReference === "CB-ALREADY-USED") throw new Error("A recovery grant already exists for this user, role, and support reference");
      return { adjustmentId: 42, recipientUserId: input.recipientUserId, role: input.role, tokenCount: input.tokenCount, newBalance: 9 };
    });
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      findUsersForTokenRecovery: async () => [{ id: 12, name: "Candidate", email: "candidate@example.com" }], listAdminTokenAdjustments: async () => [{ id: 41, recipientUserId: 12, recipientName: "Candidate", recipientEmail: "candidate@example.com", role: "job_seeker", tokenCount: 2, caseReference: "CB-123", reason: "Payment succeeded but a webhook retry was required." }], grantAdminTokenAdjustment,
    });

    expect((await request(app).get("/api/admin/token-recovery/users?query=ca").set("x-test-user", "member")).status).toBe(403);
    expect((await request(app).get("/api/admin/token-recovery/users?query=c").set("x-test-user", "admin")).status).toBe(400);
    const search = await request(app).get("/api/admin/token-recovery/users?query=ca").set("x-test-user", "admin");
    expect(search.status).toBe(200); expect(search.body.users).toEqual([{ id: 12, name: "Candidate", email: "candidate@example.com" }]);
    const unconfirmed = await request(app).post("/api/admin/token-recovery/grants").set("x-test-user", "admin").send({ recipientUserId: 12, role: "job_seeker", tokenCount: 3, caseReference: "CB-456", reason: "Payment succeeded but the token balance was not updated." });
    expect(unconfirmed.status).toBe(400); expect(grantAdminTokenAdjustment).not.toHaveBeenCalled();
    const granted = await request(app).post("/api/admin/token-recovery/grants").set("x-test-user", "admin").send({ recipientUserId: 12, role: "job_seeker", tokenCount: 3, caseReference: "CB-456", reason: "Payment succeeded but the token balance was not updated.", confirmed: true });
    expect(granted.status).toBe(201); expect(granted.body.grant).toMatchObject({ adjustmentId: 42, tokenCount: 3, newBalance: 9 }); expect(grantAdminTokenAdjustment).toHaveBeenCalledWith(7, expect.objectContaining({ recipientUserId: 12, tokenCount: 3, caseReference: "CB-456" }));
    const duplicate = await request(app).post("/api/admin/token-recovery/grants").set("x-test-user", "admin").send({ recipientUserId: 12, role: "job_seeker", tokenCount: 3, caseReference: "CB-ALREADY-USED", reason: "Payment succeeded but the token balance was not updated.", confirmed: true });
    expect(duplicate.status).toBe(409); expect(duplicate.body.error).toMatch(/already exists/i);
    const history = await request(app).get("/api/admin/token-recovery/adjustments").set("x-test-user", "admin");
    expect(history.status).toBe(200); expect(history.body.adjustments[0]).toMatchObject({ caseReference: "CB-123", tokenCount: 2 });
  });
});

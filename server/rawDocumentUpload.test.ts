import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("raw private-document upload route", () => {
  it("accepts authorized PDF bytes without base64 JSON and preserves the existing private storage contract", async () => {
    const app = express(); app.use(express.json());
    let stored: { key: string; data: Buffer; mimeType: string } | undefined;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "seeker" ? { account: { id: 12, openId: "clerk-seeker" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("unused"), sanitizeDocumentName: value => value,
      storagePut: async (key, data, mimeType) => { stored = { key, data, mimeType }; return { key: "private/resume.pdf" }; }, storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async (_ownerId, input) => ({ id: 44, fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize, fileKey: input.fileKey }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }),
      listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });

    const pdf = Buffer.from("%PDF-1.4\n% safe test\n");
    expect((await request(app).post("/api/documents/raw").set("Content-Type", "application/pdf").set("X-Resume-Filename", "resume.pdf").send(pdf)).status).toBe(401);
    const uploaded = await request(app).post("/api/documents/raw").set("x-test-user", "seeker").set("Content-Type", "application/pdf").set("X-Resume-Filename", encodeURIComponent("resume.pdf")).send(pdf);
    expect(uploaded.status).toBe(201); expect(uploaded.body).toMatchObject({ id: 44, fileName: "resume.pdf", mimeType: "application/pdf", url: "/api/documents/44" });
    expect(stored).toEqual({ key: expect.stringContaining("skipwait/private-referrals/clerk-seeker/"), data: pdf, mimeType: "application/pdf" });
    expect((await request(app).post("/api/documents/raw").set("x-test-user", "seeker").set("Content-Type", "application/pdf").set("X-Resume-Filename", "resume.txt").send(pdf)).status).toBe(400);
  });
});

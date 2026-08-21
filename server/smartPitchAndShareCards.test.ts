import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { draftSmartReferralPitch, smartPitchFallback } from "./ai";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("Smart Pitch and referral share cards", () => {
  const identities = new Map([
    ["seeker", { account: { id: 1, openId: "clerk-seeker" } }],
    ["referrer", { account: { id: 2, openId: "clerk-referrer" } }],
    ["outsider", { account: { id: 3, openId: "clerk-outsider" } }],
  ]);

  function appFor() {
    const app = express(); app.use(express.json());
    let active = true;
    let signedUrlCalls = 0;
    const createCalls: number[] = [];
    const revokeCalls: number[] = [];
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => { signedUrlCalls += 1; return "https://signed.example/private-resume.pdf"; },
      createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 901, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 901, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      getOwnedResumeAttachmentForPitch: async (userId, attachmentId) => { if (userId !== 1 || attachmentId !== 55) throw new Error("Your private resume is unavailable"); return { id: 55, fileKey: "private/seeker-resume.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }; },
      draftSmartReferralPitch: async input => input.resumeMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? smartPitchFallback(input) : "A private editable draft.",
      getOrCreateReferralShareCard: async (userId, requestId) => { if (requestId !== 901 || (userId !== 1 && userId !== 2)) throw new Error("You are not part of this private referral"); createCalls.push(userId); return { shareToken: "a".repeat(32), companyDomain: "acme.com", status: "approved", isActive: true }; },
      revokeReferralShareCard: async (userId, requestId) => { if (requestId !== 901 || (userId !== 1 && userId !== 2)) throw new Error("You are not part of this private referral"); active = false; revokeCalls.push(userId); return { revoked: true }; },
      getPublicReferralShareCard: async token => token === "a".repeat(32) && active ? { companyDomain: "acme.com", status: "approved" } : undefined,
    });
    return { app, createCalls, revokeCalls, signedUrlCalls: () => signedUrlCalls };
  }

  it("allows only a resume owner to obtain a draft and returns the editable fallback for a non-PDF without requesting a signed URL", async () => {
    const { app, signedUrlCalls } = appFor();
    const draft = await request(app).post("/api/smart-pitch").set("x-test-user", "seeker").send({ attachmentId: 55, targetRoleUrl: "https://careers.acme.com/jobs/design" });
    expect(draft.status).toBe(200); expect(draft.body.draft).toContain("opportunity at careers.acme.com"); expect(signedUrlCalls()).toBe(0); expect(JSON.stringify(draft.body)).not.toContain("private-resume");
    expect((await request(app).post("/api/smart-pitch").set("x-test-user", "referrer").send({ attachmentId: 55, targetRoleUrl: "https://careers.acme.com/jobs/design" })).status).toBe(403);
  });

  it("returns the local editable fallback whenever a resume cannot be analyzed", async () => {
    const fallback = smartPitchFallback({ companyDomain: "acme.com" });
    await expect(draftSmartReferralPitch({ companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", resumeMimeType: "image/png" })).resolves.toBe(fallback);
  });

  it("limits social-card creation and revocation to accepted participants, while public resolution contains only company-level acceptance copy", async () => {
    const { app, createCalls, revokeCalls } = appFor();
    expect((await request(app).post("/api/referral-share-cards/901")).status).toBe(401);
    expect((await request(app).delete("/api/referral-share-cards/901")).status).toBe(401);
    expect((await request(app).post("/api/referral-share-cards/901").set("x-test-user", "outsider")).status).toBe(403);
    const created = await request(app).post("/api/referral-share-cards/901").set("x-test-user", "seeker");
    expect(created.status).toBe(201); expect(created.body).toMatchObject({ shareToken: "a".repeat(32), companyDomain: "acme.com", status: "accepted" }); expect(JSON.stringify(created.body)).not.toMatch(/seeker|referrer|requestId|queue/i); expect(createCalls).toEqual([1]);
    const publicCard = await request(app).get(`/api/referral-share-cards/public/${"a".repeat(32)}`);
    expect(publicCard.status).toBe(200); expect(publicCard.body).toEqual({ card: { companyDomain: "acme.com", status: "accepted" } }); expect(JSON.stringify(publicCard.body)).not.toMatch(/token|request|user|email|queue/i);
    const previewHtml = await request(app).get(`/share-card/${"a".repeat(32)}`);
    expect(previewHtml.status).toBe(200); expect(previewHtml.text).toContain('property="og:image"'); expect(previewHtml.text).toContain("Accepted at acme.com"); expect(previewHtml.text).not.toMatch(/seeker|referrer|requestId|queue/i);
    const previewImage = await request(app).get(`/api/referral-share-cards/public/${"a".repeat(32)}/image.png`);
    expect(previewImage.status).toBe(200); expect(previewImage.headers["content-type"]).toMatch(/image\/png/);
    expect((await request(app).delete("/api/referral-share-cards/901").set("x-test-user", "outsider")).status).toBe(403);
    expect((await request(app).delete("/api/referral-share-cards/901").set("x-test-user", "referrer")).body).toEqual({ revoked: true }); expect(revokeCalls).toEqual([2]);
    expect((await request(app).get(`/api/referral-share-cards/public/${"a".repeat(32)}`)).status).toBe(404);
  });
});

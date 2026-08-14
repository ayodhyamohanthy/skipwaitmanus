import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("private referral HTTP routes", () => {
  it("keeps a resume private through upload, request creation, exclusive claim, and unrelated-user denial", async () => {
    const app = express();
    app.use(express.json());
    let claimedBy: number | undefined;
    const attachment = { id: 77, ownerId: 1, fileName: "resume.pdf", fileKey: "private/resume.pdf", mimeType: "application/pdf", fileSize: 3, referrerId: undefined as number | undefined };
    const identities = new Map([["seeker", { account: { id: 1, openId: "clerk-seeker" }, primaryEmail: { emailAddress: "seeker@example.com", verification: { status: "verified" } } }], ["employee", { account: { id: 2, openId: "clerk-employee" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } } }], ["outsider", { account: { id: 3, openId: "clerk-outsider" }, primaryEmail: { emailAddress: "outsider@other.com", verification: { status: "verified" } } }]]);
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async () => attachment,
      getAccessibleReferralAttachment: async (userId) => userId === 1 || userId === claimedBy ? { ...attachment, referrerId: claimedBy } : undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
      createCompanyReferralRequest: async () => ({ requestId: 501, companyDomain: "acme.com", notifiedEmployees: 1 }),
      listCompanyReferralInbox: async () => [{ id: 501, companyDomain: "acme.com" }],
      claimCompanyReferralRequest: async (userId, requestId) => { claimedBy = userId; return { requestId, claimed: true }; },
      getClaimedCompanyReferralDetail: async (userId, requestId) => userId === claimedBy ? { id: requestId, candidateName: "Avery", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [attachment] } : undefined,
      listPublicCompanyOpportunities: async () => [{ id: 91, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer" }],
      publishCompanyOpportunity: async (_userId, input) => ({ id: 92, companyDomain: "acme.com", ...input }),
    });

    const upload = await request(app).post("/api/documents").set("x-test-user", "seeker").send({ fileName: "resume.pdf", mimeType: "application/pdf", dataUrl: "data:application/pdf;base64,cGRm" });
    expect(upload.status).toBe(201); expect(upload.body.url).toBe("/api/documents/77");
    const created = await request(app).post("/api/company-referrals").set("x-test-user", "seeker").send({ targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentIds: [77] });
    expect(created.status).toBe(201); expect(created.body.companyDomain).toBe("acme.com");
    expect((await request(app).get("/api/documents/77").set("x-test-user", "outsider")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/501").set("x-test-user", "outsider")).status).toBe(404);
    expect((await request(app).post("/api/company-referrals/501/claim").set("x-test-user", "employee")).status).toBe(200);
    const detail = await request(app).get("/api/company-referrals/501").set("x-test-user", "employee");
    expect(detail.status).toBe(200); expect(detail.body.request.attachments[0].url).toBe("/api/documents/77");
    const securedDocument = await request(app).get("/api/documents/77").set("x-test-user", "employee");
    expect(securedDocument.status).toBe(307); expect(securedDocument.headers.location).toBe("https://signed.example/resume.pdf");
  });

  it("lists anonymous opportunities publicly but only lets a verified employee publish one", async () => {
    const app = express();
    app.use(express.json());
    const identities = new Map([["employee", { account: { id: 2, openId: "clerk-employee" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } } }]]);
    let savedWorkEmail = false;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => { savedWorkEmail = true; return { workEmailDomain: "acme.com" }; }, createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [{ id: 91, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer" }], publishCompanyOpportunity: async (_userId, input) => ({ id: 92, companyDomain: "acme.com", ...input }),
    });
    const listed = await request(app).get("/api/opportunities");
    expect(listed.status).toBe(200); expect(listed.body.opportunities[0]).not.toHaveProperty("ownerId");
    expect((await request(app).post("/api/opportunities").send({ kind: "hiring_now", roleTitle: "Product Designer" })).status).toBe(401);
    const published = await request(app).post("/api/opportunities").set("x-test-user", "employee").send({ kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design" });
    expect(published.status).toBe(201); expect(savedWorkEmail).toBe(true); expect(published.body.opportunity).toMatchObject({ companyDomain: "acme.com", roleTitle: "Product Designer" });
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const identity = (role?: "admin") => ({ account: { id: role ? 9 : 1, openId: role ? "admin" : "member", role }, primaryEmail: { emailAddress: role ? "admin@skipwait.me" : "member@example.com", verification: { status: "verified" as const } } });

function makeDeps(): PrivateReferralRouteDeps {
  return {
    resolveIdentity: async req => req.header("x-test-user") === "admin" ? identity("admin") : req.header("x-test-user") === "member" ? identity() : undefined,
    dataUrlToBuffer: () => Buffer.from("%PDF-test"), sanitizeDocumentName: value => value, storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 9 }), getAccessibleReferralAttachment: async () => undefined,
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    exportUserData: async userId => ({ generatedAt: "2026-08-19T00:00:00.000Z", account: { id: userId }, uploadedDocuments: [{ id: 8, downloadPath: "/api/documents/8" }] }), listMyPrivacyRequests: async () => [{ id: 7, kind: "erasure", status: "requested" }], createPrivacyErasureRequest: async () => ({ id: 7, kind: "erasure", status: "requested", createdAt: new Date("2026-08-19"), alreadyRequested: false }), listAdminPrivacyRequests: async () => [{ id: 7, requesterEmail: "member@example.com", status: "requested" }], reviewPrivacyRequest: async (_adminId, requestId, input) => ({ id: requestId, ...input }),
  };
}

describe("privacy HTTP routes", () => {
  it("keeps exports and erasure requests authenticated while providing an administrator-only review queue", async () => {
    const app = express(); app.use(express.json()); registerPrivateReferralRoutes(app, makeDeps());
    expect((await request(app).get("/api/privacy/export")).status).toBe(401);
    const exported = await request(app).get("/api/privacy/export").set("x-test-user", "member");
    expect(exported.status).toBe(200); expect(exported.headers["cache-control"]).toBe("private, no-store"); expect(exported.headers["content-disposition"]).toContain("attachment"); expect(exported.body).toMatchObject({ account: { id: 1 } });
    expect((await request(app).post("/api/privacy/requests/erasure").set("x-test-user", "member")).status).toBe(201);
    expect((await request(app).get("/api/admin/privacy-requests").set("x-test-user", "member")).status).toBe(403);
    expect((await request(app).get("/api/admin/privacy-requests").set("x-test-user", "admin")).body.requests).toHaveLength(1);
    const reviewed = await request(app).post("/api/admin/privacy-requests/7/review").set("x-test-user", "admin").send({ status: "in_review", resolution: "Identity review started" });
    expect(reviewed.status).toBe(200); expect(reviewed.body.request).toMatchObject({ id: 7, status: "in_review" });
  });
});

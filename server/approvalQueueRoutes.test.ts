import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const adminIdentity = { account: { id: 9, openId: "workos-admin", role: "admin" } };
const memberIdentity = { account: { id: 1, openId: "workos-member" } };

function minimalDeps(overrides: Partial<PrivateReferralRouteDeps> = {}): PrivateReferralRouteDeps {
  return {
    resolveIdentity: async req => req.header("x-test-user") === "admin" ? adminIdentity : req.header("x-test-user") === "member" ? memberIdentity : undefined,
    dataUrlToBuffer: () => Buffer.from("%PDF-test"),
    sanitizeDocumentName: (value: string) => value,
    storagePut: async () => ({ key: "private/resume.pdf" }),
    storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }),
    getAccessibleReferralAttachment: async () => undefined,
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
    createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }),
    listCompanyReferralInbox: async () => [],
    claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }),
    getClaimedCompanyReferralDetail: async () => undefined,
    listPublicCompanyOpportunities: async () => [],
    publishCompanyOpportunity: async () => ({ id: 1 }),
    ...overrides,
  };
}

function buildApp(deps: PrivateReferralRouteDeps) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, deps);
  return app;
}

const queueItem = { kind: "referral_request", id: 501, status: "under_review", companyDomain: "acme.com", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", summary: "I led a measurable product design launch.", meta: {} };
const enrollmentItem = { kind: "referrer_enrollment", id: 77, status: "under_review", companyDomain: "acme.com", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", summary: "Work email verified · awaiting a first referral action", meta: { otpTime: "2026-09-01T00:00:00.000Z" } };
const paymentItem = { kind: "payment", id: 33, status: "requires_review", companyDomain: "", provider: "chargebee", amount: 39600, currency: "INR", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", summary: "provider_page_mismatch", meta: { tokenCount: 4, reason: "provider_page_mismatch" } };

describe("unified admin approval queue routes", () => {
  it("guards the queue and decision endpoints behind the administrator role", async () => {
    const app = buildApp(minimalDeps());
    expect((await request(app).get("/api/admin/approval-queue")).status).toBe(403);
    expect((await request(app).get("/api/admin/approval-queue").set("x-test-user", "member")).status).toBe(403);
    expect((await request(app).post("/api/admin/approval-queue/referral_request/501/decision").set("x-test-user", "member").send({ decision: "approved" })).status).toBe(403);
    expect((await request(app).post("/api/admin/approval-queue/referral_request/501/decision").set("x-test-user", "admin").send({ decision: "approved" })).status).toBe(501);
  });

  it("lists the three record kinds in one normalized queue for the admin", async () => {
    const activity: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
    const app = buildApp(minimalDeps({ listAdminApprovalQueue: async (limit?: number) => { expect(limit).toBe(250); return [queueItem, enrollmentItem, paymentItem]; }, recordActivity: async entry => { activity.push(entry); } }));
    const response = await request(app).get("/api/admin/approval-queue?limit=250").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([queueItem, enrollmentItem, paymentItem]);
    expect(activity).toContainEqual(expect.objectContaining({ action: "admin.approval_queue_viewed", resourceType: "approval_queue", metadata: { limit: 250, queueCount: 3 } }));
  });

  it("records an approval decision with the note and returns ok with the normalized status", async () => {
    const activity: Array<{ action: string; resourceId?: string | number; metadata?: Record<string, unknown> }> = [];
    let resolved: { kind: string; id: number; decision: string; note?: string } | undefined;
    const app = buildApp(minimalDeps({
      resolveAdminApproval: async (_adminUserId, kind, id, decision, note) => { resolved = { kind, id, decision, note }; return { status: decision === "approved" ? "approved" : "declined" }; },
      recordActivity: async entry => { activity.push(entry); },
    }));
    const response = await request(app).post("/api/admin/approval-queue/referrer_enrollment/77/decision").set("x-test-user", "admin").send({ decision: "approved", note: "Verified domain matches the invite code" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, status: "approved", decision: "approved" });
    expect(resolved).toEqual({ kind: "referrer_enrollment", id: 77, decision: "approved", note: "Verified domain matches the invite code" });
    expect(activity).toContainEqual(expect.objectContaining({ action: "admin.approval_approved", resourceType: "referrer_enrollment", resourceId: 77 }));
  });

  it("rejects an already-resolved record with 409 and invalid input with 400", async () => {
    const app = buildApp(minimalDeps({ resolveAdminApproval: async () => { throw new Error("This record was already resolved"); } }));
    const response = await request(app).post("/api/admin/approval-queue/referral_request/501/decision").set("x-test-user", "admin").send({ decision: "approved" });
    expect(response.status).toBe(409);
    expect((await request(app).post("/api/admin/approval-queue/unknown/501/decision").set("x-test-user", "admin").send({ decision: "approved" })).status).toBe(400);
    expect((await request(app).post("/api/admin/approval-queue/referral_request/501/decision").set("x-test-user", "admin").send({ decision: "maybe" })).status).toBe(400);
  });

  it("reports a missing record as 404", async () => {
    const app = buildApp(minimalDeps({ resolveAdminApproval: async () => { throw new Error("This referral request could not be found"); } }));
    expect((await request(app).post("/api/admin/approval-queue/referral_request/999/decision").set("x-test-user", "admin").send({ decision: "rejected" })).status).toBe(404);
  });
});

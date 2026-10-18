import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { PaymentReviewRefusedError } from "./paymentRefundReview";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

// POST /api/admin/payments/review/:paymentId (P0-refund-review-double-credit):
// the body is parsed with the shared contract before the resolver runs, a refused
// decision is a 409 in the resolver's plain words, and a take-back reports what it
// removed and what had already been used.
const adminIdentity = { account: { id: 9, openId: "workos-admin", role: "admin" as const } };
const memberIdentity = { account: { id: 1, openId: "workos-member" } };
type Activity = { action: string; outcome: string; resourceId?: string | number; metadata?: Record<string, unknown> };

function buildApp(overrides: Partial<PrivateReferralRouteDeps> = {}) {
  const activity: Activity[] = [];
  const deps: PrivateReferralRouteDeps = {
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
    recordActivity: async entry => { activity.push(entry as Activity); },
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, deps);
  return { app, activity };
}

const base = { paymentId: 41, tokenCount: 5, userId: 7, role: "job_seeker" as const };
const post = (app: express.Express, body: unknown, user = "admin") => request(app).post("/api/admin/payments/review/41").set("x-test-user", user).send(body as object);

describe("admin payment review decision route", () => {
  it("passes a take-back with its credit cap and note to the resolver and returns what it removed", async () => {
    const resolve = vi.fn(async () => ({ ...base, decision: "revoke_unused" as const, requested: 4, revoked: 1, unrecovered: 3, balanceBefore: 1, balanceAfter: 0 }));
    const { app, activity } = buildApp({ resolveRequiresReviewPayment: resolve });
    const response = await post(app, { decision: "revoke_unused", credits: 4, note: "  partial refund  " });
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith(9, 41, "revoke_unused", "partial refund", 4);
    expect(response.body.payment).toMatchObject({ decision: "revoke_unused", requested: 4, revoked: 1, unrecovered: 3 });
    expect(activity).toContainEqual(expect.objectContaining({ action: "payment.review_revoke_unused", outcome: "success", resourceId: 41, metadata: expect.objectContaining({ decision: "revoke_unused", requested: 4, revoked: 1, unrecovered: 3 }) }));
  });

  it("credits and rejections keep their body and response shape", async () => {
    const resolve = vi.fn(async (_admin: number, paymentId: number, decision: "credited" | "rejected" | "revoke_unused" | "keep_credits") => ({ ...base, paymentId, decision }));
    const { app, activity } = buildApp({ resolveRequiresReviewPayment: resolve as never });
    const response = await post(app, { decision: "credited", note: "tax added" });
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith(9, 41, "credited", "tax added", undefined);
    expect(response.body).toEqual({ payment: { ...base, decision: "credited" } });
    expect(activity).toContainEqual(expect.objectContaining({ action: "payment.review_credited", outcome: "success" }));
  });

  it("returns a refused decision as 409 in plain words and records the refusal", async () => {
    const message = "This payment's credits were already added before it was refunded, so it cannot be credited again or rejected. Take back the unused credits, or keep them and close it.";
    const { app, activity } = buildApp({ resolveRequiresReviewPayment: async () => { throw new PaymentReviewRefusedError(message); } });
    const response = await post(app, { decision: "credited" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: message });
    expect(activity).toContainEqual(expect.objectContaining({ action: "payment.review_refused", outcome: "denied", resourceId: 41, metadata: expect.objectContaining({ decision: "credited" }) }));
    expect(activity.some(entry => entry.action === "payment.review_credited")).toBe(false);
  });

  it("returns an already resolved payment as 409 and a missing one as 404", async () => {
    const resolved = buildApp({ resolveRequiresReviewPayment: async () => { throw new Error("This payment was already resolved"); } });
    expect((await post(resolved.app, { decision: "revoke_unused" })).status).toBe(409);
    const missing = buildApp({ resolveRequiresReviewPayment: async () => { throw new Error("This payment record does not exist"); } });
    expect((await post(missing.app, { decision: "rejected" })).status).toBe(404);
  });

  it("refuses an unknown decision, an extra field or a bad credit count with 400 before calling the resolver", async () => {
    const resolve = vi.fn();
    const { app } = buildApp({ resolveRequiresReviewPayment: resolve });
    for (const body of [{ decision: "refund" }, { decision: "credited", extra: 1 }, { decision: "revoke_unused", credits: 0 }, { decision: "revoke_unused", credits: 2.5 }, { decision: "keep_credits", credits: 2 }, {}]) {
      const response = await post(app, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error).toEqual(expect.any(String));
    }
    expect((await request(app).post("/api/admin/payments/review/0").set("x-test-user", "admin").send({ decision: "credited" })).status).toBe(400);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("is administrator only", async () => {
    const resolve = vi.fn();
    const { app } = buildApp({ resolveRequiresReviewPayment: resolve });
    expect((await post(app, { decision: "credited" }, "member")).status).toBe(403);
    expect((await request(app).post("/api/admin/payments/review/41").send({ decision: "credited" })).status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("admin payment review queue route", () => {
  it("passes why each payment is parked through to the page", async () => {
    const parked = { id: 41, provider: "chargebee", providerHostedPageId: "hp_41", checkoutIntentId: "intent_41", userId: 7, role: "job_seeker", tokenCount: 5, amount: 50000, currency: "INR", reconciliationReason: "refund_credits_spent", creditedAt: "2026-10-10T00:00:00.000Z", createdAt: "2026-10-10T00:00:00.000Z", userEmail: "avery@example.com", reviewKind: "refunded_after_credit" };
    const { app } = buildApp({ listRequiresReviewPayments: async () => [parked] });
    const response = await request(app).get("/api/admin/payments/review").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.body.payments).toEqual([parked]);
    expect((await request(app).get("/api/admin/payments/review").set("x-test-user", "member")).status).toBe(403);
  });
});

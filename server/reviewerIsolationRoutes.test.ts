import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { REVIEWER_EXTERNAL_ACTION_REFUSAL } from "./_core/reviewerLogin";

/**
 * REVIEWER-ISOLATION-1: a demo review account (reviewer_* openId, ordinary
 * session) gets a flat 403 on every route that can reach a real member, an
 * external service, or an admin surface - before any body validation or dep
 * runs. Browse and checkout-cart creation are covered elsewhere (they stay
 * open on purpose for merchant review).
 */
const reviewerIdentity = { account: { id: 900, openId: "reviewer_seeker", role: "user" as const }, primaryEmail: { emailAddress: "seeker@reviewer.skipwait.me" } };
const memberIdentity = { account: { id: 901, openId: "workos_member", role: "user" as const } };

function buildApp(identity: unknown, depOverrides: Partial<PrivateReferralRouteDeps> = {}) {
  const app = express();
  app.use(express.json());
  const deps = {
    resolveIdentity: async () => identity as never,
    dataUrlToBuffer: () => Buffer.alloc(0),
    sanitizeDocumentName: (fileName: string) => fileName,
    storagePut: async () => ({ key: "test-key" }),
    storageGetSignedUrl: async () => "https://signed.test/key",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 1 }),
    createCompanyReferralRequest: vi.fn(async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 1 })),
    listCompanyReferralInbox: async () => [],
    claimCompanyReferralRequest: vi.fn(async () => ({ requestId: 1, claimed: true })),
    getClaimedCompanyReferralDetail: async () => undefined,
    listPublicCompanyOpportunities: async () => [],
    publishCompanyOpportunity: vi.fn(async () => ({})),
    ...depOverrides,
  } as unknown as PrivateReferralRouteDeps;
  registerPrivateReferralRoutes(app, deps);
  return { app, deps };
}

const guarded: Array<{ method: "post" | "put" | "delete"; path: string }> = [
  { method: "post", path: "/api/company-referrals" },
  { method: "post", path: "/api/opportunities" },
  { method: "post", path: "/api/opportunities/1/renew" },
  { method: "post", path: "/api/opportunities/1/close" },
  { method: "put", path: "/api/referrer/slack-webhook" },
  { method: "delete", path: "/api/referrer/slack-webhook" },
  { method: "post", path: "/api/work-email/otp/send" },
  { method: "post", path: "/api/work-email/otp/verify" },
  { method: "post", path: "/api/company-referrals/verify-work-email" },
  { method: "post", path: "/api/personal-invites/claim" },
  { method: "post", path: "/api/company-referrals/availability/open" },
  { method: "post", path: "/api/company-referrals/1/claim" },
  { method: "post", path: "/api/company-referrals/1/save" },
  { method: "post", path: "/api/company-referrals/1/withdraw" },
  { method: "post", path: "/api/company-referrals/1/review" },
  { method: "post", path: "/api/company-referrals/1/one-click-review" },
  { method: "post", path: "/api/company-referrals/1/progress" },
  { method: "post", path: "/api/company-referrals/1/conversation" },
  { method: "post", path: "/api/company-referrals/1/extend-referred-deadline" },
  { method: "post", path: "/api/company-referrals/1/step-back" },
  { method: "post", path: "/api/company-referrals/1/confirm-referred" },
  { method: "post", path: "/api/referral-share-cards/1" },
  { method: "delete", path: "/api/referral-share-cards/1" },
  { method: "post", path: "/api/privacy/requests/erasure" },
  { method: "post", path: "/api/admin/approval-queue/payment/1/decision" },
  { method: "post", path: "/api/admin/users/2/suspend" },
  { method: "post", path: "/api/admin/payments/review/1/revoke-credits" },
  { method: "post", path: "/api/admin/payments/review/1" },
  { method: "post", path: "/api/admin/privacy-requests/1/review" },
  { method: "post", path: "/api/admin/token-recovery/grants" },
  { method: "post", path: "/api/admin/schema/reconcile" },
];

describe("reviewer isolation on effectful routes", () => {
  it.each(guarded.map(g => [g.method.toUpperCase() + " " + g.path, g] as const))("%s answers 403 for a demo review account", async (_label, g) => {
    const { app } = buildApp(reviewerIdentity);
    const response = await request(app)[g.method](g.path).send({});
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: REVIEWER_EXTERNAL_ACTION_REFUSAL });
  });

  it("does not refuse an ordinary member on the guard itself (falls through to route logic)", async () => {
    const { app } = buildApp(memberIdentity);
    // OTP send without its dep answers 503, proving the reviewer guard did not fire.
    const response = await request(app).post("/api/work-email/otp/send").send({ email: "member@acme.com" });
    expect(response.status).not.toBe(403);
    expect(response.body?.error ?? "").not.toBe(REVIEWER_EXTERNAL_ACTION_REFUSAL);
  });
});

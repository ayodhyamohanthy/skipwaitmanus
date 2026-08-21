import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";
import { createReferrerReviewEmailSender } from "./referrerReviewEmail";

describe("Referrer one-click review actions", () => {
  const token = "a".repeat(48);
  const identities = new Map([
    ["seeker", { account: { id: 1, openId: "seeker" } }],
    ["employee", { account: { id: 2, openId: "employee" } }],
    ["outsider", { account: { id: 3, openId: "outsider" } }],
  ]);
  afterEach(() => { delete process.env.RESEND_API_KEY; delete process.env.ERROR_ALERT_FROM_EMAIL; });

  function appFor() {
    const app = express(); app.use(express.json());
    const reviews: Array<{ userId: number; requestId: number; decision: string; declineReason?: string }> = [];
    const consumed: string[] = [];
    const sent: Array<{ to: string; companyDomain: string; reviewUrl: string }> = [];
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 81, companyDomain: "acme.com", notifiedEmployees: 1 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 81, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      prepareReferrerReviewEmailNotifications: async requestId => requestId === 81 ? [{ referrerId: 2, email: "employee@acme.com", linkToken: token, companyDomain: "acme.com" }] : [],
      sendReferrerReviewEmail: async input => { sent.push(input); return { sent: true, reason: "sent" }; },
      oneClickReviewReferralRequest: async (userId, input) => { if (userId !== 2) throw new Error("This referral request is no longer available"); reviews.push({ userId, ...input }); return { status: input.decision, companyDomain: "acme.com", declineReason: input.declineReason }; },
      resolveReferrerReviewEmailLink: async (userId, linkToken) => { if (userId !== 2 || linkToken !== token || consumed.includes(linkToken)) throw new Error("This private review link is unavailable"); return { requestId: 81 }; },
      consumeReferrerReviewEmailLink: async (_userId, linkToken) => { consumed.push(linkToken); },
    });
    return { app, reviews, consumed, sent };
  }

  it("records dashboard acceptance or a bounded one-click decline reason only for an authenticated company employee", async () => {
    const { app, reviews } = appFor();
    expect((await request(app).post("/api/company-referrals/81/one-click-review").send({ decision: "approved" })).status).toBe(401);
    expect((await request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "declined", declineReason: "free text" })).status).toBe(400);
    const accepted = await request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "approved" });
    expect(accepted.status).toBe(200); expect(accepted.body).toEqual({ status: "approved" });
    const declined = await request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "declined", declineReason: "timing" });
    expect(declined.status).toBe(200); expect(declined.body).toEqual({ status: "declined", declineReason: "timing" });
    expect(reviews).toEqual([{ userId: 2, requestId: 81, decision: "approved", declineReason: undefined }, { userId: 2, requestId: 81, decision: "declined", declineReason: "timing" }]);
  });

  it("sends a company-only email handoff and completes its action once for the authenticated intended Referrer", async () => {
    const { app, reviews, consumed, sent } = appFor();
    const created = await request(app).post("/api/company-referrals").set("x-test-user", "seeker").send({ targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentIds: [1] });
    expect(created.status).toBe(201); expect(sent).toEqual([{ to: "employee@acme.com", companyDomain: "acme.com", reviewUrl: expect.stringMatching(new RegExp(`/email-review/${token}$`)) }]); expect(JSON.stringify(sent)).not.toMatch(/resume|candidate|requestId|queue/i);
    expect((await request(app).post(`/api/referrer-review-links/${token}/decision`).send({ decision: "approved" })).status).toBe(401);
    expect((await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "outsider").send({ decision: "approved" })).status).toBe(409);
    const acted = await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "employee").send({ decision: "declined", declineReason: "role_not_a_fit" });
    expect(acted.status).toBe(200); expect(acted.body).toEqual({ status: "declined", declineReason: "role_not_a_fit" }); expect(JSON.stringify(acted.body)).not.toMatch(/request|email|token|company/i); expect(consumed).toEqual([token]);
    expect((await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "employee").send({ decision: "declined", declineReason: "role_not_a_fit" })).status).toBe(409);
    expect(reviews).toEqual([{ userId: 2, requestId: 81, decision: "declined", declineReason: "role_not_a_fit" }]);
  });

  it("keeps recipient review emails factual and omits candidate-private details", async () => {
    process.env.RESEND_API_KEY = "test-key"; process.env.ERROR_ALERT_FROM_EMAIL = "noreply@updates.skipwait.me";
    let body = "";
    const sender = createReferrerReviewEmailSender({ fetchImpl: async (_url, init) => { body = String(init?.body || ""); return new Response("{}", { status: 200 }); } });
    await expect(sender({ to: "employee@acme.com", companyDomain: "acme.com", reviewUrl: `https://skipwait.me/email-review/${token}` })).resolves.toEqual({ sent: true, reason: "sent" });
    expect(body).toContain("acme.com"); expect(body).toContain("decision=approved"); expect(body).toContain("reason=timing"); expect(body).not.toMatch(/candidate|resume|document|queue|hiring outcome guaranteed/i);
  });
});

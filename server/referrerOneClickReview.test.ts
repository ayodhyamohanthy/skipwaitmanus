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

  function appFor(overrides: Record<string, unknown> = {}) {
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
      oneClickReviewReferralRequest: async (userId, input) => { if (userId !== 2) throw new Error("This referral request is no longer available"); reviews.push({ userId, ...input }); return { status: input.decision === "declined" ? "passed" : input.decision, companyDomain: "acme.com", declineReason: input.declineReason }; },
      resolveReferrerReviewEmailLink: async (userId, linkToken) => { if (userId !== 2 || linkToken !== token || consumed.includes(linkToken)) throw new Error("This private review link is unavailable"); return { requestId: 81 }; },
      consumeReferrerReviewEmailLink: async (_userId, linkToken) => { consumed.push(linkToken); },
      ...overrides,
    } as Parameters<typeof registerPrivateReferralRoutes>[1]);
    return { app, reviews, consumed, sent };
  }

  it("refuses an accept without the explicit confirmation, before any state change (kit ethics gate)", async () => {
    const { app, reviews } = appFor();
    const bare = await request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "approved" });
    expect(bare.status).toBe(400);
    expect(bare.body.error).toMatch(/official process/);
    const emailBare = await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "employee").send({ decision: "approved" });
    expect(emailBare.status).toBe(400);
    expect(emailBare.body.error).toMatch(/official process/);
    expect(reviews).toEqual([]);
    const confirmed = await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "employee").send({ decision: "approved", ethicsConfirmed: true });
    expect(confirmed.status).toBe(200);
  });

  it("records dashboard acceptance or a bounded one-click decline reason only for an authenticated company employee", async () => {
    const { app, reviews } = appFor();
    expect((await request(app).post("/api/company-referrals/81/one-click-review").send({ decision: "approved" })).status).toBe(401);
    expect((await request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "declined", declineReason: "free text" })).status).toBe(400);
    const accepted = await request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "approved", ethicsConfirmed: true });
    expect(accepted.status).toBe(200); expect(accepted.body).toEqual({ status: "approved" });
    const declined = await request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "declined", declineReason: "timing" });
    expect(declined.status).toBe(200); expect(declined.body).toEqual({ status: "passed", declineReason: "timing" });
    expect(reviews).toEqual([{ userId: 2, requestId: 81, decision: "approved", declineReason: undefined, passReason: null }, { userId: 2, requestId: 81, decision: "declined", declineReason: "timing", passReason: null }]);
  });

  it("accepts a kit pass reason code, rejects unknown codes, and never needs a name", async () => {
    const { app, reviews } = appFor();
    const post = (body: object) => request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send(body);
    expect((await post({ decision: "declined", declineReason: "timing", passReason: "Jane Doe" })).status).toBe(400);
    expect((await post({ decision: "declined", declineReason: "timing", passReason: "at_capacity" })).status).toBe(200);
    expect(reviews).toEqual([{ userId: 2, requestId: 81, decision: "declined", declineReason: "timing", passReason: "at_capacity" }]);
  });

  it("accepts D-052's two added reasons with their legacy decline reasons", async () => {
    const { app, reviews } = appFor();
    const post = (body: object) => request(app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send(body);
    expect((await post({ decision: "declined", declineReason: "role_not_a_fit", passReason: "role_closed" })).status).toBe(200);
    expect((await post({ decision: "declined", declineReason: "cannot_support", passReason: "only_refer_known" })).status).toBe(200);
    expect(reviews).toEqual([
      { userId: 2, requestId: 81, decision: "declined", declineReason: "role_not_a_fit", passReason: "role_closed" },
      { userId: 2, requestId: 81, decision: "declined", declineReason: "cannot_support", passReason: "only_refer_known" },
    ]);
  });

  it("sends a company-only email handoff and completes its action once for the authenticated intended Referrer", async () => {
    const { app, reviews, consumed, sent } = appFor();
    const created = await request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000001").set("x-test-user", "seeker").send({ expectedCost: 1, targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentIds: [1] });
    expect(created.status).toBe(201); expect(sent).toEqual([{ to: "employee@acme.com", companyDomain: "acme.com", reviewUrl: expect.stringMatching(new RegExp(`/email-review/${token}$`)) }]); expect(JSON.stringify(sent)).not.toMatch(/resume|candidate|requestId|queue/i);
    expect((await request(app).post(`/api/referrer-review-links/${token}/decision`).send({ decision: "approved" })).status).toBe(401);
    expect((await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "outsider").send({ decision: "approved", ethicsConfirmed: true })).status).toBe(409);
    const acted = await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "employee").send({ decision: "declined", declineReason: "role_not_a_fit" });
    expect(acted.status).toBe(200); expect(acted.body).toEqual({ status: "passed", declineReason: "role_not_a_fit" }); expect(JSON.stringify(acted.body)).not.toMatch(/request|email|token|company/i); expect(consumed).toEqual([token]);
    expect((await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "employee").send({ decision: "declined", declineReason: "role_not_a_fit" })).status).toBe(409);
    expect(reviews).toEqual([{ userId: 2, requestId: 81, decision: "declined", declineReason: "role_not_a_fit", passReason: null, reviewLinkToken: token }]);
  });

  it("keeps recipient review emails factual and omits candidate-private details", async () => {
    process.env.RESEND_API_KEY = "test-key"; process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    let body = "";
    const sender = createReferrerReviewEmailSender({ fetchImpl: async (_url, init) => { body = String(init?.body || ""); return new Response("{}", { status: 200 }); } });
    await expect(sender({ to: "employee@acme.com", companyDomain: "acme.com", reviewUrl: `https://skipwait.me/email-review/${token}` })).resolves.toEqual({ sent: true, reason: "sent" });
    expect(body).toContain("acme.com"); expect(body).toContain(`/email-review/${token}`); expect(body).not.toContain("decision="); expect(body).not.toContain("reason="); expect(body).not.toMatch(/candidate|resume|document|queue|hiring outcome guaranteed/i);
  });
  // D-021: a decline by the employee who claimed the ask reopens it for the rest
  // of the company, so the email the seeker receives must say that and nothing more.
  it("tells the seeker their ask is open again after a claimed pass, and never overstates it", async () => {
    const mails: Array<{ to: string; subject: string; html: string }> = [];
    const passDeps = {
      getUserEmailById: async () => "seeker@example.com",
      sendEmail: async (input: { to: string; subject: string; html: string }) => { mails.push(input); },
    };
    const claimed = appFor({ ...passDeps, oneClickReviewReferralRequest: async () => ({ status: "passed", companyDomain: "acme.com", declineReason: "timing", jobSeekerId: 1, revision: 5, reopened: true }) });
    const passed = await request(claimed.app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "declined", declineReason: "timing", passReason: "at_capacity" });
    expect(passed.status).toBe(200); expect(passed.body).toEqual({ status: "passed", declineReason: "timing" });
    expect(JSON.stringify(passed.body)).not.toMatch(/reopened|company|candidate|email/i);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mails).toHaveLength(1); expect(mails[0].to).toBe("seeker@example.com");
    expect(mails[0].html).toContain("Your ask is open again to other verified employees there.");

    mails.length = 0;
    const unclaimed = appFor({ ...passDeps, oneClickReviewReferralRequest: async () => ({ status: "passed", companyDomain: "acme.com", declineReason: "timing", jobSeekerId: 1, revision: 5, reopened: false }) });
    const plain = await request(unclaimed.app).post("/api/company-referrals/81/one-click-review").set("x-test-user", "employee").send({ decision: "declined", declineReason: "timing" });
    expect(plain.status).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mails).toHaveLength(1);
    expect(mails[0].html).toContain("remains visible to other verified employees");
    expect(mails[0].html).not.toContain("open again");
  });
});

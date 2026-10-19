import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

const seeker = { account: { id: 11, openId: "workos-seeker" } };
const referrer = { account: { id: 22, openId: "workos-referrer" } };

function appFor(blockedIds: Set<number>, overrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => (req.header("x-test-user") === "referrer" ? referrer : req.header("x-test-user") === "seeker" ? seeker : undefined),
    dataUrlToBuffer: () => Buffer.from("pdf"),
    sanitizeDocumentName: value => value,
    storagePut: async () => ({ key: "private/resume.pdf" }),
    storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }),
    getAccessibleReferralAttachment: async () => undefined,
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
    createCompanyReferralRequest: async () => ({ requestId: 601, companyDomain: "acme.com", notifiedEmployees: 1 }),
    listCompanyReferralInbox: async () => [{ id: 601 }, { id: 602 }],
    listCompanyReferralInboxByState: async () => [{ id: 601 }, { id: 602 }],
    listJobSeekerCompanyReferrals: async () => [{ id: 601, referrerId: 22 }, { id: 602, referrerId: null }],
    getUnclaimedCompanyReferralPreview: async () => ({ id: 601, attachments: [] }),
    getClaimedCompanyReferralDetail: async () => ({ id: 601, attachments: [] }),
    claimCompanyReferralRequest: async () => ({ requestId: 601, claimed: true }),
    saveCompanyReferralRequest: async () => ({ requestId: 601, saved: true }),
    withdrawCompanyReferralRequest: async () => ({ withdrawn: true, requestId: 601, status: "withdrawn", creditSummary: {} }),
    reviewReferralRequest: async () => ({ status: "approved" }),
    oneClickReviewReferralRequest: async () => ({ status: "approved", companyDomain: "acme.com" }),
    updateReferralProgress: async () => ({ status: "intro_made" as const, changed: true }),
    listReferralConversation: async () => [],
    sendReferralConversationMessage: async () => ({ id: 1 }),
    listPublicCompanyOpportunities: async () => [],
    publishCompanyOpportunity: async () => ({ id: 1 }),
    getBlockedReferralRequestIds: async (_userId: number, ids: number[]) => new Set(ids.filter(id => blockedIds.has(id))),
    recordActivity: async () => undefined,
    ...overrides,
  } as Parameters<typeof registerPrivateReferralRoutes>[1]);
  return app;
}

describe("block enforcement on referral surfaces", () => {
  it("hides blocked threads from seeker and referrer lists", async () => {
    const app = appFor(new Set([601]));
    const mine = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(mine.body.requests.map((row: { id: number }) => row.id)).toEqual([602]);
    const inbox = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "referrer");
    expect(inbox.body.requests.map((row: { id: number }) => row.id)).toEqual([602]);
  });

  it("fails open when the block check itself errors", async () => {
    const app = appFor(new Set(), {
      getBlockedReferralRequestIds: async () => { throw new Error("userBlocks missing"); },
    });
    const mine = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(mine.body.requests.map((row: { id: number }) => row.id)).toEqual([601, 602]);
  });

  it("denies blocked thread detail, preview, and conversation neutrally", async () => {
    const app = appFor(new Set([601]));
    expect((await request(app).get("/api/company-referrals/601").set("x-test-user", "seeker")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/601/preview").set("x-test-user", "referrer")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "seeker")).status).toBe(404);
    expect((await request(app).post("/api/company-referrals/601/conversation").set("x-test-user", "seeker").send({ body: "hi" })).status).toBe(404);
  });

  it("denies blocked claim, save, review, and progress while allowing withdraw", async () => {
    const app = appFor(new Set([601]));
    const auth = { "x-test-user": "referrer" } as Record<string, string>;
    const agent = request(app);
    expect((await agent.post("/api/company-referrals/601/claim").set(auth)).status).toBe(404);
    expect((await agent.post("/api/company-referrals/601/save").set(auth).send({ saved: true })).status).toBe(404);
    expect((await agent.post("/api/company-referrals/601/review").set(auth).send({ decision: "approved" })).status).toBe(404);
    expect((await agent.post("/api/company-referrals/601/one-click-review").set(auth).send({ decision: "approved", ethicsConfirmed: true })).status).toBe(404);
    expect((await agent.post("/api/company-referrals/601/progress").set(auth).send({ status: "intro_made" })).status).toBe(404);
    const withdraw = await agent.post("/api/company-referrals/601/withdraw").set("x-test-user", "seeker");
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.withdrawn).toBe(true);
  });

  it("leaves unblocked threads untouched", async () => {
    const app = appFor(new Set());
    expect((await request(app).get("/api/company-referrals/601").set("x-test-user", "seeker")).status).toBe(200);
    expect((await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "seeker")).status).toBe(200);
    expect((await request(app).post("/api/company-referrals/601/withdraw").set("x-test-user", "seeker")).status).toBe(200);
  });

  it("records denied block traffic for the repair loop", async () => {
    const activity: Array<{ action: string }> = [];
    const app = appFor(new Set([601]), { recordActivity: async (input: { action: string }) => void activity.push(input) });
    await request(app).get("/api/company-referrals/601").set("x-test-user", "seeker");
    expect(activity.some(entry => entry.action === "company_referral.blocked_denied")).toBe(true);
  });
});

// P0-email-review-block: the private email link is the third way to accept or pass
// an ask, so it gets the same two-way block check as the dashboard review, after
// the link is proven to belong to the signed-in referrer and before anything else.
describe("block enforcement on private email review links", () => {
  const token = "a".repeat(48);
  const foreignToken = "b".repeat(48);
  const readyBody = JSON.stringify({ review: { ready: true, decisions: ["approved", "role_not_a_fit", "cannot_support", "timing"] } });
  const neutralDenial = JSON.stringify({ error: "This private request is not available" });
  const signInFirst = JSON.stringify({ error: "Sign in with your verified company email to use this private review link" });
  const unavailableLink = JSON.stringify({ error: "This private review link is unavailable" });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  function reviewLinkApp(blockedIds: Set<number>, overrides: Record<string, unknown> = {}) {
    const calls = {
      blockLookups: [] as number[][],
      decisions: [] as Array<{ userId: number; requestId: number; decision: string; reviewLinkToken?: string }>,
      consumed: [] as string[],
      notified: [] as number[],
      emailed: [] as string[],
      activity: [] as Array<{ action: string; resourceId?: unknown }>,
    };
    const app = appFor(blockedIds, {
      getBlockedReferralRequestIds: async (_userId: number, ids: number[]) => { calls.blockLookups.push(ids); return new Set(ids.filter(id => blockedIds.has(id))); },
      resolveReferrerReviewEmailLink: async (userId: number, linkToken: string) => { if (userId !== referrer.account.id || linkToken !== token) throw new Error("This private review link is unavailable"); return { requestId: 601 }; },
      consumeReferrerReviewEmailLink: async (_userId: number, linkToken: string) => { calls.consumed.push(linkToken); },
      // The legacy result shape (no revision): reaching the decision consumes the link and tells the seeker.
      oneClickReviewReferralRequest: async (userId: number, input: { requestId: number; decision: string; declineReason?: string; reviewLinkToken?: string }) => {
        calls.decisions.push({ userId, requestId: input.requestId, decision: input.decision, reviewLinkToken: input.reviewLinkToken });
        return { status: input.decision === "declined" ? "passed" : "approved", companyDomain: "acme.com", declineReason: input.declineReason, jobSeekerId: seeker.account.id };
      },
      createNotification: async (userId: number) => { calls.notified.push(userId); },
      getUserEmailById: async () => "seeker@example.com",
      sendEmail: async (input: { to: string }) => { calls.emailed.push(input.to); },
      recordActivity: async (input: { action: string; resourceId?: unknown }) => { calls.activity.push(input); },
      ...overrides,
    });
    return { app, calls };
  }
  const decide = (app: express.Express, linkToken: string, body: Record<string, unknown>, user?: string) => {
    const pending = request(app).post(`/api/referrer-review-links/${linkToken}/decision`);
    return (user ? pending.set("x-test-user", user) : pending).send(body);
  };

  it("answers a blocked pair's email link with the neutral denial, never readiness", async () => {
    const { app, calls } = reviewLinkApp(new Set([601]));
    const response = await request(app).get(`/api/referrer-review-links/${token}`).set("x-test-user", "referrer");
    expect(response.status).toBe(404);
    expect(response.text).toBe(neutralDenial);
    expect(calls.blockLookups).toEqual([[601]]);
    expect(calls.activity).toContainEqual(expect.objectContaining({ action: "company_referral.blocked_denied", resourceId: 601 }));
  });

  it("refuses a blocked pair's accept and pass through the email link with no decision, link use or notice", async () => {
    const { app, calls } = reviewLinkApp(new Set([601]));
    const accept = await decide(app, token, { decision: "approved", ethicsConfirmed: true }, "referrer");
    const pass = await decide(app, token, { decision: "declined", declineReason: "role_not_a_fit" }, "referrer");
    await settle();
    for (const response of [accept, pass]) {
      expect(response.status).toBe(404);
      expect(response.text).toBe(neutralDenial);
    }
    expect(calls.decisions).toEqual([]);
    expect(calls.consumed).toEqual([]);
    expect(calls.notified).toEqual([]);
    expect(calls.emailed).toEqual([]);
    expect(calls.activity.filter(entry => entry.action === "company_referral.blocked_denied")).toHaveLength(2);
    expect(calls.activity.some(entry => entry.action.startsWith("company_referral.email_one_click_"))).toBe(false);
  });

  it("leaves an unblocked email link byte-identical, including its decision, link use and notices", async () => {
    const ready = await request(reviewLinkApp(new Set([602])).app).get(`/api/referrer-review-links/${token}`).set("x-test-user", "referrer");
    expect(ready.status).toBe(200);
    expect(ready.text).toBe(readyBody);
    expect(ready.headers["cache-control"]).toBe("private, no-store");

    const accepted = reviewLinkApp(new Set([602]));
    const accept = await decide(accepted.app, token, { decision: "approved", ethicsConfirmed: true }, "referrer");
    await settle();
    expect(accept.status).toBe(200);
    expect(accept.text).toBe(JSON.stringify({ status: "approved" }));
    expect(accept.headers["cache-control"]).toBe("private, no-store");
    expect(accepted.calls.decisions).toEqual([{ userId: referrer.account.id, requestId: 601, decision: "approved", reviewLinkToken: token }]);
    expect(accepted.calls.consumed).toEqual([token]);
    expect(accepted.calls.notified).toEqual([seeker.account.id]);
    expect(accepted.calls.emailed).toEqual(["seeker@example.com"]);

    const passed = reviewLinkApp(new Set([602]));
    const pass = await decide(passed.app, token, { decision: "declined", declineReason: "role_not_a_fit" }, "referrer");
    expect(pass.status).toBe(200);
    expect(pass.text).toBe(JSON.stringify({ status: "passed", declineReason: "role_not_a_fit" }));
    expect(passed.calls.decisions).toEqual([{ userId: referrer.account.id, requestId: 601, decision: "declined", reviewLinkToken: token }]);
  });

  it("keeps unauthenticated, malformed and foreign links exactly as before, without a block lookup", async () => {
    const { app, calls } = reviewLinkApp(new Set([601]));
    const anonymousReady = await request(app).get(`/api/referrer-review-links/${token}`);
    const anonymousDecision = await decide(app, token, { decision: "approved" });
    for (const response of [anonymousReady, anonymousDecision]) {
      expect(response.status).toBe(401);
      expect(response.text).toBe(signInFirst);
    }
    const malformedReady = await request(app).get("/api/referrer-review-links/not-a-token").set("x-test-user", "referrer");
    expect(malformedReady.status).toBe(400);
    expect(malformedReady.text).toBe(JSON.stringify({ error: "This private review link is invalid" }));
    const malformedDecision = await decide(app, "not-a-token", { decision: "approved" }, "referrer");
    expect(malformedDecision.status).toBe(400);
    expect(malformedDecision.text).toBe(JSON.stringify({ error: "This private review action is invalid" }));
    // Someone else's link, and the intended referrer's link opened from another account.
    const foreign = [
      await request(app).get(`/api/referrer-review-links/${foreignToken}`).set("x-test-user", "referrer"),
      await decide(app, foreignToken, { decision: "approved" }, "referrer"),
      await request(app).get(`/api/referrer-review-links/${token}`).set("x-test-user", "seeker"),
      await decide(app, token, { decision: "declined", declineReason: "timing" }, "seeker"),
    ];
    for (const response of foreign) {
      expect(response.status).toBe(409);
      expect(response.text).toBe(unavailableLink);
    }
    expect(calls.blockLookups).toEqual([]);
    expect(calls.decisions).toEqual([]);
    expect(calls.consumed).toEqual([]);
  });

  it("keeps today's behaviour when the block lookup itself fails", async () => {
    const failing = { getBlockedReferralRequestIds: async () => { throw new Error("userBlocks missing"); } };
    const ready = await request(reviewLinkApp(new Set([601]), failing).app).get(`/api/referrer-review-links/${token}`).set("x-test-user", "referrer");
    expect(ready.status).toBe(200);
    expect(ready.text).toBe(readyBody);
    const { app, calls } = reviewLinkApp(new Set([601]), failing);
    const accept = await decide(app, token, { decision: "approved", ethicsConfirmed: true }, "referrer");
    expect(accept.status).toBe(200);
    expect(accept.text).toBe(JSON.stringify({ status: "approved" }));
    expect(calls.decisions).toHaveLength(1);
    expect(calls.consumed).toEqual([token]);
  });
});

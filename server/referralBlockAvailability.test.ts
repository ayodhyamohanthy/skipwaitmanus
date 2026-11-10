import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { BlockCheckUnavailableError, registerBlocksRoutes } from "./blocksRoutes";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

/*
 * P0-referral-access-availability: when the block/authorization decision cannot
 * be established (the block lookup fails), private referral access stays
 * unavailable. The surface answers a truthful unavailable response: 503,
 * private no-store, no private content, safe monitoring — never an unsupported
 * "not blocked" result, never the blocked-pair denial.
 */

const UNAVAILABLE = "This private request is unavailable right now";
const REVIEW_LINK_UNAVAILABLE = "This private review link is unavailable";
const seeker = { account: { id: 11, openId: "workos-seeker" } };
const referrer = { account: { id: 22, openId: "workos-referrer" } };

const failingLookup = async (): Promise<Set<number>> => { throw new Error("userBlocks missing"); };
const workingLookup = (blocked: Set<number>) => async (_userId: number, ids: number[]) => new Set(ids.filter(id => blocked.has(id)));

function appFor(blockLookup: typeof failingLookup | Set<number>, overrides: Record<string, unknown> = {}) {
  const getBlockedReferralRequestIds = blockLookup instanceof Set ? workingLookup(blockLookup) : blockLookup;
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") === "referrer" ? referrer : req.header("x-test-user") === "seeker" ? seeker : undefined),
    dataUrlToBuffer: () => Buffer.from("pdf"),
    sanitizeDocumentName: value => value,
    storagePut: async () => ({ key: "private/resume.pdf" }),
    storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }),
    getAccessibleReferralAttachment: async () => ({ id: 1, ownerId: seeker.account.id, referralRequestId: 601, fileName: "resume.pdf", mimeType: "application/pdf" }),
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
    createCompanyReferralRequest: async () => ({ requestId: 601, companyDomain: "acme.com", notifiedEmployees: 1 }),
    listCompanyReferralInbox: async () => [{ id: 601 }, { id: 602 }],
    listCompanyReferralInboxByState: async () => [{ id: 601 }, { id: 602 }],
    listJobSeekerCompanyReferrals: async () => [{ id: 601, referrerId: 22 }, { id: 602, referrerId: null }],
    getUnclaimedCompanyReferralPreview: async () => ({ id: 601, attachments: [] }),
    getClaimedCompanyReferralDetail: async () => ({ id: 601, attachments: [], status: "pending" }),
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
    getBlockedReferralRequestIds,
    recordActivity: async () => undefined,
    ...overrides,
  } as Parameters<typeof registerPrivateReferralRoutes>[1]);
  return app;
}

describe("truthful unavailable when the authorization decision cannot be established", () => {
  it("answers mine with 503 private no-store and no private content", async () => {
    const activity: Array<{ action: string; outcome?: string }> = [];
    const app = appFor(failingLookup, { recordActivity: async (input: { action: string; outcome?: string }) => void activity.push(input) });
    const mine = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(mine.status).toBe(503);
    expect(mine.body).toEqual({ error: UNAVAILABLE });
    expect(mine.headers["cache-control"]).toBe("private, no-store");
    const body = JSON.stringify(mine.body);
    expect(body).not.toMatch(/601|602|acme\.com|resume\.pdf/);
    expect(activity.some(entry => entry.action === "company_referral.block_check_unavailable" && entry.outcome === "failure")).toBe(true);
    expect(activity.some(entry => entry.action === "company_referral.blocked_denied")).toBe(false);
  });

  it("answers the referrer inbox with 503 and no private content", async () => {
    const app = appFor(failingLookup);
    const inbox = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "referrer");
    expect(inbox.status).toBe(503);
    expect(inbox.body).toEqual({ error: UNAVAILABLE });
    expect(inbox.headers["cache-control"]).toBe("private, no-store");
    expect(JSON.stringify(inbox.body)).not.toMatch(/601|602/);
  });

  it("answers claimed detail, preview, conversation GET and conversation POST with 503", async () => {
    const app = appFor(failingLookup);
    const detail = await request(app).get("/api/company-referrals/601").set("x-test-user", "seeker");
    expect(detail.status).toBe(503);
    expect(detail.body).toEqual({ error: UNAVAILABLE });
    const preview = await request(app).get("/api/company-referrals/601/preview").set("x-test-user", "referrer");
    expect(preview.status).toBe(503);
    expect(preview.body).toEqual({ error: UNAVAILABLE });
    const conversation = await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "seeker");
    expect(conversation.status).toBe(503);
    expect(conversation.body).toEqual({ error: UNAVAILABLE });
    const sent = await request(app).post("/api/company-referrals/601/conversation").set("x-test-user", "seeker").send({ body: "hi" });
    expect(sent.status).toBe(503);
    expect(sent.body).toEqual({ error: UNAVAILABLE });
  });

  it("answers claim, review and progress with 503 and no state change", async () => {
    const decisions: string[] = [];
    const app = appFor(failingLookup, {
      claimCompanyReferralRequest: async () => { decisions.push("claim"); return { requestId: 601, claimed: true }; },
      reviewReferralRequest: async () => { decisions.push("review"); return { status: "approved" }; },
      updateReferralProgress: async () => { decisions.push("progress"); return { status: "intro_made" as const, changed: true }; },
    });
    const claim = await request(app).post("/api/company-referrals/601/claim").set("x-test-user", "referrer");
    expect(claim.status).toBe(503);
    expect(claim.body).toEqual({ error: UNAVAILABLE });
    const review = await request(app).post("/api/company-referrals/601/review").set("x-test-user", "referrer").send({ decision: "approved" });
    expect(review.status).toBe(503);
    expect(review.body).toEqual({ error: UNAVAILABLE });
    const progress = await request(app).post("/api/company-referrals/601/progress").set("x-test-user", "referrer").send({ status: "intro_made" });
    expect(progress.status).toBe(503);
    expect(progress.body).toEqual({ error: UNAVAILABLE });
    expect(decisions).toEqual([]);
  });

  it("answers the document surface with 503, never a file", async () => {
    const app = appFor(failingLookup);
    const file = await request(app).get("/api/documents/1").set("x-test-user", "referrer");
    expect(file.status).toBe(503);
    expect(file.body).toEqual({ error: UNAVAILABLE });
    expect(file.headers["content-disposition"]).toBeUndefined();
    expect(file.headers.location).toBeUndefined();
  });

  it("refuses the private email review link with 503 and no decision, link use or notice", async () => {
    const token = "a".repeat(48);
    const calls = { decisions: [] as string[], consumed: [] as string[], notified: [] as number[] };
    const app = appFor(failingLookup, {
      resolveReferrerReviewEmailLink: async () => ({ requestId: 601 }),
      consumeReferrerReviewEmailLink: async () => { calls.consumed.push(token); },
      oneClickReviewReferralRequest: async () => { calls.decisions.push("approve"); return { status: "approved", companyDomain: "acme.com", jobSeekerId: seeker.account.id }; },
      createNotification: async (userId: number) => { calls.notified.push(userId); },
    });
    const ready = await request(app).get(`/api/referrer-review-links/${token}`).set("x-test-user", "referrer");
    expect(ready.status).toBe(503);
    expect(ready.text).toBe(JSON.stringify({ error: UNAVAILABLE }));
    const accept = await request(app).post(`/api/referrer-review-links/${token}/decision`).set("x-test-user", "referrer").send({ decision: "approved", ethicsConfirmed: true });
    expect(accept.status).toBe(503);
    expect(accept.text).toBe(JSON.stringify({ error: UNAVAILABLE }));
    expect(calls).toEqual({ decisions: [], consumed: [], notified: [] });
  });

  it("keeps withdraw available because the seeker's own exit never consults the block check", async () => {
    const app = appFor(failingLookup);
    const withdraw = await request(app).post("/api/company-referrals/601/withdraw").set("x-test-user", "seeker");
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.withdrawn).toBe(true);
  });

  it("authorized control: a passing block check serves the lists", async () => {
    const app = appFor(new Set([601]));
    const mine = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(mine.status).toBe(200);
    expect(mine.body.requests.map((row: { id: number }) => row.id)).toEqual([602]);
  });

  it("denied control: a blocked pair still gets the neutral 404", async () => {
    const app = appFor(new Set([601]));
    expect((await request(app).get("/api/company-referrals/601").set("x-test-user", "seeker")).status).toBe(404);
  });

  it("empty control: an empty list serves an empty list, not an error", async () => {
    const app = appFor(new Set(), { listJobSeekerCompanyReferrals: async () => [] });
    const mine = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(mine.status).toBe(200);
    expect(mine.body.requests).toEqual([]);
  });

  it("intentionally skipped control: an invalid id answers 400 and never consults the block check", async () => {
    const lookups: number[][] = [];
    const app = appFor(async (_userId: number, ids: number[]) => { lookups.push(ids); return new Set<number>(); });
    expect((await request(app).get("/api/company-referrals/abc").set("x-test-user", "seeker")).status).toBe(400);
    expect(lookups).toEqual([]);
  });
});

describe("blocks routes answer truthful unavailable", () => {
  function blocksApp(overrides: Partial<Parameters<typeof registerBlocksRoutes>[1]> = {}) {
    const app = express();
    app.use(express.json());
    registerBlocksRoutes(app, {
      resolveIdentity: async (req: express.Request) => (req.header("x-test-user") === "seeker" ? { account: { id: 11, openId: "workos-seeker" } } : undefined),
      recordActivity: async () => undefined,
      ...overrides,
    });
    return app;
  }

  it("answers /api/blocks/mine with 503 private no-store when the list cannot be established", async () => {
    const app = blocksApp({ listBlocks: async () => { throw new BlockCheckUnavailableError(); } });
    const mine = await request(app).get("/api/blocks/mine").set("x-test-user", "seeker");
    expect(mine.status).toBe(503);
    expect(mine.body).toEqual({ error: "Blocking is temporarily unavailable" });
    expect(mine.headers["cache-control"]).toBe("private, no-store");
    expect(mine.body.blocks).toBeUndefined();
  });

  it("answers POST /api/blocks with 503 when the block cannot be stored", async () => {
    const app = blocksApp({ blockUser: async () => { throw new BlockCheckUnavailableError(); } });
    const blocked = await request(app).post("/api/blocks").set("x-test-user", "seeker").send({ blockedUserId: 42 });
    expect(blocked.status).toBe(503);
    expect(blocked.body).toEqual({ error: "Blocking is temporarily unavailable" });
  });

  it("answers DELETE /api/blocks/:id with 503 when the block cannot be removed", async () => {
    const app = blocksApp({ unblockUser: async () => { throw new BlockCheckUnavailableError(); } });
    const removed = await request(app).delete("/api/blocks/7").set("x-test-user", "seeker");
    expect(removed.status).toBe(503);
    expect(removed.body).toEqual({ error: "Blocking is temporarily unavailable" });
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const identity = { account: { id: 42, openId: "workos_referrer" }, primaryEmail: { emailAddress: "referrer@example.com" } };

function baseDeps(overrides: Partial<PrivateReferralRouteDeps> = {}): PrivateReferralRouteDeps {
  return {
    resolveIdentity: async () => identity,
    dataUrlToBuffer: () => Buffer.alloc(0),
    sanitizeDocumentName: (fileName: string) => fileName,
    storagePut: async () => ({ key: "test-key" }),
    storageGetSignedUrl: async () => "https://signed.test/key",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 1 }),
    createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 1 }),
    listCompanyReferralInbox: async () => [],
    claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }),
    getClaimedCompanyReferralDetail: async () => undefined,
    listPublicCompanyOpportunities: async () => [],
    publishCompanyOpportunity: async () => ({}),
    ...overrides,
  };
}

function buildApp(deps: PrivateReferralRouteDeps) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, deps);
  return app;
}

describe("conversation rate limit", () => {
  it("returns 429 when the sender already has 30 or more messages in the last hour", async () => {
    let seenSince: Date | undefined;
    const app = buildApp(baseDeps({ countRecentMessagesBySender: async (userId, since) => { expect(userId).toBe(42); seenSince = since; return 30; } }));
    const response = await request(app).post("/api/company-referrals/7/conversation").send({ body: "hello" });
    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/too quickly/i);
    expect(seenSince?.getTime()).toBeLessThanOrEqual(Date.now() - 60 * 60 * 1000);
  });

  it("passes through to the send handler when the sender is under the limit", async () => {
    const sent: Array<{ userId: number; requestId: number; body: string }> = [];
    const app = buildApp(baseDeps({
      countRecentMessagesBySender: async () => 29,
      sendReferralConversationMessage: async (userId, requestId, body) => { sent.push({ userId, requestId, body }); return { id: 11 }; },
    }));
    const response = await request(app).post("/api/company-referrals/7/conversation").send({ body: "hello" });
    expect(response.status).toBe(201);
    expect(sent).toEqual([{ userId: 42, requestId: 7, body: "hello" }]);
  });

  it("does not block when the rate limit dep is not wired", async () => {
    const app = buildApp(baseDeps({ sendReferralConversationMessage: async () => ({ id: 11 }) }));
    const response = await request(app).post("/api/company-referrals/7/conversation").send({ body: "hello" });
    expect(response.status).toBe(201);
    expect(response.status).not.toBe(429);
  });
});

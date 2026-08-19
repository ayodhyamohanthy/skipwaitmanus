import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authorizeApprovedReferralConversation } from "./db";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("approved referral conversation authorization", () => {
  it("allows only the Job Seeker and accepted Referrer, with the other participant as recipient", () => {
    const accepted = { jobSeekerId: 11, referrerId: 22, status: "approved" };
    expect(authorizeApprovedReferralConversation(11, accepted)).toMatchObject({ jobSeekerId: 11, referrerId: 22, recipientId: 22 });
    expect(authorizeApprovedReferralConversation(22, accepted)).toMatchObject({ jobSeekerId: 11, referrerId: 22, recipientId: 11 });
    expect(() => authorizeApprovedReferralConversation(33, accepted)).toThrow(/not available to you/i);
  });

  it("rejects a claimed-but-pending request and every non-approved decision", () => {
    expect(() => authorizeApprovedReferralConversation(11, { jobSeekerId: 11, referrerId: 22, status: "pending" })).toThrow(/only available after the referral is accepted/i);
    expect(() => authorizeApprovedReferralConversation(22, { jobSeekerId: 11, referrerId: 22, status: "declined" })).toThrow(/only available after the referral is accepted/i);
    expect(() => authorizeApprovedReferralConversation(11, undefined)).toThrow(/not available to you/i);
  });
});

describe("approved referral conversation HTTP routes", () => {
  it("does not disclose messages before approval or to outsiders, then persists a request-scoped partner message after approval", async () => {
    const app = express();
    app.use(express.json());
    const identities = new Map([
      ["seeker", { account: { id: 11, openId: "clerk-seeker" } }],
      ["referrer", { account: { id: 22, openId: "clerk-referrer" } }],
      ["outsider", { account: { id: 33, openId: "clerk-outsider" } }],
    ]);
    const acceptedRequest = { jobSeekerId: 11, referrerId: 22, status: "pending" };
    const stored = [{ id: 1, body: "Thanks for reviewing this.", createdAt: new Date("2026-08-19T09:00:00.000Z"), senderId: 11 }];
    const activity: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
    const conversationMessages = async (userId: number, requestId: number) => {
      if (requestId !== 601) throw new Error("This conversation is not available to you");
      authorizeApprovedReferralConversation(userId, acceptedRequest);
      return stored.map(message => ({ id: message.id, body: message.body, createdAt: message.createdAt, isMine: message.senderId === userId }));
    };
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 601, companyDomain: "acme.com", notifiedEmployees: 1 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 601, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      listReferralConversation: conversationMessages,
      sendReferralConversationMessage: async (userId, requestId, body) => {
        const { recipientId } = authorizeApprovedReferralConversation(userId, requestId === 601 ? acceptedRequest : undefined);
        stored.push({ id: stored.length + 1, body, createdAt: new Date("2026-08-19T09:01:00.000Z"), senderId: userId });
        expect(recipientId).toBe(userId === 11 ? 22 : 11);
        return { id: stored.length };
      },
      recordActivity: async input => { activity.push(input); },
    });

    expect((await request(app).get("/api/company-referrals/601/conversation")).status).toBe(401);
    const preApproval = await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "seeker");
    expect(preApproval.status).toBe(409);
    expect(preApproval.body.error).toMatch(/only available after the referral is accepted/i);

    acceptedRequest.status = "approved";
    expect((await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "outsider")).status).toBe(403);
    const seekerMessages = await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "seeker");
    expect(seekerMessages.status).toBe(200);
    expect(seekerMessages.headers["cache-control"]).toBe("private, no-store");
    expect(seekerMessages.body.messages).toEqual([expect.objectContaining({ id: 1, body: "Thanks for reviewing this.", isMine: true })]);
    expect(seekerMessages.body.messages[0]).not.toHaveProperty("senderId");
    expect(seekerMessages.body.messages[0]).not.toHaveProperty("recipientId");

    const sent = await request(app).post("/api/company-referrals/601/conversation").set("x-test-user", "referrer").send({ body: "I can take the next step." });
    expect(sent.status).toBe(201);
    expect((await request(app).post("/api/company-referrals/601/conversation").set("x-test-user", "seeker").send({ body: "   " })).status).toBe(400);
    const seekerAfterReply = await request(app).get("/api/company-referrals/601/conversation").set("x-test-user", "seeker");
    expect(seekerAfterReply.body.messages[1]).toMatchObject({ body: "I can take the next step.", isMine: false });
    expect(activity.map(item => item.action)).toEqual(expect.arrayContaining(["company_referral.conversation_viewed", "company_referral.conversation_message_sent"]));
    expect(JSON.stringify(activity)).not.toContain("I can take the next step.");
  });
});

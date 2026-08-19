import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("private notification routes", () => {
  it("returns only the signed-in account’s safe display fields and marks only that account’s notification as read", async () => {
    const app = express(); app.use(express.json());
    const readCalls: Array<{ userId: number; notificationId: number }> = [];
    const activity: Array<{ actorUserId?: number; action: string }> = [];
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "member" ? { account: { id: 41, openId: "clerk-member" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }),
      listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      listNotifications: async userId => userId === 41 ? [{ id: 99, category: "message", title: "New private referral message", body: "You have a new message in an accepted referral request.", readAt: null, createdAt: new Date("2026-08-19T09:00:00.000Z") }] : [],
      markNotificationRead: async (userId, notificationId) => { readCalls.push({ userId, notificationId }); return { success: true }; },
      recordActivity: async entry => { activity.push(entry); },
    });

    expect((await request(app).get("/api/notifications")).status).toBe(401);
    const listed = await request(app).get("/api/notifications").set("x-test-user", "member");
    expect(listed.status).toBe(200); expect(listed.headers["cache-control"]).toContain("private");
    expect(listed.body.notifications).toEqual([{ id: 99, category: "message", title: "New private referral message", body: "You have a new message in an accepted referral request.", readAt: null, createdAt: "2026-08-19T09:00:00.000Z" }]);
    expect(listed.body.notifications[0]).not.toHaveProperty("userId");
    expect((await request(app).post("/api/notifications/invalid/read").set("x-test-user", "member")).status).toBe(400);
    expect((await request(app).post("/api/notifications/99/read").set("x-test-user", "member")).status).toBe(200);
    expect(readCalls).toEqual([{ userId: 41, notificationId: 99 }]);
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: 41, action: "notification.read" }));
  });
});

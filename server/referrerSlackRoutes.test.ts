import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

const validWebhook = "https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXX";

function buildApp(overrides: Record<string, unknown> = {}) {
  const app = express(); app.use(express.json());
  const activity: Array<{ actorUserId?: number; action: string; metadata?: Record<string, unknown> }> = [];
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => req.header("x-test-user") === "member" ? { account: { id: 77, openId: "clerk-referrer" } } : undefined,
    dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
    storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }),
    listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
    listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    recordActivity: async entry => { activity.push(entry); },
    ...overrides,
  });
  return { app, activity };
}

describe("opt-in Slack triage webhook management routes", () => {
  it("rejects unauthenticated access and invalid webhook URLs without storing anything", async () => {
    const saved: string[] = [];
    const { app } = buildApp({ saveReferrerSlackWebhook: async (_userId: number, url: string) => { saved.push(url); return { connected: true }; } });
    expect((await request(app).put("/api/referrer/slack-webhook").send({ webhookUrl: validWebhook })).status).toBe(401);
    const denied = await request(app).put("/api/referrer/slack-webhook").set("x-test-user", "member").send({ webhookUrl: "https://evil.example/hook" });
    expect(denied.status).toBe(400);
    expect(saved).toEqual([]);
  });

  it("connects, reports status without exposing the stored URL, and disconnects", async () => {
    const saved: string[] = [];
    const { app, activity } = buildApp({
      saveReferrerSlackWebhook: async (_userId: number, url: string) => { saved.push(url); return { connected: true }; },
      getReferrerSlackWebhookStatus: async () => ({ connected: true, active: true, updatedAt: new Date("2026-08-30T02:00:00.000Z") }),
      deactivateReferrerSlackWebhook: async () => ({ deactivated: true }),
    });
    const connected = await request(app).put("/api/referrer/slack-webhook").set("x-test-user", "member").send({ webhookUrl: ` ${validWebhook} ` });
    expect(connected.status).toBe(200); expect(connected.body).toEqual({ connected: true });
    expect(saved).toEqual([validWebhook]);
    const status = await request(app).get("/api/referrer/slack-webhook").set("x-test-user", "member");
    expect(status.status).toBe(200); expect(status.body).toEqual({ connected: true, active: true });
    expect(JSON.stringify(status.body)).not.toContain("hooks.slack.com/services");
    const disconnected = await request(app).delete("/api/referrer/slack-webhook").set("x-test-user", "member");
    expect(disconnected.status).toBe(200); expect(disconnected.body).toEqual({ connected: false });
    expect(activity).toContainEqual(expect.objectContaining({ action: "slack_webhook.saved" }));
    expect(activity).toContainEqual(expect.objectContaining({ action: "slack_webhook.disconnected" }));
  });

  it("returns 503 when storage is unavailable instead of pretending success", async () => {
    const { app } = buildApp({});
    const response = await request(app).put("/api/referrer/slack-webhook").set("x-test-user", "member").send({ webhookUrl: validWebhook });
    expect(response.status).toBe(503);
  });
});

describe("Slack dispatch alongside email review notifications", () => {
  it("delivers the same single-use review link to opted-in referrer webhooks without touching email behavior", async () => {
    const deliveries: Array<{ to: string; reviewUrl: string }> = [];
    const emailSends: Array<{ to: string }> = [];
    const { app, activity } = buildApp({
      createCompanyReferralRequest: async () => ({ requestId: 9, companyDomain: "acme.com", notifiedEmployees: 1 }),
      prepareReferrerReviewEmailNotifications: async () => [{ referrerId: 77, email: "ref@acme.com", linkToken: "T".repeat(40), companyDomain: "acme.com" }],
      sendReferrerReviewEmail: async input => { emailSends.push({ to: input.to }); return { sent: true, reason: "sent" }; },
      getActiveReferrerSlackWebhooks: async () => [{ referrerId: 77, webhookUrl: validWebhook }],
      sendReferrerSlackDelivery: async input => { deliveries.push({ to: input.to, reviewUrl: input.reviewUrl }); return { sent: true, reason: "sent" }; },
    });
    const created = await request(app).post("/api/company-referrals").set("x-test-user", "member").send({ targetRoleUrl: "https://jobs.acme.com/roles/123", attachmentIds: [1] });
    expect(created.status).toBe(201);
    expect(emailSends).toEqual([{ to: "ref@acme.com" }]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].to).toBe(validWebhook);
    expect(deliveries[0].reviewUrl).toContain("/email-review/");
    expect(deliveries[0].reviewUrl.endsWith("/email-review/" + "T".repeat(40))).toBe(true);
    const slackRecord = activity.find(entry => entry.action === "company_referral.review_slack_dispatched");
    expect(slackRecord).toBeTruthy();
    expect(slackRecord?.metadata).toMatchObject({ intendedRecipientCount: 1, sentCount: 1 });
  });

  it("does not dispatch Slack when no review links exist and still records a truthful outcome", async () => {
    const deliveries: Array<unknown> = [];
    const { app, activity } = buildApp({
      createCompanyReferralRequest: async () => ({ requestId: 9, companyDomain: "acme.com", notifiedEmployees: 0 }),
      prepareReferrerReviewEmailNotifications: async () => [],
      getActiveReferrerSlackWebhooks: async () => { throw new Error("must not be called"); },
      sendReferrerSlackDelivery: async () => { deliveries.push({}); return { sent: true, reason: "sent" }; },
    });
    const created = await request(app).post("/api/company-referrals").set("x-test-user", "member").send({ targetRoleUrl: "https://jobs.acme.com/roles/123", attachmentIds: [1] });
    expect(created.status).toBe(201);
    expect(deliveries).toEqual([]);
    expect(activity.find(entry => entry.action === "company_referral.review_slack_dispatched")).toBeUndefined();
  });

  it("keeps request creation successful when Slack delivery fails", async () => {
    const { app, activity } = buildApp({
      createCompanyReferralRequest: async () => ({ requestId: 9, companyDomain: "acme.com", notifiedEmployees: 1 }),
      prepareReferrerReviewEmailNotifications: async () => [{ referrerId: 77, email: "ref@acme.com", linkToken: "T".repeat(40), companyDomain: "acme.com" }],
      sendReferrerReviewEmail: async () => ({ sent: true, reason: "sent" }),
      getActiveReferrerSlackWebhooks: async () => [{ referrerId: 77, webhookUrl: validWebhook }],
      sendReferrerSlackDelivery: async () => { throw new Error("slack down"); },
    });
    const created = await request(app).post("/api/company-referrals").set("x-test-user", "member").send({ targetRoleUrl: "https://jobs.acme.com/roles/123", attachmentIds: [1] });
    expect(created.status).toBe(201);
    const slackRecord = activity.find(entry => entry.action === "company_referral.review_slack_dispatched");
    expect(slackRecord?.outcome).toBe("failure");
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const identity = { account: { id: 7, openId: "workos_referrer" }, primaryEmail: { emailAddress: "referrer@example.com" } };

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
    claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true, jobSeekerId: 42, companyDomain: "acme.com" }),
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

async function flushMicrotasks() { await new Promise(resolve => setImmediate(resolve)); }

describe("referral status email + in-app notifications", () => {
  it("sends a claim email to the seeker and records a status notification", async () => {
    const emails: Array<{ to: string; subject: string; html: string }> = [];
    const notifications: Array<{ userId: number; category: string; title: string; body: string }> = [];
    const app = buildApp(baseDeps({
      getUserEmailById: async userId => (userId === 42 ? "seeker@example.com" : null),
      sendEmail: async input => { emails.push(input); return { sent: true }; },
      createNotification: async (userId, category, title, body) => { notifications.push({ userId, category, title, body }); },
    }));
    const response = await request(app).post("/api/company-referrals/9/claim").send();
    await flushMicrotasks();
    expect(response.status).toBe(200);
    expect(response.body.claimed).toBe(true);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("seeker@example.com");
    expect(emails[0].subject).toContain("acme.com");
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ userId: 42, category: "status", title: "Your referral request was claimed" });
  });

  it("notifies the seeker on a one-click decline without leaking the decline reason", async () => {
    const emails: Array<{ to: string; subject: string; html: string }> = [];
    const notifications: Array<{ userId: number; category: string; title: string }> = [];
    const app = buildApp(baseDeps({
      oneClickReviewReferralRequest: async () => ({ status: "declined", companyDomain: "acme.com", jobSeekerId: 42, declineReason: "role_not_a_fit" }),
      getUserEmailById: async () => "seeker@example.com",
      sendEmail: async input => { emails.push(input); return { sent: true }; },
      createNotification: async (userId, category, title) => { notifications.push({ userId, category, title }); },
    }));
    const response = await request(app).post("/api/company-referrals/9/one-click-review").send({ decision: "declined", declineReason: "role_not_a_fit" });
    await flushMicrotasks();
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("declined");
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toContain("Update on your referral request");
    expect(emails[0].subject).toContain("acme.com");
    expect(emails[0].html).not.toContain("role_not_a_fit");
    expect(emails[0].html).toContain("remains visible to other verified employees");
    expect(notifications[0].title).toContain("Update on your referral request");
  });

  it("notifies the seeker on a one-click approval", async () => {
    const emails: Array<{ to: string; subject: string }> = [];
    const notifications: Array<{ title: string }> = [];
    const app = buildApp(baseDeps({
      oneClickReviewReferralRequest: async () => ({ status: "approved", companyDomain: "acme.com", jobSeekerId: 42 }),
      getUserEmailById: async () => "seeker@example.com",
      sendEmail: async input => { emails.push(input); return { sent: true }; },
      createNotification: async (_userId, _category, title) => { notifications.push({ title }); },
    }));
    const response = await request(app).post("/api/company-referrals/9/one-click-review").send({ decision: "approved" });
    await flushMicrotasks();
    expect(response.status).toBe(200);
    expect(emails[0].subject).toContain("Your referral was accepted");
    expect(notifications[0].title).toContain("Your referral request was accepted at acme.com");
  });

  it("keeps the route successful when the email dep throws (fire-and-forget isolation)", async () => {
    let sendAttempts = 0;
    const app = buildApp(baseDeps({
      oneClickReviewReferralRequest: async () => ({ status: "approved", companyDomain: "acme.com", jobSeekerId: 42 }),
      getUserEmailById: async () => "seeker@example.com",
      sendEmail: async () => { sendAttempts += 1; throw new Error("smtp down"); },
      createNotification: async () => { throw new Error("db down"); },
    }));
    const response = await request(app).post("/api/company-referrals/9/one-click-review").send({ decision: "approved" });
    await flushMicrotasks();
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("approved");
    expect(sendAttempts).toBe(1);
  });
});

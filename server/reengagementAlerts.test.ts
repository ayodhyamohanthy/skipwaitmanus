import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";
import { createSlotOpenedAlertEmailSender } from "./slotOpenedAlertEmail";

describe("private Slot Opened alerts and aggregate impact", () => {
  afterEach(() => { delete process.env.RESEND_API_KEY; delete process.env.ERROR_ALERT_FROM_EMAIL; });

  function appFor(input: { senderFails?: boolean } = {}) {
    const app = express(); app.use(express.json());
    const recipientLookup = vi.fn(async (referrerId: number, requestIds: number[]) => {
      expect(referrerId).toBe(21); expect(requestIds).toEqual([81]);
      return [{ requestId: 81, jobSeekerId: 9, email: "seeker@example.com", companyDomain: "acme.com" }];
    });
    const sent: Array<{ to: string; companyDomain: string; requestsUrl: string }> = [];
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => String(req.header("x-test-user")) === "employee" ? { account: { id: 21, openId: "employee" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value, storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 81, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 81, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      openCompanyReferralAvailability: async () => ({ companyDomain: "acme.com", requestedSlotCount: 1, allocatedRequestIds: [81], allocatedCount: 1 }),
      getSlotOpenedAlertRecipients: recipientLookup,
      sendSlotOpenedAlertEmail: async delivery => { sent.push(delivery); if (input.senderFails) throw new Error("mail unavailable"); return { sent: true, reason: "sent" }; },
      getPublicReferralImpact: async () => ({ acceptedReferrals: 17 }),
    });
    return { app, recipientLookup, sent };
  }

  it("delivers a private Slot Opened alert only to the allocated Job Seeker after exact-company capacity opens", async () => {
    const { app, recipientLookup, sent } = appFor();
    expect((await request(app).post("/api/company-referrals/availability/open").send({ slotCount: 1 })).status).toBe(401);
    const opened = await request(app).post("/api/company-referrals/availability/open").set("x-test-user", "employee").send({ slotCount: 1 });
    expect(opened.status).toBe(200); expect(opened.body.availability).toMatchObject({ companyDomain: "acme.com", allocatedCount: 1, allocatedRequestIds: [81] });
    expect(recipientLookup).toHaveBeenCalledTimes(1); expect(sent).toEqual([{ to: "seeker@example.com", companyDomain: "acme.com", requestsUrl: expect.stringMatching(/\/requests$/) }]);
    expect(JSON.stringify(sent)).not.toMatch(/resume|candidate|queue|rank|employee|hiring/i);
  });

  it("does not roll back a real capacity allocation when email delivery fails", async () => {
    const { app } = appFor({ senderFails: true });
    const opened = await request(app).post("/api/company-referrals/availability/open").set("x-test-user", "employee").send({ slotCount: 1 });
    expect(opened.status).toBe(200); expect(opened.body.availability).toMatchObject({ allocatedCount: 1, allocatedRequestIds: [81] });
  });

  it("returns only a truthful aggregate accepted-referral count from the public impact endpoint", async () => {
    const { app } = appFor();
    const impact = await request(app).get("/api/referral-impact");
    expect(impact.status).toBe(200); expect(impact.body).toEqual({ acceptedReferrals: 17 });
    expect(JSON.stringify(impact.body)).not.toMatch(/name|company|stripe|sarah|time|queue|request/i);
  });

  it("keeps outbound Slot Opened emails factual and free of private referral content", async () => {
    process.env.RESEND_API_KEY = "test-key"; process.env.ERROR_ALERT_FROM_EMAIL = "noreply@updates.skipwait.me";
    let body = "";
    const sender = createSlotOpenedAlertEmailSender({ fetchImpl: async (_url, init) => { body = String(init?.body || ""); return new Response("{}", { status: 200 }); } });
    await expect(sender({ to: "seeker@example.com", companyDomain: "acme.com", requestsUrl: "https://skipwait.me/requests" })).resolves.toEqual({ sent: true, reason: "sent" });
    expect(body).toContain("acme.com"); expect(body).toContain("does not guarantee"); expect(body).not.toMatch(/resume|candidate|employee identity|queue|rank|sarah|stripe/i);
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("admin referral ledger CSV export", () => {
  it("requires an administrator identity", async () => {
    const app = express();
    app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => undefined,
      dataUrlToBuffer: () => Buffer.from("x"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "k" }), storageGetSignedUrl: async () => "https://signed.example/x",
      createReferralAttachment: async () => ({}) as never, getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }),
      listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }), recordActivity: async () => {},
    });
    const response = await request(app).get("/api/admin/referrals/export.csv");
    expect(response.status).toBe(403);
  });

  it("streams a CSV ledger of referral rows and records the admin export action", async () => {
    const app = express();
    app.use(express.json());
    const activity: Array<Record<string, unknown>> = [];
    const adminIdentity = { account: { id: 9, openId: "admin", role: "admin" }, primaryEmail: { emailAddress: "admin@skipwait.me", verification: { status: "verified" } } };
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => adminIdentity,
      dataUrlToBuffer: () => Buffer.from("x"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "k" }), storageGetSignedUrl: async () => "https://signed.example/x",
      createReferralAttachment: async () => ({}) as never, getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }),
      listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }), recordActivity: async input => { activity.push(input as Record<string, unknown>); },
      listReferralLedger: async () => [{
        id: 12, ref: "Ref-0012", status: "approved", company: "Acme, Inc.", jobTitle: "Designer", jobLocation: "Remote", seekerEmail: "seeker@example.com", referrerEmail: "ref@acme.com", createdAt: new Date("2026-08-01T10:00:00Z"), updatedAt: new Date("2026-08-02T10:00:00Z"),
      }],
    });

    const response = await request(app).get("/api/admin/referrals/export.csv");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["cache-control"]).toContain("no-store");
    const lines = response.text.split("\n");
    expect(lines[0]).toBe('"Ref","Status","Company","Job title","Location","Seeker email","Referrer email","Created","Updated"');
    expect(lines[1]).toContain('"Acme, Inc."');
    expect(lines[1]).toContain('"seeker@example.com"');
    expect(lines[1]).toContain("2026-08-01T10:00:00.000Z");
    expect(activity).toContainEqual(expect.objectContaining({ action: "admin.referral_ledger_exported", outcome: "success", metadata: { rowCount: 1 } }));
  });
});
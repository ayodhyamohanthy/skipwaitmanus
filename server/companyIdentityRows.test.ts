import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CompanyIdentityLookup } from "./companyDirectory";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

// Request, inbox and thread rows carry the directory's display identity so
// every screen reads "Go Neutrinos" / "GN" instead of a raw domain.
const directory: CompanyIdentityLookup = async domains => new Map(domains.filter(domain => domain === "goneutrinos.com").map(domain => [domain, { slug: "go-neutrinos", name: "Go Neutrinos", initials: "GN" }]));
const attachment = { id: 5, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3, fileKey: "private/resume.pdf" };

function setup(lookup: CompanyIdentityLookup = directory) {
  const app = express();
  app.use(express.json());
  const resolveCompanyIdentities = vi.fn(lookup);
  const deps = {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined),
    listJobSeekerCompanyReferrals: async () => [{ id: 11, companyDomain: "goneutrinos.com", status: "pending", createdAt: "2026-10-10T00:00:00.000Z" }, { id: 12, companyDomain: "acme.io", status: "pending", createdAt: "2026-10-10T00:00:00.000Z" }],
    listCompanyReferralInbox: async () => [{ id: 21, companyDomain: "goneutrinos.com", status: "pending" }],
    listCompanyReferralInboxByState: async () => [{ id: 21, companyDomain: "goneutrinos.com", status: "pending" }],
    getVerifiedWorkEmailAccess: async (userId: number) => (userId === 3 ? { workEmailDomain: "goneutrinos.com" } : undefined),
    getUnclaimedCompanyReferralPreview: async () => ({ id: 31, companyDomain: "goneutrinos.com", attachments: [attachment] }),
    getClaimedCompanyReferralDetail: async () => ({ id: 41, companyDomain: "goneutrinos.com", status: "approved", attachments: [attachment] }),
    resolveCompanyIdentities,
  };
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return { app, resolveCompanyIdentities };
}

describe("company identity on referral rows", () => {
  it("names seeker rows from the directory and leaves unknown domains null", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "1");
    expect(response.status).toBe(200);
    expect(response.body.requests.map((row: Record<string, unknown>) => [row.companyDomain, row.companyName, row.companyInitials])).toEqual([["goneutrinos.com", "Go Neutrinos", "GN"], ["acme.io", null, null]]);
  });

  it("names referrer inbox rows, the preview, the claimed detail and the access check", async () => {
    const { app } = setup();
    const inbox = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "3");
    expect(inbox.body.requests[0]).toMatchObject({ id: 21, companyName: "Go Neutrinos", companyInitials: "GN" });
    const preview = await request(app).get("/api/company-referrals/31/preview").set("x-test-user", "3");
    expect(preview.body.request).toMatchObject({ id: 31, companyName: "Go Neutrinos", companyInitials: "GN" });
    // Before acceptance a file is counted, never named (D-019; the name of a resume file carries the seeker's name).
    expect(preview.body.request.attachments[0]).toEqual({ mimeType: "application/pdf", fileSize: 3, availability: "after_claim" });
    const detail = await request(app).get("/api/company-referrals/41").set("x-test-user", "3");
    expect(detail.body.request).toMatchObject({ id: 41, companyName: "Go Neutrinos", companyInitials: "GN" });
    expect(JSON.stringify(detail.body)).not.toContain("private/resume.pdf");
    const access = await request(app).get("/api/company-referrals/access").set("x-test-user", "3");
    expect(access.body).toEqual({ verifiedCompanyAccess: true, workEmailDomain: "goneutrinos.com", companyName: "Go Neutrinos", companyInitials: "GN" });
  });

  it("never fails a list because the directory lookup failed", async () => {
    const { app } = setup(async () => { throw new Error("directory down"); });
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "1");
    expect(response.status).toBe(200);
    expect(response.body.requests.map((row: Record<string, unknown>) => row.companyName)).toEqual([null, null]);
  });

  it("does not look anything up for an anonymous caller", async () => {
    const { app, resolveCompanyIdentities } = setup();
    expect((await request(app).get("/api/company-referrals/mine")).status).toBe(401);
    expect((await request(app).get("/api/company-referrals/access")).status).toBe(401);
    expect(resolveCompanyIdentities).not.toHaveBeenCalled();
  });
});

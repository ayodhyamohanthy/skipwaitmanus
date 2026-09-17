import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const identity = { account: { id: 7, openId: "workos_seeker" }, primaryEmail: { emailAddress: "seeker@example.com" } };

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
    listJobs: async () => [],
    listSavedRoles: async () => [],
    setSavedRole: async (_userId,_jobId,saved) => ({ saved }),
    ...overrides,
  };
}

function buildApp(deps: PrivateReferralRouteDeps) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, deps);
  return app;
}

describe("job explorer routes", () => {
  it("serves /api/jobs publicly, passes query/location through, and caps results at 50", async () => {
    const seen: Array<{ query?: string; location?: string }> = [];
    const app = buildApp(baseDeps({ listJobs: async input => { seen.push(input); return Array.from({ length: 55 }, (_, index) => ({ id: index + 1 })); } }));
    const response = await request(app).get("/api/jobs?query=designer&location=Bengaluru");
    expect(response.status).toBe(200);
    expect(seen[0]).toEqual({ query: "designer", location: "Bengaluru" });
    expect(response.body.jobs).toHaveLength(50);
  });

  it("never exposes private referral target rows from /api/jobs", async () => {
    const app = buildApp(baseDeps({ listJobs: async () => [
      { id: 1, title: "Product Designer", description: "Public catalog role" },
      { id: 2, title: "Role from shared job link", description: "Private referral request routed from a Target Role URL." },
      { id: 3, title: "Another role", description: "Private referral request routed from a Target Role URL." },
    ] }));
    const response = await request(app).get("/api/jobs");
    expect(response.status).toBe(200);
    expect(response.body.jobs).toEqual([{ id: 1, title: "Product Designer", description: "Public catalog role" }]);
  });

  it("requires sign-in for saved roles and returns the saver's list", async () => {
    const signedOut = buildApp(baseDeps({ resolveIdentity: async () => undefined }));
    expect((await request(signedOut).get("/api/saved-roles")).status).toBe(401);
    const app = buildApp(baseDeps({ listSavedRoles: async userId => (userId === 7 ? [{ jobId: 3, title: "Designer" }] : []) }));
    const response = await request(app).get("/api/saved-roles");
    expect(response.status).toBe(200);
    expect(response.body.saved).toEqual([{ jobId: 3, title: "Designer" }]);
  });

  it("rejects an invalid job id for explicit state with 400", async () => {
    const app = buildApp(baseDeps());
    expect((await request(app).put("/api/saved-roles/abc")).status).toBe(400);
    expect((await request(app).put("/api/saved-roles/0")).status).toBe(400);
    expect((await request(app).put("/api/saved-roles/-4")).status).toBe(400);
  });

  it("requires sign-in and forwards explicit desired state", async () => {
    const signedOut = buildApp(baseDeps({ resolveIdentity: async () => undefined }));
    expect((await request(signedOut).put("/api/saved-roles/5")).status).toBe(401);
    const seen: Array<[number, number, boolean]> = [];
    const app = buildApp(baseDeps({ setSavedRole: async (userId, jobId, saved) => { seen.push([userId, jobId, saved]); return { saved }; } }));
    const response = await request(app).put("/api/saved-roles/5");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ saved: true });
    expect(seen).toEqual([[7, 5, true]]);
  });
});

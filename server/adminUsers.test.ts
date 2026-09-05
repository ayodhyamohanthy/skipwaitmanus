import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const adminIdentity = { account: { id: 1, openId: "workos_admin", role: "admin" as const }, primaryEmail: { emailAddress: "admin@skipwait.me" } };
const userIdentity = { account: { id: 2, openId: "workos_user", role: "user" as const }, primaryEmail: { emailAddress: "user@example.com" } };

function baseDeps(overrides: Partial<PrivateReferralRouteDeps> = {}): PrivateReferralRouteDeps {
  return {
    resolveIdentity: async () => adminIdentity,
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

describe("admin users directory", () => {
  it("lists users for an administrator with the directory payload", async () => {
    const seen: Array<number | undefined> = [];
    const activities: Array<{ action: string; resourceId?: string | number }> = [];
    const app = buildApp(baseDeps({
      listUsersAdmin: async limit => { seen.push(limit); return [{ id: 9, email: "avery@example.com", name: "Avery", role: "user", accountType: "job_seeker", company: null, workEmailVerifiedAt: null, suspended: false, createdAt: new Date() }]; },
      recordActivity: async input => { activities.push({ action: input.action, resourceId: input.resourceId }); },
    }));
    const response = await request(app).get("/api/admin/users?limit=50");
    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0]).toMatchObject({ id: 9, email: "avery@example.com", suspended: false });
    expect(seen).toEqual([50]);
    expect(activities.some(entry => entry.action === "admin.users_viewed")).toBe(true);
  });

  it("rejects a non-admin with 403 on both directory and suspend", async () => {
    const app = buildApp(baseDeps({ resolveIdentity: async () => userIdentity, listUsersAdmin: async () => [{ id: 9 }], setUserSuspended: async () => ({ userId: 9, suspended: true }) }));
    expect((await request(app).get("/api/admin/users")).status).toBe(403);
    expect((await request(app).post("/api/admin/users/9/suspend").send({ suspended: true })).status).toBe(403);
  });

  it("suspends a user, records admin.user_suspended, and returns the updated user", async () => {
    const seen: Array<[number, boolean]> = [];
    const activities: Array<{ action: string; resourceId?: string | number; metadata?: Record<string, unknown> }> = [];
    const app = buildApp(baseDeps({
      setUserSuspended: async (userId, suspended) => { seen.push([userId, suspended]); return { userId, suspended }; },
      recordActivity: async input => { activities.push({ action: input.action, resourceId: input.resourceId, metadata: input.metadata }); },
    }));
    const response = await request(app).post("/api/admin/users/9/suspend").send({ suspended: true, note: "payment fraud review" });
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ userId: 9, suspended: true });
    expect(seen).toEqual([[9, true]]);
    expect(activities[0]).toMatchObject({ action: "admin.user_suspended", resourceId: 9, metadata: { note: "payment fraud review" } });
  });

  it("unsuspends likewise and records admin.user_unsuspended", async () => {
    const activities: Array<{ action: string }> = [];
    const app = buildApp(baseDeps({
      setUserSuspended: async (userId, suspended) => ({ userId, suspended }),
      recordActivity: async input => { activities.push({ action: input.action }); },
    }));
    const response = await request(app).post("/api/admin/users/9/suspend").send({ suspended: false });
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ userId: 9, suspended: false });
    expect(activities[0]?.action).toBe("admin.user_unsuspended");
  });

  it("validates the payload and guards an admin from self-suspending", async () => {
    const app = buildApp(baseDeps({ setUserSuspended: async () => ({ userId: 1, suspended: true }) }));
    expect((await request(app).post("/api/admin/users/abc/suspend").send({ suspended: true })).status).toBe(400);
    expect((await request(app).post("/api/admin/users/9/suspend").send({})).status).toBe(400);
    expect((await request(app).post("/api/admin/users/9/suspend").send({ suspended: "yes" })).status).toBe(400);
    expect((await request(app).post("/api/admin/users/1/suspend").send({ suspended: true })).status).toBe(400);
  });
});

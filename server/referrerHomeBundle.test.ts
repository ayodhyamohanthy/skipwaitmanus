import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

function appFor(overrides: Record<string, unknown> = {}, blocked = new Set<number>()) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 7, openId: "workos-test" } } : undefined,
    getVerifiedWorkEmailAccess: async () => ({ workEmailDomain: "acme.com" }),
    resolveCompanyIdentities: async () => new Map(),
    listCompanyReferralInbox: async () => [{ id: 1 }, { id: 2 }],
    listCompanyReferralInboxByState: async (_id: number, scope: string) => (scope === "new" ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }]),
    getBlockedReferralRequestIds: async (_u: number, ids: number[]) => new Set(ids.filter(id => blocked.has(id))),
    getReferrerPreferences: async () => ({ paused: false }),
    getMyProfile: async () => ({ profile: { referralCapacity: 5 } }),
    getPrivateReferrerImpactSummary: async () => ({ reviewed: 1, approved: 1, introductions: 0, interviews: 0, offers: 0 }),
    recordActivity: async () => undefined,
    ...overrides,
  } as unknown as PrivateReferralRouteDeps);
  return app;
}

describe("GET /api/referrer/home-bundle", () => {
  it("requires sign-in", async () => {
    expect((await request(appFor()).get("/api/referrer/home-bundle")).status).toBe(401);
  });

  it("returns every section for a verified referrer in one call", async () => {
    const res = await request(appFor()).get("/api/referrer/home-bundle").set("x-test-user", "u");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.access.verifiedCompanyAccess).toBe(true);
    expect(res.body.inboxNew.requests.map((r: { id: number }) => r.id)).toEqual([1, 2]);
    expect(res.body.inboxCompleted.requests.map((r: { id: number }) => r.id)).toEqual([3]);
    expect(res.body.preferences).toEqual({ paused: false });
    expect(res.body.profile.profile.referralCapacity).toBe(5);
    expect(res.body.impact.reviewed).toBe(1);
    expect(res.body.failed).toEqual([]);
  });

  it("gives an unverified account no inbox, impact, profile or preference data and never queries them", async () => {
    const inbox = vi.fn(async () => [{ id: 1 }]);
    const impact = vi.fn(async () => ({ reviewed: 9 }));
    const res = await request(appFor({ getVerifiedWorkEmailAccess: async () => null, listCompanyReferralInboxByState: inbox, getPrivateReferrerImpactSummary: impact })).get("/api/referrer/home-bundle").set("x-test-user", "u");
    expect(res.status).toBe(200);
    expect(res.body.access.verifiedCompanyAccess).toBe(false);
    expect(res.body.inboxNew).toBeNull();
    expect(res.body.inboxCompleted).toBeNull();
    expect(res.body.impact).toBeNull();
    expect(res.body.profile).toBeNull();
    expect(res.body.preferences).toBeNull();
    expect(inbox).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });

  it("keeps blocked asks out of both inbox lists", async () => {
    const res = await request(appFor({}, new Set([2, 3]))).get("/api/referrer/home-bundle").set("x-test-user", "u");
    expect(res.body.inboxNew.requests.map((r: { id: number }) => r.id)).toEqual([1]);
    expect(res.body.inboxCompleted.requests).toEqual([]);
  });

  it("reports a failing section without hiding the others", async () => {
    const res = await request(appFor({ getPrivateReferrerImpactSummary: async () => { throw new Error("boom"); } })).get("/api/referrer/home-bundle").set("x-test-user", "u");
    expect(res.status).toBe(200);
    expect(res.body.impact).toBeNull();
    expect(res.body.failed).toEqual(["impact"]);
    expect(res.body.inboxNew.requests).toHaveLength(2);
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

function appFor(overrides: Record<string, unknown> = {}, blocked = new Set<number>()) {
  const app = express();
  app.use(express.json());
  const thankYous = vi.fn(async () => ({ thankYous: [{ id: 9, message: "You opened the door.", seekerName: "Kavya", roleTitle: "Data Analyst", createdAt: "2026-10-17T09:00:00.000Z" }], total: 2 }));
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
    listReferrerThankYous: thankYous,
    recordActivity: async () => undefined,
    ...overrides,
  } as unknown as PrivateReferralRouteDeps);
  return { app, thankYous };
}

describe("GET /api/referrer/home-bundle", () => {
  it("requires sign-in", async () => {
    expect((await request(appFor().app).get("/api/referrer/home-bundle")).status).toBe(401);
  });

  it("returns every section for a verified referrer in one call", async () => {
    const { app } = appFor();
    const res = await request(app).get("/api/referrer/home-bundle").set("x-test-user", "u");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.access.verifiedCompanyAccess).toBe(true);
    expect(res.body.inboxNew.requests.map((r: { id: number }) => r.id)).toEqual([1, 2]);
    expect(res.body.inboxCompleted.requests.map((r: { id: number }) => r.id)).toEqual([3]);
    expect(res.body.preferences).toEqual({ paused: false });
    expect(res.body.profile.profile.referralCapacity).toBe(5);
    expect(res.body.impact.reviewed).toBe(1);
    expect(res.body.thankYous).toMatchObject({ total: 2, thankYous: [{ id: 9, seekerName: "Kavya" }] });
    expect(res.body.failed).toEqual([]);
  });

  it("gives an unverified account no inbox, impact, profile or preference data and never queries them", async () => {
    const inbox = vi.fn(async () => [{ id: 1 }]);
    const impact = vi.fn(async () => ({ reviewed: 9 }));
    const { app, thankYous } = appFor({ getVerifiedWorkEmailAccess: async () => null, listCompanyReferralInboxByState: inbox, getPrivateReferrerImpactSummary: impact });
    const res = await request(app).get("/api/referrer/home-bundle").set("x-test-user", "u");
    expect(res.status).toBe(200);
    expect(res.body.access.verifiedCompanyAccess).toBe(false);
    expect(res.body.inboxNew).toBeNull();
    expect(res.body.inboxCompleted).toBeNull();
    expect(res.body.impact).toBeNull();
    expect(res.body.profile).toBeNull();
    expect(res.body.preferences).toBeNull();
    // A seeker's note about a hire is not for an account whose work email is not verified.
    expect(res.body.thankYous).toBeNull();
    expect(inbox).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(thankYous).not.toHaveBeenCalled();
  });

  it("keeps blocked asks out of both inbox lists", async () => {
    const { app } = appFor({}, new Set([2, 3]));
    const res = await request(app).get("/api/referrer/home-bundle").set("x-test-user", "u");
    expect(res.body.inboxNew.requests.map((r: { id: number }) => r.id)).toEqual([1]);
    expect(res.body.inboxCompleted.requests).toEqual([]);
  });

  it("reports a failing section without hiding the others", async () => {
    const { app } = appFor({ getPrivateReferrerImpactSummary: async () => { throw new Error("boom"); } });
    const res = await request(app).get("/api/referrer/home-bundle").set("x-test-user", "u");
    expect(res.status).toBe(200);
    expect(res.body.impact).toBeNull();
    expect(res.body.failed).toEqual(["impact"]);
    expect(res.body.inboxNew.requests).toHaveLength(2);
  });
});

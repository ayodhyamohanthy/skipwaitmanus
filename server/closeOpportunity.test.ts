import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

// The injected owner deps speak the same contract the real db projection and
// the route's response validation use (shared/companyOpportunities.ts), so the
// list rows carry the full OwnerOpportunityPost shape.
const ownerPost = (id: number, roleTitle: string) => ({ id, companyDomain: "acme.com", kind: "hiring_now" as const, roleTitle, targetRoleUrl: "https://acme.com/careers/role", location: null, compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-01T08:00:00.000Z", expiresAt: "2026-10-31T08:00:00.000Z", poster: { kind: "anonymous" as const }, isActive: true, expired: false, renewable: false });

const openings = new Map([[5, { id: 5, ownerId: 2, live: true, roleTitle: "Role" }], [6, { id: 6, ownerId: 4, live: true, roleTitle: "Role" }]]);
const makeApp = (withDeps = true) => {
  const app = express(); app.use(express.json());
  const identities = new Map([["owner", { account: { id: 2, openId: "o" } }], ["other", { account: { id: 4, openId: "p" } }]]);
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async (req: express.Request) => identities.get(String(req.header("x-test-user"))),
    ...(withDeps ? {
      listMyCompanyOpportunities: async (userId: number) => [...openings.values()].filter(row => row.ownerId === userId && row.live).map(row => ownerPost(row.id, row.roleTitle)),
      closeCompanyOpportunity: async (userId: number, id: number) => { const row = openings.get(id); if (!row || row.ownerId !== userId) return false; row.live = false; return true; },
    } : {}),
  } as never);
  return app;
};

describe("close my opening", () => {
  it("lists only the poster's own openings and requires sign-in", async () => {
    const app = makeApp();
    expect((await request(app).get("/api/opportunities/mine")).status).toBe(401);
    expect((await request(app).get("/api/opportunities/mine").set("x-test-user", "owner")).body.opportunities).toEqual([ownerPost(5, "Role")]);
  });
  it("lets the owner close their opening, never someone else's, and rejects bad ids", async () => {
    const app = makeApp();
    expect((await request(app).post("/api/opportunities/5/close")).status).toBe(401);
    expect((await request(app).post("/api/opportunities/5/close").set("x-test-user", "other")).status).toBe(404);
    expect(openings.get(5)!.live).toBe(true);
    expect((await request(app).post("/api/opportunities/abc/close").set("x-test-user", "owner")).status).toBe(400);
    const closed = await request(app).post("/api/opportunities/5/close").set("x-test-user", "owner");
    expect(closed.status).toBe(200); expect(closed.body).toEqual({ closed: true, id: 5 });
    expect(openings.get(5)!.live).toBe(false);
    expect(openings.get(6)!.live).toBe(true);
    expect((await request(app).get("/api/opportunities/mine").set("x-test-user", "owner")).body.opportunities).toEqual([]);
  });
  it("answers 503 rather than crashing when the capability is not wired", async () => {
    expect((await request(makeApp(false)).post("/api/opportunities/5/close").set("x-test-user", "owner")).status).toBe(503);
  });
});

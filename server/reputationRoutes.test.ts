import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerReputationRoutes, type ReputationRouteDeps } from "./reputationRoutes";

function setup(overrides: Partial<ReputationRouteDeps> = {}) {
  const app = express();
  app.use(express.json());
  const deps: ReputationRouteDeps = {
    resolveIdentity: async req => (req.header("x-test-user") ? { account: { id: 7, openId: "workos-test" } } : undefined),
    getReferrerReputation: vi.fn(async () => ({
      decisions: 2, approvals: 1, declines: 1, approvalRate: 0.5,
      introductions: 1, interviews: 1, offers: 0,
      interviewHitRate: 1, offerRate: 0, medianResponseHours: 2,
    })),
    getJobSeekerReliability: vi.fn(async () => ({
      totalRequests: 3, withdrawnBeforeClaim: 1, reviewsReceived: 2, approvalsReceived: 2,
      introductions: 1, interviews: 1, offers: 0, completionRate: 0.5,
    })),
    ...overrides,
  };
  registerReputationRoutes(app, deps);
  return { app, deps };
}

describe("GET /api/reputation/referrer/me", () => {
  it("requires authentication", async () => {
    const { app, deps } = setup();
    const response = await request(app).get("/api/reputation/referrer/me");
    expect(response.status).toBe(401);
    expect(deps.getReferrerReputation).not.toHaveBeenCalled();
  });

  it("maps an unverified work email to 403", async () => {
    const { app } = setup({ getReferrerReputation: vi.fn(async () => { throw new Error("Verify your company email to view your referral track record"); }) });
    const response = await request(app).get("/api/reputation/referrer/me").set("x-test-user", "employee");
    expect(response.status).toBe(403);
  });

  it("returns the private track record with no-store caching", async () => {
    const { app, deps } = setup();
    const response = await request(app).get("/api/reputation/referrer/me").set("x-test-user", "employee");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body.reputation).toMatchObject({ decisions: 2, approvals: 1, approvalRate: 0.5, medianResponseHours: 2 });
    expect(deps.getReferrerReputation).toHaveBeenCalledWith(7);
  });
});

describe("GET /api/reputation/seeker/me", () => {
  it("requires authentication", async () => {
    const { app, deps } = setup();
    const response = await request(app).get("/api/reputation/seeker/me");
    expect(response.status).toBe(401);
    expect(deps.getJobSeekerReliability).not.toHaveBeenCalled();
  });

  it("returns the seeker's own reliability signals", async () => {
    const { app, deps } = setup();
    const response = await request(app).get("/api/reputation/seeker/me").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body.reliability).toMatchObject({ totalRequests: 3, approvalsReceived: 2, completionRate: 0.5 });
    expect(deps.getJobSeekerReliability).toHaveBeenCalledWith(7);
  });

  it("surfaces a safe 500 when the data layer fails", async () => {
    const { app } = setup({ getJobSeekerReliability: vi.fn(async () => { throw new Error("Database unavailable"); }) });
    const response = await request(app).get("/api/reputation/seeker/me").set("x-test-user", "seeker");
    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Database unavailable");
  });
});

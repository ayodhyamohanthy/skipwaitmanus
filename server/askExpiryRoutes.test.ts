import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const seeker = { account: { id: 7, openId: "workos-seeker" } };

function setup(deps: Partial<PrivateReferralRouteDeps>) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => (req.header("x-test-user") ? seeker : undefined),
    recordActivity: async () => {},
    ...deps,
  } as unknown as PrivateReferralRouteDeps);
  return app;
}

const staleRow = { id: 501, companyDomain: "acme.com", status: "pending", referrerId: null, createdAt: "2026-09-20T12:00:00.000Z", updatedAt: "2026-09-20T12:00:00.000Z" };
const freshRow = { id: 502, companyDomain: "acme.com", status: "pending", referrerId: null, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() };

describe("ask expiry routes", () => {
  it("attaches expiresAt per row and reports reconciled ids", async () => {
    const reconcileExpiredPendingReferrals = vi.fn(async () => ({ expiredRequestIds: [500] }));
    const app = setup({ listJobSeekerCompanyReferrals: async () => [staleRow, freshRow], reconcileExpiredPendingReferrals });
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(reconcileExpiredPendingReferrals).toHaveBeenCalledWith(7, expect.any(Number));
    expect(response.body.expiredRequestIds).toEqual([500]);
    const stale = response.body.requests.find((row: { id: number }) => row.id === 501);
    expect(stale.expiresAt).toBe(new Date(new Date("2026-09-20T12:00:00.000Z").getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());
    const fresh = response.body.requests.find((row: { id: number }) => row.id === 502);
    expect(typeof fresh.expiresAt).toBe("string");
  });

  it("fails open when reconciliation throws: listing still succeeds", async () => {
    const app = setup({
      listJobSeekerCompanyReferrals: async () => [freshRow],
      reconcileExpiredPendingReferrals: async () => { throw new Error("db down"); },
    });
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body.requests.length).toBe(1);
    expect(response.body.expiredRequestIds).toEqual([]);
  });

  it("works when no reconcile dep is registered", async () => {
    const app = setup({ listJobSeekerCompanyReferrals: async () => [freshRow] });
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body.expiredRequestIds).toEqual([]);
  });

  it("maps an expired claim to 409 with the conflict state", async () => {
    const conflict = Object.assign(new Error("This referral request expired before it could be claimed"), { currentState: { status: "pending", revision: 3 }, name: "ReferralTransitionConflict" });
    const app = setup({ claimCompanyReferralRequest: async () => { throw conflict; } });
    const response = await request(app).post("/api/company-referrals/501/claim").set("x-test-user", "seeker");
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/expired/);
    expect(response.body.currentState).toMatchObject({ status: "pending", revision: 3 });
  });
});

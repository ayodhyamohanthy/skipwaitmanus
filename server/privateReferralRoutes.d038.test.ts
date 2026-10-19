import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

/*
 * D-038/D-066 HTTP boundary: the four referral-clock actions resolve the
 * authenticated person, validate the optional reference, delegate to the db
 * contract and keep the response shape the thread UI parses.
 */
function setup(overrides: Partial<PrivateReferralRouteDeps> = {}) {
  const app = express();
  app.use(express.json());
  const recordActivity = vi.fn(async () => undefined);
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined,
    recordActivity,
    ...overrides,
  } as unknown as PrivateReferralRouteDeps);
  return { app, recordActivity };
}

describe("D-038 referral clock routes", () => {
  it("requires authentication on every new action", async () => {
    const { app } = setup();
    for (const path of ["/api/company-referrals/601/referred", "/api/company-referrals/601/referred-extension", "/api/company-referrals/601/confirm-referral", "/api/company-referrals/601/step-back"]) {
      expect((await request(app).post(path)).status).toBe(401);
    }
  });

  it("marks referred with the optional portal reference and records the action", async () => {
    const markReferralReferred = vi.fn(async (userId: number, input: { requestId: number; referenceId?: string | null }) => ({ requestId: input.requestId, status: "referred", changed: true, referenceId: input.referenceId ?? null, referredAt: new Date() }));
    const { app, recordActivity } = setup({ markReferralReferred });
    const response = await request(app).post("/api/company-referrals/601/referred").set("x-test-user", "2").send({ referenceId: " TC-4410 " });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ requestId: 601, status: "referred", changed: true, referenceId: "TC-4410" });
    expect(markReferralReferred).toHaveBeenCalledWith(2, { requestId: 601, referenceId: "TC-4410" });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "company_referral.referred", outcome: "success" }));
  });

  it("rejects a malformed portal reference before any db call", async () => {
    const markReferralReferred = vi.fn();
    const { app } = setup({ markReferralReferred });
    const response = await request(app).post("/api/company-referrals/601/referred").set("x-test-user", "2").send({ referenceId: "bad\u0000reference" });
    expect(response.status).toBe(400);
    expect(markReferralReferred).not.toHaveBeenCalled();
  });

  it("extends once and reports an already-used extension", async () => {
    const extendReferralDeadline = vi.fn(async () => ({ requestId: 601, extended: false, alreadyExtended: true, deadlineAt: new Date() }));
    const { app } = setup({ extendReferralDeadline });
    const response = await request(app).post("/api/company-referrals/601/referred-extension").set("x-test-user", "2");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ extended: false, alreadyExtended: true });
    expect(extendReferralDeadline).toHaveBeenCalledWith(2, 601);
  });

  it("confirms the seeker's referral email", async () => {
    const confirmReferralEmail = vi.fn(async () => ({ requestId: 601, status: "referred", confirmed: true, changed: true }));
    const { app } = setup({ confirmReferralEmail });
    const response = await request(app).post("/api/company-referrals/601/confirm-referral").set("x-test-user", "1");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "referred", confirmed: true, changed: true });
    expect(confirmReferralEmail).toHaveBeenCalledWith(1, 601);
  });

  it("steps back and returns the credit outcome to the referrer", async () => {
    const stepBackFromReferral = vi.fn(async () => ({ requestId: 601, status: "pending", changed: true, creditRefunded: true, returned: 1 }));
    const { app, recordActivity } = setup({ stepBackFromReferral });
    const response = await request(app).post("/api/company-referrals/601/step-back").set("x-test-user", "2");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "pending", creditRefunded: true });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "company_referral.step_back", metadata: expect.objectContaining({ creditRefunded: true }) }));
  });

  it("maps an unavailable state to 409 with the current state", async () => {
    const { ReferralTransitionConflict } = await import("./db");
    const markReferralReferred = vi.fn(async () => { throw new ReferralTransitionConflict("Only an accepted referral can be marked referred", { status: "pending", revision: 4 }); });
    const { app } = setup({ markReferralReferred });
    const response = await request(app).post("/api/company-referrals/601/referred").set("x-test-user", "2").send({});
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: "Only an accepted referral can be marked referred", currentState: { status: "pending", revision: 4 } });
  });
});

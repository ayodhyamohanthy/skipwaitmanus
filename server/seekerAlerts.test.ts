import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

function setup(deps: Partial<PrivateReferralRouteDeps>) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => (req.header("x-test-user") ? { account: { id: 7, openId: "workos-seeker" } } : undefined),
    recordActivity: async () => {},
    ...deps,
  } as unknown as PrivateReferralRouteDeps);
  return app;
}

describe("seeker alert routes", () => {
  it("requires sign-in for every alert operation", async () => {
    const app = setup({ listSeekerAlerts: async () => [] });
    expect((await request(app).get("/api/seeker-alerts")).status).toBe(401);
    expect((await request(app).post("/api/seeker-alerts").send({ companyDomain: "acme.com" })).status).toBe(401);
    expect((await request(app).patch("/api/seeker-alerts/1").send({ paused: true })).status).toBe(401);
    expect((await request(app).delete("/api/seeker-alerts/1")).status).toBe(401);
  });

  it("lists, creates, pauses, and deletes through injected deps", async () => {
    const alerts = [{ id: 1, companyDomain: "acme.com", paused: false }];
    const app = setup({
      listSeekerAlerts: async () => alerts,
      createSeekerAlert: async (_userId, input) => ({ id: 2, companyDomain: input.companyDomain }),
      setSeekerAlertPaused: async () => ({ id: 1, paused: true }),
      deleteSeekerAlert: async () => ({ deleted: true, id: 1 }),
    });
    const listed = await request(app).get("/api/seeker-alerts").set("x-test-user", "seeker");
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ alerts });
    const created = await request(app).post("/api/seeker-alerts").set("x-test-user", "seeker").send({ companyDomain: "Acme.com" });
    expect(created.status).toBe(201);
    expect(await request(app).patch("/api/seeker-alerts/0").set("x-test-user", "seeker").send({ paused: true })).toHaveProperty("status", 400);
    const patched = await request(app).patch("/api/seeker-alerts/1").set("x-test-user", "seeker").send({ paused: true });
    expect(patched.body).toEqual({ alert: { id: 1, paused: true } });
    const removed = await request(app).delete("/api/seeker-alerts/1").set("x-test-user", "seeker");
    expect(removed.body).toEqual({ deleted: true, id: 1 });
  });

  it("maps validation and ownership failures honestly", async () => {
    const app = setup({
      createSeekerAlert: async () => { throw new Error("Enter a valid company domain, like acme.com"); },
      setSeekerAlertPaused: async () => { throw new Error("This alert is not in your account"); },
      deleteSeekerAlert: async () => { throw new Error("This alert is not in your account"); },
    });
    expect((await request(app).post("/api/seeker-alerts").set("x-test-user", "seeker").send({ companyDomain: "x" })).status).toBe(400);
    expect((await request(app).patch("/api/seeker-alerts/9").set("x-test-user", "seeker").send({ paused: true })).status).toBe(404);
    expect((await request(app).delete("/api/seeker-alerts/9").set("x-test-user", "seeker")).status).toBe(404);
  });

  it("notifies watchers on enrollment without breaking it", async () => {
    const notifySeekerAlertsForCompany = vi.fn(async () => ({ notified: 2 }));
    const app = setup({
      completeWorkEmailOtpEnrollment: async () => ({ workEmailDomain: "acme.com", reward: { rewarded: false }, replayed: false }),
      notifySeekerAlertsForCompany,
    });
    const response = await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "seeker").send({ email: "ref@acme.com", receipt: "r1" });
    expect(response.status).toBe(200);
    expect(notifySeekerAlertsForCompany).toHaveBeenCalledWith("acme.com");
  });

  it("still enrolls when alert matching fails", async () => {
    const app = setup({
      completeWorkEmailOtpEnrollment: async () => ({ workEmailDomain: "acme.com", reward: { rewarded: false }, replayed: false }),
      notifySeekerAlertsForCompany: async () => { throw new Error("db down"); },
    });
    const response = await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "seeker").send({ email: "ref@acme.com", receipt: "r1" });
    expect(response.status).toBe(200);
    expect(response.body.workEmailDomain).toBe("acme.com");
  });
});

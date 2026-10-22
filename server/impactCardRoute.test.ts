import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMPACT_CARD_FLAG, type ImpactCardPayload } from "./impactCard";
import { registerImpactCardRoutes } from "./impactCardRoutes";

const ready: ImpactCardPayload = {
  state: "ready",
  screenName: "QuietFalcon",
  companyName: "Kestrel Pay",
  companySlug: "kestrel-pay",
  linkPath: "/refer/kestrel-pay/quietfalcon",
  stats: { referredThisMonth: 3, medianFirstReplyHours: 3, acceptRatePct: 64 },
};

function buildApp(card: ImpactCardPayload = ready, signedIn = true) {
  const app = express();
  registerImpactCardRoutes(app, {
    resolveIdentity: async () => (signedIn ? { account: { id: 42 } } : null),
    loadImpactCard: async () => card,
  });
  return app;
}

describe("GET /api/referrer/impact-card", () => {
  beforeEach(() => { process.env[IMPACT_CARD_FLAG] = "true"; });
  afterEach(() => { delete process.env[IMPACT_CARD_FLAG]; });

  it("404 when the flag is off", async () => {
    delete process.env[IMPACT_CARD_FLAG];
    await request(buildApp()).get("/api/referrer/impact-card").expect(404);
  });
  it("401 when signed out", async () => {
    await request(buildApp(ready, false)).get("/api/referrer/impact-card").expect(401);
  });
  it("returns aggregates and screen name only", async () => {
    const res = await request(buildApp()).get("/api/referrer/impact-card").expect(200);
    expect(res.body).toEqual(ready);
    expect(JSON.stringify(res.body)).not.toMatch(/seeker|pitch|request/i);
  });
  it("insufficient state passes through", async () => {
    const res = await request(buildApp({ state: "insufficient" })).get("/api/referrer/impact-card").expect(200);
    expect(res.body).toEqual({ state: "insufficient" });
  });
  it("F4: every per-user answer is private, no-store", async () => {
    const ok = await request(buildApp()).get("/api/referrer/impact-card").expect(200);
    expect(ok.headers["cache-control"]).toBe("private, no-store");
    const denied = await request(buildApp(ready, false)).get("/api/referrer/impact-card").expect(401);
    expect(denied.headers["cache-control"]).toBe("private, no-store");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = express();
    registerImpactCardRoutes(failing, { resolveIdentity: async () => ({ account: { id: 42 } }), loadImpactCard: async () => { throw new Error("down"); } });
    const failed = await request(failing).get("/api/referrer/impact-card").expect(503);
    expect(failed.headers["cache-control"]).toBe("private, no-store");
  });
  it("F6: records one viewed activity row on a successful load, and none when signed out", async () => {
    const recordActivity = vi.fn(async () => undefined);
    const app = express();
    registerImpactCardRoutes(app, { resolveIdentity: async () => ({ account: { id: 42 } }), loadImpactCard: async () => ready, recordActivity });
    await request(app).get("/api/referrer/impact-card").expect(200);
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 42,
      action: "referrer_impact_card.viewed",
      outcome: "success",
      resourceType: "referrer_impact_card",
      metadata: { state: "ready" },
    }));
    const denied = express();
    registerImpactCardRoutes(denied, { resolveIdentity: async () => null, loadImpactCard: async () => ready, recordActivity });
    await request(denied).get("/api/referrer/impact-card").expect(401);
    expect(recordActivity).toHaveBeenCalledTimes(1);
  });
  it("503 when the load throws, and the failure is logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    registerImpactCardRoutes(app, { resolveIdentity: async () => ({ account: { id: 42 } }), loadImpactCard: async () => { throw new Error("down"); } });
    await request(app).get("/api/referrer/impact-card").expect(503);
    expect(logged).toHaveBeenCalled();
    const [message] = logged.mock.calls[0] ?? [];
    expect(String(message)).toContain("[ImpactCard]");
  });
});

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("503 when the load throws", async () => {
    const app = express();
    registerImpactCardRoutes(app, { resolveIdentity: async () => ({ account: { id: 42 } }), loadImpactCard: async () => { throw new Error("down"); } });
    await request(app).get("/api/referrer/impact-card").expect(503);
  });
});

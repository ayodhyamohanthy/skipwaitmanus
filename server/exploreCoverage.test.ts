/**
 * /api/explore/coverage — kit v4 `/explore` company cards with live referrer
 * availability. Privacy-safe aggregate only: distinct verified referrers with
 * open capacity per launch domain. No names, no emails, no per-person data.
 * Public endpoint (explore is a public funnel): no identity, cacheable 60s.
 */
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

describe("explore coverage route", () => {
  function setup(coverage: Array<{ companyDomain: string; referrerCount: number }>) {
    const app = express();
    app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => undefined,
      getExploreCoverage: async () => coverage,
    } as unknown as PrivateReferralRouteDeps);
    return app;
  }

  it("returns referrer counts keyed by company domain", async () => {
    const response = await request(setup([
      { companyDomain: "wipro.com", referrerCount: 3 },
      { companyDomain: "acme.com", referrerCount: 1 },
    ])).get("/api/explore/coverage");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      coverage: [
        { companyDomain: "wipro.com", referrerCount: 3 },
        { companyDomain: "acme.com", referrerCount: 1 },
      ],
    });
  });

  it("answers an empty map when nobody can refer yet, never 500", async () => {
    const response = await request(setup([])).get("/api/explore/coverage");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ coverage: [] });
  });

  it("stays public so signed-out seekers can explore", async () => {
    const response = await request(setup([])).get("/api/explore/coverage");
    expect(response.status).not.toBe(401);
    expect(response.headers["cache-control"]).toMatch(/public/);
  });
});
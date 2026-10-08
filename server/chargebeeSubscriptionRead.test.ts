import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

/**
 * GET /api/chargebee/subscription — the read route /billing depends on.
 *
 * It exists because Chargebee was wired for WRITES only: checkout, cancel and
 * gifts all worked, but nothing could read the current subscription, and
 * Deps.getUserSubscription sat unused. Without it /billing had no plan to show
 * and would have had to invent one.
 */

function build(overrides: Partial<Parameters<typeof registerChargebeeRoutes>[1]> = {}) {
  const app = express();
  app.use(express.json());
  registerChargebeeRoutes(app, {
    resolveIdentity: async () => ({ account: { id: 7 } }),
    getUserSubscription: async () => undefined,
    getCreditSummary: async () => undefined,
    createPaymentIntent: async () => undefined,
    fulfillPayment: async () => undefined,
    ...overrides,
  } as Parameters<typeof registerChargebeeRoutes>[1]);
  return app;
}

describe("GET /api/chargebee/subscription", () => {
  it("refuses an unauthenticated read", async () => {
    const app = build({ resolveIdentity: async () => undefined });
    const response = await request(app).get("/api/chargebee/subscription");
    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/Sign in/);
  });

  it("reports the plan the wallet holds, not a guess", async () => {
    const app = build({
      getUserSubscription: async () => ({ subscriptionId: "sub_1", plan: "max", status: "active", currentTermEnd: new Date("2026-11-06") }),
    });
    const response = await request(app).get("/api/chargebee/subscription");
    expect(response.status).toBe(200);
    expect(response.body.subscription.plan).toBe("max");
    expect(response.body.subscription.status).toBe("active");
  });

  it("never leaks the Chargebee subscription id to the client", async () => {
    // It is a provider identifier the client never needs, and handing it out
    // lets a caller pass it back into a request.
    const app = build({
      getUserSubscription: async () => ({ subscriptionId: "sub_secret", plan: "pro", status: "active" }),
    });
    const response = await request(app).get("/api/chargebee/subscription");
    expect(JSON.stringify(response.body)).not.toContain("sub_secret");
  });

  it("reports no subscription as null rather than as a plan", async () => {
    // getUserSubscription returns undefined for a free wallet, so null here
    // means Free -- the client must not read it as an unknown paid plan.
    const app = build();
    const response = await request(app).get("/api/chargebee/subscription");
    expect(response.status).toBe(200);
    expect(response.body.subscription).toBeNull();
  });

  it("passes the requested role through to the wallet read", async () => {
    const getUserSubscription = vi.fn(async () => undefined);
    const app = build({ getUserSubscription });
    await request(app).get("/api/chargebee/subscription?role=referrer");
    expect(getUserSubscription).toHaveBeenCalledWith(7, "referrer");
  });

  it("surfaces a provider failure as 502 rather than an empty plan", async () => {
    // A failed read must not look like "you are on Free" -- that would show a
    // paying account the wrong plan.
    const app = build({ getUserSubscription: async () => { throw new Error("boom"); } });
    const response = await request(app).get("/api/chargebee/subscription");
    expect(response.status).toBe(502);
    expect(response.body.error).toMatch(/could not load/i);
  });
});

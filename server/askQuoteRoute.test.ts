import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import type { AcceptedAskCost } from "../shared/acceptedAskCost";

function setup(totalAvailable: number, previewAskCost?: (userId: number, targetRoleUrl: string) => Promise<AcceptedAskCost | null>) {
  const app = express();
  app.use(express.json());
  const getCreditSummary = vi.fn(async () => ({ totalAvailable }));
  const preview = previewAskCost ? vi.fn(previewAskCost) : undefined;
  const deps = {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined),
    getCreditSummary,
    ...(preview ? { previewAskCost: preview } : {}),
  };
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return { app, getCreditSummary, preview };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("GET /api/company-referrals/quote", () => {
  it("needs a signed-in caller", async () => {
    const { app, getCreditSummary } = setup(3);
    expect((await request(app).get("/api/company-referrals/quote?url=https://acme.com/jobs/1")).status).toBe(401);
    expect(getCreditSummary).not.toHaveBeenCalled();
  });

  it("rejects a missing or invalid Target Role URL", async () => {
    const { app } = setup(3);
    expect((await request(app).get("/api/company-referrals/quote").set("x-test-user", "7")).status).toBe(400);
    expect((await request(app).get("/api/company-referrals/quote?url=not-a-url").set("x-test-user", "7")).status).toBe(400);
  });

  it("flag off quotes the flat one-credit cost", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    const { app } = setup(3);
    const response = await request(app).get("/api/company-referrals/quote?url=https://acme.com/careers/senior-frontend-engineer").set("x-test-user", "7");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ level: 5, cost: 1, totalAvailable: 3, shortfall: 0 });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("flag on prices the level and states the shortfall plainly", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    const { app } = setup(3);
    const senior = await request(app).get("/api/company-referrals/quote?url=https://acme.com/careers/senior-frontend-engineer").set("x-test-user", "7");
    expect(senior.body).toMatchObject({ level: 5, cost: 5, totalAvailable: 3, shortfall: 2 });
    const plain = await request(app).get("/api/company-referrals/quote?url=https://acme.com/jobs/12345").set("x-test-user", "7");
    expect(plain.body).toMatchObject({ level: 2, cost: 2, shortfall: 0 });
  });

  it("fails closed when the credit summary cannot load", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    const app = express();
    app.use(express.json());
    const deps = {
      resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: 7, openId: "workos-test" } } : undefined),
      getCreditSummary: async () => undefined,
    };
    registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
    expect((await request(app).get("/api/company-referrals/quote?url=https://acme.com/jobs/12345").set("x-test-user", "7")).status).toBe(500);
  });

  // D-132-item3 ruling 2/8: the numeric cost never changes; the accepted cost is a second, explicit field.
  it("adds only acceptedCost from the injected preview, after the four current keys", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    const acceptedCost: AcceptedAskCost = { units: 1, band: null, source: [{ bucket: "cycle", units: 1 }] };
    const { app, preview } = setup(3, async () => acceptedCost);
    const response = await request(app).get("/api/company-referrals/quote?url=https://acme.com/careers/senior-frontend-engineer").set("x-test-user", "7");
    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["level", "cost", "totalAvailable", "shortfall", "acceptedCost"]);
    expect(response.body).toMatchObject({ level: 5, cost: 1, totalAvailable: 3, shortfall: 0, acceptedCost });
    expect(typeof response.body.cost).toBe("number");
    expect(preview).toHaveBeenCalledWith(7, "https://acme.com/careers/senior-frontend-engineer");
  });

  it("states acceptedCost as null on a shortfall, never a guessed cost", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    const { app } = setup(0, async () => null);
    const response = await request(app).get("/api/company-referrals/quote?url=https://acme.com/jobs/12345").set("x-test-user", "7");
    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["level", "cost", "totalAvailable", "shortfall", "acceptedCost"]);
    expect(response.body).toMatchObject({ totalAvailable: 0, shortfall: 1, acceptedCost: null });
  });

  it("keeps exactly today's four keys when no preview dependency is injected", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    const { app } = setup(3);
    const response = await request(app).get("/api/company-referrals/quote?url=https://acme.com/jobs/12345").set("x-test-user", "7");
    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["level", "cost", "totalAvailable", "shortfall"]);
  });

  it("answers today's pricing error when the preview throws, never a silent null", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    const { app } = setup(3, async () => { throw new Error("database unavailable"); });
    const response = await request(app).get("/api/company-referrals/quote?url=https://acme.com/jobs/12345").set("x-test-user", "7");
    expect(response.status).toBe(500);
    expect(response.body.error).toBe("We could not price this ask");
    expect(response.body).not.toHaveProperty("acceptedCost");
  });
});

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { AskPriceChangedError } from "./planGates";
import type { BandedAskQuote } from "../shared/acceptedAskCost";

function setup(totalAvailable: number, overrides: Partial<PrivateReferralRouteDeps> = {}) {
  const app = express();
  app.use(express.json());
  const getCreditSummary = vi.fn(async () => ({ totalAvailable }));
  const deps = {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined),
    getCreditSummary,
    ...overrides,
  };
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return { app, getCreditSummary };
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
});

describe("banded quote and confirmation HTTP boundary", () => {
  const quote: BandedAskQuote = { level: 5, cost: 1, totalAvailable: 2, shortfall: 0, coverageStatus: "covered", acceptedCost: { units: 1, band: "senior", source: [{ bucket: "included", units: 1, cycleKey: "paid-cycle" }] } };
  const payload = { targetRoleUrl: "https://acme.com/careers/senior-frontend-engineer", personalPitch: "I shipped the platform described in this role.", attachmentIds: [41], expectedCost: quote.acceptedCost };
  const key = "banded-route-test-0001";
  it("uses the authenticated preview and ignores the retired level-cost flag", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "true");
    vi.stubEnv("ASK_LEVEL_COST", "true");
    const preview = vi.fn(async () => quote);
    const { app, getCreditSummary } = setup(999, { previewBandedAskCost: preview });
    const response = await request(app).get(`/api/company-referrals/quote?url=${encodeURIComponent(payload.targetRoleUrl)}`).set("x-test-user", "7");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(quote);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(preview).toHaveBeenCalledWith(7, payload.targetRoleUrl);
    expect(getCreditSummary).not.toHaveBeenCalled();
  });
  it("does not read a preview for signed-out requests", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "true");
    const preview = vi.fn(async () => quote);
    const { app } = setup(3, { previewBandedAskCost: preview });
    expect((await request(app).get(`/api/company-referrals/quote?url=${encodeURIComponent(payload.targetRoleUrl)}`)).status).toBe(401);
    expect(preview).not.toHaveBeenCalled();
  });
  it("rejects malformed expected allocation before calling create", async () => {
    const create = vi.fn<PrivateReferralRouteDeps["createCompanyReferralRequest"]>();
    const { app } = setup(3, { createCompanyReferralRequest: create });
    const response = await request(app).post("/api/company-referrals").set("x-test-user", "7").set("Idempotency-Key", key).send({ ...payload, expectedCost: { ...quote.acceptedCost, units: 3 } });
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
  it("passes confirmation to create and returns the typed 409 for a second confirmation", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "true");
    const create = vi.fn<PrivateReferralRouteDeps["createCompanyReferralRequest"]>(async () => { throw new AskPriceChangedError(quote.acceptedCost); });
    const { app } = setup(3, { createCompanyReferralRequest: create });
    const response = await request(app).post("/api/company-referrals").set("x-test-user", "7").set("Idempotency-Key", key).send(payload);
    expect(create).toHaveBeenCalledWith(7, expect.objectContaining({ expectedCost: quote.acceptedCost }));
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "ask_price_changed", currentCost: quote.acceptedCost });
  });
});

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BANDED_REFUSALS } from "../shared/subscriptionManagement";
import { registerBandedCheckoutRoutes, type BandedRouteDeps } from "./bandedCheckoutRoutes";
import { fakeBandedDeps, KEY } from "./bandedCheckout.fixtures";

/**
 * QA-demo-test-billing (D-393): only the reviewer demo seeker checks out on the
 * Chargebee TEST site while sales are off for everyone else, with no plan, band
 * or founding limit. Identity alone selects it; request input never does.
 */
const DEMO = { account: { id: 9, email: "seeker@reviewer.skipwait.me", name: "Demo seeker" } };
const OTHER = { account: { id: 7, email: "member@example.com", name: "Sam Lee" } };
const planBody = { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY };
const wideCart = { items: [{ level: "senior", quantity: 2 }], billingCountry: "IN", idempotencyKey: KEY };

function appWith(identity: typeof DEMO | typeof OTHER, over: Partial<BandedRouteDeps> = {}) {
  const deps: BandedRouteDeps = {
    resolveIdentity: vi.fn(async () => identity),
    recordActivity: vi.fn(async () => undefined),
    checkout: fakeBandedDeps({ salesEnabled: () => false }),
    createSubscriptionIntent: vi.fn(async () => undefined),
    ...over,
  };
  const app = express();
  app.use(express.json());
  registerBandedCheckoutRoutes(app, deps);
  return { app, deps };
}

beforeEach(() => {
  vi.stubEnv("DEMO_TEST_BILLING_ENABLED", "true");
  vi.stubEnv("BILLING_ENV", "live");
  vi.stubEnv("CHARGEBEE_LIVE_SITE", "skipwait");
  vi.stubEnv("CHARGEBEE_LIVE_API_KEY", "live-key");
  vi.stubEnv("CHARGEBEE_SITE", "skipwait-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "test-key");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("demo test billing routes (D-393)", () => {
  it("switch on: the demo seeker sees the offer on sale while sales are off for everyone else", async () => {
    const demo = appWith(DEMO);
    const demoOffer = await request(demo.app).get("/api/chargebee/banded/offer");
    expect(demoOffer.status).toBe(200);
    expect(demoOffer.body.onSale).toBe(true);

    const other = appWith(OTHER);
    const otherOffer = await request(other.app).get("/api/chargebee/banded/offer");
    expect(otherOffer.status).toBe(200);
    expect(otherOffer.body.onSale).toBe(false);
  });

  it("switch on: the demo plan checkout opens on the TEST site with no membership or founding limit", async () => {
    const checkout = fakeBandedDeps({
      salesEnabled: () => false,
      membership: vi.fn(async () => ({ bandedPlan: "early_to_mid" as const, activeSubscription: true })),
      reserveFoundingPlace: vi.fn(async () => ({ status: "full" as const })),
    });
    const { app } = appWith(DEMO, { checkout });
    const res = await request(app).post("/api/chargebee/banded/plan-checkout").send(planBody);
    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toContain("chargebee.com");
    expect(checkout.reserveFoundingPlace).not.toHaveBeenCalled();
    expect(checkout.createPlanPage).toHaveBeenCalledWith(
      { environment: "test", site: "skipwait-test", apiKey: "test-key" },
      expect.objectContaining({ itemPriceId: expect.any(String) }),
    );
  });

  it("switch on: the demo referral checkout ignores the band and the plan requirement", async () => {
    const checkout = fakeBandedDeps({
      salesEnabled: () => false,
      membership: vi.fn(async () => ({ bandedPlan: "early_to_mid" as const, activeSubscription: true })),
    });
    const { app } = appWith(DEMO, { checkout });
    const res = await request(app).post("/api/chargebee/banded/referral-checkout").send(wideCart);
    expect(res.status).toBe(200);
    expect(checkout.createReferralPage).toHaveBeenCalledWith(
      { environment: "test", site: "skipwait-test", apiKey: "test-key" },
      expect.objectContaining({ lines: expect.any(Array) }),
    );
  });

  it("switch on: every other account still gets 409 not_on_sale", async () => {
    const { app } = appWith(OTHER);
    for (const [path, body] of [["/api/chargebee/banded/plan-checkout", planBody], ["/api/chargebee/banded/referral-checkout", wideCart]] as const) {
      const res = await request(app).post(path).send(body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe(BANDED_REFUSALS.notOnSale);
    }
  });

  it("switch off: the demo account gets 409 like everyone else", async () => {
    vi.stubEnv("DEMO_TEST_BILLING_ENABLED", "false");
    const { app, deps } = appWith(DEMO);
    const res = await request(app).post("/api/chargebee/banded/plan-checkout").send(planBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(BANDED_REFUSALS.notOnSale);
    // The default path still answers before any identity read.
    expect(deps.resolveIdentity).not.toHaveBeenCalled();
  });

  it("a spoofed host, header or body cannot make a real account the demo one", async () => {
    const { app } = appWith(OTHER);
    const res = await request(app)
      .post("/api/chargebee/banded/plan-checkout")
      .set("Host", "skipwait-test.chargebee.com")
      .set("x-chargebee-site", "skipwait-test")
      .send({ ...planBody, email: DEMO.account.email, role: "job_seeker" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(BANDED_REFUSALS.notOnSale);
  });
});

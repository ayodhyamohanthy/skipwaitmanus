import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { BANDED_REFUSALS, bandedOfferResponseSchema, checkoutResponseSchema } from "../shared/subscriptionManagement";
import { bandedPlanItemPriceId } from "../shared/bandedCatalog";
import { planFeeMinor } from "../shared/planFamily";
import { REFERRER_PURCHASE_REFUSED_CODE } from "../shared/referrerPurchases";
import { bandedCheckoutIntentId } from "./bandedCheckout";
import { registerBandedCheckoutRoutes, type BandedRouteDeps } from "./bandedCheckoutRoutes";
import { registerChargebeeRoutes } from "./chargebeeRoutes";
import { fakeBandedDeps, KEY } from "./bandedCheckout.fixtures";

const identity = { account: { id: 7, email: "member@example.com", name: "Sam Lee" } };
const planBody = { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY };
const cartBody = { items: [{ level: "early", quantity: 3 }, { level: "mid", quantity: 2 }], billingCountry: "IN", idempotencyKey: KEY };

function appWith(over: Partial<BandedRouteDeps> = {}) {
  const deps: BandedRouteDeps = {
    resolveIdentity: vi.fn(async () => identity),
    recordActivity: vi.fn(async () => undefined),
    checkout: fakeBandedDeps({ membership: vi.fn(async () => ({ bandedPlan: "early_to_mid" as const, activeSubscription: false })) }),
    createSubscriptionIntent: vi.fn(async () => undefined),
    ...over,
  };
  const app = express();
  app.use(express.json());
  registerBandedCheckoutRoutes(app, deps);
  return { app, deps };
}

describe("banded routes while the switch is off", () => {
  it("answer 409 not_on_sale on every checkout route before sign-in, a read or a provider call", async () => {
    const checkout = fakeBandedDeps({ salesEnabled: () => false });
    const { app, deps } = appWith({ checkout });
    for (const [path, body] of [["/api/chargebee/banded/plan-checkout", planBody], ["/api/chargebee/banded/referral-checkout", cartBody]] as const) {
      const res = await request(app).post(path).send(body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe(BANDED_REFUSALS.notOnSale);
      expect(res.body.error).toMatch(/Nothing has been charged/);
    }
    expect(deps.resolveIdentity).not.toHaveBeenCalled();
    expect(checkout.membership).not.toHaveBeenCalled();
    expect(checkout.reserveFoundingPlace).not.toHaveBeenCalled();
    expect(checkout.createPlanPage).not.toHaveBeenCalled();
    expect(checkout.createReferralPage).not.toHaveBeenCalled();
    expect(deps.createSubscriptionIntent).not.toHaveBeenCalled();
  });

  it("read the switch from the environment when the server wires no override, and stay off by default", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "");
    const checkout = fakeBandedDeps();
    delete checkout.salesEnabled;
    const { app } = appWith({ checkout });
    expect((await request(app).post("/api/chargebee/banded/plan-checkout").send(planBody)).status).toBe(409);
    vi.unstubAllEnvs();
  });

  it("tell the plans page nothing is on sale", async () => {
    const { app, deps } = appWith({ checkout: fakeBandedDeps({ salesEnabled: () => false }) });
    const res = await request(app).get("/api/chargebee/banded/offer");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ onSale: false });
    expect(bandedOfferResponseSchema.parse(res.body)).toEqual({ onSale: false });
    expect(deps.resolveIdentity).not.toHaveBeenCalled();
  });
});

describe("banded plan checkout route", () => {
  it("asks a signed-out visitor to sign in", async () => {
    const { app } = appWith({ resolveIdentity: vi.fn(async () => undefined) });
    expect((await request(app).post("/api/chargebee/banded/plan-checkout").send(planBody)).status).toBe(401);
  });

  it("refuses a referrer-role body (referrers never pay) before parsing anything else", async () => {
    const { app, deps } = appWith();
    const res = await request(app).post("/api/chargebee/banded/plan-checkout").send({ ...planBody, role: "referrer" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(REFERRER_PURCHASE_REFUSED_CODE);
    expect(deps.checkout!.createPlanPage).not.toHaveBeenCalled();
  });

  it("rejects a malformed body or a client price with 400 and no provider call", async () => {
    const { app, deps } = appWith();
    for (const body of [{}, { ...planBody, amount: 1 }, { ...planBody, idempotencyKey: "x" }]) {
      expect((await request(app).post("/api/chargebee/banded/plan-checkout").send(body)).status).toBe(400);
    }
    expect(deps.checkout!.createPlanPage).not.toHaveBeenCalled();
  });

  it("returns the hosted page and records the pending intent at the catalog price", async () => {
    const checkout = fakeBandedDeps();
    const { app, deps } = appWith({ checkout });
    const res = await request(app).post("/api/chargebee/banded/plan-checkout").send(planBody);
    expect(res.status).toBe(200);
    expect(checkoutResponseSchema.parse(res.body)).toEqual({ checkoutUrl: "https://fixture-test.chargebee.com/pages/v4/plan/checkout", hostedPageId: "hp_plan" });
    expect(deps.createSubscriptionIntent).toHaveBeenCalledWith({
      hostedPageId: "hp_plan", checkoutIntentId: bandedCheckoutIntentId("plan", "test", 7, KEY), userId: 7, role: "job_seeker",
      plan: "early_to_mid", itemPriceId: bandedPlanItemPriceId("early_to_mid", "INR"), amount: planFeeMinor("early_to_mid", "INR"), currency: "INR",
    });
    expect(deps.recordActivity).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7, action: "billing.banded_checkout_started", outcome: "success" }));
  });

  it("passes refusals through with their code and records them", async () => {
    const checkout = fakeBandedDeps({ reserveFoundingPlace: vi.fn(async () => ({ status: "full" as const })) });
    const { app, deps } = appWith({ checkout });
    const res = await request(app).post("/api/chargebee/banded/plan-checkout").send(planBody);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: BANDED_REFUSALS.foundingFull, error: "Founding places for Early to Mid are taken. Nothing has been charged." });
    expect(deps.createSubscriptionIntent).not.toHaveBeenCalled();
    expect(deps.recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.banded_checkout_refused", outcome: "denied" }));
  });

  it("answers 502 in plain words when the provider fails, and the reservation is released", async () => {
    const checkout = fakeBandedDeps({ createPlanPage: vi.fn(async () => { throw new Error("provider down"); }) });
    const { app, deps } = appWith({ checkout });
    const res = await request(app).post("/api/chargebee/banded/plan-checkout").send(planBody);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Nothing has been charged/);
    expect(checkout.releaseFoundingPlace).toHaveBeenCalled();
    expect(deps.createSubscriptionIntent).not.toHaveBeenCalled();
  });

  it("answers 503 when the server has not wired banded checkout at all", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "true");
    const { app } = appWith({ checkout: undefined });
    expect((await request(app).post("/api/chargebee/banded/plan-checkout").send(planBody)).status).toBe(503);
    vi.unstubAllEnvs();
  });
});

describe("banded extra-referral checkout route", () => {
  it("returns the hosted page and never writes a legacy credit-pack intent", async () => {
    const createPaymentIntent = vi.fn();
    const fulfillPayment = vi.fn();
    const checkout = fakeBandedDeps({ membership: vi.fn(async () => ({ bandedPlan: "early_to_mid" as const, activeSubscription: true })) });
    const app = express();
    app.use(express.json());
    registerChargebeeRoutes(app, { resolveIdentity: async () => identity, createPaymentIntent, fulfillPayment, banded: { checkout, createSubscriptionIntent: vi.fn() } });
    const res = await request(app).post("/api/chargebee/banded/referral-checkout").send(cartBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checkoutUrl: "https://fixture-test.chargebee.com/pages/v4/referral/checkout", hostedPageId: "hp_referral" });
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

  it("refuses levels outside the member's band", async () => {
    const { app } = appWith();
    const res = await request(app).post("/api/chargebee/banded/referral-checkout").send({ ...cartBody, items: [{ level: "executive", quantity: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(BANDED_REFUSALS.outsideBand);
  });
});

describe("banded offer while on sale", () => {
  it("lists every plan with its real founding places left and the member's own band", async () => {
    const checkout = fakeBandedDeps({ foundingPlacesLeft: vi.fn(async () => ({ early_to_mid: 12, mid_to_senior: 0, senior_to_executive: 100 })) });
    const { app } = appWith({ checkout, resolveIdentity: vi.fn(async () => identity) });
    vi.mocked(checkout.membership).mockResolvedValue({ bandedPlan: "early_to_mid", activeSubscription: true });
    const res = await request(app).get("/api/chargebee/banded/offer");
    expect(res.status).toBe(200);
    expect(bandedOfferResponseSchema.parse(res.body)).toEqual({
      onSale: true,
      memberPlan: "early_to_mid",
      plans: [
        { planId: "early_to_mid", byApplication: false, foundingPlacesLeft: 12 },
        { planId: "mid_to_senior", byApplication: false, foundingPlacesLeft: 0 },
        { planId: "senior_to_executive", byApplication: true, foundingPlacesLeft: 100 },
      ],
    });
    expect(checkout.foundingPlacesLeft).toHaveBeenCalledWith("test", expect.any(Date));
  });

  it("answers a signed-out visitor without a member plan", async () => {
    const { app } = appWith({ resolveIdentity: vi.fn(async () => undefined) });
    const res = await request(app).get("/api/chargebee/banded/offer");
    expect(res.status).toBe(200);
    expect(res.body.memberPlan).toBeNull();
  });
});

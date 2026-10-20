// GO-LIVE-1b ruling 2: POST /api/chargebee/subscription-recovery activates a
// pending pass checkout from its provider checkout page - ownership-checked,
// never trusting the client, idempotent with the webhook.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

const identity = { account: { id: 7, openId: "workos_test", email: "candidate@example.com", name: "Candidate" }, primaryEmail: { emailAddress: "candidate@example.com" } };
const intent = {
  id: 11, hostedPageId: "hp_pass_1", checkoutIntentId: "intent_pass_1", userId: 7, role: "job_seeker",
  plan: "momentum", itemPriceId: "skipwait_momentum_30d-USD", amount: 2400, currency: "USD",
  status: "pending", billingPeriod: "30d", kind: "new", subscriptionId: null, failureReason: null, failureCode: null, failedAt: null, createdAt: new Date("2026-10-21T00:00:00Z"),
};
const succeededPage = {
  hostedPageId: "hp_pass_1", state: "succeeded", passThruContent: "intent_pass_1", subscriptionId: "sub_1", customerId: "cust_1",
  subscription: { id: "sub_1", customerId: "cust_1", status: "active", currency: "USD", itemPriceId: "skipwait_momentum_30d-USD", currentTermStart: new Date("2026-10-21T00:00:00Z"), currentTermEnd: new Date("2026-11-20T00:00:00Z"), resourceVersion: 5 },
};

function harness(overrides: Record<string, unknown> = {}) {
  const spies = {
    retrieveCheckout: vi.fn(async () => succeededPage),
    applySubscriptionEvent: vi.fn(async () => ({ status: "applied" })),
    alert: vi.fn(async () => undefined),
    getSummary: vi.fn(async () => ({ plan: "momentum", subscriptionCurrentTermEnd: "2026-11-20T00:00:00.000Z" })),
    getIntent: vi.fn(async () => intent),
  };
  const app = express();
  app.use(express.json());
  registerChargebeeRoutes(app, {
    resolveIdentity: async () => identity,
    createPaymentIntent: async () => undefined,
    fulfillPayment: async () => ({ status: "credited" }),
    getSubscriptionCheckoutIntent: spies.getIntent,
    retrieveCheckout: spies.retrieveCheckout,
    applySubscriptionEvent: spies.applySubscriptionEvent,
    alertRetiredPlanEvent: spies.alert,
    getCreditSummary: spies.getSummary,
    ...overrides,
  });
  return { app, spies };
}

const post = (app: express.Express, body: unknown = { hostedPageId: "hp_pass_1", role: "job_seeker" }) => request(app).post("/api/chargebee/subscription-recovery").send(body);

describe("pass checkout recovery (GO-LIVE-1b)", () => {
  it("activates a succeeded pass page through the shared activation input, once", async () => {
    const { app, spies } = harness();
    const response = await post(app);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("activated");
    expect(spies.applySubscriptionEvent).toHaveBeenCalledTimes(1);
    const event = spies.applySubscriptionEvent.mock.calls[0][0];
    expect(event).toMatchObject({ eventId: "hosted_page:hp_pass_1", hostedPageId: "hp_pass_1", passThruContent: "intent_pass_1", subscriptionId: "sub_1", plan: "momentum", interval: "30d", itemPriceId: "skipwait_momentum_30d-USD", status: "active", currency: "USD", resourceVersion: 5 });
    expect(event.currentTermEnd).toEqual(new Date("2026-11-20T00:00:00Z"));
  });

  it("answers another seeker's hostedPageId 404 and never calls the provider", async () => {
    const { app, spies } = harness({ getSubscriptionCheckoutIntent: vi.fn(async () => ({ ...intent, userId: 99 })) });
    const response = await post(app);
    expect(response.status).toBe(404);
    expect(spies.retrieveCheckout).not.toHaveBeenCalled();
  });

  it("answers a referrer role 404 (the intent belongs to the seeker role)", async () => {
    const { app, spies } = harness();
    const response = await post(app, { hostedPageId: "hp_pass_1", role: "referrer" });
    expect(response.status).toBe(404);
    expect(spies.retrieveCheckout).not.toHaveBeenCalled();
  });

  it("answers pending when the provider page has not succeeded yet", async () => {
    const { app, spies } = harness();
    spies.retrieveCheckout.mockResolvedValue({ ...succeededPage, state: "acknowledged" });
    const response = await post(app);
    expect(response.body.status).toBe("pending");
    expect(spies.applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("answers an already-activated intent from state, with no provider call", async () => {
    const { app, spies } = harness({ getSubscriptionCheckoutIntent: vi.fn(async () => ({ ...intent, status: "activated" })) });
    const response = await post(app);
    expect(response.body.status).toBe("activated");
    expect(spies.retrieveCheckout).not.toHaveBeenCalled();
  });

  it("refuses a pass_thru_content mismatch as requires_review, alerting and granting nothing", async () => {
    const { app, spies } = harness();
    spies.retrieveCheckout.mockResolvedValue({ ...succeededPage, passThruContent: "intent_OTHER" });
    const response = await post(app);
    expect(response.body.status).toBe("requires_review");
    expect(spies.applySubscriptionEvent).not.toHaveBeenCalled();
    expect(spies.alert).toHaveBeenCalledTimes(1);
  });

  it("refuses an item price that is not the intent's term, granting nothing", async () => {
    const { app, spies } = harness();
    spies.retrieveCheckout.mockResolvedValue({ ...succeededPage, subscription: { ...succeededPage.subscription, itemPriceId: "skipwait_momentum_90d-USD" } });
    const response = await post(app);
    expect(response.body.status).toBe("requires_review");
    expect(spies.applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("a webhook after recovery updates by subscription id without a second grant path", async () => {
    // Activation happened; the intent is activated and the wallet holds sub_1.
    // The same apply function treats the webhook as an ordinary update (covered
    // in db tests); here the route itself stays idempotent on replay.
    const { app, spies } = harness({ getSubscriptionCheckoutIntent: vi.fn(async () => ({ ...intent, status: "activated" })) });
    expect((await post(app)).body.status).toBe("activated");
    expect(spies.applySubscriptionEvent).not.toHaveBeenCalled();
  });
});

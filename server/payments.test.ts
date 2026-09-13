import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPaymentRoutes, type ActivityInput } from "./payments";

type Deps = Parameters<typeof registerPaymentRoutes>[1];

const identity = { account: { id: 7 } };

function build(extra: Partial<Deps> = {}) {
  const app = express();
  app.use(express.json());
  const records: ActivityInput[] = [];
  registerPaymentRoutes(app, {
    resolveIdentity: async req => (req.header("x-test-user") === "member" ? identity : undefined),
    planPricing: planId => (planId === "pro" ? { inrAmount: 99, usdAmount: 1.19 } : undefined),
    record: async entry => {
      records.push(entry);
    },
    ...extra,
  });
  return { app, records };
}

describe("direct gateway order routes fail closed without a fulfillment path", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    process.env.PAYPAL_CLIENT_ID = "paypal_test_id";
    process.env.PAYPAL_SECRET = "paypal_test_secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_SECRET;
  });

  it("refuses the Razorpay plan order without ever contacting the gateway", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { app, records } = build();
    const response = await request(app)
      .post("/api/payments/razorpay/order")
      .set("x-test-user", "member")
      .send({ planId: "pro" });
    expect(response.status).toBe(501);
    // The decisive assertion: no order was minted, so no money can move.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      actorUserId: 7,
      action: "payment.razorpay_order_blocked",
      outcome: "denied",
      resourceType: "payment",
      metadata: { planId: "pro", reason: "no_fulfillment_path" },
    });
  });

  it("refuses the PayPal plan order without ever contacting the gateway", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { app, records } = build();
    const response = await request(app)
      .post("/api/payments/paypal/order")
      .set("x-test-user", "member")
      .send({ planId: "pro" });
    expect(response.status).toBe(501);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(records[0]).toMatchObject({
      actorUserId: 7,
      action: "payment.paypal_order_blocked",
      outcome: "denied",
      metadata: { planId: "pro", reason: "no_fulfillment_path" },
    });
  });

  it("still requires authentication and a known plan before the guard", async () => {
    const { app } = build();
    const anonymous = await request(app).post("/api/payments/razorpay/order").send({ planId: "pro" });
    expect(anonymous.status).toBe(401);
    const unknownPlan = await request(app)
      .post("/api/payments/razorpay/order")
      .set("x-test-user", "member")
      .send({ planId: "nope" });
    expect(unknownPlan.status).toBe(400);
  });

  it("creates the order once a fulfillment path is explicitly enabled", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => ({ id: "order_1", amount: 9900, currency: "INR" }) } as unknown as Response);
    const { app, records } = build({ planPurchaseFulfillmentEnabled: true });
    const response = await request(app)
      .post("/api/payments/razorpay/order")
      .set("x-test-user", "member")
      .send({ planId: "pro" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ orderId: "order_1", amount: 9900, currency: "INR" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(records[0]).toMatchObject({ action: "payment.razorpay_order_created", outcome: "success" });
  });

  it("returns 503 when the gateway is not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    const { app } = build();
    const response = await request(app)
      .post("/api/payments/razorpay/order")
      .set("x-test-user", "member")
      .send({ planId: "pro" });
    expect(response.status).toBe(503);
  });
});

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

function auth(secret: string) {
  return `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
}

const SECRET = "gift-safety-secret";

function appFor(deps?: Parameters<typeof registerChargebeeRoutes>[1]) {
  const app = express();
  app.use(express.json());
  registerChargebeeRoutes(app, {
    resolveIdentity: async () => undefined,
    createPaymentIntent: vi.fn(),
    fulfillPayment: vi.fn(async () => ({ status: "ignored" as const, reason: "test-double" })),
    ...deps,
  });
  return app;
}

function authed(app: ReturnType<typeof appFor>, payload: unknown) {
  return request(app).post("/api/chargebee/webhook").set("Authorization", auth(SECRET)).send(payload);
}

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
  vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", SECRET);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

// Gift subscriptions were enabled on the site, but no app flow creates gift
// checkouts. These tests lock in that gift traffic arriving at the webhook is
// terminally ignored: no credits move, no errors, retries stop (2xx).
describe("gift event safety", () => {
  it.each([
    "gift_scheduled",
    "gift_unclaimed",
    "gift_claimed",
    "gift_expired",
    "gift_cancelled",
    "gift_updated",
  ])("acknowledges %s without touching fulfillment", async eventType => {
    const fulfillPayment = vi.fn();
    const applySubscriptionEvent = vi.fn();
    const response = await authed(appFor({ fulfillPayment, applySubscriptionEvent }), {
      id: `ev_gift_${eventType}`,
      event_type: eventType,
      content: { gift: { id: "gift_123", status: "scheduled" } },
    });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ received: true, ignored: true });
    expect(fulfillPayment).not.toHaveBeenCalled();
    expect(applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("routes a gift-claimed subscription to the durable layer instead of crediting directly", async () => {
    const fulfillPayment = vi.fn();
    const applySubscriptionEvent = vi.fn(async () => ({ status: "ignored" as const, reason: "unknown_subscription" }));
    const response = await authed(appFor({ fulfillPayment, applySubscriptionEvent }), {
      id: "ev_gift_claim",
      event_type: "subscription_created",
      content: {
        subscription: {
          id: "sub_gifted_1",
          status: "active",
          currency_code: "USD",
          subscription_items: [{ item_price_id: "skipwait_pro_monthly-USD" }],
        },
      },
    });
    expect(response.status).toBe(200);
    expect(applySubscriptionEvent).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub_gifted_1", plan: "pro" }));
    expect(fulfillPayment).not.toHaveBeenCalled();
  });

  it("never resolves a gift payment against another checkout's hosted page", async () => {
    const resolveHostedPage = vi.fn(async () => undefined);
    const fulfillPayment = vi.fn(async () => ({ status: "ignored" as const, reason: "missing_hosted_page" }));
    // $7 Pro gift: amount coincides with 7 token packs, but the gift invoice
    // matches none of our pending hosted pages, so fulfillment stays ignored.
    const response = await authed(appFor({ fulfillPayment, resolveHostedPage }), {
      id: "ev_gift_payment",
      event_type: "payment_succeeded",
      content: {
        payment: { amount: 700, currency_code: "USD" },
        invoice: { id: "inv_gift_1", total: 700, currency_code: "USD" },
      },
    });
    expect(response.status).toBe(200);
    expect(resolveHostedPage).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: "inv_gift_1", amount: 700, currency: "USD" }));
    const fulfillment = fulfillPayment.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(fulfillment?.hostedPageId).toBeUndefined();
    expect(fulfillment?.passThruContent).toBeUndefined();
  });

  it("rejects unsigned gift deliveries before parsing", async () => {
    const fulfillPayment = vi.fn();
    const app = appFor({ fulfillPayment });
    const response = await request(app).post("/api/chargebee/webhook").send({ id: "ev_nosig", event_type: "gift_scheduled", content: {} });
    expect(response.status).toBe(401);
    expect(fulfillPayment).not.toHaveBeenCalled();
  });
});

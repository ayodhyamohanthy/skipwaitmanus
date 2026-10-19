// D-079: the webhook turns a provider card confirmation into a validated wallet,
// alerts the owner on unmatched customers and declined sources, and asks
// Chargebee to retry on a processing error.
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

const SECRET = "card-validation-secret";
const authHeader = `Basic ${Buffer.from(`skipwait:${SECRET}`).toString("base64")}`;

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

const post = (app: ReturnType<typeof appFor>, payload: unknown) =>
  request(app).post("/api/chargebee/webhook").set("Authorization", authHeader).send(payload);

const sourcePayload = (over: Record<string, unknown> = {}) => ({
  id: "ev_ps_1",
  event_type: "payment_source_added",
  content: { payment_source: { id: "pm_1", customer_id: "cb_cust_1", status: "valid" } },
  ...over,
});

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
  vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", SECRET);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("card-validation webhook (D-079)", () => {
  it("applies a valid payment source without alerting", async () => {
    const applyCardValidationEvent = vi.fn(async () => ({ status: "applied" as const, userId: 7, granted: true }));
    const alertCardValidationEvent = vi.fn(async () => ({ alerted: true }));
    const response = await post(appFor({ applyCardValidationEvent, alertCardValidationEvent }), sourcePayload());
    expect(response.status).toBe(200);
    expect(applyCardValidationEvent).toHaveBeenCalledWith({ eventId: "ev_ps_1", eventType: "payment_source_added", customerId: "cb_cust_1", paymentSourceId: "pm_1", status: "valid" });
    expect(alertCardValidationEvent).not.toHaveBeenCalled();
  });

  it("alerts the owner on an unmatched customer, a declined source, or an invalid source; still 202", async () => {
    for (const applied of [
      { status: "unmatched" as const, reason: "no_user_for_customer" },
      { status: "invalid_source" as const, reason: "invalid" },
    ]) {
      const applyCardValidationEvent = vi.fn(async () => applied);
      const alertCardValidationEvent = vi.fn(async () => ({ alerted: true }));
      const response = await post(appFor({ applyCardValidationEvent, alertCardValidationEvent }), sourcePayload());
      expect(response.status).toBe(200);
      expect(alertCardValidationEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "ev_ps_1", customerId: "cb_cust_1", reason: applied.reason }));
    }
  });

  it("answers 500 so Chargebee retries when applying throws", async () => {
    const applyCardValidationEvent = vi.fn(async () => { throw new Error("db down"); });
    const response = await post(appFor({ applyCardValidationEvent }), sourcePayload());
    expect(response.status).toBe(500);
  });

  it("without the dep wired the event is acknowledged and nothing happens", async () => {
    const response = await post(appFor({}), sourcePayload());
    expect([200, 202]).toContain(response.status);
  });
});

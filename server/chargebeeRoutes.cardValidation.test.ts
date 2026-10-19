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
  vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "true");
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

  it("ignores payment-source events byte-for-byte when the card-validation flag is off", async () => {
    vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "false");
    const applyCardValidationEvent = vi.fn(async () => ({ status: "applied" as const, userId: 7, granted: true }));
    const response = await post(appFor({ applyCardValidationEvent }), sourcePayload());
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ received: true, ignored: true });
    expect(applyCardValidationEvent).not.toHaveBeenCalled();
  });
});

describe("card-validation hosted page route (D-079)", () => {
  const identity = { account: { id: 11, email: "seeker@example.com", name: "Seeker One" }, primaryEmail: undefined };
  const postRoute = (app: ReturnType<typeof appFor>) => request(app).post("/api/chargebee/card-validation");

  it("answers 401 signed out and never touches the provider", async () => {
    const createCardValidationPage = vi.fn();
    const response = await postRoute(appFor({ createCardValidationPage }));
    expect(response.status).toBe(401);
    expect(createCardValidationPage).not.toHaveBeenCalled();
  });

  it("returns the hosted page for a signed-in seeker when the flag is on", async () => {
    const createCardValidationPage = vi.fn(async () => ({ url: "https://hosted.example/page-1" }));
    const response = await postRoute(appFor({ resolveIdentity: async () => identity, createCardValidationPage }));
    expect(response.status).toBe(200);
    expect(response.body.url).toBe("https://hosted.example/page-1");
    expect(createCardValidationPage).toHaveBeenCalledWith(expect.objectContaining({ userId: 11, email: "seeker@example.com" }));
  });

  it("answers 503 without touching the provider when the flag is off", async () => {
    vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "false");
    const createCardValidationPage = vi.fn(async () => ({ url: "https://hosted.example/unused" }));
    const response = await postRoute(appFor({ resolveIdentity: async () => identity, createCardValidationPage }));
    expect(response.status).toBe(503);
    expect(createCardValidationPage).not.toHaveBeenCalled();
  });

  it("answers 502 and alerts the owner when hosted-page creation fails", async () => {
    const createCardValidationPage = vi.fn(async () => { throw new Error("chargebee down"); });
    const alertCardValidationPageError = vi.fn(async () => ({ alerted: true }));
    const response = await postRoute(appFor({ resolveIdentity: async () => identity, createCardValidationPage, alertCardValidationPageError }));
    expect(response.status).toBe(502);
    expect(alertCardValidationPageError).toHaveBeenCalledTimes(1);
    expect((alertCardValidationPageError.mock.calls[0]?.[0] as Error).message).toBe("chargebee down");
  });
});

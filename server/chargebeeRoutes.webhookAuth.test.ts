// REL-webhook-auth-alarm (D-212): the webhook's 401 branch is recorded; acceptance and refusal are unchanged.
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@sentry/node", async importOriginal => ({ ...(await importOriginal<typeof import("@sentry/node")>()), captureMessage: sentry.captureMessage }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), isServerSentryActive: () => true }));

import { registerChargebeeRoutes } from "./chargebeeRoutes";
import { resetWebhookAuthAlarmForTests } from "./webhookAuthAlarm";

const SECRET = "fixture-webhook-secret";
const auth = (secret: string) => `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
const EVENT = { id: "ev_fixture", event_type: "payment_succeeded", content: { payment: { amount: 9900, currency_code: "INR", hosted_page_id: "hp_fixture" } } };

function buildApp() {
  const app = express();
  app.use(express.json());
  const recordActivity = vi.fn(async (_input: { action: string; outcome: string }) => undefined);
  const fulfillPayment = vi.fn(async () => ({ status: "credited" }));
  registerChargebeeRoutes(app, { resolveIdentity: async () => undefined, createPaymentIntent: async () => undefined, recordActivity, fulfillPayment });
  return { app, recordActivity, fulfillPayment };
}
const unauthorizedRows = (spy: ReturnType<typeof buildApp>["recordActivity"]) => spy.mock.calls.map(call => call[0]).filter(row => row.action === "chargebee.webhook.unauthorized");

beforeEach(() => {
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
  vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", SECRET);
  sentry.captureMessage.mockReset();
  resetWebhookAuthAlarmForTests();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Chargebee webhook secret refusal (D-212)", () => {
  it("a wrong secret still answers 401 before any fulfillment, and writes one row and one capture", async () => {
    const { app, recordActivity, fulfillPayment } = buildApp();
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth("drifted-secret")).send(EVENT);
    expect(response.status).toBe(401);
    expect(response.text).toBe("Unauthorized");
    expect(fulfillPayment).not.toHaveBeenCalled();
    expect(unauthorizedRows(recordActivity)).toEqual([{ action: "chargebee.webhook.unauthorized", outcome: "failure", resourceType: "chargebee_webhook" }]);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("chargebee webhook unauthorized", { fingerprint: ["chargebee-webhook-401"] });
  });

  it("a missing Authorization header and an unset secret are recorded the same way", async () => {
    const { app, recordActivity } = buildApp();
    expect((await request(app).post("/api/chargebee/webhook").send(EVENT)).status).toBe(401);
    vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", "");
    expect((await request(app).post("/api/chargebee/webhook").set("Authorization", auth(SECRET)).send(EVENT)).status).toBe(401);
    expect(unauthorizedRows(recordActivity)).toHaveLength(2);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("a valid webhook writes no unauthorized row and raises no capture", async () => {
    const { app, recordActivity, fulfillPayment } = buildApp();
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth(SECRET)).send(EVENT);
    expect(response.status).not.toBe(401);
    expect(fulfillPayment).toHaveBeenCalled();
    expect(unauthorizedRows(recordActivity)).toEqual([]);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});

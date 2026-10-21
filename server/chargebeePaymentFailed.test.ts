import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseFailedPaymentEvent } from "./chargebee";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

const secret = "failed-secret";
const auth = () => `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
beforeEach(() => { vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", secret); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const failed = (extra: Record<string, unknown> = {}) => ({ id: "ev_failed_1", event_type: "payment_failed", content: { payment: { amount: 490, currency_code: "USD", invoice_id: "11", subscription_id: "sub_9" }, invoice: { id: "11", customer_id: "cust_9" }, ...extra } });

describe("parseFailedPaymentEvent", () => {
  it("reads the payment, invoice and customer refs", () => {
    expect(parseFailedPaymentEvent(failed())).toEqual({ eventId: "ev_failed_1", invoiceId: "11", subscriptionId: "sub_9", customerId: "cust_9", amount: 490, currency: "USD" });
  });
  it("ignores other event types and events without an id", () => {
    expect(parseFailedPaymentEvent({ id: "ev_1", event_type: "payment_succeeded", content: {} })).toBeUndefined();
    expect(parseFailedPaymentEvent({ event_type: "payment_failed", content: {} })).toBeUndefined();
  });
  it("leaves unparseable amounts undefined rather than dropping the event", () => {
    expect(parseFailedPaymentEvent({ id: "ev_2", event_type: "payment_failed", content: { invoice: { id: "12", total: "not-a-number" } } })).toMatchObject({ eventId: "ev_2", invoiceId: "12", amount: undefined });
  });
});

describe("payment_failed webhook handling (owner rule: never silent)", () => {
  it("records the failure and alerts without touching credits", async () => {
    const alertFailedPayment = vi.fn(async () => ({ alerted: true }));
    const fulfillPayment = vi.fn();
    const recordActivity = vi.fn(async () => undefined);
    const app = express(); app.use(express.json());
    registerChargebeeRoutes(app, { resolveIdentity: vi.fn(), createPaymentIntent: vi.fn(), fulfillPayment, alertFailedPayment, recordActivity } as any);
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(failed());
    expect(response.status).toBe(200);
    expect(fulfillPayment).not.toHaveBeenCalled();
    expect(alertFailedPayment).toHaveBeenCalledWith(expect.objectContaining({ eventId: "ev_failed_1", invoiceId: "11", subscriptionId: "sub_9", customerId: "cust_9", amount: 490, currency: "USD" }));
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.payment_failed", outcome: "failure", resourceId: "11" }));
  });
});

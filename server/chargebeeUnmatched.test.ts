import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

const secret = "unmatched-secret";
const auth = () => `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
beforeEach(() => { vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", secret); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function appWith(overrides: Record<string, unknown> = {}) {
  const alertUnmatchedPayment = vi.fn(async () => ({ alerted: true }));
  const recordActivity = vi.fn(async () => undefined);
  const app = express(); app.use(express.json());
  registerChargebeeRoutes(app, { resolveIdentity: vi.fn(), createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(async () => ({ status: "ignored", reason: "unknown_checkout" })), alertUnmatchedPayment, recordActivity, ...overrides } as any);
  return { app, alertUnmatchedPayment, recordActivity };
}
const paid = (extra: Record<string, unknown> = {}, amount = 700) => ({ id: `ev_${amount}_${Object.keys(extra).join("")}`, event_type: "payment_succeeded", content: { payment: { amount, currency_code: "USD", hosted_page_id: "hp_x" }, hosted_page: { pass_thru_content: "intent_x" }, invoice: { id: "inv_x" }, ...extra } });

describe("unmatched paid invoice safety net (#77)", () => {
  it("parks a paid invoice with no known checkout for review and alerts the admin", async () => {
    const { app, alertUnmatchedPayment, recordActivity } = appWith();
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(paid());
    expect(response.status).toBe(200);
    expect(response.body.obligations.payment).toMatchObject({ status: "requires_review", reason: "unknown_checkout" });
    expect(alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: "inv_x", reason: "unknown_checkout", paidAmount: 700, paidCurrency: "USD" }));
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.payment_unmatched", outcome: "failure" }));
  });

  it("also catches a paid amount that is not a whole number of packs", async () => {
    const fulfillPayment = vi.fn();
    const { app, alertUnmatchedPayment } = appWith({ fulfillPayment });
    const body = paid({}, 750); delete (body.content as any).hosted_page;
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(body);
    expect(response.status).toBe(200);
    expect(fulfillPayment).not.toHaveBeenCalled();
    expect(alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({ reason: "unpriced_amount", paidAmount: 750 }));
  });

  it("does not alert for a credited pack purchase", async () => {
    const { app, alertUnmatchedPayment } = appWith({ fulfillPayment: vi.fn(async () => ({ status: "credited", tokenCount: 7 })) });
    await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(paid());
    expect(alertUnmatchedPayment).not.toHaveBeenCalled();
  });

  it("does not alert for a subscription renewal the subscription handler applied", async () => {
    const { app, alertUnmatchedPayment } = appWith({ applySubscriptionEvent: vi.fn(async () => ({ status: "applied" })) });
    await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(paid({ subscription: { id: "sub_1", status: "active", plan_id: "pro" } }));
    expect(alertUnmatchedPayment).not.toHaveBeenCalled();
  });

  it("does not alert for a gifted subscription invoice", async () => {
    const { app, alertUnmatchedPayment } = appWith();
    await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(paid({ subscription: { id: "sub_g", gift_id: "gift_1" } }));
    expect(alertUnmatchedPayment).not.toHaveBeenCalled();
  });
});

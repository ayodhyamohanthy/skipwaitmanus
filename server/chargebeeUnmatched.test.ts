// D-067 recovery: transport belongs exclusively to the durable scheduled consumer.
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
    await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(paid({ subscription: { id: "sub_1", status: "active", subscription_items: [{ item_price_id: "skipwait_start_30d-USD" }] } }));
    expect(alertUnmatchedPayment).not.toHaveBeenCalled();
  });

  // D-067: no plan can be gifted any more (gifts only ever sold Pro/Max), so a paid gift
  // invoice is a payment nothing explains: it is parked and alerted, never dropped silently.
  it("parks and alerts a gifted subscription invoice", async () => {
    const { app, alertUnmatchedPayment, recordActivity } = appWith();
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(paid({ subscription: { id: "sub_g", gift_id: "gift_1" } }));
    expect(response.status).toBe(200);
    expect(response.body.obligations.payment).toMatchObject({ status: "requires_review" });
    expect(alertUnmatchedPayment).toHaveBeenCalledTimes(1);
    expect(alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: "inv_x", paidAmount: 700, paidCurrency: "USD" }));
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.payment_unmatched", outcome: "failure" }));
  });

  // D-067: a late renewal of a retired Pro/Max subscription grants nothing: the subscription
  // handler gets no plan, the paid invoice is parked and alerted, and the retired plan is alerted too.
  it("parks and alerts a retired Pro/Max renewal invoice; the subscription handler receives no plan", async () => {
    const applySubscriptionEvent = vi.fn(async () => ({ status: "ignored", reason: "plan_retired" }));
    const alertRetiredPlanEvent = vi.fn(async () => ({ alerted: true }));
    const fulfillPayment = vi.fn(async () => ({ status: "ignored", reason: "missing_hosted_page" }));
    const { app, alertUnmatchedPayment, recordActivity } = appWith({ applySubscriptionEvent, alertRetiredPlanEvent, fulfillPayment });
    const body = { id: "ev_max_renewal", event_type: "payment_succeeded", content: { transaction: { amount: 1_500, currency_code: "USD" }, invoice: { id: "inv_max_renewal", total: 1_500, currency_code: "USD" }, subscription: { id: "sub_max_legacy", status: "active", currency_code: "USD", subscription_items: [{ item_price_id: "skipwait_max_monthly-USD" }] } } };
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send(body);
    expect(response.status).toBe(200);
    expect(applySubscriptionEvent).toHaveBeenCalledTimes(1);
    expect(applySubscriptionEvent).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub_max_legacy", itemPriceId: "skipwait_max_monthly-USD", plan: undefined, interval: undefined }));
    expect(response.body.obligations.subscription).toEqual({ status: "ignored", reason: "plan_retired" });
    expect(response.body.obligations.payment).toMatchObject({ status: "requires_review" });
    expect(alertUnmatchedPayment).toHaveBeenCalledTimes(1);
    expect(alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: "inv_max_renewal", paidAmount: 1_500, paidCurrency: "USD" }));
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.payment_unmatched", outcome: "failure" }));
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.retired_plan_event", outcome: "failure", resourceId: "sub_max_legacy" }));
  });

  it("alerts a retired-plan subscription event that carries no payment, and still acknowledges it", async () => {
    const applySubscriptionEvent = vi.fn(async () => ({ status: "ignored", reason: "plan_retired" }));
    const alertRetiredPlanEvent = vi.fn(async () => ({ alerted: true }));
    const { app, alertUnmatchedPayment } = appWith({ applySubscriptionEvent, alertRetiredPlanEvent });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send({ id: "ev_pro_changed", event_type: "subscription_changed", content: { subscription: { id: "sub_pro_legacy", status: "active", subscription_items: [{ item_price_id: "skipwait_pro_monthly-INR" }] } } });
    expect(response.status).toBe(200);
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
    expect(alertUnmatchedPayment).not.toHaveBeenCalled();
  });

  // Review round 2: an event skipwait.me cannot place (an item price outside the price book on a
  // subscription a wallet still holds) is not called Pro/Max: it is alerted as "unrecognised,
  // review", with its own activity, so nobody refunds a kit customer on a wrong label.
  it("alerts an unrecognised item price as unsupported, never as a retired Pro/Max plan", async () => {
    const applySubscriptionEvent = vi.fn(async () => ({ status: "ignored", reason: "unsupported_plan" }));
    const alertRetiredPlanEvent = vi.fn(async () => ({ alerted: true }));
    const { app, recordActivity } = appWith({ applySubscriptionEvent, alertRetiredPlanEvent });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send({ id: "ev_unknown_price", event_type: "subscription_changed", content: { subscription: { id: "sub_start", status: "cancelled", subscription_items: [{ item_price_id: "skipwait_start_30d_v2-USD" }] } } });
    expect(response.status).toBe(200);
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.unsupported_plan_event", outcome: "failure", resourceId: "sub_start" }));
    expect(recordActivity).not.toHaveBeenCalledWith(expect.objectContaining({ action: "billing.retired_plan_event" }));
  });

  it("calls a retired item price retired even when the handler answers with another reason", async () => {
    const alertRetiredPlanEvent = vi.fn(async () => ({ alerted: true }));
    const { app } = appWith({ applySubscriptionEvent: vi.fn(async () => ({ status: "ignored", reason: "unsupported_plan" })), alertRetiredPlanEvent });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send({ id: "ev_max_old", event_type: "subscription_renewed", content: { subscription: { id: "sub_max_legacy", status: "active", subscription_items: [{ item_price_id: "skipwait_max_monthly-USD" }] } } });
    expect({ status: response.status, body: response.body }).toMatchObject({ status: 200, body: { obligations: { subscription: { status: "ignored" } } } });
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
  });

  it("does not alert again for a redelivered retired-plan event already recorded", async () => {
    const alertRetiredPlanEvent = vi.fn(async () => ({ alerted: true }));
    const { app } = appWith({ applySubscriptionEvent: vi.fn(async () => ({ status: "duplicate" })), alertRetiredPlanEvent });
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send({ id: "ev_pro_changed", event_type: "subscription_changed", content: { subscription: { id: "sub_pro_legacy", status: "active", subscription_items: [{ item_price_id: "skipwait_pro_monthly-INR" }] } } });
    expect(response.status).toBe(200);
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
  });

  it("never raises the retired-plan alert for a kit subscription event", async () => {
    const alertRetiredPlanEvent = vi.fn(async () => ({ alerted: true }));
    const { app } = appWith({ applySubscriptionEvent: vi.fn(async () => ({ status: "applied" })), alertRetiredPlanEvent });
    await request(app).post("/api/chargebee/webhook").set("Authorization", auth()).send({ id: "ev_start", event_type: "subscription_renewed", content: { subscription: { id: "sub_start", status: "active", subscription_items: [{ item_price_id: "skipwait_start_30d-USD" }] } } });
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
  });
});

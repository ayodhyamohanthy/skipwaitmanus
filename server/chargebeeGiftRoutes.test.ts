import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

function auth(secret: string) {
  return `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
}

const SECRET = "gift-routes-secret";

function appFor(deps?: Parameters<typeof registerChargebeeRoutes>[1]) {
  const app = express();
  app.use(express.json());
  registerChargebeeRoutes(app, {
    resolveIdentity: async () => ({ account: { id: 7 } }),
    createPaymentIntent: vi.fn(),
    fulfillPayment: vi.fn(async () => ({ status: "ignored" as const, reason: "test-double" })),
    ...deps,
  });
  return app;
}

beforeEach(() => {
  vi.stubEnv("GIFT_CHECKOUT_ENABLED", "true");
  vi.stubEnv("BILLING_ENV", "test");
  vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
  vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", SECRET);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const giftClaimedPayload = (gift: Record<string, unknown>) => ({
  id: "ev_gift_claimed_9",
  event_type: "gift_claimed",
  content: { gift },
});

describe("gift checkout endpoint", () => {
  // D-067: gifts only ever sold Pro or Max, which are removed completely, so the
  // route stays off whatever the environment says, before identity or any provider call.
  it.each(["", "true"])("refuses every gift checkout with 503 when GIFT_CHECKOUT_ENABLED is %j", async flag => {
    vi.stubEnv("GIFT_CHECKOUT_ENABLED", flag);
    const createGiftCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example/gift", hostedPageId: "hp_gift_7" }));
    const resolveIdentity = vi.fn(async () => ({ account: { id: 7 } }));
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    for (const body of [{ plan: "pro", currency: "USD", billingCountry: "INTL" }, { plan: "max", currency: "INR", billingCountry: "IN" }, {}]) {
      const response = await request(appFor({ createGiftCheckout, resolveIdentity } as never)).post("/api/chargebee/gift-checkout").send(body);
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: "Gifting is not available. Nothing has been charged." });
    }
    expect(createGiftCheckout).not.toHaveBeenCalled();
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("gift mine and claim endpoints", () => {
  it("lists buyer receipts and recipient claimables", async () => {
    const listBuyerGifts = vi.fn(async () => [{ giftId: "g1", plan: "pro", fulfillmentStatus: "pending" }]);
    const listClaimableGifts = vi.fn(async () => [{ giftId: "g2", plan: "max" }]);
    const app = appFor({ listBuyerGifts, listClaimableGifts });
    const response = await request(app).get("/api/chargebee/gifts/mine");
    expect(response.status).toBe(200);
    expect(response.body.sent).toHaveLength(1);
    expect(response.body.claimable).toHaveLength(1);
  });

  // D-067: every gift was a Pro or Max gift, so a claim is refused, never credited.
  it("refuses a retired-plan gift claim with 409 plan_retired, alerts, and writes no wallet", async () => {
    const claimGift = vi.fn(async () => ({ status: "retired" as const }));
    const alertRetiredPlanEvent = vi.fn(async () => ({ alerted: true }));
    const recordActivity = vi.fn(async () => undefined);
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    const app = appFor({ claimGift, alertRetiredPlanEvent, recordActivity } as never);
    const response = await request(app).post("/api/chargebee/gifts/claim").send({ giftId: "gift_ready" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "This gift was for a plan SkipWait no longer offers, so it cannot be added to your account. We have told our team so the person who sent it can be refunded.", code: "plan_retired" });
    expect(claimGift).toHaveBeenCalledWith(7, "gift_ready");
    expect(alertRetiredPlanEvent).toHaveBeenCalledWith(expect.objectContaining({ giftId: "gift_ready", reason: "gift_claim_refused" }));
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7, action: "billing.gift_claim_refused", outcome: "denied", resourceType: "gift", resourceId: "gift_ready" }));
    expect(recordActivity).not.toHaveBeenCalledWith(expect.objectContaining({ action: "billing.gift_claimed" }));
    expect(provider).not.toHaveBeenCalled();
  });

  it("answers a gift credited before D-067 as a duplicate, without crediting again", async () => {
    const claimGift = vi.fn(async () => ({ status: "duplicate" as const }));
    const response = await request(appFor({ claimGift } as never)).post("/api/chargebee/gifts/claim").send({ giftId: "gift_old" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "duplicate" });
  });

  it("maps claim failures to honest statuses", async () => {
    const notFound = appFor({ claimGift: async () => { throw new Error("We could not find this gift"); } });
    expect((await request(notFound).post("/api/chargebee/gifts/claim").send({ giftId: "nope" })).status).toBe(404);
    const wrongEmail = appFor({ claimGift: async () => { throw new Error("This gift was sent to a different email address"); } });
    expect((await request(wrongEmail).post("/api/chargebee/gifts/claim").send({ giftId: "g1" })).status).toBe(403);
    const badBody = appFor({ claimGift: vi.fn() });
    expect((await request(badBody).post("/api/chargebee/gifts/claim").send({})).status).toBe(400);
    const notReady = appFor({ claimGift: async () => { throw new Error("This gift is not ready to claim yet"); } } as never);
    expect((await request(notReady).post("/api/chargebee/gifts/claim").send({ giftId: "g2" })).status).toBe(400);
  });

  it("never asks the provider for a gift's plan any more", async () => {
    const retrieveGiftPlan = vi.fn(async () => ({ subscriptionId: "sub_enrich", plan: "pro" as const, currency: "USD" as const }));
    const updateGiftPlan = vi.fn(async () => ({}));
    const claimGift = vi.fn(async () => { throw new Error("This gift is not ready to claim yet"); });
    const listClaimableGifts = vi.fn(async () => [{ giftId: "gift_enrich", plan: null, subscriptionId: "sub_enrich" }]);
    const response = await request(appFor({ claimGift, listClaimableGifts, retrieveGiftPlan, updateGiftPlan } as never)).post("/api/chargebee/gifts/claim").send({ giftId: "gift_enrich" });
    expect(response.status).toBe(400);
    expect(retrieveGiftPlan).not.toHaveBeenCalled();
    expect(updateGiftPlan).not.toHaveBeenCalled();
    expect(claimGift).toHaveBeenCalledTimes(1);
  });
});

describe("gift webhook branch", () => {
  const authed = (app: ReturnType<typeof appFor>, payload: unknown) =>
    request(app).post("/api/chargebee/webhook").set("Authorization", auth(SECRET)).send(payload);

  it("records lifecycle events without moving any credit", async () => {
    const recordGiftEvent = vi.fn(async () => ({ giftId: "gift_1", fulfillmentStatus: "pending" }));
    const fulfillGift = vi.fn();
    const app = appFor({ recordGiftEvent, fulfillGift });
    const response = await authed(app, { id: "ev_sched", event_type: "gift_scheduled", content: { gift: { id: "gift_1", status: "scheduled", gifter: { customer_id: "skipwait-u9" }, gift_receiver: { email: "james@user.com" } } } });
    expect(response.status).toBe(202);
    expect(recordGiftEvent).toHaveBeenCalledWith(expect.objectContaining({ giftId: "gift_1", buyerUserId: 9, receiverEmail: "james@user.com" }));
    expect(fulfillGift).not.toHaveBeenCalled();
  });

  // D-067: a claimed gift used to credit the recipient's wallet with Pro or Max. It is now a
  // durable receipt only (parked as plan_retired by recordGiftEvent), answered 2xx so Chargebee
  // stops retrying, and alerted so a human cancels and refunds it in the Chargebee dashboard.
  it("records a claimed gift as a receipt, never fulfils it, and alerts the admin", async () => {
    const recordGiftEvent = vi.fn(async () => ({ giftId: "gift_1", fulfillmentStatus: "conflict", plan: "pro" as const, currency: "USD" }));
    const retrieveGiftPlan = vi.fn(async () => ({ subscriptionId: "sub_g1", plan: "pro" as const, currency: "USD" as const }));
    const updateGiftPlan = vi.fn(async () => ({}));
    const resolveGiftRecipient = vi.fn(async () => ({ status: "resolved", userId: 7 }));
    const fulfillGift = vi.fn(async () => ({ status: "credited" }));
    const alertRetiredPlanEvent = vi.fn(async () => ({ alerted: true }));
    const recordActivity = vi.fn(async () => undefined);
    const fulfillPayment = vi.fn();
    const applySubscriptionEvent = vi.fn();
    const app = appFor({ recordGiftEvent, retrieveGiftPlan, updateGiftPlan, resolveGiftRecipient, fulfillGift, alertRetiredPlanEvent, recordActivity, fulfillPayment, applySubscriptionEvent } as never);
    const response = await authed(app, giftClaimedPayload({ id: "gift_1", status: "claimed", gifter: { customer_id: "skipwait-u9" }, gift_receiver: { email: "james@user.com", subscription_id: "sub_g1" } }));
    expect(response.status).toBe(200);
    expect(response.body.obligations.gift).toEqual({ status: "parked", reason: "plan_retired" });
    expect(recordGiftEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "ev_gift_claimed_9", giftId: "gift_1", status: "claimed", subscriptionId: "sub_g1", receiverEmail: "james@user.com", buyerUserId: 9 }));
    for (const untouched of [retrieveGiftPlan, updateGiftPlan, resolveGiftRecipient, fulfillGift, fulfillPayment, applySubscriptionEvent]) expect(untouched).not.toHaveBeenCalled();
    expect(alertRetiredPlanEvent).toHaveBeenCalledTimes(1);
    expect(alertRetiredPlanEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "ev_gift_claimed_9", eventType: "gift_claimed", giftId: "gift_1", subscriptionId: "sub_g1", reason: "gift_claimed" }));
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.retired_plan_event", outcome: "failure", resourceType: "gift", resourceId: "gift_1" }));
  });

  it("asks for a retry when the gift receipt cannot be recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const alertRetiredPlanEvent = vi.fn();
    const app = appFor({ recordGiftEvent: vi.fn(async () => { throw new Error("db down"); }), alertRetiredPlanEvent } as never);
    const response = await authed(app, giftClaimedPayload({ id: "gift_1", status: "claimed", gift_receiver: { email: "james@user.com", subscription_id: "sub_g1" } }));
    expect(response.status).toBe(500);
    expect(alertRetiredPlanEvent).not.toHaveBeenCalled();
  });

  it("leaves a claimed gift without receiver identifiers as a receipt", async () => {
    const recordGiftEvent = vi.fn(async () => ({ giftId: "gift_1", fulfillmentStatus: "pending" }));
    const fulfillGift = vi.fn();
    const app = appFor({ recordGiftEvent, fulfillGift });
    const response = await authed(app, { id: "ev_bare", event_type: "gift_claimed", content: { gift: { id: "gift_1", status: "claimed" } } });
    expect(response.status).toBe(202);
    expect(fulfillGift).not.toHaveBeenCalled();
  });

  it("rejects unsigned gift deliveries before parsing", async () => {
    const app = appFor({ recordGiftEvent: vi.fn() });
    const response = await request(app).post("/api/chargebee/webhook").send({ id: "x", event_type: "gift_claimed", content: {} });
    expect(response.status).toBe(401);
  });
});

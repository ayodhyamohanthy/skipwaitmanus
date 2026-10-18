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

// D-067 (owner, Oct 18 2026): gifting a Pro/Max subscription is retired. No new
// gift checkout can start, and a historic gift only settles when its own row
// already carries the plan it was sold with.
describe("gift checkout is retired", () => {
  it("answers 410 with the retired code and never calls a provider", async () => {
    const createGiftCheckout = vi.fn();
    const response = await request(appFor({ createGiftCheckout })).post("/api/chargebee/gift-checkout").send({ plan: "pro", currency: "USD", billingCountry: "INTL" });
    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({ code: "gift_retired" });
    expect(createGiftCheckout).not.toHaveBeenCalled();
  });

  it("answers 410 before sign-in and whatever the body says", async () => {
    const signedOut = appFor({ resolveIdentity: async () => undefined });
    expect((await request(signedOut).post("/api/chargebee/gift-checkout").send({ plan: "max", currency: "INR", billingCountry: "IN" })).status).toBe(410);
    expect((await request(signedOut).post("/api/chargebee/gift-checkout").send({})).status).toBe(410);
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

  it("claims a ready gift for its verified recipient", async () => {
    const claimGift = vi.fn(async () => ({ status: "credited" }));
    const app = appFor({ claimGift });
    const response = await request(app).post("/api/chargebee/gifts/claim").send({ giftId: "gift_ready" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "credited" });
    expect(claimGift).toHaveBeenCalledWith(7, "gift_ready");
  });

  it("maps claim failures to honest statuses", async () => {
    const notFound = appFor({ claimGift: async () => { throw new Error("We could not find this gift"); } });
    expect((await request(notFound).post("/api/chargebee/gifts/claim").send({ giftId: "nope" })).status).toBe(404);
    const wrongEmail = appFor({ claimGift: async () => { throw new Error("This gift was sent to a different email address"); } });
    expect((await request(wrongEmail).post("/api/chargebee/gifts/claim").send({ giftId: "g1" })).status).toBe(403);
    const badBody = appFor({ claimGift: vi.fn() });
    expect((await request(badBody).post("/api/chargebee/gifts/claim").send({})).status).toBe(400);
  });

  it("answers the retired code for a plan-less historic gift instead of retrying forever", async () => {
    // The provider re-read that used to fill a missing plan needed a Pro/Max item
    // price that D-067 deleted, so this can never become claimable.
    const claimGift = vi.fn(async () => { throw new Error("This gift is not ready to claim yet"); });
    const app = appFor({ claimGift });
    const response = await request(app).post("/api/chargebee/gifts/claim").send({ giftId: "gift_enrich" });
    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({ code: "gift_retired" });
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

  it("credits a claimed gift whose own row already carries the plan", async () => {
    const recordGiftEvent = vi.fn(async () => ({ giftId: "gift_1", fulfillmentStatus: "pending", plan: "pro", currency: "USD" }));
    const resolveGiftRecipient = vi.fn(async () => ({ status: "resolved", userId: 7 }));
    const fulfillGift = vi.fn(async () => ({ status: "credited" }));
    const app = appFor({ recordGiftEvent, resolveGiftRecipient, fulfillGift });
    const response = await authed(app, giftClaimedPayload({ id: "gift_1", status: "claimed", gifter: { customer_id: "skipwait-u9" }, gift_receiver: { email: "james@user.com", subscription_id: "sub_g1" } }));
    expect(response.status).toBe(200);
    expect(fulfillGift).toHaveBeenCalledWith(expect.objectContaining({ giftId: "gift_1", subscriptionId: "sub_g1", plan: "pro", recipientUserId: 7, role: "job_seeker" }));
  });

  it("settles a claimed gift with no recorded plan as history and moves no credit", async () => {
    const recordGiftEvent = vi.fn(async () => ({ giftId: "gift_1", fulfillmentStatus: "pending", plan: null, currency: null }));
    const resolveGiftRecipient = vi.fn(async () => ({ status: "resolved", userId: 7 }));
    const fulfillGift = vi.fn();
    const app = appFor({ recordGiftEvent, resolveGiftRecipient, fulfillGift });
    const response = await authed(app, giftClaimedPayload({ id: "gift_1", status: "claimed", gifter: { customer_id: "skipwait-u9" }, gift_receiver: { email: "james@user.com", subscription_id: "sub_g1" } }));
    expect(response.status).toBe(200);
    expect(fulfillGift).not.toHaveBeenCalled();
    expect(resolveGiftRecipient).not.toHaveBeenCalled();
  });

  it("holds an unresolvable claim as pending without crediting", async () => {
    const recordGiftEvent = vi.fn(async () => ({ giftId: "gift_1", fulfillmentStatus: "pending", plan: "pro", currency: "USD" }));
    const resolveGiftRecipient = vi.fn(async () => ({ status: "unresolved" }));
    const fulfillGift = vi.fn();
    const app = appFor({ recordGiftEvent, resolveGiftRecipient, fulfillGift });
    const response = await authed(app, giftClaimedPayload({ id: "gift_1", status: "claimed", gift_receiver: { email: "stranger@example.com", subscription_id: "sub_g1" } }));
    expect(response.status).toBe(200);
    expect(response.body.obligations.gift).toMatchObject({ status: "pending", reason: "recipient_unresolved" });
    expect(fulfillGift).not.toHaveBeenCalled();
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

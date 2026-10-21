import express from "express";
import request from "supertest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { billingReviewOutbox, giftSubscriptionFulfillments, canonicalPeople, users, verifiedLoginAliases, tokenBalances, tokenTransactions, paymentFulfillments, planCreditGrants } from "../drizzle/schema";
import { createInMemoryDrizzle } from "./inMemoryDrizzle.testkit";
import { registerChargebeeRoutes } from "./chargebeeRoutes";
import { runBillingReviewOutbox } from "./billingReviewOutbox";
import { applyChargebeeSubscriptionEvent, recordGiftProviderEvent, claimGiftSubscription } from "./db";
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
const memory = createInMemoryDrizzle();
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("BILLING_ENV", "test"); vi.stubEnv("CHARGEBEE_SITE", "fixture-test"); vi.stubEnv("CHARGEBEE_API_KEY", "fixture"); vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", "fixture-secret");
  vi.stubEnv("RESEND_API_KEY", "fixture"); vi.stubEnv("ERROR_ALERT_FROM_EMAIL", "fixture@example.invalid");
  memory.reset([[canonicalPeople, [{ id: 1, suspended: false }]], [users, [{ id: 7, canonicalPersonId: 1, suspended: false }]], [verifiedLoginAliases, [{ id: 1, canonicalPersonId: 1, normalizedVerifiedEmail: "recipient@example.invalid" }]], [giftSubscriptionFulfillments, [{ id: 1, giftId: "gift_fixture", fulfillmentStatus: "pending", receiverEmail: "recipient@example.invalid" }]]]);
  mocks.createPool.mockResolvedValue({}); mocks.drizzle.mockReturnValue(memory.db);
});
afterEach(() => {
  for (const table of [tokenBalances, tokenTransactions, paymentFulfillments, planCreditGrants]) expect(memory.rows(table)).toEqual([]);
  vi.unstubAllEnvs();
});
it.each(["claim", "gift-webhook", "subscription-webhook"] as const)("%s durably recovers failed delivery without customer/provider replay", async mode => {
  const app = express(); app.use(express.json());
  const fulfillPayment = vi.fn();
  registerChargebeeRoutes(app, { resolveIdentity: async () => ({ account: { id: 7 } }), createPaymentIntent: vi.fn(), fulfillPayment, recordActivity: async () => undefined, applySubscriptionEvent: applyChargebeeSubscriptionEvent, recordGiftEvent: recordGiftProviderEvent, claimGift: claimGiftSubscription });
  const payload = mode === "gift-webhook" ? { id: "event_gift", event_type: "gift_claimed", content: { gift: { id: "gift_fixture", status: "claimed", gift_receiver: { email: "recipient@example.invalid", subscription_id: "sub_fixture" } } } } : { id: "event_subscription", event_type: "subscription_created", content: { subscription: { id: "sub_fixture", status: "active", currency_code: "INR", subscription_items: [{ item_price_id: "skipwait_pro_monthly-INR" }] } } };
  const response = mode === "claim" ? await request(app).post("/api/chargebee/gifts/claim").send({ giftId: "gift_fixture" }) : await request(app).post("/api/chargebee/webhook").set("Authorization", `Basic ${Buffer.from("skipwait:fixture-secret").toString("base64")}`).send(payload);
  expect(response.status).toBe(mode === "claim" ? 409 : 200);
  expect(memory.rows(billingReviewOutbox)).toHaveLength(1); expect(fulfillPayment).not.toHaveBeenCalled();
  let clock = new Date(Date.now() + 1000);
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockImplementation(async () => new Response(JSON.stringify({ id: "email_fixture" })));
  await runBillingReviewOutbox({ now: () => clock, fetchImpl: transport });
  clock = new Date(clock.getTime() + 180_000);
  await runBillingReviewOutbox({ now: () => clock, fetchImpl: transport });
  await runBillingReviewOutbox({ now: () => clock, fetchImpl: transport });
  expect(transport).toHaveBeenCalledTimes(2); expect(memory.rows(billingReviewOutbox)[0].status).toBe("accepted");
});
it("outbox persistence failure rolls back gift parking and never acknowledges webhook success", async () => {
  memory.failReads(billingReviewOutbox);
  const app = express(); app.use(express.json());
  registerChargebeeRoutes(app, { resolveIdentity: async () => ({ account: { id: 7 } }), createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), recordActivity: async () => undefined, applySubscriptionEvent: applyChargebeeSubscriptionEvent, recordGiftEvent: recordGiftProviderEvent, claimGift: claimGiftSubscription });
  const response = await request(app).post("/api/chargebee/webhook").set("Authorization", `Basic ${Buffer.from("skipwait:fixture-secret").toString("base64")}`).send({ id: "event_failure", event_type: "gift_claimed", content: { gift: { id: "gift_fixture", status: "claimed" } } });
  expect(response.status).toBeGreaterThanOrEqual(500);
  expect(memory.rows(giftSubscriptionFulfillments)[0].fulfillmentStatus).toBe("pending");
  expect(memory.rows(billingReviewOutbox)).toEqual([]);
});
it("duplicate retired provider receipt repairs a missing durable obligation", async () => {
  const input = { eventId: "duplicate_fixture", eventType: "subscription_created", subscriptionId: "sub_fixture", itemPriceId: "skipwait_pro_monthly-INR", status: "active" };
  await applyChargebeeSubscriptionEvent(input);
  const { subscriptionEvents } = await import("../drizzle/schema");
  const receipts = memory.rows(subscriptionEvents);
  memory.reset([[subscriptionEvents, receipts]]);
  expect(await applyChargebeeSubscriptionEvent(input)).toEqual({ status: "duplicate" });
  expect(memory.rows(billingReviewOutbox)).toHaveLength(1);
  expect(memory.rows(subscriptionEvents)).toHaveLength(1);
});
it.each([undefined, "pro"] as const)("actual gift claim preserves authoritative classification for stored plan %s", async plan => {
  memory.reset([[canonicalPeople, [{ id: 1, suspended: false }]], [users, [{ id: 7, canonicalPersonId: 1, suspended: false }]], [verifiedLoginAliases, [{ id: 1, canonicalPersonId: 1, normalizedVerifiedEmail: "recipient@example.invalid" }]], [giftSubscriptionFulfillments, [{ id: 1, giftId: "gift_fixture", plan, subscriptionId: "gift_subscription", fulfillmentStatus: "pending", receiverEmail: "recipient@example.invalid" }]]]);
  const app = express(); app.use(express.json());
  registerChargebeeRoutes(app, { resolveIdentity: async () => ({ account: { id: 7 } }), createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), recordActivity: async () => undefined, claimGift: claimGiftSubscription });
  expect((await request(app).post("/api/chargebee/gifts/claim").send({ giftId: "gift_fixture" })).status).toBe(409);
  const payload = JSON.parse(String(memory.rows(billingReviewOutbox)[0].payload));
  expect(payload.classification).toBe(plan ? "retired" : "unsupported");
  expect(payload.evidence.subscriptionId).toBe("gift_subscription");
});
it.each(["pro", "unknown_plan"])("duplicate receipt repairs authoritative stored wallet %s before acknowledgement", async plan => {
  const { subscriptionEvents } = await import("../drizzle/schema");
  memory.reset([[subscriptionEvents, [{ id: 1, provider: "chargebee", providerEventId: "existing_receipt", subscriptionId: "stored_subscription" }]], [tokenBalances, [{ id: 1, userId: 7, role: "job_seeker", subscriptionId: "stored_subscription", plan }]]]);
  const app = express(); app.use(express.json());
  registerChargebeeRoutes(app, { resolveIdentity: async () => undefined, createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), recordActivity: async () => undefined, applySubscriptionEvent: applyChargebeeSubscriptionEvent });
  const result = await request(app).post("/api/chargebee/webhook").set("Authorization", `Basic ${Buffer.from("skipwait:fixture-secret").toString("base64")}`).send({ id: "existing_receipt", event_type: "subscription_created", content: { subscription: { id: "stored_subscription", status: "active" } } });
  expect(result.status).toBe(200);
  expect(JSON.parse(String(memory.rows(billingReviewOutbox)[0].payload)).classification).toBe(plan === "pro" ? "retired" : "unsupported");
  // Seeded wallet is evidence only; economic fields must be byte-identical.
  expect(memory.rows(tokenBalances)).toEqual([{ id: 1, userId: 7, role: "job_seeker", subscriptionId: "stored_subscription", plan }]);
  memory.reset([]);
});
it("actual HTTP duplicate receipt repairs retired checkout-intent evidence without a wallet", async () => {
  const { subscriptionEvents, subscriptionCheckoutIntents } = await import("../drizzle/schema");
  memory.reset([[subscriptionEvents, [{ id: 1, provider: "chargebee", providerEventId: "intent_receipt", subscriptionId: "intent_subscription" }]], [subscriptionCheckoutIntents, [{ id: 1, hostedPageId: "hosted_fixture", checkoutIntentId: "intent_fixture", userId: 7, plan: "max" }]]]);
  const app = express(); app.use(express.json());
  registerChargebeeRoutes(app, { resolveIdentity: async () => undefined, createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), recordActivity: async () => undefined, applySubscriptionEvent: applyChargebeeSubscriptionEvent });
  const response = await request(app).post("/api/chargebee/webhook").set("Authorization", `Basic ${Buffer.from("skipwait:fixture-secret").toString("base64")}`).send({ id: "intent_receipt", event_type: "subscription_created", content: { subscription: { id: "intent_subscription", status: "active" }, hosted_page: { id: "hosted_fixture", pass_thru_content: "intent_fixture" } } });
  expect(response.status).toBe(200);
  expect(memory.rows(subscriptionEvents)).toHaveLength(1);
  expect(JSON.parse(String(memory.rows(billingReviewOutbox)[0].payload)).classification).toBe("retired");
});
it.each([undefined, "pro"] as const)("actual gift webhook retains stored plan %s and event evidence", async plan => {
  memory.reset([[giftSubscriptionFulfillments, [{ id: 1, giftId: "gift_fixture", plan, subscriptionId: "gift_subscription", fulfillmentStatus: "pending" }]]]);
  const app = express(); app.use(express.json());
  registerChargebeeRoutes(app, { resolveIdentity: async () => undefined, createPaymentIntent: vi.fn(), fulfillPayment: vi.fn(), recordActivity: async () => undefined, recordGiftEvent: recordGiftProviderEvent });
  const response = await request(app).post("/api/chargebee/webhook").set("Authorization", `Basic ${Buffer.from("skipwait:fixture-secret").toString("base64")}`).send({ id: "gift_evidence_event", event_type: "gift_claimed", content: { gift: { id: "gift_fixture", status: "claimed" } } });
  expect(response.status).toBe(200);
  const payload = JSON.parse(String(memory.rows(billingReviewOutbox)[0].payload));
  expect(payload.classification).toBe(plan ? "retired" : "unsupported");
  expect(payload.evidence).toMatchObject({ subscriptionId: "gift_subscription", eventId: "gift_evidence_event", eventType: "gift_claimed" });
});
it("real gift handlers quarantine conflicting historical classification without sending", async () => {
  const transport = vi.fn();
  const input = { eventId: "unknown_gift_event", eventType: "gift_claimed", giftId: "gift_fixture", status: "claimed" };
  await recordGiftProviderEvent(input);
  expect(JSON.parse(String(memory.rows(billingReviewOutbox)[0].payload)).classification).toBe("unsupported");
  await recordGiftProviderEvent({ ...input, eventId: "historical_gift_event", plan: "pro", subscriptionId: "historical_subscription" });
  expect(memory.rows(billingReviewOutbox)[0]).toMatchObject({ status: "unknown", lastError: "classification_conflict", leaseOwner: null, leaseUntil: null });
  expect((await runBillingReviewOutbox({ fetchImpl: transport })).failed).toBeGreaterThan(0);
  expect(transport).not.toHaveBeenCalled();
});

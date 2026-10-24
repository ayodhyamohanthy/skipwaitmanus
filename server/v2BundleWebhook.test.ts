import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";

function auth(secret: string) {
  return `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function bundlePayload(overrides: { amount?: number; subscriptionId?: string; invoiceId?: string; withHostedPage?: boolean }) {
  const amount = overrides.amount ?? 162_400; // Fast Track Rs499 + 25-credit rung Rs1,125 (D-132).
  return {
    id: "ev_v2_bundle_1",
    event_type: "payment_succeeded",
    content: {
      payment: { amount, currency_code: "INR", invoice_id: overrides.invoiceId ?? "inv_v2_1", subscription_id: overrides.subscriptionId ?? "sub_v2_1", ...(overrides.withHostedPage ? { hosted_page_id: "hp_v2_1", pass_thru_content: "intent_v2_1" } : {}) },
      invoice: { id: overrides.invoiceId ?? "inv_v2_1", subscription_id: overrides.subscriptionId ?? "sub_v2_1", amount_paid: amount, currency_code: "INR", line_items: [{ item_price_id: "skipwait_v2plan_fast_track-INR" }, { item_price_id: "skipwait_v2credits_25-INR" }] },
      ...(overrides.withHostedPage ? { hosted_page: { id: "hp_v2_1", pass_thru_content: "intent_v2_1" } } : {}),
    },
  };
}

function app(deps: Parameters<typeof registerChargebeeRoutes>[1]) {
  vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", "v2-secret");
  const app = express(); app.use(express.json());
  registerChargebeeRoutes(app, {
    resolveIdentity: async () => undefined,
    createPaymentIntent: async () => undefined,
    fulfillPayment: vi.fn(async () => ({ status: "ignored", reason: "unknown_checkout" })),
    ...deps,
  });
  return app;
}

describe("D-132 bundle crediting webhook arm", () => {
  it("a bundle renewal invoice (no hosted page) grants the rung through the v2 path, never the pack path", async () => {
    const grantV2Credits = vi.fn(async () => ({ status: "credited", tokenCount: 25, userId: 7, role: "job_seeker" }));
    const fulfillPayment = vi.fn(async () => ({ status: "ignored", reason: "unknown_checkout" }));
    const response = await request(app({ grantV2Credits, fulfillPayment })).post("/api/chargebee/webhook").set("Authorization", auth("v2-secret")).send(bundlePayload({}));
    expect(response.status).toBe(200);
    expect(grantV2Credits).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: "ev_v2_bundle_1", invoiceId: "inv_v2_1", subscriptionId: "sub_v2_1", planFamily: "fast_track", rung: 25, amount: 162_400, currency: "INR" }));
    expect(fulfillPayment).not.toHaveBeenCalled();
  });

  it("a first-month bundle invoice (hosted page + intent) also grants through the v2 path", async () => {
    const grantV2Credits = vi.fn(async () => ({ status: "credited", tokenCount: 25, userId: 7, role: "job_seeker" }));
    const fulfillPayment = vi.fn(async () => ({ status: "ignored", reason: "unknown_checkout" }));
    const response = await request(app({ grantV2Credits, fulfillPayment })).post("/api/chargebee/webhook").set("Authorization", auth("v2-secret")).send(bundlePayload({ withHostedPage: true }));
    expect(response.status).toBe(200);
    expect(grantV2Credits).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ planFamily: "fast_track", rung: 25, hostedPageId: "hp_v2_1", passThruContent: "intent_v2_1" }));
    expect(fulfillPayment).not.toHaveBeenCalled();
  });

  it("a first-month invoice without a hosted page re-reads the provider page before granting (review F2)", async () => {
    vi.stubEnv("BILLING_ENV", "test");
    vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
    vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
    const grantV2Credits = vi.fn(async () => ({ status: "credited", tokenCount: 25, userId: 9, role: "job_seeker" }));
    const resolveHostedPage = vi.fn(async () => ({ hostedPageId: "hp_v2_1", passThruContent: "intent_v2_1", pageState: "succeeded", paid: true }));
    const response = await request(app({ grantV2Credits, resolveHostedPage })).post("/api/chargebee/webhook").set("Authorization", auth("v2-secret")).send(bundlePayload({}));
    expect(response.status).toBe(200);
    expect(resolveHostedPage).toHaveBeenCalledExactlyOnceWith({ invoiceId: "inv_v2_1", amount: 162_400, currency: "INR", site: "fixture-test", apiKey: "fixture-key" });
    expect(grantV2Credits).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ hostedPageId: "hp_v2_1", passThruContent: "intent_v2_1", planFamily: "fast_track", rung: 25 }));
  });

  it("a first-month invoice that already names its hosted page never re-reads or replaces it", async () => {
    vi.stubEnv("BILLING_ENV", "test");
    vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
    vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
    const grantV2Credits = vi.fn(async () => ({ status: "credited", tokenCount: 25, userId: 7, role: "job_seeker" }));
    const resolveHostedPage = vi.fn();
    const response = await request(app({ grantV2Credits, resolveHostedPage })).post("/api/chargebee/webhook").set("Authorization", auth("v2-secret")).send(bundlePayload({ withHostedPage: true }));
    expect(response.status).toBe(200);
    expect(resolveHostedPage).not.toHaveBeenCalled();
    expect(grantV2Credits).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ hostedPageId: "hp_v2_1", passThruContent: "intent_v2_1" }));
  });

  it("a v2 pack invoice (rung item, no plan fee) still fulfils through the pack path", async () => {
    const grantV2Credits = vi.fn();
    const fulfillPayment = vi.fn(async () => ({ status: "credited", tokenCount: 10, userId: 7, role: "job_seeker" }));
    const payload = { id: "ev_v2_pack_1", event_type: "payment_succeeded", content: { payment: { amount: 47_000, currency_code: "INR", invoice_id: "inv_pack_1", hosted_page_id: "hp_pack_1", pass_thru_content: "intent_pack_1" }, invoice: { id: "inv_pack_1", amount_paid: 47_000, currency_code: "INR", line_items: [{ item_price_id: "skipwait_v2pack_10-INR" }] }, hosted_page: { id: "hp_pack_1", pass_thru_content: "intent_pack_1" } } };
    const response = await request(app({ grantV2Credits, fulfillPayment })).post("/api/chargebee/webhook").set("Authorization", auth("v2-secret")).send(payload);
    expect(response.status).toBe(200);
    expect(fulfillPayment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: "ev_v2_pack_1", amount: 47_000 }));
    expect(grantV2Credits).not.toHaveBeenCalled();
  });

  it("a parked grant raises the payment-review alert", async () => {
    const grantV2Credits = vi.fn(async () => ({ status: "requires_review", reason: "checkout_amount_mismatch", paymentId: 55, userId: 7, role: "job_seeker", expectedAmount: 162_400, expectedCurrency: "INR", paidAmount: 190_000, paidCurrency: "INR" }));
    const alertPaymentReview = vi.fn(async () => ({ alerted: true }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(app({ grantV2Credits, alertPaymentReview })).post("/api/chargebee/webhook").set("Authorization", auth("v2-secret")).send(bundlePayload({ amount: 190_000 }));
    expect(response.status).toBe(200);
    expect(alertPaymentReview).toHaveBeenCalledExactlyOnceWith({ paymentId: 55, reason: "checkout_amount_mismatch", expectedAmount: 162_400, expectedCurrency: "INR", paidAmount: 190_000, paidCurrency: "INR" });
  });

  it("a bundle invoice nobody knows raises the unmatched-payment alert, never silent", async () => {
    const grantV2Credits = vi.fn(async () => ({ status: "ignored", reason: "unknown_v2_subscription" }));
    const alertUnmatchedPayment = vi.fn(async () => ({ alerted: true }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(app({ grantV2Credits, alertUnmatchedPayment })).post("/api/chargebee/webhook").set("Authorization", auth("v2-secret")).send(bundlePayload({}));
    expect(response.status).toBe(200);
    expect(alertUnmatchedPayment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: "ev_v2_bundle_1", invoiceId: "inv_v2_1", reason: "unknown_v2_subscription" }));
  });

  it("a bundle invoice with no grant wired fails loudly for a provider retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(app({})).post("/api/chargebee/webhook").set("Authorization", auth("v2-secret")).send(bundlePayload({}));
    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Fulfillment retry required");
  });
});

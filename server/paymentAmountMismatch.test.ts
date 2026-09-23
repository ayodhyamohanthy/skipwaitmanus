import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerChargebeeRoutes } from "./chargebeeRoutes";
import { createPaymentReviewAlerter } from "./errorAlerting";

function auth(secret: string) {
  return `Basic ${Buffer.from(`skipwait:${secret}`).toString("base64")}`;
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("paid invoice that disagrees with the checkout amount", () => {
  it("parks the payment for review and raises the admin alert instead of ignoring it", async () => {
    vi.stubEnv("BILLING_ENV", "test");
    vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
    vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
    vi.stubEnv("CHARGEBEE_WEBHOOK_SECRET", "mismatch-secret");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const alertPaymentReview = vi.fn(async () => ({ alerted: true }));
    const app = express(); app.use(express.json());
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => undefined,
      createPaymentIntent: async () => undefined,
      fulfillPayment: async () => ({ status: "requires_review", reason: "checkout_amount_mismatch", paymentId: 41, userId: 7, role: "job_seeker", expectedAmount: 99000, expectedCurrency: "INR", paidAmount: 116820, paidCurrency: "INR" }),
      alertPaymentReview,
    });
    const payload = { id: "ev_tax", event_type: "payment_succeeded", content: { payment: { amount: 116820, currency_code: "INR", hosted_page_id: "hp_tax", invoice_id: "inv_tax" }, hosted_page: { pass_thru_content: "intent_tax" } } };
    const response = await request(app).post("/api/chargebee/webhook").set("Authorization", auth("mismatch-secret")).send(payload);
    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ status: "requires_review", reason: "checkout_amount_mismatch" });
    expect(alertPaymentReview).toHaveBeenCalledExactlyOnceWith({ paymentId: 41, reason: "checkout_amount_mismatch", expectedAmount: 99000, expectedCurrency: "INR", paidAmount: 116820, paidCurrency: "INR" });
  });

  it("shows the user a pending-review state on payment recovery and alerts the admin", async () => {
    vi.stubEnv("BILLING_ENV", "test");
    vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
    vi.stubEnv("CHARGEBEE_API_KEY", "fixture-key");
    const alertPaymentReview = vi.fn(async () => ({ alerted: true }));
    const markPaymentForReview = vi.fn(async () => undefined);
    const app = express(); app.use(express.json());
    registerChargebeeRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7 } }),
      createPaymentIntent: vi.fn(),
      fulfillPayment: vi.fn(),
      getPaymentRecovery: async () => ({ id: 12, status: "pending", hostedPageId: "hp_tax", checkoutIntentId: "intent_tax", tokenCount: 10, amount: 99000, currency: "INR", reconciliationReason: null }),
      retrieveHostedPage: vi.fn(async () => ({ hostedPageId: "hp_tax", invoiceId: "inv_tax", passThruContent: "intent_tax", amount: 116820, currency: "INR", pageState: "succeeded", invoiceStatus: "paid", paymentStatus: "success", paid: true })) as never,
      markPaymentForReview,
      alertPaymentReview,
      getCreditSummary: async () => ({ balance: 0 }),
    });
    const response = await request(app).post("/api/chargebee/credit-recovery").send({ hostedPageId: "hp_tax", role: "job_seeker" });
    expect(response.body.status).toBe("requires_review");
    expect(markPaymentForReview).toHaveBeenCalledWith(12, "provider_page_mismatch");
    expect(alertPaymentReview).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 12, expectedAmount: 99000, paidAmount: 116820 }));
  });

  it("emails the administrator for every parked payment and records the alert", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fixture");
    vi.stubEnv("ERROR_ALERT_FROM_EMAIL", "alerts@skipwait.me");
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const recordActivity = vi.fn(async () => undefined);
    const alert = createPaymentReviewAlerter({ fetchImpl: fetchImpl as never, recordActivity: recordActivity as never });
    const input = { paymentId: 41, reason: "checkout_amount_mismatch", expectedAmount: 99000, expectedCurrency: "INR", paidAmount: 116820, paidCurrency: "INR" };
    expect(await alert(input)).toEqual({ alerted: true });
    expect(await alert(input)).toEqual({ alerted: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.to).toEqual(["ayodhya@skipwait.me"]);
    expect(body.subject).toContain("#41");
    expect(body.text).toContain("Expected: 99000 INR");
    expect(body.text).toContain("Paid: 116820 INR");
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "system.payment_review_alert_sent", outcome: "success", resourceId: "41" }));
  });
});

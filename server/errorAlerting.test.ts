import { afterEach, describe, expect, it, vi } from "vitest";
import { createMaterialErrorEscalator, createPaymentReviewAlerter, createRetiredPlanAlerter } from "./errorAlerting";

const originalApiKey = process.env.RESEND_API_KEY;
const originalSender = process.env.ERROR_ALERT_FROM_EMAIL;
const runLiveAlertDeliveryTest = process.env.RUN_LIVE_ADMIN_ALERT_TEST === "true";

afterEach(() => {
  process.env.RESEND_API_KEY = originalApiKey;
  process.env.ERROR_ALERT_FROM_EMAIL = originalSender;
});

describe("material API error escalation", () => {
  it("emails only minimized API error context and writes a success activity record", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    const recordActivity = vi.fn(async () => undefined);
    const escalate = createMaterialErrorEscalator({ fetchImpl, recordActivity, now: () => 1_000 });

    await expect(escalate({ method: "POST", path: "/api/company-referrals?resume=private.pdf&otp=123456", statusCode: 500, durationMs: 48.6 })).resolves.toEqual({ alerted: true, reason: "sent" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request?.headers).toMatchObject({ Authorization: "Bearer re_test" });
    const payload = JSON.parse(String(request?.body));
    expect(payload).toMatchObject({ from: "noreply@skipwait.me", to: ["ayodhya@skipwait.me"], subject: "skipwait.me error alert · 500" });
    expect(payload.text).toContain("POST /api/company-referrals");
    expect(payload.text).not.toContain("private.pdf");
    expect(payload.text).not.toContain("123456");
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "system.error_alert_sent", outcome: "success", resourceId: "/api/company-referrals" }));
  });

  it("never puts a single-use token in the alert, the activity record or the dedupe key (FND-4)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const recordActivity = vi.fn(async () => undefined);
    const escalate = createMaterialErrorEscalator({ fetchImpl, recordActivity, now: () => 1_000 });

    await expect(escalate({ method: "POST", path: "/api/referrer-review-links/tokA1/decision?x=1", statusCode: 500, durationMs: 5 })).resolves.toEqual({ alerted: true, reason: "sent" });
    await expect(escalate({ method: "POST", path: "/api/referrer-review-links/tokB2/decision", statusCode: 500, durationMs: 5 })).resolves.toEqual({ alerted: false, reason: "deduplicated" });
    const payload = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(payload.text).toContain("POST /api/referrer-review-links/:token/decision");
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("tokA1");
    expect(JSON.stringify(recordActivity.mock.calls)).not.toContain("tokA1");
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "/api/referrer-review-links/:token/decision" }));
  });

  it("sends payment alerts through ZeptoMail when it is configured and Resend is not", async () => {
    const saved = { z: process.env.ZEPTOMAIL_API_KEY, r: process.env.RESEND_API_KEY };
    process.env.ZEPTOMAIL_API_KEY = "zepto_test";
    delete process.env.RESEND_API_KEY;
    process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    try {
      const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
      const recordActivity = vi.fn(async () => undefined);
      const alert = createPaymentReviewAlerter({ fetchImpl, recordActivity });
      await expect(alert({ paymentId: 7, reason: "amount_mismatch", expectedAmount: 100, expectedCurrency: "INR", paidAmount: 90, paidCurrency: "INR" } as never)).resolves.toEqual({ alerted: true });
      const [url, request] = fetchImpl.mock.calls[0] ?? [];
      expect(url).toBe("https://api.zeptomail.com/v1.1/email");
      expect(request?.headers).toMatchObject({ Authorization: "Zoho-enczapikey zepto_test" });
      expect(JSON.parse(String(request?.body)).to[0].email_address.address).toBe("ayodhya@skipwait.me");
    } finally {
      if (saved.z === undefined) delete process.env.ZEPTOMAIL_API_KEY; else process.env.ZEPTOMAIL_API_KEY = saved.z;
      if (saved.r === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.r;
    }
  });

  it("deduplicates repeated material failures and ignores non-API or non-server errors", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const recordActivity = vi.fn(async () => undefined);
    const escalate = createMaterialErrorEscalator({ fetchImpl, recordActivity, now: () => 1_000 });

    await expect(escalate({ method: "GET", path: "/api/private-request", statusCode: 503, durationMs: 10 })).resolves.toEqual({ alerted: true, reason: "sent" });
    await expect(escalate({ method: "GET", path: "/api/private-request", statusCode: 503, durationMs: 12 })).resolves.toEqual({ alerted: false, reason: "deduplicated" });
    await expect(escalate({ method: "GET", path: "/api/private-request", statusCode: 400, durationMs: 12 })).resolves.toEqual({ alerted: false, reason: "not_material" });
    await expect(escalate({ method: "GET", path: "/start", statusCode: 500, durationMs: 12 })).resolves.toEqual({ alerted: false, reason: "not_material" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("records a delivery failure without interrupting the original application response", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    const fetchImpl = vi.fn(async () => new Response("blocked", { status: 403 }));
    const recordActivity = vi.fn(async () => undefined);
    const escalate = createMaterialErrorEscalator({ fetchImpl, recordActivity, now: () => 1_000 });

    await expect(escalate({ method: "PATCH", path: "/api/company-referrals/1", statusCode: 500, durationMs: 10 })).resolves.toEqual({ alerted: false, reason: "delivery_failed" });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "system.error_alert_sent", outcome: "failure" }));
  });

  it.runIf(runLiveAlertDeliveryTest)("delivers one minimized direct alert to the configured administrator", async () => {
    const escalate = createMaterialErrorEscalator({ recordActivity: async () => undefined });
    await expect(escalate({ method: "POST", path: "/api/_alert-delivery-verification", statusCode: 500, durationMs: 1 })).resolves.toEqual({ alerted: true, reason: "sent" });
  }, 15_000);
});

// D-067: a late provider event for the retired Pro/Max plans (or a gift of one) grants nothing,
// so it must reach a human who cancels and refunds it in Chargebee. Never deduplicated.
describe("retired-plan event alert", () => {
  it("emails provider ids only, every time, and records the delivery", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const recordActivity = vi.fn(async () => undefined);
    const alert = createRetiredPlanAlerter({ fetchImpl, recordActivity });
    const input = { eventId: "ev_max_renewal", eventType: "subscription_renewed", reason: "plan_retired" as const, subscriptionId: "sub_max_legacy", itemPriceId: "skipwait_max_monthly-USD" };
    await expect(alert(input)).resolves.toEqual({ alerted: true });
    await expect(alert(input)).resolves.toEqual({ alerted: true });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const payload = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(payload).toMatchObject({ to: ["ayodhya@skipwait.me"], subject: "skipwait.me retired plan event needs review · sub_max_legacy" });
    expect(payload.text).toContain("Nothing was granted");
    expect(payload.text).toContain("sub_max_legacy");
    expect(payload.text).toContain("skipwait_max_monthly-USD");
    expect(payload.text).toContain("Pro/Max");
    expect(payload.text).toContain("cancel the subscription and refund the customer");
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "system.retired_plan_alert_sent", outcome: "success", resourceId: "sub_max_legacy", metadata: expect.objectContaining({ eventId: "ev_max_renewal", reason: "plan_retired" }) }));
  });

  // Review round 2: an item price skipwait.me cannot place is not a Pro/Max plan. The email says so
  // neutrally and asks for a review, never for a cancel-and-refund of a possibly paying customer.
  it("words an unrecognised item price neutrally, with no Pro/Max label and no refund instruction", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const recordActivity = vi.fn(async () => undefined);
    const alert = createRetiredPlanAlerter({ fetchImpl, recordActivity });
    await expect(alert({ eventId: "ev_unknown", eventType: "subscription_changed", reason: "unsupported_plan", subscriptionId: "sub_start", itemPriceId: "skipwait_start_30d_v2-USD" })).resolves.toEqual({ alerted: true });
    const payload = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(payload.subject).toBe("skipwait.me unrecognised plan event needs review · sub_start");
    expect(payload.text).toContain("Nothing was granted");
    expect(payload.text).toContain("skipwait_start_30d_v2-USD");
    expect(payload.text).not.toContain("Pro/Max");
    expect(payload.text.toLowerCase()).not.toContain("refund the customer");
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "system.unsupported_plan_alert_sent", outcome: "success", resourceId: "sub_start" }));
  });

  it("names a gift when there is no subscription, and records a failed delivery without throwing", async () => {
    process.env.RESEND_API_KEY = "";
    const recordActivity = vi.fn(async () => undefined);
    const alert = createRetiredPlanAlerter({ fetchImpl: vi.fn(), recordActivity });
    await expect(alert({ reason: "gift_claim_refused", giftId: "gift_1" })).resolves.toEqual({ alerted: false });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "system.retired_plan_alert_sent", outcome: "failure", resourceId: "gift_1" }));
  });
});

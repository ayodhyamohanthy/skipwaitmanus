import { afterEach, describe, expect, it, vi } from "vitest";
import { createMaterialErrorEscalator } from "./errorAlerting";

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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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

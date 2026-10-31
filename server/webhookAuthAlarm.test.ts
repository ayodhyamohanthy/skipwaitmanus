// REL-webhook-auth-alarm (D-212): a Chargebee webhook refused for its secret is recorded and reaches Sentry, throttled.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  active: true,
  withIsolationScope: vi.fn((cb: (scope: any) => void) => cb({ clear: vi.fn(), setSDKProcessingMetadata: vi.fn() })),
  withScope: vi.fn((cb: (scope: any) => void) => cb({ clear: vi.fn(), setSDKProcessingMetadata: vi.fn(), addEventProcessor: vi.fn() })),
}));
vi.mock("@sentry/node", () => ({
  captureMessage: sentry.captureMessage,
  withIsolationScope: sentry.withIsolationScope,
  withScope: sentry.withScope,
}));
vi.mock("./sentry", () => ({ isServerSentryActive: () => sentry.active }));

import {
  MAX_PENDING_WEBHOOK_UNAUTHORIZED_WRITES,
  WEBHOOK_UNAUTHORIZED_ACTION,
  WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS,
  recordWebhookUnauthorized,
  resetWebhookAuthAlarmForTests,
} from "./webhookAuthAlarm";

const T0 = Date.parse("2026-10-30T08:00:00Z");

beforeEach(() => {
  sentry.captureMessage.mockReset();
  sentry.withIsolationScope.mockClear();
  sentry.withScope.mockClear();
  sentry.active = true;
  resetWebhookAuthAlarmForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordWebhookUnauthorized (D-212)", () => {
  it("writes one failure row with no headers or body and raises one fingerprinted capture in an isolated scope", () => {
    const recordActivity = vi.fn(async () => undefined);
    recordWebhookUnauthorized(recordActivity, T0);
    expect(WEBHOOK_UNAUTHORIZED_ACTION).toBe("chargebee.webhook.unauthorized");
    expect(recordActivity).toHaveBeenCalledTimes(1);
    const row = recordActivity.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).toMatchObject({ action: "chargebee.webhook.unauthorized", outcome: "failure" });
    expect(row.metadata).toBeUndefined();
    expect(Object.keys(row).sort()).toEqual(["action", "outcome", "resourceType"]);
    expect(sentry.withIsolationScope).toHaveBeenCalledTimes(1);
    expect(sentry.withScope).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("chargebee webhook unauthorized", { fingerprint: ["chargebee-webhook-401"] });
  });

  it("a burst inside 10 minutes writes every row but captures once, and the next window captures again", () => {
    const recordActivity = vi.fn(async () => undefined);
    for (let i = 0; i < 5; i += 1) recordWebhookUnauthorized(recordActivity, T0 + i * 60_000);
    recordWebhookUnauthorized(recordActivity, T0 + WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS - 1);
    expect(WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS).toBe(10 * 60_000);
    expect(recordActivity).toHaveBeenCalledTimes(6);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    recordWebhookUnauthorized(recordActivity, T0 + WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it("bounds pending writes when the recorder hangs so memory does not grow unboundedly", () => {
    const hangingWriter = vi.fn(() => new Promise<void>(() => {}));
    for (let i = 0; i < MAX_PENDING_WEBHOOK_UNAUTHORIZED_WRITES + 5; i += 1) {
      recordWebhookUnauthorized(hangingWriter, T0 + i);
    }
    expect(hangingWriter).toHaveBeenCalledTimes(MAX_PENDING_WEBHOOK_UNAUTHORIZED_WRITES);
  });

  it("strips request, headers and body canary in Sentry event processor", () => {
    let capturedProcessor: ((event: any) => any) | null = null;
    sentry.withScope.mockImplementationOnce((cb: any) => {
      const scope = {
        clear: vi.fn(),
        setSDKProcessingMetadata: vi.fn(),
        addEventProcessor: vi.fn((fn: any) => {
          capturedProcessor = fn;
        }),
      };
      cb(scope);
    });

    recordWebhookUnauthorized(undefined, T0);
    expect(capturedProcessor).not.toBeNull();

    const dirtyEvent: any = {
      message: "chargebee webhook unauthorized",
      request: { headers: { authorization: "Basic secret123" }, body: "canary" },
      sdkProcessingMetadata: { request: { headers: { authorization: "Basic secret123" } } },
      contexts: { request: { url: "/api/chargebee/webhook" } },
    };

    const cleanedEvent = capturedProcessor!(dirtyEvent);
    expect(cleanedEvent.request).toBeUndefined();
    expect(cleanedEvent.sdkProcessingMetadata?.request).toBeUndefined();
    expect(cleanedEvent.contexts?.request).toBeUndefined();
  });

  it("never captures while server Sentry is inactive, and still writes the row", () => {
    sentry.active = false;
    const recordActivity = vi.fn(async () => undefined);
    recordWebhookUnauthorized(recordActivity, T0);
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    sentry.active = true;
    recordWebhookUnauthorized(recordActivity, T0 + 1);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("never throws when the row write or the capture fails, or when no writer is wired", async () => {
    sentry.captureMessage.mockImplementation(() => { throw new Error("sentry down"); });
    const rejecting = vi.fn(async () => { throw new Error("db down"); });
    const throwing = vi.fn(() => { throw new Error("sync fault"); });
    expect(() => recordWebhookUnauthorized(rejecting, T0)).not.toThrow();
    expect(() => recordWebhookUnauthorized(throwing as unknown as typeof rejecting, T0 + WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS)).not.toThrow();
    expect(() => recordWebhookUnauthorized(undefined, T0 + 2 * WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS)).not.toThrow();
    await Promise.resolve();
    expect(rejecting).toHaveBeenCalledTimes(1);
  });
});

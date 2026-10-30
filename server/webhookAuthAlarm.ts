// REL-webhook-auth-alarm (D-212): a Chargebee webhook refused for a bad or missing secret is noticed.
//
// The webhook's 401 branch used to record nothing, so a drifted secret silently refused every refund,
// card-validation and renewal event. Each refusal now writes one operational-activity row (read by the
// daily money check's `webhook_unauthorized_24h` finding) and, at most once per 10 minutes per process,
// one Sentry message with a fixed fingerprint. Neither carries a header, a body, an id or a secret, and
// neither changes the refusal itself: this never throws and never awaits on the request path.
import * as Sentry from "@sentry/node";
import { isServerSentryActive } from "./sentry";

export const WEBHOOK_UNAUTHORIZED_ACTION = "chargebee.webhook.unauthorized";
export const WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS = 10 * 60_000;

export type WebhookUnauthorizedRecorder = (input: { action: string; outcome: "failure"; resourceType: string }) => Promise<void>;

let lastCaptureAtMs: number | null = null;

export function recordWebhookUnauthorized(recordActivity: WebhookUnauthorizedRecorder | undefined, nowMs: number = Date.now()): void {
  try {
    void recordActivity?.({ action: WEBHOOK_UNAUTHORIZED_ACTION, outcome: "failure", resourceType: "chargebee_webhook" }).catch(() => undefined);
  } catch {
    // A writer that throws synchronously must not turn the 401 into a 500.
  }
  if (!isServerSentryActive()) return;
  // Written as "not at least the interval" so a clock that reads NaN suppresses rather than floods.
  if (lastCaptureAtMs !== null && !(nowMs - lastCaptureAtMs >= WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS)) return;
  lastCaptureAtMs = nowMs;
  try {
    Sentry.captureMessage("chargebee webhook unauthorized", { fingerprint: ["chargebee-webhook-401"] });
  } catch {
    // Reporting is best effort; the row above is the durable record.
  }
}

/** Tests only: forget the last capture time so each case starts with an open window. */
export function resetWebhookAuthAlarmForTests(): void {
  lastCaptureAtMs = null;
}

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
export const MAX_PENDING_WEBHOOK_UNAUTHORIZED_WRITES = 10;

export type WebhookUnauthorizedRecorder = (input: { action: string; outcome: "failure"; resourceType: string }) => Promise<void>;

let lastCaptureAtMs: number | null = null;
let pendingWrites = 0;

export function recordWebhookUnauthorized(recordActivity: WebhookUnauthorizedRecorder | undefined, nowMs: number = Date.now()): void {
  if (recordActivity && pendingWrites < MAX_PENDING_WEBHOOK_UNAUTHORIZED_WRITES) {
    pendingWrites += 1;
    try {
      void recordActivity({ action: WEBHOOK_UNAUTHORIZED_ACTION, outcome: "failure", resourceType: "chargebee_webhook" })
        .catch(() => undefined)
        .finally(() => {
          pendingWrites = Math.max(0, pendingWrites - 1);
        });
    } catch {
      pendingWrites = Math.max(0, pendingWrites - 1);
    }
  }

  if (!isServerSentryActive()) return;
  // Written as "not at least the interval" so a clock that reads NaN suppresses rather than floods.
  if (lastCaptureAtMs !== null && !(nowMs - lastCaptureAtMs >= WEBHOOK_UNAUTHORIZED_CAPTURE_INTERVAL_MS)) return;
  lastCaptureAtMs = nowMs;
  try {
    if (typeof Sentry.withIsolationScope === "function") {
      Sentry.withIsolationScope((isolationScope) => {
        isolationScope?.clear?.();
        isolationScope?.setSDKProcessingMetadata?.({ request: undefined });
        if (typeof Sentry.withScope === "function") {
          Sentry.withScope((scope) => {
            scope?.clear?.();
            scope?.setSDKProcessingMetadata?.({ request: undefined });
            scope?.addEventProcessor?.((event) => {
              delete event.request;
              if (event.sdkProcessingMetadata) {
                delete (event.sdkProcessingMetadata as Record<string, unknown>).request;
              }
              if (event.contexts?.request) {
                delete event.contexts.request;
              }
              return event;
            });
            Sentry.captureMessage("chargebee webhook unauthorized", { fingerprint: ["chargebee-webhook-401"] });
          });
        } else {
          Sentry.captureMessage("chargebee webhook unauthorized", { fingerprint: ["chargebee-webhook-401"] });
        }
      });
    } else {
      Sentry.captureMessage("chargebee webhook unauthorized", { fingerprint: ["chargebee-webhook-401"] });
    }
  } catch {
    // Reporting is best effort; the row above is the durable record.
  }
}

/** Tests only: forget the last capture time and pending writes so each case starts with an open window. */
export function resetWebhookAuthAlarmForTests(): void {
  lastCaptureAtMs = null;
  pendingWrites = 0;
}

import * as Sentry from "@sentry/react";
import { scrubTelemetryUrl } from "@shared/telemetryScrub";

declare global {
  interface Window {
    __sentryTest?: () => boolean;
  }
}

let initialized = false;

// Single-use links carry secrets in the path (referral review tokens, share
// cards, fast-track codes, vanity aliases, storage keys), in browser and API
// URLs alike. These must never leave the device in an event (FND-4).
export function scrubSentryUrl(value: string, origin: string): string {
  return scrubTelemetryUrl(value, origin);
}

export function initClientSentry(): boolean {
  if (initialized || typeof window === "undefined") return initialized;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return false;
  const origin = window.location.origin;
  Sentry.init({
    dsn,
    release: (import.meta.env.VITE_GIT_COMMIT_SHA as string | undefined) || undefined,
    environment: window.location.hostname === "localhost" ? "development" : "production",
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubSentryUrl(event.request.url, origin);
      return event;
    },
  });
  initialized = true;
  return true;
}

export function captureClientError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function isClientSentryActive(): boolean {
  return initialized;
}

// Manual test hook: sends a fixed test event when active so the Sentry
// dashboard can be verified without throwing real errors. Returns whether
// an event was queued.
export function testClientSentry(): boolean {
  if (!initialized) return false;
  Sentry.captureException(new Error("Sentry client test event"), { extra: { source: "manual-test" } });
  return true;
}

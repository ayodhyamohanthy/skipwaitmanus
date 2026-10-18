import * as Sentry from "@sentry/react";
import { scrubTelemetryBreadcrumb, scrubTelemetryEvent } from "@shared/telemetryScrub";

declare global {
  interface Window {
    __sentryTest?: () => boolean;
  }
}

let initialized = false;

// Single-use links carry secrets in the path (referral review tokens, share
// cards, fast-track codes). These must never leave the device in an event.
export function scrubSentryUrl(value: string, origin: string): string {
  try {
    const url = new URL(value, origin);
    url.pathname = url.pathname
      .replace(/^\/email-review\/[^/]+/, "/email-review/[redacted]")
      .replace(/^\/share-card\/[^/]+/, "/share-card/[redacted]")
      .replace(/^\/fast\/[^/]+/, "/fast/[redacted]")
      .replace(/^\/refer\/[^/]+\/[^/]+/, "/refer/[redacted]");
    url.search = "";
    url.hash = "";
    return url.pathname;
  } catch {
    return "[redacted]";
  }
}

/**
 * Breadcrumb, span and referer URLs: a same-site URL becomes its scrubbed path (no query, no fragment, no
 * single-use token path); another site keeps its origin. Query strings carry what people type and the
 * WorkOS reset token on /reset-password.
 */
export function scrubClientTelemetryUrl(value: string, origin: string): string {
  try {
    const url = new URL(value, origin);
    const path = scrubSentryUrl(url.href, origin);
    return url.origin === origin ? path : `${url.origin}${path}`;
  } catch {
    return "[redacted]";
  }
}

/** Tests only: a capturing transport, so a privacy test sees exactly what would be sent. */
export type ClientSentryTestOverrides = Pick<Sentry.BrowserOptions, "transport">;

export function initClientSentry(overrides: ClientSentryTestOverrides = {}): boolean {
  if (initialized || typeof window === "undefined") return initialized;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return false;
  const origin = window.location.origin;
  const scrubUrl = (value: string) => scrubClientTelemetryUrl(value, origin);
  Sentry.init({
    dsn,
    release: (import.meta.env.VITE_GIT_COMMIT_SHA as string | undefined) || undefined,
    environment: window.location.hostname === "localhost" ? "development" : "production",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // One scrubber for errors, transactions and breadcrumbs (shared/telemetryScrub.ts): breadcrumbs are scrubbed
    // as they are recorded, because dropping the reset token from the address bar records a navigation from it.
    beforeSend: event => scrubTelemetryEvent(event, scrubUrl),
    beforeSendTransaction: event => scrubTelemetryEvent(event, scrubUrl),
    beforeBreadcrumb: breadcrumb => scrubTelemetryBreadcrumb(breadcrumb, scrubUrl),
    ...overrides,
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

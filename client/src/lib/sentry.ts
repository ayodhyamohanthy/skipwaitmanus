import * as Sentry from "@sentry/react";

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

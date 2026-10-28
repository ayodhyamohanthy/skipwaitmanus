import * as Sentry from "@sentry/react";

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
      .replace(/^\/refer\/[^/]+\/[^/]+/, "/refer/[redacted]")
      .replace(/^\/r\/[^/]+/, "/r/[redacted]")
      .replace(/^\/api\/ask-invites\/[^/]+/, "/api/ask-invites/[redacted]");
    url.search = "";
    url.hash = "";
    return url.pathname;
  } catch {
    return "[redacted]";
  }
}

// Breadcrumbs (navigation from/to, fetch/xhr url) record the same paths as the
// event URL, so each one goes through the same scrub (D-090 re-review F2).
const BREADCRUMB_URL_KEYS = ["url", "from", "to"] as const;
export function scrubBreadcrumb<T extends { data?: Record<string, unknown> }>(breadcrumb: T, origin: string): T {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  const scrubbed: Record<string, unknown> = { ...data };
  for (const key of BREADCRUMB_URL_KEYS) {
    if (typeof scrubbed[key] === "string") scrubbed[key] = scrubSentryUrl(scrubbed[key] as string, origin);
  }
  return { ...breadcrumb, data: scrubbed };
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
    beforeBreadcrumb: breadcrumb => scrubBreadcrumb(breadcrumb, origin),
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubSentryUrl(event.request.url, origin);
      // Backstop: anything that reached the event without passing beforeBreadcrumb.
      if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(crumb => scrubBreadcrumb(crumb, origin));
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

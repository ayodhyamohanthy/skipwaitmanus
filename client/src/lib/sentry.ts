import * as Sentry from "@sentry/react";

declare global {
  interface Window {
    __sentryTest?: () => boolean;
  }
}

let initialized = false;

// A single-use token sits directly after one of these routes. React Router and
// Express match routes case-insensitively, so the scan is too.
const SENSITIVE_PREFIXES = [
  "/email-review/",
  "/share-card/",
  "/fast/",
  "/refer/",
  "/r/",
  "/api/ask-invites/",
];
const MAX_DECODE_PASSES = 2;

// Decodes only well-formed escapes, so one broken escape cannot stop the rest
// of a hostile string from being inspected.
function decodeValidEscapes(value: string): string {
  return value.replace(/%([0-9a-f]{2})/gi, match => {
    try {
      return decodeURIComponent(match);
    } catch {
      return match;
    }
  });
}

function hasSensitivePrefix(value: string): boolean {
  const lower = value.toLowerCase();
  return SENSITIVE_PREFIXES.some(prefix => lower.includes(prefix));
}

// True for a raw token path, a percent-encoded one, a nested/double-encoded
// return target, or a string left encoded after two passes (fail safe).
export function containsSensitivePath(value: string): boolean {
  let current = value;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    if (hasSensitivePrefix(current)) return true;
    const decoded = decodeValidEscapes(current);
    if (decoded === current) return false;
    current = decoded;
  }
  if (hasSensitivePrefix(current)) return true;
  return /%[0-9a-f]{2}/i.test(current);
}

// Single-use links carry secrets in the path (referral review tokens, share
// cards, fast-track codes). These must never leave the device in an event.
export function scrubSentryUrl(value: string, origin: string): string {
  try {
    const url = new URL(value, origin);
    const pathname = decodeURIComponent(url.pathname);
    const scrubbed = pathname
      .replace(/^\/email-review\/[^/]+/i, "/email-review/[redacted]")
      .replace(/^\/share-card\/[^/]+/i, "/share-card/[redacted]")
      .replace(/^\/fast\/[^/]+/i, "/fast/[redacted]")
      .replace(/^\/refer\/[^/]+\/[^/]+/i, "/refer/[redacted]")
      .replace(/^\/r\/[^/]+/i, "/r/[redacted]")
      .replace(/^\/api\/ask-invites\/[^/]+/i, "/api/ask-invites/[redacted]");
    if (scrubbed !== pathname) return scrubbed;
    // Not an anchored route but still carrying a sensitive path: fail safe.
    return containsSensitivePath(pathname) ? "/[redacted]" : pathname;
  } catch {
    return "[redacted]";
  }
}

// Free text never keeps its shape around a secret, so the whole value goes.
export function scrubSentryText(value: string): string {
  return containsSensitivePath(value) ? "[redacted]" : value;
}

function scrubDeepValue(value: unknown, scrub: (input: string) => string, depth = 0): unknown {
  if (typeof value === "string") return scrub(value);
  if (depth >= 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(item => scrubDeepValue(item, scrub, depth + 1));
  const scrubbed: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) scrubbed[key] = scrubDeepValue(item, scrub, depth + 1);
  return scrubbed;
}

// Breadcrumbs (navigation from/to, fetch/xhr url) record the same paths as the
// event URL, so each one goes through the same scrub (D-090 re-review F2).
const BREADCRUMB_URL_KEYS = ["url", "from", "to"] as const;
export function scrubBreadcrumb<T extends { data?: Record<string, unknown>; message?: string }>(breadcrumb: T, origin: string): T {
  const next: T = { ...breadcrumb };
  if (typeof next.message === "string") next.message = scrubSentryText(next.message);
  const data = next.data;
  if (!data) return next;
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    scrubbed[key] =
      (BREADCRUMB_URL_KEYS as readonly string[]).includes(key) && typeof value === "string"
        ? scrubSentryUrl(value, origin)
        : scrubDeepValue(value, scrubSentryText);
  }
  next.data = scrubbed;
  return next;
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
      return scrubEvent(event, origin);
    },
  });
  initialized = true;
  return true;
}

// Every field that can echo a page URL, a request or a caught error goes
// through the same scan, so a token cannot ride in beside the event URL
// (D-090 post-fix regression round).
function scrubEvent(event: Sentry.ErrorEvent, origin: string): Sentry.ErrorEvent {
  if (typeof event.message === "string") event.message = scrubSentryText(event.message);
  if (typeof event.transaction === "string") event.transaction = scrubSentryText(event.transaction);
  if (event.tags) event.tags = scrubDeepValue(event.tags, scrubSentryText) as typeof event.tags;
  if (event.extra) event.extra = scrubDeepValue(event.extra, scrubSentryText) as typeof event.extra;
  if (event.contexts) event.contexts = scrubDeepValue(event.contexts, scrubSentryText) as typeof event.contexts;
  const request = event.request;
  if (request) {
    if (typeof request.url === "string") request.url = scrubSentryUrl(request.url, origin);
    if (request.query_string !== undefined) {
      request.query_string = scrubDeepValue(request.query_string, scrubSentryText) as typeof request.query_string;
    }
    if (request.headers) request.headers = scrubDeepValue(request.headers, scrubSentryText) as typeof request.headers;
    if (request.data !== undefined) request.data = scrubDeepValue(request.data, scrubSentryText) as typeof request.data;
    if (request.cookies) request.cookies = scrubDeepValue(request.cookies, scrubSentryText) as typeof request.cookies;
  }
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === "string") value.value = scrubSentryText(value.value);
  }
  // Backstop: anything that reached the event without passing beforeBreadcrumb.
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(crumb => scrubBreadcrumb(crumb, origin));
  return event;
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

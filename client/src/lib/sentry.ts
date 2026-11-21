import * as Sentry from "@sentry/react";
import { scrubTelemetryBreadcrumb, scrubTelemetryCredentials, scrubTelemetryEvent, scrubTelemetryPath } from "@shared/telemetryScrub";

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
  "/api/referrer-fast-track/",
  "/api/referral-share-cards/public/",
  "/api/referrer-review-links/",
  "/api/documents/by-key/",
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
// cards, fast-track codes, vanity aliases, storage keys), in browser and API
// URLs alike. These must never leave the device in an event (FND-4).
export function scrubSentryUrl(value: string, origin: string): string {
  try {
    const url = new URL(value, origin);
    const pathname = decodeURIComponent(url.pathname);
    const scrubbed = scrubTelemetryPath(pathname);
    if (scrubbed !== pathname) return scrubbed;
    // Not an anchored route but still carrying a sensitive path: fail safe.
    const path = containsSensitivePath(pathname) ? "/[redacted]" : pathname;
    return scrubTelemetryCredentials(path);
  } catch {
    return "[redacted]";
  }
}

// Free text never keeps its shape around a secret, so the whole value goes.
export function scrubSentryText(value: string): string {
  return containsSensitivePath(value) ? "[redacted]" : scrubTelemetryCredentials(value);
}

export function scrubBreadcrumb<T extends { data?: Record<string, unknown>; message?: string }>(breadcrumb: T, origin: string): T {
  return scrubTelemetryBreadcrumb(breadcrumb, value => scrubSentryUrl(value, origin), scrubSentryText);
}

type ClientSentryTestOverrides = Pick<Sentry.BrowserOptions, "transport" | "tracesSampleRate">;

export function initClientSentry(overrides: ClientSentryTestOverrides = {}): boolean {
  if (initialized || typeof window === "undefined") return initialized;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return false;
  const origin = window.location.origin;
  const scrubUrl = (value: string) => scrubSentryUrl(value, origin);
  Sentry.init({
    dsn,
    release: (import.meta.env.VITE_GIT_COMMIT_SHA as string | undefined) || undefined,
    environment: window.location.hostname === "localhost" ? "development" : "production",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeBreadcrumb: breadcrumb => scrubBreadcrumb(breadcrumb, origin),
    beforeSend: event => scrubTelemetryEvent(event, scrubUrl, scrubSentryText),
    beforeSendTransaction: event => scrubTelemetryEvent(event, scrubUrl, scrubSentryText),
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

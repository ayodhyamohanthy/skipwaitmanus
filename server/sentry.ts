import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";
import { scrubTelemetryBreadcrumb, scrubTelemetryCredentials, scrubTelemetryEvent, scrubTelemetryPath } from "../shared/telemetryScrub";

let initialized = false;

// Single-use link segments that must never reach Sentry. Matched anywhere in a
// string and case-insensitively, because the SDK carries absolute URLs
// (`request.url`) and referers, not only the `req.path` the middleware saw.
const SINGLE_USE_SEGMENTS: readonly (readonly [RegExp, string])[] = [
  [/\/api\/ask-invites\/[^/?#\s]+/gi, "/api/ask-invites/[redacted]"],
  [/\/email-review\/[^/?#\s]+/gi, "/email-review/[redacted]"],
  [/\/share-card\/[^/?#\s]+/gi, "/share-card/[redacted]"],
  [/\/fast\/[^/?#\s]+/gi, "/fast/[redacted]"],
  [/\/refer\/[^/?#\s]+\/[^/?#\s]+/gi, "/refer/[redacted]"],
  [/\/r\/[^/?#\s]+/gi, "/r/[redacted]"],
];

/** Redacts every single-use link in free text. Prose keeps its question marks (F4). */
export function scrubSentryText(value: string): string {
  const scrubbed = SINGLE_USE_SEGMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  return scrubTelemetryCredentials(scrubbed);
}

const RELATIVE_BASE = "http://relative.invalid";

/** A URL-bearing field keeps its origin and scrubbed path, without credentials or query. */
export function scrubSentryUrlText(value: string): string {
  if (value === "[redacted]") return value;
  try {
    const url = new URL(value, RELATIVE_BASE);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "[redacted]";
    const pathname = decodeURIComponent(url.pathname);
    const scrubbed = scrubSentryPath(pathname);
    const path = scrubbed === pathname ? scrubSentryText(pathname) : scrubTelemetryCredentials(scrubbed);
    if (path === "[redacted]") return path;
    return url.origin === RELATIVE_BASE ? path : `${url.origin}${path}`;
  } catch {
    return "[redacted]";
  }
}

// FND-4: one shared scrubber for every token-bearing browser and API route.
export function scrubSentryPath(path: string): string {
  return scrubTelemetryPath(path);
}

function serverRelease(): string | undefined {
  try {
    const sha = readFileSync("commit-sha.txt", "utf8").trim();
    return /^[a-f0-9]{40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

type ServerSentryTestOverrides = Pick<Sentry.NodeOptions, "transport" | "tracesSampleRate">;

export function initServerSentry(overrides: ServerSentryTestOverrides = {}): boolean {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    release: serverRelease(),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // sendDefaultPii alone does not disable HTTP request body collection.
    integrations: defaults => [...defaults, Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" })],
    beforeBreadcrumb: breadcrumb => scrubTelemetryBreadcrumb(breadcrumb, scrubSentryUrlText, scrubSentryText),
    beforeSend: event => scrubTelemetryEvent(event, scrubSentryUrlText, scrubSentryText),
    beforeSendTransaction: event => scrubTelemetryEvent(event, scrubSentryUrlText, scrubSentryText),
    ...overrides,
  });
  initialized = true;
  return true;
}

export function isServerSentryActive(): boolean {
  return initialized;
}

export async function flushServerSentry(timeoutMs = 5000): Promise<boolean> {
  if (!initialized) return false;
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}

export function captureServerError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function sentryErrorMiddleware(error: unknown, req: Request, _res: Response, next: NextFunction): void {
  if (initialized && error instanceof Error) {
    Sentry.captureException(error, { extra: { method: req.method, path: scrubSentryPath(req.path) } });
  }
  next(error);
}

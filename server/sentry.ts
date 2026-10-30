import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";

let initialized = false;

// Single-use link segments that must never reach Sentry. Matched anywhere in a
// string and case-insensitively, because the SDK carries absolute URLs
// (`request.url`) and referers, not only the `req.path` the middleware saw.
const SINGLE_USE_SEGMENTS: readonly (readonly [RegExp, string])[] = [
  [/\/api\/ask-invites\/[^/?#\s]+/i, "/api/ask-invites/[redacted]"],
  [/\/email-review\/[^/?#\s]+/i, "/email-review/[redacted]"],
  [/\/share-card\/[^/?#\s]+/i, "/share-card/[redacted]"],
  [/\/fast\/[^/?#\s]+/i, "/fast/[redacted]"],
  [/\/refer\/[^/?#\s]+\/[^/?#\s]+/i, "/refer/[redacted]"],
  [/\/r\/[^/?#\s]+/i, "/r/[redacted]"],
];

/** Drops any query or fragment and redacts every single-use link in a string. */
export function scrubSentryText(value: string): string {
  const withoutQuery = value.split("?")[0].split("#")[0];
  return SINGLE_USE_SEGMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), withoutQuery);
}

export function scrubSentryPath(path: string): string {
  return scrubSentryText(path);
}

type EventRequest = NonNullable<Sentry.Event["request"]>;
type ScrubbableBreadcrumb = { message?: string; data?: Record<string, unknown> };
type ScrubbableEvent = { transaction?: string; message?: string; request?: EventRequest; breadcrumbs?: readonly ScrubbableBreadcrumb[] };
type ScrubbableSpan = { description?: string; data?: Record<string, unknown> };

// `data` keys that carry a URL or a hop in the SDK's own breadcrumbs and spans.
const URL_BEARING_KEY = /^(?:url|http\.|from|to)$/i;

function scrubUrlBearingData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (typeof value === "string" && URL_BEARING_KEY.test(key)) data[key] = scrubSentryText(value);
  }
}

function scrubRequestInPlace(request: EventRequest | undefined): void {
  if (!request) return;
  if (typeof request.url === "string") request.url = scrubSentryText(request.url);
  if (typeof request.query_string === "string") request.query_string = scrubSentryText(request.query_string);
  const headers = request.headers;
  if (!headers) return;
  for (const name of Object.keys(headers)) {
    const header = headers[name];
    if (typeof header === "string") headers[name] = scrubSentryText(header);
  }
}

// D-090-BYOR review finding H1 (P1, §4.3.16): `@sentry/node` attaches the incoming
// request to every event captured inside it, so redacting `extra.path` alone left
// the one-time invite token in `transaction`, `request.url`, `request.query_string`
// and the `referer` header. These hooks redact all of them before any send.
function scrubEventInPlace(event: ScrubbableEvent): void {
  if (typeof event.transaction === "string") event.transaction = scrubSentryText(event.transaction);
  if (typeof event.message === "string") event.message = scrubSentryText(event.message);
  scrubRequestInPlace(event.request);
  // The http integration records each request as a breadcrumb whose `data.url`
  // holds the full URL, so the request path leaks there too.
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (typeof breadcrumb.message === "string") breadcrumb.message = scrubSentryText(breadcrumb.message);
    scrubUrlBearingData(breadcrumb.data);
  }
}

function scrubTransactionInPlace(event: ScrubbableEvent & { spans?: readonly ScrubbableSpan[] }): void {
  scrubEventInPlace(event);
  for (const span of event.spans ?? []) {
    if (typeof span.description === "string") span.description = scrubSentryText(span.description);
    scrubUrlBearingData(span.data);
  }
}

function serverRelease(): string | undefined {
  try {
    const sha = readFileSync("commit-sha.txt", "utf8").trim();
    return /^[a-f0-9]{40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

export function initServerSentry(): boolean {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    release: serverRelease(),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    tracesSampleRate: 0.1,
    beforeSend: event => { scrubEventInPlace(event); return event; },
    beforeSendTransaction: event => { scrubTransactionInPlace(event); return event; },
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

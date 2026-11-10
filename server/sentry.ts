import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";
import { scrubTelemetryPath } from "../shared/telemetryScrub";

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
  return SINGLE_USE_SEGMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

/** A URL-bearing field: its query and fragment go first, then the redaction. */
export function scrubSentryUrlText(value: string): string {
  const cut = value.search(/[?#]/);
  return scrubSentryText(cut === -1 ? value : value.slice(0, cut));
}

// FND-4: one shared scrubber for every token-bearing browser and API route.
export function scrubSentryPath(path: string): string {
  return scrubTelemetryPath(path);
}

type EventRequest = NonNullable<Sentry.Event["request"]>;
type ScrubbableBreadcrumb = { message?: string; data?: Record<string, unknown> };
type ScrubbableContext = { data?: Record<string, unknown> };
type ScrubbableEvent = {
  transaction?: string;
  message?: string;
  request?: EventRequest;
  breadcrumbs?: readonly ScrubbableBreadcrumb[];
  contexts?: Record<string, ScrubbableContext | undefined>;
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  exception?: { values?: readonly { value?: string }[] };
};
type ScrubbableSpan = { description?: string; data?: Record<string, unknown> };

// `data` keys that carry a URL or a hop in the SDK's own breadcrumbs, spans and
// root-span attributes: `url`, `url.full`, `http.url`, `http.target`,
// `http.request.header.referer` (F1: the old pattern only matched a literal `http.`).
const URL_BEARING_KEY = /^(?:url|from|to)$|^(?:url|http)\./i;

function scrubUrlBearingData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (typeof value === "string" && URL_BEARING_KEY.test(key)) data[key] = scrubSentryUrlText(value);
  }
}

function scrubRequestInPlace(request: EventRequest | undefined): void {
  if (!request) return;
  if (typeof request.url === "string") request.url = scrubSentryUrlText(request.url);
  if (typeof request.query_string === "string") request.query_string = scrubSentryUrlText(request.query_string);
  const headers = request.headers;
  if (!headers) return;
  for (const name of Object.keys(headers)) {
    const header = headers[name];
    if (typeof header === "string") headers[name] = scrubSentryUrlText(header);
  }
}

// D-090-BYOR review finding H1 (P1, §4.3.16): `@sentry/node` attaches the incoming
// request to every event captured inside it, so redacting `extra.path` alone left
// the one-time invite token in `transaction`, `request.url`, `request.query_string`
// and the `referer` header. These hooks redact all of them before any send.
// Re-review F1/F3: the root span's attributes live in `contexts.trace.data`, and
// exception values, `extra` and `tags` carried the token too.
function scrubEventInPlace(event: ScrubbableEvent): void {
  if (typeof event.transaction === "string") event.transaction = scrubSentryText(event.transaction);
  if (typeof event.message === "string") event.message = scrubSentryText(event.message);
  scrubRequestInPlace(event.request);
  for (const context of Object.values(event.contexts ?? {})) {
    if (context && typeof context === "object") scrubUrlBearingData(context.data);
  }
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === "string") exception.value = scrubSentryText(exception.value);
  }
  for (const bag of [event.extra, event.tags]) {
    if (!bag) continue;
    for (const key of Object.keys(bag)) {
      const value = bag[key];
      if (typeof value === "string") bag[key] = scrubSentryText(value);
    }
  }
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

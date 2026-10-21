import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";
import { scrubTelemetryBreadcrumb, scrubTelemetryEvent } from "@shared/telemetryScrub";

let initialized = false;

export function scrubSentryPath(path: string): string {
  return path
    .split("?")[0]
    .replace(/^\/email-review\/[^/]+/, "/email-review/[redacted]")
    .replace(/^\/share-card\/[^/]+/, "/share-card/[redacted]")
    .replace(/^\/fast\/[^/]+/, "/fast/[redacted]")
    .replace(/^\/refer\/[^/]+\/[^/]+/, "/refer/[redacted]")
    .replace(/^\/api\/referrer-review-links\/[^/]+/, "/api/referrer-review-links/[redacted]")
    .replace(/^\/api\/referrer-fast-track\/[^/]+/, "/api/referrer-fast-track/[redacted]");
}

const RELATIVE_BASE = "http://relative.invalid";

/** An absolute URL keeps its origin; every URL loses its query and fragment and has single-use paths redacted. */
export function scrubServerUrl(value: string): string {
  try {
    const url = new URL(value, RELATIVE_BASE);
    const path = scrubSentryPath(url.pathname);
    return url.origin === RELATIVE_BASE ? path : `${url.origin}${path}`;
  } catch {
    return "[redacted]";
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

/** Tests only: a capturing transport and a sample rate, so a privacy test sees every event and transaction. */
export type ServerSentryTestOverrides = Pick<Sentry.NodeOptions, "transport" | "tracesSampleRate">;

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
    // The SDK attaches incoming request bodies (up to 10 KB) to every event and sampled transaction unless told
    // not to, whatever sendDefaultPii says. Bodies carry passwords, emails and reset tokens: never capture them.
    integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" })],
    // And whatever an integration attaches anyway (cookies, headers, query strings) is removed before sending.
    beforeSend: event => scrubTelemetryEvent(event, scrubServerUrl),
    beforeSendTransaction: event => scrubTelemetryEvent(event, scrubServerUrl),
    beforeBreadcrumb: breadcrumb => scrubTelemetryBreadcrumb(breadcrumb, scrubServerUrl),
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

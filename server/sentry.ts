import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";
import { scrubTelemetryPath } from "../shared/telemetryScrub";

let initialized = false;

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

export function initServerSentry(): boolean {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    release: serverRelease(),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    tracesSampleRate: 0.1,
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

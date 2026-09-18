import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";

let initialized = false;

export function scrubSentryPath(path: string): string {
  return path
    .split("?")[0]
    .replace(/^\/email-review\/[^/]+/, "/email-review/[redacted]")
    .replace(/^\/share-card\/[^/]+/, "/share-card/[redacted]")
    .replace(/^\/fast\/[^/]+/, "/fast/[redacted]")
    .replace(/^\/refer\/[^/]+\/[^/]+/, "/refer/[redacted]");
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

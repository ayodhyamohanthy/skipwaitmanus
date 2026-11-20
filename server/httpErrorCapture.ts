/**
 * D-212 REL-5xx-capture: every server 5xx reaches Sentry and the owner, sign-in
 * and webhooks included. This module owns the three pieces `_core/index.ts`
 * wires in: the finish-hook capture, the error-middleware marker and the tRPC
 * client-code filter. Route values (tokens, aliases, storage keys) never reach
 * Sentry: `routeTemplateOf` keeps only the literal pattern Express matched.
 */
import * as Sentry from "@sentry/node";
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { isServerSentryActive } from "./sentry";

/**
 * The literal route pattern for a request, never a value: `/api/referrer-review-links/:linkToken`
 * for a parameterized route, `/api/trpc/<procedure>` for tRPC, `unmatched` when no route matched.
 */
export function routeTemplateOf(req: Request): string {
  const baseUrl = req.baseUrl ?? "";
  // tRPC mounts once and carries the procedure in the path; Express never matches a route for it.
  if (baseUrl === "/api/trpc") return baseUrl + req.path;
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof routePath === "string" && routePath) return baseUrl + routePath;
  if (Array.isArray(routePath) && typeof routePath[0] === "string") return baseUrl + routePath[0];
  return "unmatched";
}

const API_PATH = /^\/api(\/|$)/;

/** A 5xx that no route, tRPC handler or error middleware reported is captured here, once. */
export const httpErrorCaptureMiddleware: RequestHandler = (req, res, next) => {
  res.once("finish", () => {
    const fullPath = `${req.baseUrl ?? ""}${req.path}`;
    if (!API_PATH.test(fullPath)) return;
    // Readiness answers 503 on every rollout; the watchdog and release verify own those routes.
    if (fullPath === "/api/health" || fullPath.startsWith("/api/health/")) return;
    if (res.statusCode < 500) return;
    if (res.locals.errorReported === true) return;
    if (!isServerSentryActive()) return;
    const method = req.method.toUpperCase();
    const route = routeTemplateOf(req);
    const status = String(res.statusCode);
    Sentry.captureMessage(`skipwait.me ${method} ${route} ${status}`, {
      level: "error",
      fingerprint: [method, route, status],
      tags: { method, route, status_code: status },
    });
  });
  next();
};

/** Marks a response whose 5xx was already reported, so the finish-hook capture skips it. */
export const markErrorReported: ErrorRequestHandler = (error, _req, res, next) => {
  res.locals.errorReported = true;
  next(error);
};

const CLIENT_TRPC_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
  "CONFLICT",
  "PRECONDITION_FAILED",
]);

/** True for caller-fixable tRPC codes; these never spend Sentry quota. */
export function isClientTrpcCode(code: string | undefined): boolean {
  return code !== undefined && CLIENT_TRPC_CODES.has(code);
}

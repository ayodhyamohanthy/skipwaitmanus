import type { NextFunction, Request, Response } from "express";
import { isSecureRequest } from "./_core/cookies";

// Six months. Long enough to matter for a returning visitor, short enough that
// a future move off TLS on this host is recoverable without a support ticket.
const HSTS_MAX_AGE_SECONDS = 15552000;

export function globalSecurityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // No skipwait.me surface is meant to be embedded, so refuse framing outright
  // rather than only same-origin framing.
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy-Report-Only", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  // Only meaningful over TLS, and browsers ignore it on plain http.
  if (isSecureRequest(req)) {
    res.setHeader("Strict-Transport-Security", `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
  }
  next();
}

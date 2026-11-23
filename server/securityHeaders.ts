import type { NextFunction, Request, Response } from "express";
import { isSecureRequest } from "./_core/cookies";
import { CSP_REPORT_PATH, handleCspReport } from "./cspReport";

// Six months. Long enough to matter for a returning visitor, short enough that
// a future move off TLS on this host is recoverable without a support ticket.
const HSTS_MAX_AGE_SECONDS = 15552000;
const HSTS_PRELOAD_MAX_AGE_SECONDS = 63072000;
// Owner approval is required both to turn this on and to submit the domain.
const HSTS_PRELOAD = false;

export function strictTransportSecurityValue(preload: boolean): string {
  const maxAge = preload ? HSTS_PRELOAD_MAX_AGE_SECONDS : HSTS_MAX_AGE_SECONDS;
  return `max-age=${maxAge}; includeSubDomains${preload ? "; preload" : ""}`;
}

const HSTS_HEADER_VALUE = strictTransportSecurityValue(HSTS_PRELOAD);

// D-100.csp-enforce: the enforcing header is built but stays off. Only
// D-100.csp-release flips this after 48 hours of page reports and desktop/mobile
// verification (D-350). Off, the response is unchanged during collection.
export const CSP_ENFORCED = false;

export const CSP_POLICY = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; report-uri ${CSP_REPORT_PATH}`;

export function contentSecurityPolicyHeader(enforced: boolean): { name: string; value: string } {
  return { name: enforced ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: CSP_POLICY };
}

export function globalSecurityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // No skipwait.me surface is meant to be embedded, so refuse framing outright
  // rather than only same-origin framing.
  res.setHeader("X-Frame-Options", "DENY");
  const csp = contentSecurityPolicyHeader(CSP_ENFORCED);
  res.setHeader(csp.name, csp.value);
  // Only meaningful over TLS, and browsers ignore it on plain http.
  if (isSecureRequest(req)) {
    res.setHeader("Strict-Transport-Security", HSTS_HEADER_VALUE);
  }
  // D-100.csp-report: the report endpoint is answered here, before any body
  // parser or session middleware, so it reads its own bounded raw body.
  if (req.method === "POST" && req.path === CSP_REPORT_PATH) {
    handleCspReport(req, res);
    return;
  }
  next();
}

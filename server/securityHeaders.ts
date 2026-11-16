import type { NextFunction, Request, Response } from "express";
import { isSecureRequest } from "./_core/cookies";
import { CSP_REPORT_PATH, handleCspReport } from "./cspReport";

// Six months. Long enough to matter for a returning visitor, short enough that
// a future move off TLS on this host is recoverable without a support ticket.
const HSTS_MAX_AGE_SECONDS = 15552000;

// D-100.csp-enforce: the enforcing header is built but stays off. Only
// D-100.csp-release flips this, after seven days of reports from the
// report-only policy and the CEO's sign-off. Off, the response is unchanged.
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
    res.setHeader("Strict-Transport-Security", `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
  }
  // D-100.csp-report: the report endpoint is answered here, before any body
  // parser or session middleware, so it reads its own bounded raw body.
  if (req.method === "POST" && req.path === CSP_REPORT_PATH) {
    handleCspReport(req, res);
    return;
  }
  next();
}

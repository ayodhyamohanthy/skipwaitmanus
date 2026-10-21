import type { Request } from "express";

/**
 * Login-CSRF posture for the public password POSTs (sign-in, forgot, reset).
 * There is no CORS grant on this API, so a cross-site page cannot send a JSON
 * body without a preflight it will never pass; requiring application/json
 * closes the HTML-form path (the global urlencoded parser would otherwise
 * accept it). The Origin header, which browsers always send on POST, must be
 * this request's own origin or the configured public origin. With no Origin,
 * only a browser's Sec-Fetch-Site: same-origin is accepted.
 */
export function configuredPublicOrigin(): string | undefined {
  for (const raw of [process.env.PUBLIC_BASE_URL, process.env.WORKOS_REDIRECT_URI]) {
    if (!raw) continue;
    try { return new URL(raw).origin; } catch { continue; }
  }
  return undefined;
}

/**
 * Origin for links that leave the system (emails, Slack deliveries, share
 * URLs). Always the configured public origin - PUBLIC_BASE_URL first, then
 * the origin of WORKOS_REDIRECT_URI, which production always sets. Request
 * headers are never trusted for outbound links: with `trust proxy` on, a
 * spoofed Host/X-Forwarded-Host would otherwise put a one-click token link
 * onto an attacker's host. In production a missing configuration is a boot
 * error, not a downgrade; outside production the request host keeps local
 * development convenient.
 */
export function publicOutboundOrigin(req: Request): string {
  const configured = configuredPublicOrigin();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("Public origin is not configured (PUBLIC_BASE_URL or WORKOS_REDIRECT_URI)");
  return `${req.protocol}://${req.get("host")}`;
}

export function isTrustedAuthPost(req: Request): boolean {
  if (!req.is("application/json")) return false;
  const origin = req.header("origin");
  if (origin) {
    let presented: string;
    // An opaque origin ("null", sandboxed frames) does not parse and is refused.
    try { presented = new URL(origin).origin; } catch { return false; }
    const allowed = new Set<string>([`${req.protocol}://${req.get("host") ?? ""}`]);
    const configured = configuredPublicOrigin();
    if (configured) allowed.add(configured);
    return allowed.has(presented);
  }
  return req.header("sec-fetch-site") === "same-origin";
}

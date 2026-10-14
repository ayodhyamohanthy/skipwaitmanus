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

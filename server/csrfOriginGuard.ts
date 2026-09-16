import type { NextFunction, Request, Response } from "express";

/**
 * Cross-site request forgery guard for state-changing requests.
 *
 * The session cookie is `SameSite=None` in production (see _core/cookies.ts),
 * and cookie auth is the only auth on every REST route, so any website could
 * auto-submit a form to endpoints like subscription cancellation, account
 * erasure, one-click referral review, or (as admin) user suspension and token
 * grants. There was no CSRF token, no `Origin` check, and `express.urlencoded`
 * is parsed globally so a plain cross-site `<form>` reaches handlers with a
 * populated body.
 *
 * This is deliberately narrow rather than a token scheme:
 *
 * - Only non-safe methods are checked; GET/HEAD/OPTIONS pass through.
 * - A request is rejected only when it *carries* an `Origin` (or `Referer`)
 *   whose host differs from the host it was sent to. Browsers attach `Origin`
 *   to every cross-origin POST and cannot be made to forge it, so this closes
 *   the browser attack without a token round-trip.
 * - Requests with neither header pass. A browser cannot omit `Origin` on a
 *   cross-origin state-changing request, so an absent header means a non-browser
 *   caller: provider webhooks (which authenticate by signature), curl, or
 *   server-to-server. Rejecting those would break the payment rails for no
 *   security gain.
 *
 * The comparison uses `publicRequestHost` rather than the raw `Host` header.
 * Production proxies `/api/*` through a Cloudflare Pages Function that deletes
 * `Host` (Cloudflare forbids setting it on an outbound fetch) and forwards the
 * browser's host as `X-Forwarded-Host`. Comparing against the raw `Host` therefore
 * compared `Origin: https://skipwait.me` to `Host: <container>.workers.dev` and
 * rejected **every** state-changing browser request with 403.
 *
 * See `_core/publicHost.ts` for the trust model. The short version: a browser
 * cannot attach a custom forwarding header without a CORS preflight, and the
 * session cookie is scoped to the public domain so it is never sent to the
 * container host — so the forwarded host cannot be steered in a credentialed
 * request. Setting `PROXY_SHARED_SECRET` adds proof on top.
 */

import { publicRequestHost } from "./_core/publicHost";

/** Returned to any caller whose Origin does not match the host it reached. */
export const CROSS_SITE_BLOCKED_MESSAGE =
  "This request was blocked because it came from another site.";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Extra hosts allowed to send state-changing requests, e.g. a staging origin. */
export function allowedCsrfHosts(
  env: NodeJS.ProcessEnv = process.env
): Set<string> {
  return new Set(
    (env.CSRF_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
      // Accept either "host" or a full origin, so a copy-pasted URL still works.
      .map(value => hostFromOriginLike(value) ?? value)
  );
}

/** Host[:port] of an Origin/Referer-style value; undefined if it isn't a URL. */
export function hostFromOriginLike(
  value: string | undefined | null
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.host.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export function csrfOriginGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (SAFE_METHODS.has(req.method)) return next();

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  // `Origin` is authoritative when present; some clients only send `Referer`.
  const candidate =
    typeof originHeader === "string"
      ? originHeader
      : typeof refererHeader === "string"
        ? refererHeader
        : undefined;

  if (candidate === undefined) return next();

  const requestHost = (publicRequestHost(req) ?? "").trim().toLowerCase();
  const candidateHost = hostFromOriginLike(candidate);

  // A present-but-unparseable value (e.g. `Origin: null` from a sandboxed
  // iframe or a data: URL) is treated as cross-site and refused.
  if (candidateHost && candidateHost === requestHost) return next();
  if (candidateHost && allowedCsrfHosts().has(candidateHost)) return next();

  return res.status(403).json({ error: CROSS_SITE_BLOCKED_MESSAGE });
}

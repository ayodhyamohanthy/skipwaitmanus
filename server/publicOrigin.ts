import type { Request } from "express";
import { publicRequestHost } from "./_core/publicHost";

/**
 * Canonical public origin for absolute URLs that leave the server.
 *
 * Review links in email, Slack triage messages, share-card canonical/OG URLs and
 * payment redirect URLs were all built from `${req.protocol}://${req.get("host")}`.
 * With `app.set("trust proxy", true)` Express takes `req.protocol` from the
 * client-supplied `X-Forwarded-Proto`, so a caller could force those links to
 * `http://`. That matters most for the one-click review links: the token in the
 * URL is by itself sufficient to approve or decline a referral, so an `http`
 * link is exposed to every plaintext hop — corporate mail-gateway link scanners,
 * shared terminals, proxy logs.
 *
 * Resolution order:
 *  1. `PUBLIC_APP_ORIGIN` — explicit override, if you ever serve the app from a
 *     different canonical host than the one below.
 *  2. The origin of `WORKOS_REDIRECT_URI`, which production already sets to
 *     `https://skipwait.me/...`. Deriving it here means the fix is active with
 *     no new configuration, and it cannot disagree with the origin the identity
 *     provider sends users back to.
 *  3. Request-derived — local development on arbitrary ports.
 */
export function publicAppOrigin(
  req: Pick<Request, "protocol" | "get" | "headers">
): string {
  const configured = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (configured) return stripTrailingSlash(configured);

  const redirectUri = process.env.WORKOS_REDIRECT_URI?.trim();
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      // Malformed config: fall through rather than emit a broken absolute URL.
    }
  }

  // Step 3 only runs in local development, but the raw `Host` is still the wrong
  // thing to read here: behind the Pages proxy it is the container's workers.dev
  // name, which would put the wrong host into one-click review links. See
  // `_core/publicHost.ts`.
  return `${req.protocol}://${publicRequestHost(req) ?? req.get("host")}`;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * The public host the browser actually used.
 *
 * Why this cannot just be `req.headers.host`:
 *
 * Production serves the SPA and proxies `/api/*` through a Cloudflare Pages
 * Function (`functions/api/[[path]].ts`). Cloudflare forbids setting `Host` on an
 * outbound `fetch`, so the proxy **deletes** `Host` and forwards the browser's
 * host as `X-Forwarded-Host`. The API container therefore sees
 * `Host: <container>.workers.dev` on *every* request while the browser's `Origin`
 * is `https://skipwait.me`.
 *
 * Any host-scoped decision that reads the raw `Host` is therefore wrong for this
 * deployment, and silently breaks:
 *
 *  - `csrfOriginGuard` — compares the request host to the browser's `Origin`, so
 *    every state-changing request 403s.
 *  - `chargebeeEnvironment.billingHost` — decides live vs test billing, so live
 *    checkouts and live webhook verification silently fall back to test.
 *  - `publicAppOrigin` / the WorkOS callback fallback — builds the wrong host into
 *    outbound links and redirect URIs.
 *
 * Trust model
 * -----------
 * The forwarded host is only honoured when it can be attributed to the proxy:
 *
 *  1. `PROXY_SHARED_SECRET` set and the request carries a matching
 *     `x-skipwait-proxy` header → the proxy forwarded it; trust `X-Forwarded-Host`.
 *  2. `PROXY_SHARED_SECRET` set but the header is missing or wrong → the request
 *     did not come through the proxy (or came with a forged marker); fall back to
 *     the raw `Host`, which a caller cannot steer past the proxy.
 *  3. `PROXY_SHARED_SECRET` **not** configured → honour `X-Forwarded-Host`. This is
 *     the pre-existing behaviour and is required for the app to function at all
 *     behind the proxy; refusing it would 403 every mutation. The residual risk is
 *     confined to server-to-server callers, because a browser cannot attach a
 *     custom forwarding header without a CORS preflight, and the session cookie is
 *     scoped to the public domain so it is never sent to the container host.
 *
 * Setting `PROXY_SHARED_SECRET` (in the Pages project *and* the container) is the
 * recommended hardening step; `warnOnUnhardenedProxy` logs once at boot when it is
 * missing in production.
 */

type HostishHeaders = {
  host?: string | string[];
  "x-forwarded-host"?: string | string[];
  "x-skipwait-proxy"?: string | string[];
};

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

/** The first entry of `X-Forwarded-Host`, which is the original client-facing host. */
function forwardedHost(headers: HostishHeaders): string | undefined {
  const raw = firstHeaderValue(headers["x-forwarded-host"]);
  if (!raw) return undefined;
  const first = raw.split(",")[0]?.trim();
  return first || undefined;
}

export function publicRequestHost(req: { headers?: HostishHeaders }): string | undefined {
  // Tolerate a caller with no `headers` object at all: this is called from link
  // builders that accept a narrowed request type, and from tests.
  const headers = req?.headers ?? {};
  const forwarded = forwardedHost(headers);
  const direct = firstHeaderValue(headers.host);
  if (!forwarded) return direct;

  const secret = process.env.PROXY_SHARED_SECRET;
  if (!secret) return forwarded;

  return firstHeaderValue(headers["x-skipwait-proxy"]) === secret ? forwarded : direct;
}

let warnedAboutMissingProxySecret = false;

/**
 * Logs once when production runs behind the proxy without a shared secret, so the
 * un-hardened state is visible instead of silent. Never throws.
 */
export function warnOnUnhardenedProxy(env: NodeJS.ProcessEnv = process.env): void {
  if (warnedAboutMissingProxySecret) return;
  if (env.NODE_ENV !== "production") return;
  if (env.PROXY_SHARED_SECRET) return;
  warnedAboutMissingProxySecret = true;
  console.warn(
    "[Proxy] PROXY_SHARED_SECRET is not set. The public host is taken from X-Forwarded-Host without proof it came from the Pages proxy. " +
      "Set the same secret in the Cloudflare Pages project and the API container to close this."
  );
}

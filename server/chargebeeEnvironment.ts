import { publicRequestHost } from "./_core/publicHost";

export type ChargebeeRuntime = {
  environment: "test" | "live";
  site: string;
  apiKey: string;
};

export type ChargebeeEnvironment = Record<string, string | undefined>;

/**
 * Host used for the live/test billing decision.
 *
 * NOT the raw `Host` header. Production proxies `/api/*` through a Cloudflare
 * Pages Function that *deletes* `Host` (Cloudflare forbids setting it on an
 * outbound fetch) and forwards the browser's host as `X-Forwarded-Host`. Reading
 * the raw `Host` therefore saw the container's `workers.dev` name on every
 * request, so `isLiveChargebeeRequest` was **always false in production** and live
 * checkouts ran on the test site with the test API key, while live webhooks were
 * verified against the test secret.
 *
 * `publicRequestHost` resolves this correctly and documents the trust model: the
 * forwarded host is honoured when the proxy proves it forwarded the request (via
 * `PROXY_SHARED_SECRET` + `x-skipwait-proxy`), and falls back to the raw `Host`
 * when a secret is configured but the proof is absent — so a caller still cannot
 * steer which secret validates their webhook.
 */
export function billingHost(req: Parameters<typeof publicRequestHost>[0]): string | undefined {
  return publicRequestHost(req);
}

function normalizeHost(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function isLiveChargebeeRequest(host: string | undefined, env: ChargebeeEnvironment = process.env): boolean {
  const liveDomain = normalizeHost(env.CHARGEBEE_LIVE_DOMAIN);
  const requestHost = normalizeHost(host);
  return env.CHARGEBEE_LIVE_ENABLED === "true" && Boolean(liveDomain) && requestHost === liveDomain;
}

export function resolveChargebeeRuntime(host: string | undefined, env: ChargebeeEnvironment = process.env): ChargebeeRuntime {
  if (isLiveChargebeeRequest(host, env)) {
    const apiKey = env.CHARGEBEE_LIVE_API_KEY;
    if (!apiKey) throw new Error("Live Chargebee API key is not configured");
    return { environment: "live", site: env.CHARGEBEE_LIVE_SITE ?? "skipwait", apiKey };
  }

  const apiKey = env.CHARGEBEE_API_KEY;
  if (!apiKey) throw new Error("Chargebee API key is not configured");
  return { environment: "test", site: env.CHARGEBEE_SITE ?? "skipwait-test", apiKey };
}

export function resolveChargebeeWebhookSecret(host: string | undefined, env: ChargebeeEnvironment = process.env): string | undefined {
  return isLiveChargebeeRequest(host, env)
    ? env.CHARGEBEE_LIVE_WEBHOOK_SECRET
    : env.CHARGEBEE_WEBHOOK_SECRET;
}

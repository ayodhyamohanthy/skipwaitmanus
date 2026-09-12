export type ChargebeeRuntime = {
  environment: "test" | "live";
  site: string;
  apiKey: string;
};

export type ChargebeeEnvironment = Record<string, string | undefined>;

/**
 * Host used for the live/test billing decision.
 *
 * Deliberately the raw `Host` header rather than `req.hostname`. With
 * `app.set("trust proxy", true)` Express derives `req.hostname` from the
 * client-supplied `X-Forwarded-Host` in preference to `Host`, so a caller could
 * choose whether the server validates a webhook delivery against the **live** or
 * the **test** Chargebee secret — and which site/API key a checkout runs on. The
 * proxy in front of this service controls `Host`; a caller does not.
 */
export function billingHost(req: { headers: { host?: string | string[] } }): string | undefined {
  const host = req.headers.host;
  return typeof host === "string" ? host : undefined;
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

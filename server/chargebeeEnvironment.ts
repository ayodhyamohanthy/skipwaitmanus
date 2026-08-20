export type ChargebeeRuntime = {
  environment: "test" | "live";
  site: string;
  apiKey: string;
};

export type ChargebeeEnvironment = Record<string, string | undefined>;

function normalizeHost(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function isLiveChargebeeRequest(host: string | undefined, env: ChargebeeEnvironment = process.env): boolean {
  const liveDomain = normalizeHost(env.CHARGEBEE_LIVE_DOMAIN ?? "skipwait.me");
  return env.CHARGEBEE_LIVE_ENABLED === "true" && Boolean(liveDomain) && normalizeHost(host) === liveDomain;
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

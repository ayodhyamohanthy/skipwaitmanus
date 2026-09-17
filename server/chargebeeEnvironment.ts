export type ChargebeeRuntime = {
  environment: "test" | "live";
  site: string;
  apiKey: string;
};

export type ChargebeeEnvironment = Record<string, string | undefined>;

export function resolveBillingEnvironment(env: ChargebeeEnvironment = process.env): "test" | "live" {
  const value = env.BILLING_ENV?.trim().toLowerCase();
  if (value === "test" || value === "live") return value;
  // Isolated unit tests do not boot the production server. Keep their default
  // deterministic while production startup still refuses an unset value.
  if (env === process.env && process.env.NODE_ENV === "test" && !value) return "test";
  throw new Error("BILLING_ENV must be explicitly set to test or live");
}

export function validateBillingEnvironment(env: ChargebeeEnvironment = process.env): "test" | "live" {
  const environment = resolveBillingEnvironment(env);
  const required = environment === "live"
    ? ["CHARGEBEE_LIVE_SITE", "CHARGEBEE_LIVE_API_KEY", "CHARGEBEE_LIVE_WEBHOOK_SECRET"]
    : ["CHARGEBEE_SITE", "CHARGEBEE_API_KEY", "CHARGEBEE_WEBHOOK_SECRET"];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Billing ${environment} configuration is incomplete: ${missing.join(", ")}`);
  return environment;
}

/** Request host is deliberately ignored. Billing environment is immutable for
 * the process and selected only by BILLING_ENV at startup. */
export function isLiveChargebeeRequest(_host: string | undefined, env: ChargebeeEnvironment = process.env): boolean {
  return resolveBillingEnvironment(env) === "live";
}

export function resolveChargebeeRuntime(_host: string | undefined, env: ChargebeeEnvironment = process.env): ChargebeeRuntime {
  const environment = resolveBillingEnvironment(env);
  if (environment === "live") {
    const site = env.CHARGEBEE_LIVE_SITE;
    const apiKey = env.CHARGEBEE_LIVE_API_KEY;
    if (!site || !apiKey) throw new Error("Live Chargebee API key/site is not configured");
    return { environment, site, apiKey };
  }
  const site = env.CHARGEBEE_SITE;
  const apiKey = env.CHARGEBEE_API_KEY;
  if (!site || !apiKey) throw new Error("Chargebee API key/site is not configured");
  return { environment, site, apiKey };
}

export function resolveChargebeeWebhookSecret(_host: string | undefined, env: ChargebeeEnvironment = process.env): string | undefined {
  return resolveBillingEnvironment(env) === "live" ? env.CHARGEBEE_LIVE_WEBHOOK_SECRET : env.CHARGEBEE_WEBHOOK_SECRET;
}

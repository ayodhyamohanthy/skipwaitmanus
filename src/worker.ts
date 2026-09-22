// src/worker.ts
// Worker entry: routes requests to the Container running the Express app.
import { Container, getContainer } from "@cloudflare/containers";

const CONTAINER_ENV_KEYS = [
  "ADMIN_SMOKE_SECRET", "AI_MODEL", "AI_PROVIDER_API_KEY", "AI_PROVIDER_BASE_URL",
  "BUILT_IN_FORGE_API_KEY", "BUILT_IN_FORGE_API_URL", "BILLING_ENV", "CHARGEBEE_API_KEY",
  "CHARGEBEE_LIVE_API_KEY", "CHARGEBEE_LIVE_DOMAIN", "CHARGEBEE_LIVE_ENABLED",
  "CHARGEBEE_LIVE_SITE", "CHARGEBEE_LIVE_WEBHOOK_SECRET", "CHARGEBEE_SITE",
  "CHARGEBEE_WEBHOOK_SECRET",
  "DATABASE_URL", "ENABLE_ADMIN_BOOTSTRAP", "ENABLE_ADMIN_SMOKE_FIXTURE",
  "ERROR_ALERT_FROM_EMAIL", "JWT_SECRET", "NODE_ENV", "OAUTH_SERVER_URL",
  "OWNER_OPEN_ID", "PAYPAL_CLIENT_ID", "PAYPAL_ENV", "PAYPAL_SECRET",
  "PAYPAL_WEBHOOK_ID", "R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_BUCKET",
  "R2_SECRET_ACCESS_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET", "RESEND_API_KEY", "SENTRY_DSN", "SKIPWAIT_ADMIN_EMAIL",
  "VITE_APP_ID", "VITE_APP_TITLE", "WORKOS_API_KEY", "WORKOS_CLIENT_ID",
  "WORKOS_COOKIE_PASSWORD", "WORKOS_POST_SIGNIN_PATH", "WORKOS_REDIRECT_URI",
  "WORKOS_WEBHOOK_SECRET",
  "ZEPTOMAIL_API_KEY", "ZEPTOMAIL_FROM_EMAIL",
] as const;

/**
 * SkipwaitApi container.
 *
 * Cloudflare Containers do not inherit Worker bindings automatically. Keep
 * this allowlist explicit so the container receives only values the app reads, including secret bindings that may not appear in Object.entries(env).
 */
export class SkipwaitApi extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
  envVars: Record<string, string> = {};

  constructor(
    ctx: DurableObject["ctx"],
    env: Record<string, unknown>,
    options?: ConstructorParameters<typeof Container>[2]
  ) {
    super(ctx, env, options);
    for (const key of CONTAINER_ENV_KEYS) {
      const value = env[key];
      if (typeof value === "string" && value.length > 0) this.envVars[key] = value;
    }
  }
}

import { fetchContainerWithStoppedRecovery } from "./containerRecovery";

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown> & { SkipwaitApi: DurableObjectNamespace; API_RELEASE?: string },
    ctx: ExecutionContext
  ): Promise<Response> {
    // The API Worker is reachable only on the canonical zone route. Never trust
    // forwarded host headers: callers can supply them, while request.url is set
    // by Cloudflare from the matched route.
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.hostname !== "skipwait.me" || !url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    // Single-instance API: all requests to one container for session affinity.
    const release = typeof env.API_RELEASE === "string" && /^[a-f0-9]{40}$/.test(env.API_RELEASE) ? env.API_RELEASE.slice(0, 12) : "legacy";
    const container = getContainer(env.SkipwaitApi, `skipwaitmanus-api-${release}`);
    return fetchContainerWithStoppedRecovery(container, request);
  },
};

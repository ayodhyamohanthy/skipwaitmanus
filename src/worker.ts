// src/worker.ts
// Worker entry: routes requests to the Container running the Express app.
import { Container, getContainer } from "@cloudflare/containers";

const CONTAINER_ENV_KEYS = [
  "COMPANY_CLAIM_ENABLED",
  "ADMIN_SMOKE_SECRET", "COMPANY_RESPONSE_SIGNAL_ENABLED", "UNMATCHED_DOMAINS_ENABLED", "AI_MODEL", "AI_PROVIDER_API_KEY", "AI_PROVIDER_BASE_URL",
  "BUILT_IN_FORGE_API_KEY", "BUILT_IN_FORGE_API_URL", "BILLING_ENV", "BILLING_LEDGER_READ_TOKEN", "CHARGEBEE_API_KEY",
  "CHARGEBEE_LIVE_API_KEY", "CHARGEBEE_LIVE_DOMAIN", "CHARGEBEE_LIVE_ENABLED",
  "CHARGEBEE_LIVE_SITE", "CHARGEBEE_LIVE_WEBHOOK_SECRET", "CHARGEBEE_SITE",
  "CHARGEBEE_WEBHOOK_SECRET",
  "DATABASE_URL", "ENABLE_ADMIN_BOOTSTRAP", "ENABLE_ADMIN_SMOKE_FIXTURE",
  "ERROR_ALERT_FROM_EMAIL", "SHARE_IMPACT_CARD_ENABLED", "JWT_SECRET", "NODE_ENV", "OAUTH_SERVER_URL",
  "OPPORTUNITY_HIRING_NOW_TTL_DAYS", "OPPORTUNITY_MAX_OPEN_PER_USER",
  "OPPORTUNITY_MAX_PER_USER_PER_DAY",
  "OWNER_OPEN_ID", "PAYPAL_CLIENT_ID", "PAYPAL_ENV", "PAYPAL_SECRET",
  "PAYPAL_WEBHOOK_ID", "PUBLIC_BASE_URL", "R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_BUCKET",
  "R2_SECRET_ACCESS_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET", "RESEND_API_KEY", "SENTRY_DSN", "SKIPWAIT_ADMIN_EMAIL",
  "INDIA_GST_REGISTERED", "USD_RECURRING_CONFIRMED", "HUMAN_REVIEWERS_STAFFED",
  "EMPLOYER_SPONSORSHIP_ENABLED",
  "FREE_CREDITS_REQUIRE_CARD_VALIDATION",
  "PROMO_GRANTS_ENABLED", "ASK_LEVEL_COST", "PLAN_FAMILY_V2", "TRUST_CLOUDFLARE_CONNECTING_IP",
  "VITE_APP_ID", "VITE_APP_TITLE", "WORKOS_API_KEY", "WORKOS_CLIENT_ID",
  "WORKOS_COOKIE_PASSWORD", "WORKOS_POST_SIGNIN_PATH", "WORKOS_REDIRECT_URI",
  "WORKOS_WEBHOOK_SECRET",
  "ZEPTOMAIL_API_KEY", "ZEPTOMAIL_FROM_EMAIL", "ZEPTOMAIL_FROM_NAME",
  "SKIPPIE_AGENT_ENABLED", "REVIEWER_LOGIN_ENABLED", "SKIPPIE_ADMIN_ENABLED", "SKIPPIE_SEEKER_ENABLED", "SKIPPIE_SEEKER_USER_IDS", "SENTRY_READ_TOKEN", "REVIEWER_ALLOW_ADMIN", "REVIEWER_SEEKER_PASSWORD_HASH", "REVIEWER_REFERRER_PASSWORD_HASH", "REVIEWER_EMPLOYER_PASSWORD_HASH", "REVIEWER_ADMIN_PASSWORD_HASH",
  "WORK_EMAIL_HMAC_KEY",
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

import { fetchContainerReplayingIdempotent, fetchContainerWithStoppedRecovery } from "./containerRecovery";
import { buildJobsTickRequest, isInternalApiPath, withoutJobsTickHeader } from "../shared/jobsTick";
import { withEdgeClientIp } from "../shared/clientIp";

type WorkerEnv = Record<string, unknown> & { SkipwaitApi: DurableObjectNamespace; API_RELEASE?: string };

function releaseOf(env: WorkerEnv): string {
  return typeof env.API_RELEASE === "string" && /^[a-f0-9]{40}$/.test(env.API_RELEASE) ? env.API_RELEASE.slice(0, 12) : "legacy";
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    // The API Worker is reachable only on the canonical zone route. Never trust
    // forwarded host headers: callers can supply them, while request.url is set
    // by Cloudflare from the matched route.
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.hostname !== "skipwait.me" || !(url.pathname.startsWith("/api/") || url.pathname === "/sitemap.xml")) {
      return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    // Internal routes (the scheduled-jobs tick) are reachable only from
    // scheduled() below, never through the public route.
    if (isInternalApiPath(url.pathname)) {
      return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    // Single-instance API: all requests to one container for session affinity.
    const release = releaseOf(env);
    const container = getContainer(env.SkipwaitApi, `skipwaitmanus-api-${release}`);
    // A public request can never present the cron's tick token to the container.
    // Client-supplied X-Forwarded-For is never trusted: the container sees one
    // forwarding header, set here from Cloudflare's CF-Connecting-IP.
    return fetchContainerWithStoppedRecovery(container, withEdgeClientIp(withoutJobsTickHeader(request)));
  },

  // Cron trigger (wrangler.jsonc triggers.crons): POST the scheduled-jobs tick
  // to the same container, signed with HMAC(JWT_SECRET, minute) per
  // shared/jobsTick.ts. The container runs each due job once per window, so a
  // replay after a stopped-instance start is safe. A non-2xx answer throws so
  // the cron invocation is marked failed in Workers observability.
  async scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    const secret = typeof env.JWT_SECRET === "string" ? env.JWT_SECRET : "";
    if (!secret) throw new Error("Scheduled jobs tick skipped: JWT_SECRET is not set on the Worker");
    const container = getContainer(env.SkipwaitApi, `skipwaitmanus-api-${releaseOf(env)}`);
    const response = await fetchContainerReplayingIdempotent(container, () => buildJobsTickRequest(secret, Date.now()));
    const body = await response.text();
    if (!response.ok) throw new Error(`Scheduled jobs tick (${controller.cron}) failed with HTTP ${response.status}`);
    console.log(`[jobs] tick ${controller.cron} ${body.slice(0, 1000)}`);
  },
};

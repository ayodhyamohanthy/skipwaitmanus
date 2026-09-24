/**
 * Live provider credentials must not be reachable from an ordinary test run.
 *
 * `vitest.setup.ts` loads `.env.local` and `.env` into every test process, so on
 * a machine configured for production the suite inherits real keys. Providers
 * here read their key at call time rather than at boot, which means a test that
 * forgets to stub one send path can email a real user, charge a real invoice,
 * upload a real resume, or post a member's data to an AI vendor -- and the
 * individual `it.runIf(RUN_EXTERNAL_CREDENTIAL_TESTS)` files only protect
 * themselves. Removing the keys once, at the edge of the test process, makes
 * every current and future test file unable to reach a live provider by accident.
 *
 * The database connection string is deliberately absent from the list. Specs that
 * need a real one own their opt-in and their own check on the target
 * (`WALLET_MYSQL_ACCEPTANCE` plus `WALLET_MYSQL_URL`), and `server/db.ts`
 * switches to its in-memory driver when the variable is missing, so clearing it
 * here would take that decision away from the suites built to make it.
 */
export const LIVE_OUTBOUND_CREDENTIAL_ENV_KEYS = [
  "ZEPTOMAIL_API_KEY",
  "RESEND_API_KEY",
  "WORKOS_API_KEY",
  "CHARGEBEE_API_KEY",
  "CHARGEBEE_LIVE_API_KEY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "AI_PROVIDER_API_KEY",
  "BUILT_IN_FORGE_API_KEY",
  "SENTRY_DSN",
] as const;

/**
 * The operator-facing opt-in already documented in `.env.example` and the
 * README. Compared exactly as the gated credential tests compare it, so there
 * is one meaning for the flag rather than two.
 */
export const LIVE_CREDENTIAL_OPT_IN_ENV_KEY = "RUN_EXTERNAL_CREDENTIAL_TESTS";

type MutableEnv = Record<string, string | undefined>;

/**
 * Delete every live outbound credential from `env`, returning the keys that
 * actually held a value so a caller can report what it changed. A key set to an
 * empty string is already inert and is left as it is.
 */
export function isolateLiveOutboundCredentials(env: MutableEnv = process.env): string[] {
  if (env[LIVE_CREDENTIAL_OPT_IN_ENV_KEY] === "true") return [];
  const removed: string[] = [];
  for (const key of LIVE_OUTBOUND_CREDENTIAL_ENV_KEYS) {
    if (!env[key]) continue;
    delete env[key];
    removed.push(key);
  }
  return removed;
}

/**
 * QA-demo-test-billing (D-393): the reviewer demo seeker may check out against
 * the Chargebee TEST site from skipwait.me while sales stay off for everyone
 * else. The runtime is chosen by the signed-in canonical account, never by a
 * request host, header, query or body, so a spoofed request cannot reach the
 * TEST site and a real account can never be charged there.
 *
 * Fail closed: the switch on for the demo account with TEST keys missing throws
 * instead of falling back to the live site.
 */
import { resolveChargebeeRuntime, type ChargebeeEnvironment, type ChargebeeRuntime } from "./chargebeeEnvironment";

/** The one account allowed to pay with test cards (server/_core/reviewerLogin.ts). */
export const DEMO_TEST_BILLING_EMAIL = "seeker@reviewer.skipwait.me";
/** Prefix that marks a ledger reference as TEST-site money (D-393 (4)). */
export const DEMO_TEST_MARKER = "demo-test";

export function demoTestBillingEnabled(env: ChargebeeEnvironment = process.env): boolean {
  return (env.DEMO_TEST_BILLING_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** The canonical account's own email, trimmed and lowercased; never an alias. */
export function canonicalEmailOf(account: { email?: string | null } | null | undefined): string {
  return (account?.email ?? "").trim().toLowerCase();
}

/** True only for the reviewer demo seeker while the switch is on. */
export function isDemoTestBillingAccount(account: { email?: string | null } | null | undefined, env: ChargebeeEnvironment = process.env): boolean {
  return demoTestBillingEnabled(env) && canonicalEmailOf(account) === DEMO_TEST_BILLING_EMAIL;
}

/**
 * The Chargebee runtime for this account: the TEST site only for the demo
 * seeker with the switch on, today's process runtime for everyone else.
 */
export function resolveBillingRuntimeForAccount(account: { email?: string | null } | null | undefined, env: ChargebeeEnvironment = process.env): ChargebeeRuntime {
  if (!isDemoTestBillingAccount(account, env)) return resolveChargebeeRuntime(undefined, env);
  const site = env.CHARGEBEE_SITE;
  const apiKey = env.CHARGEBEE_API_KEY;
  if (!site || !apiKey) throw new Error("Chargebee TEST API key/site is not configured");
  return { environment: "test", site, apiKey };
}

/** The TEST webhook secret; undefined when it is not configured (the route then refuses). */
export function resolveDemoTestWebhookSecret(env: ChargebeeEnvironment = process.env): string | undefined {
  return env.CHARGEBEE_WEBHOOK_SECRET;
}

/** Marks a ledger reference as TEST-site money, e.g. `demo-test:payment-credit-123`. */
export function demoTestReference(reference: string): string {
  return `${DEMO_TEST_MARKER}:${reference}`;
}

export function isDemoTestReference(reference: string | null | undefined): boolean {
  return (reference ?? "").startsWith(`${DEMO_TEST_MARKER}:`);
}

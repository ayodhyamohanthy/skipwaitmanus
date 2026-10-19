/**
 * The few billing switches the owner flips by configuration, never by a code
 * change. Each reads its environment variable on every call so a container
 * restart is the whole rollout, and each defaults to the safe, unregistered
 * position (docs/DECISIONS.md D-007).
 *
 * These are display/sales gates only: a charge, a refund and a credit still
 * come exclusively from a provider-confirmed webhook.
 */
export type BillingEnv = Record<string, string | undefined>;

function flag(env: BillingEnv, key: string): boolean {
  return (env[key] ?? "").trim().toLowerCase() === "true";
}

/**
 * SkipWait is an Indian sole proprietorship with Udyam (MSME) registration and
 * is not GST-registered, so no GST is charged and INR prices say only "India
 * price" (D-007). Set INDIA_GST_REGISTERED=true once a GSTIN exists; that also
 * requires turning on Chargebee tax mode and GST invoices in the same change.
 */
export function indiaGstRegistered(env: BillingEnv = process.env): boolean {
  return flag(env, "INDIA_GST_REGISTERED");
}

/** USD passes stay one-time until PayPal reference transactions or a card route is confirmed. */
export function usdRecurringConfirmed(env: BillingEnv = process.env): boolean {
  return flag(env, "USD_RECURRING_CONFIRMED");
}

/** Human written reviews and live sessions are sold only once reviewers are staffed (owner action, D-015/founder supply). */
export function humanReviewersStaffed(env: BillingEnv = process.env): boolean {
  return flag(env, "HUMAN_REVIEWERS_STAFFED");
}

/**
 * Paid employer placement (the sponsor route) is a labeled "Featured listing"
 * that never outranks employee posts (D-040). Unlike the switches above, this
 * one defaults to **on**: the surface already delivers what it sells, so the
 * switch exists only so the owner can pause paid placement without a code
 * change. Set EMPLOYER_SPONSORSHIP_ENABLED=false to pause it; the sponsor route
 * then answers 503 and charges nothing.
 */
export function employerSponsorshipEnabled(env: BillingEnv = process.env): boolean {
  return (env.EMPLOYER_SPONSORSHIP_ENABLED ?? "").trim().toLowerCase() !== "false";
}

/**
 * Free monthly credits unlock only after the seeker validates a card (D-079,
 * owner Oct 19 2026). Default off: while unset, today's grants are untouched.
 * The check itself is owned by the provider (Chargebee card verification);
 * SkipWait stores only the outcome. No real money in tests; production
 * enablement is an owner decision after Chargebee-test-site QA.
 */
export function freeCreditsRequireCardValidation(env: BillingEnv = process.env): boolean {
  return flag(env, "FREE_CREDITS_REQUIRE_CARD_VALIDATION");
}

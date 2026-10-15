import { z } from "zod";

/**
 * A referrer's personal link (D-017): /fast/:code or /refer/:company/:alias.
 * The ask carries it to POST /api/company-referrals as fastTrackCode, or as
 * fastTrackCompanySlug + fastTrackAlias, so the ask goes to that one referrer.
 *
 * This schema only makes the values safe to carry through URLs and browser
 * storage (trimmed, bounded, [A-Za-z0-9-]; slug and alias lowercased the way
 * the vanity lookup reads them). The server decides whether the format is
 * valid and the link is still active, and answers with the errors below, so a
 * link that cannot be used is never dropped silently on the way.
 */
export const referrerLinkPartSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);

export const referrerLinkSchema = z.union([
  z.strictObject({ fastTrackCode: referrerLinkPartSchema }),
  z.strictObject({ fastTrackCompanySlug: referrerLinkPartSchema.toLowerCase(), fastTrackAlias: referrerLinkPartSchema.toLowerCase() }),
]);

export type ReferrerLink = z.infer<typeof referrerLinkSchema>;

/** Query parameter names the entry pages use (/start, /ask, and /request before its redirect). */
export const REFERRER_LINK_PARAMS = { code: "fast", companySlug: "referCompany", alias: "referAlias" } as const;

// POST /api/company-referrals errors for a personal link that cannot be used.
export const REFERRER_LINK_INACTIVE_ERROR = "This private referral link is no longer active";
export const REFERRER_LINK_INVALID_ERROR = "This private referral link is invalid";
export const REFERRER_ALIAS_INVALID_ERROR = "This private referral alias is invalid";

// The job link is for a different company than the referrer's personal link.
export const REFERRER_LINK_OTHER_COMPANY_ERROR = "Use a job link for the same company as this private referral link";

/** Why the server refused a personal link (analytics: company_referral.referrer_link_refused). */
export type ReferrerLinkRefusalReason = "inactive" | "invalid" | "alias_invalid" | "other_company";

const REFUSAL_REASONS: ReadonlyMap<string, ReferrerLinkRefusalReason> = new Map([
  [REFERRER_LINK_INACTIVE_ERROR, "inactive"],
  [REFERRER_LINK_INVALID_ERROR, "invalid"],
  [REFERRER_ALIAS_INVALID_ERROR, "alias_invalid"],
  [REFERRER_LINK_OTHER_COMPANY_ERROR, "other_company"],
]);

/** The refusal reason for one of the errors above, or null for any other error. */
export function referrerLinkRefusalReason(message: string): ReferrerLinkRefusalReason | null {
  return REFUSAL_REASONS.get(message) ?? null;
}

/** True when the server refused the ask only because the personal link cannot be used. */
export function isReferrerLinkUnusableError(message: string): boolean {
  const reason = referrerLinkRefusalReason(message);
  return reason !== null && reason !== "other_company";
}

/**
 * True when the ask was refused only because of the personal link: it cannot be
 * used, or the job is at another company. Nothing was created or charged, so
 * /ask may offer to send the same ask to the job's company instead, as the
 * seeker's explicit choice and never automatically.
 */
export function isReferrerLinkRefusal(message: string): boolean {
  return referrerLinkRefusalReason(message) !== null;
}

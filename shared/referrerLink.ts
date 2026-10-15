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
const linkPart = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);

export const referrerLinkSchema = z.union([
  z.strictObject({ fastTrackCode: linkPart }),
  z.strictObject({ fastTrackCompanySlug: linkPart.toLowerCase(), fastTrackAlias: linkPart.toLowerCase() }),
]);

export type ReferrerLink = z.infer<typeof referrerLinkSchema>;

/** Query parameter names the entry pages use (/start, /ask, and /request before its redirect). */
export const REFERRER_LINK_PARAMS = { code: "fast", companySlug: "referCompany", alias: "referAlias" } as const;

// POST /api/company-referrals errors for a personal link that cannot be used.
export const REFERRER_LINK_INACTIVE_ERROR = "This private referral link is no longer active";
export const REFERRER_LINK_INVALID_ERROR = "This private referral link is invalid";
export const REFERRER_ALIAS_INVALID_ERROR = "This private referral alias is invalid";

const UNUSABLE_LINK_ERRORS: ReadonlySet<string> = new Set([REFERRER_LINK_INACTIVE_ERROR, REFERRER_LINK_INVALID_ERROR, REFERRER_ALIAS_INVALID_ERROR]);

/** True when the server refused the ask only because the personal link cannot be used. */
export function isReferrerLinkUnusableError(message: string): boolean {
  return UNUSABLE_LINK_ERRORS.has(message);
}

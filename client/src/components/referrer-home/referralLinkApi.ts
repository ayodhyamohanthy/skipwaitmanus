// D-089.ui (packet docs/plans/D-089-request-inbox.md §4.3-§4.5, §4.8): the signed-in referrer's own
// referral link. Every call goes through referrerData's shared fetch helpers, so a D-057
// work_email_code_required refusal re-checks the referrer-access verdict exactly as every other
// referrer call does, and every answer is parsed at the edge with the D-089.server contract in
// shared/requestInboxLink.ts. No UI here (goalPagesBoundary audits it as behavior-only).
import { z } from "zod";
import { WORK_EMAIL_CODE_REQUIRED } from "@shared/referrerStepUp";
import {
  GENERATED_SCREEN_NAME_PREFIX,
  SCREEN_NAME_REFUSALS,
  isChosenScreenName,
  isSafeFastTrackAlias,
  normalizeScreenName,
  publicReferralLinkSchema,
  publicScreenName,
  screenNameInputSchema,
  type ScreenNameRefusalCode,
} from "@shared/requestInboxLink";
import { ReferrerApiError, getJson, sendJson, type TokenSource } from "./referrerData";

export const REFERRAL_LINK_PATH = "/api/referrer-fast-track/me";

/** The one nullable screen-name field of the public contract (§4.6): a chosen name, or null for a generated alias. */
const screenNameField = publicReferralLinkSchema.shape.screenName;

/**
 * GET /api/referrer-fast-track/me. The route also returns the code link and bio copy, which this
 * panel does not show. `screenName` is sent only while the server's switch is on; while web and API
 * run different releases it can be missing, and the alias then decides (a `ref-` alias is no name).
 */
const ownLinkResponseSchema = z.object({
  link: z.object({
    vanityAlias: z.string().min(1),
    companyDomain: z.string().min(1),
    isActive: z.boolean(),
    vanityUrl: z.string().regex(/^https?:\/\/\S+$/),
    screenName: screenNameField.optional(),
  }),
});
const screenNameResponseSchema = z.object({ screenName: screenNameField, renamed: z.boolean() });
const pauseResponseSchema = z.object({ deactivated: z.boolean() });
const resumeResponseSchema = z.object({ resumed: z.boolean(), isActive: z.boolean() });

export type ReferralLink = { vanityUrl: string; companyDomain: string; isActive: boolean; screenName: string | null };

export async function fetchReferralLink(getToken: TokenSource): Promise<ReferralLink> {
  const { link } = await getJson(REFERRAL_LINK_PATH, getToken, ownLinkResponseSchema, "We could not load your referral link.");
  const named = link.screenName === undefined ? publicScreenName(link.vanityAlias) : link.screenName;
  return { vanityUrl: link.vanityUrl, companyDomain: link.companyDomain, isActive: link.isActive, screenName: isChosenScreenName(named) ? named : null };
}

/** §4.3's format rule, checked before the confirm so a typo never reaches the one-time choice. The real-name check stays server-side. */
export function checkScreenName(raw: string): { ok: true; screenName: string } | { ok: false; error: string } {
  const screenName = normalizeScreenName(raw);
  const valid = screenNameInputSchema.safeParse({ screenName }).success && isSafeFastTrackAlias(screenName) && !screenName.startsWith(GENERATED_SCREEN_NAME_PREFIX);
  return valid ? { ok: true, screenName } : { ok: false, error: SCREEN_NAME_REFUSALS.invalid.error };
}

/** PUT /me/screen-name (§4.3, D-398: once, from the generated alias). Resolves to the name the server stored. */
export async function chooseScreenName(getToken: TokenSource, screenName: string): Promise<string | null> {
  const body = screenNameInputSchema.parse({ screenName });
  return (await sendJson(`${REFERRAL_LINK_PATH}/screen-name`, "PUT", body, getToken, screenNameResponseSchema, "We could not save your screen name.")).screenName;
}

export async function pauseReferralLink(getToken: TokenSource): Promise<boolean> {
  return (await sendJson(`${REFERRAL_LINK_PATH}/deactivate`, "POST", {}, getToken, pauseResponseSchema, "We could not pause your link.")).deactivated;
}

/** POST /me/resume (§4.5): the same screen name and link, switched back on. */
export async function resumeReferralLink(getToken: TokenSource): Promise<boolean> {
  return (await sendJson(`${REFERRAL_LINK_PATH}/resume`, "POST", {}, getToken, resumeResponseSchema, "We could not turn your link back on.")).isActive;
}

/** True when the server refused because this session needs the in-session work-email code (D-057). */
export function isStepUpRequired(error: unknown): boolean {
  return error instanceof ReferrerApiError && error.status === 403 && error.code === WORK_EMAIL_CODE_REQUIRED;
}

const isRefusalCode = (code: string): code is ScreenNameRefusalCode => Object.values(SCREEN_NAME_REFUSALS).some(refusal => refusal.code === code);

/** The screen-name refusal a server answer carries (taken, identifying, invalid, locked), or null. */
export function screenNameRefusalOf(error: unknown): ScreenNameRefusalCode | null {
  return error instanceof ReferrerApiError && error.code !== null && isRefusalCode(error.code) ? error.code : null;
}

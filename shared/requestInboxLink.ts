import { z } from "zod";

/**
 * D-089 (3) / D-327: the employee request-inbox link with a screen name (idea 1, loop L4).
 *
 * One in-code switch, the D-193 pattern: no env key, both sides read this binding, and only the
 * release row `D-089-request-inbox` flips it. While it is false every public payload and inbox row
 * is byte-identical to today's behaviour (D-097): no `screenName`, no `askedYouDirectly`, no
 * screen-name or resume route, and the landings render exactly as `D-048-p3-links` left them.
 *
 * A leaf module (the `shared/askNoExpiry.ts` pattern): `server/db.ts`, `server/referrerScreenName.ts`
 * and the routes read one binding without an import cycle, and a test can force either state with
 * `vi.mock` instead of a test-only setter.
 */
export const REQUEST_INBOX_LINK_ENABLED = false;

/** The generated alias form (`ref-` + 10 hex). A generated alias is never shown as a screen name. */
export const GENERATED_SCREEN_NAME_PREFIX = "ref-";

/**
 * §4.3: the alias format and its reserved words, moved here from `server/db.ts` so the screen-name
 * route and the public resolvers share one rule. `server/db.ts` re-exports both names, so
 * `server/referrerFastTrackLinks.test.ts` keeps passing unchanged.
 */
export const SCREEN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
export const RESERVED_SCREEN_NAMES: ReadonlySet<string> = new Set([
  "admin", "api", "auth", "fast", "inbox", "login", "notifications", "refer", "request", "settings", "start",
]);

/** §4.3: lower case, trimmed, spaces become `-`. */
export function normalizeScreenName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

/** §4.3: the format plus the reserved list. A generated `ref-` alias passes the format. */
export function isSafeFastTrackAlias(alias: string): boolean {
  const normalized = alias.trim().toLowerCase();
  return SCREEN_NAME_PATTERN.test(normalized) && !RESERVED_SCREEN_NAMES.has(normalized);
}

/** §4.3: the request body. Strict, so an unknown field is refused rather than ignored. */
export const screenNameInputSchema = z.strictObject({
  screenName: z.string().min(1).max(64),
});
export type ScreenNameInput = z.infer<typeof screenNameInputSchema>;

const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * §4.3: refuse a name that is the person's own name or work email in disguise. Exact-match only by
 * design (§11): it stops accidents, and nothing is ever filled in from `users.name` or the email.
 */
export function isIdentifyingScreenName(
  name: string,
  identity: { fullName?: string | null; workEmail?: string | null },
): boolean {
  const candidate = normalizeScreenName(name);
  if (!candidate) return false;
  const fullName = identity.fullName?.trim() ?? "";
  if (fullName) {
    if (slugify(fullName) === candidate) return true;
    for (const token of fullName.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= 3 && token === candidate) return true;
    }
  }
  const workEmail = identity.workEmail?.trim().toLowerCase() ?? "";
  const at = workEmail.indexOf("@");
  const localPart = at > 0 ? workEmail.slice(0, at) : "";
  if (localPart) {
    if (localPart === candidate) return true;
    const joined = localPart.split(/[._-]+/).filter(Boolean).join("-");
    if (joined && joined === candidate) return true;
  }
  return false;
}

/** §4.6: the public payload while the switch is on. Strict, so nothing else can leak in. */
export const publicReferralLinkSchema = z.strictObject({
  companyDomain: z.string().min(1),
  isActive: z.literal(true),
  screenName: z.string().min(1).nullable(),
});
export type PublicReferralLink = z.infer<typeof publicReferralLinkSchema>;

/** §4.7: the inbox marker. Strict, so the flag cannot arrive with a stray field. */
export const inboxDirectFlagSchema = z.strictObject({ askedYouDirectly: z.boolean() });

/** §4.6: a generated alias is not a screen name; the landing says "a verified employee". */
export function publicScreenName(vanityAlias: string): string | null {
  const normalized = vanityAlias.trim().toLowerCase();
  return normalized.startsWith(GENERATED_SCREEN_NAME_PREFIX) ? null : normalized;
}

/** §4.3: the three refusals, in plain words. The route answers these codes and messages. */
export const SCREEN_NAME_REFUSALS = {
  identifying: {
    code: "screen_name_identifying",
    error: "Pick a name that is not your real name or email. Seekers see it before you accept.",
  },
  taken: {
    code: "screen_name_taken",
    error: "That name is already taken. Try another.",
  },
  invalid: {
    code: "screen_name_invalid",
    error: "Use 3 to 30 lowercase letters, numbers or dashes, starting and ending with a letter or number.",
  },
} as const;

export type ScreenNameRefusalCode = keyof typeof SCREEN_NAME_REFUSALS;

/** §4.9: the goal line on the seeker landing. */
export function linkLandingGoalLine(companyName: string, screenName: string | null): string {
  return screenName
    ? `Ask ${screenName}, a verified employee at ${companyName}`
    : `Ask a verified employee at ${companyName}`;
}

/**
 * §4.9: the line under the goal line. It restates the Terms line in `shared/referrerAskView.ts` in
 * substance: no seeker name or file before an accept. It replaces "their identity stays private"
 * only while the switch is on, because a chosen screen name makes that sentence untrue.
 */
export const LINK_LANDING_PRIVACY_LINE =
  "Your request goes only to them. They see your role and note, not your name or files, until they accept.";

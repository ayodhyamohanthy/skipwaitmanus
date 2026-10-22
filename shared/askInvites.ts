/**
 * D-090 BYOR (bring your own referrer): a seeker who already knows someone at the
 * company puts their waiting ask into that person's hands with one private,
 * one-time link. The link is seeker-owned, bound to one ask, and single-use — it
 * is not the reverse of a D-017 personal link (a referrer's standing link) and it
 * is not a `companyCoverageInvitations` code (which recruits a colleague to become
 * a referrer).
 *
 * Everything here is behind `BYOR_LINK_ENABLED` (server) and `VITE_BYOR_LINK`
 * (client), both off (D-097). The raw token exists only in the 201 that creates it
 * and in the URL the seeker sends; the database stores its SHA-256 and no read
 * path ever returns it again.
 */
import { z } from "zod";

export const ASK_INVITE_STATUSES = ["active", "claimed", "delivered", "revoked", "expired"] as const;
export type AskInviteStatus = (typeof ASK_INVITE_STATUSES)[number];

/**
 * Seven days. A one-time ask link should not outlive the ask's own visibility
 * clock or the 7-day review-link lifetime the product already uses.
 */
export const ASK_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A claim holds the ask for its insider for the same seven days (§4.5). */
export const ASK_INVITE_RESERVATION_MS = ASK_INVITE_TTL_MS;

/** D-090's changeable knob (D-087): five links per seeker per rolling seven days. */
export const ASK_INVITE_WEEKLY_CAP = 5;
export const ASK_INVITE_WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 random bytes, base64url, unpadded — 43 characters. */
export const ASK_INVITE_TOKEN_BYTES = 32;
export const ASK_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The nullable unique key that keeps one live link per ask (the house one-active-row pattern). */
export const askInviteActiveRequestKey = (requestId: number): string => `link:${requestId}`;

/**
 * The My asks line. Never the token, the URL, the hash or the claimer's identity —
 * only what the seeker needs to see about their own link.
 */
export const askInviteMineSchema = z.object({
  state: z.enum(ASK_INVITE_STATUSES),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type AskInviteMine = z.output<typeof askInviteMineSchema>;

/**
 * Landing states. `open` can be claimed; `claimed_by_you` is the signed-in viewer's
 * own reservation; `used` is a consumed link seen by anyone else; `closed` covers an
 * ask that was withdrawn, expired or delivered to someone else.
 */
export const ASK_INVITE_LANDING_STATES = ["open", "claimed_by_you", "used", "expired", "revoked", "closed", "unavailable"] as const;
export type AskInviteLandingState = (typeof ASK_INVITE_LANDING_STATES)[number];

/**
 * The `/r/:token` payload — a strict allow-list. Public ask facts the seeker chose,
 * plus `note` and `lockedFileCount` only for a verified employee of that company who
 * is neither the seeker nor blocked. Never a name, email, user id, attachment, plan,
 * wallet, referrer existence, the claimer's identity or a sequential ask id.
 */
export const askInviteLandingSchema = z.object({
  state: z.enum(ASK_INVITE_LANDING_STATES),
  companyName: z.string().nullable(),
  roleTitle: z.string().nullable(),
  jobFunction: z.string().nullable(),
  workMode: z.string().nullable(),
  location: z.string().nullable(),
  note: z.string().nullable(),
  lockedFileCount: z.number().int().nonnegative().nullable(),
});
export type AskInviteLanding = z.output<typeof askInviteLandingSchema>;

/** A landing read that an older client bundle cannot parse reads as unavailable, never as a crash. */
export const askInviteLandingResponseSchema = z.object({ invite: askInviteLandingSchema }).catch({ invite: { state: "unavailable", companyName: null, roleTitle: null, jobFunction: null, workMode: null, location: null, note: null, lockedFileCount: null } });

/** What a successful claim did: delivered spends the credit, held waits for one, reserved waits for capacity. */
export const ASK_INVITE_CLAIM_OUTCOMES = ["delivered", "held", "reserved"] as const;
export type AskInviteClaimOutcome = (typeof ASK_INVITE_CLAIM_OUTCOMES)[number];

/** One neutral sentence per landing state; the client renders exactly these. */
export const ASK_INVITE_STATE_COPY: Record<AskInviteLandingState, string> = {
  open: "You can take this ask.",
  claimed_by_you: "You have this ask. Finish it when you are ready.",
  used: "This link has already been used.",
  expired: "This link has expired.",
  revoked: "The person who sent this link cancelled it.",
  closed: "This ask is no longer open.",
  unavailable: "This link is not available.",
};

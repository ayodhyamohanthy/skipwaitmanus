/**
 * D-090 BYOR server core: the one-time link a seeker sends to an insider they
 * already know. Only the token's SHA-256 is ever stored, and the raw token leaves
 * the server exactly once, in the 201 that creates it.
 *
 * Behind `BYOR_LINK_ENABLED` (off, D-097): with the flag off every route answers
 * 404 before any database read.
 */
import { createHash, randomBytes } from "node:crypto";
import { ASK_INVITE_TOKEN_BYTES } from "../shared/askInvites";

export const BYOR_LINK_FLAG = "BYOR_LINK_ENABLED";
export const byorLinkEnabled = (): boolean => process.env[BYOR_LINK_FLAG] === "true";

/** 32 random bytes as unpadded base64url — 43 characters, URL-safe without escaping. */
export const newAskInviteToken = (): string => randomBytes(ASK_INVITE_TOKEN_BYTES).toString("base64url");

/** What the database keeps. The raw token is never written, logged or returned again. */
export const hashAskInviteToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** The ask is not the caller's own. Answered as 404 so an id can never be probed. */
export class AskInviteNotFoundError extends Error {
  constructor() { super("We could not find that ask."); this.name = "AskInviteNotFoundError"; }
}

/** Only a waiting ask (no referrer yet) can hold a link; a visible ask is already in someone's hands. */
export class AskInviteNotWaitingError extends Error {
  constructor() { super("This ask is already with an employee, so it cannot hold an invite link."); this.name = "AskInviteNotWaitingError"; }
}

/** One live link per ask, enforced by the unique activeRequestKey as well as this check. */
export class AskInviteLinkActiveError extends Error {
  constructor() { super("This ask already has a live link. Revoke it first."); this.name = "AskInviteLinkActiveError"; }
}

/** Five links per seeker per rolling seven days (D-090's changeable knob). */
export class AskInviteCapReachedError extends Error {
  constructor(readonly nextSlotAt: Date) { super("You have created five invite links this week. Try again later."); this.name = "AskInviteCapReachedError"; }
}

import type { Request, Response } from "express";
import { decodeJwt } from "jose";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { HOSTED_LINK_COOKIE, HOSTED_LINK_MAX_AGE_MS } from "./hostedAccountSwitch";

/**
 * The single place a WorkOS-authenticated user becomes an app session. The
 * AuthKit callback, password sign-in and the post-reset sign-in all go
 * through completeWorkosLogin, so every path gets the same canonical-person
 * resolution (provider subject first, verified email only), the same
 * suspension/review gate, and the same app_session_id cookie.
 */

export const APP_SESSION_MAX_AGE_MS = 30 * 60_000;

export function resolveWorkosOpenId(workosUserId: string): string { return `workos_${workosUserId}`.slice(0, 64); }

export type WorkosLoginUser = {
  readonly id: string;
  readonly email: string;
  readonly emailVerified?: boolean | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
};
export type WorkosLoginBlock = "IDENTITY_REVIEW_REQUIRED" | "ACCOUNT_NOT_ACTIVE";
export type WorkosLoginOutcome =
  | { readonly status: "signed_in"; readonly openId: string }
  | { readonly status: "blocked"; readonly code: WorkosLoginBlock };
export type ResolvedLoginAccount = Awaited<ReturnType<typeof db.resolveLoginIdentity>>;

export type CompleteWorkosLoginInput = {
  readonly user: WorkosLoginUser;
  readonly sealedSession?: string;
  /** The access token WorkOS returned; carries the hosted session id (sid) when the flow was hosted. */
  readonly accessToken?: string;
  /** Signs the hosted-link cookie with the caller's own crypto key (server/_core/hostedAccountSwitch.ts). */
  readonly signHostedLink?: (input: { uid: string; sid: string }) => Promise<string | null>;
  /** Runs after identity resolution and before the session is signed (e.g. revoke other sessions). */
  readonly beforeSession?: (account: ResolvedLoginAccount) => Promise<void>;
  readonly onStage?: (stage: "resolve" | "session") => void;
};

/** The hosted session id (sid) inside the access token WorkOS just returned to us; undefined if it cannot be read. */
export function hostedSessionIdFromAccessToken(accessToken: unknown): string | undefined {
  if (typeof accessToken !== "string") return undefined;
  try {
    const sid = decodeJwt(accessToken).sid;
    return typeof sid === "string" && /^session_[A-Za-z0-9]+$/.test(sid) ? sid : undefined;
  } catch { return undefined; }
}

function blockedCode(error: unknown): WorkosLoginBlock | null {
  if (!(error instanceof Error)) return null;
  return error.message === "IDENTITY_REVIEW_REQUIRED" || error.message === "ACCOUNT_NOT_ACTIVE" ? error.message : null;
}

export async function completeWorkosLogin(req: Request, res: Response, input: CompleteWorkosLoginInput): Promise<WorkosLoginOutcome> {
  const { user } = input;
  const openId = resolveWorkosOpenId(user.id);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];
  input.onStage?.("resolve");
  let account: ResolvedLoginAccount;
  try {
    account = await db.resolveLoginIdentity({ provider: "workos", subject: user.id, openId, email: user.email, emailVerified: user.emailVerified === true, name, loginMethod: "workos" });
  } catch (error) {
    const blocked = blockedCode(error);
    if (!blocked) throw error;
    return { status: "blocked", code: blocked };
  }
  input.onStage?.("session");
  await input.beforeSession?.(account);
  if (input.sealedSession) res.cookie("workos_session", input.sealedSession, { ...getSessionCookieOptions(req), maxAge: APP_SESSION_MAX_AGE_MS });
  const hostedSid = hostedSessionIdFromAccessToken(input.accessToken);
  const { sdk } = await import("./sdk");
  const token = await sdk.createSessionToken(account.openId, { name: account.name || name, ...(hostedSid ? { sid: hostedSid } : {}) });
  res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: APP_SESSION_MAX_AGE_MS });
  // A hosted (WorkOS-hosted) session is linked so the next hosted sign-in from a
  // different typed email can end it first; fail-soft, the app session stands.
  const hostedLink = hostedSid && input.signHostedLink ? await input.signHostedLink({ uid: user.id, sid: hostedSid }).catch(() => null) : null;
  if (hostedLink) res.cookie(HOSTED_LINK_COOKIE, hostedLink, { ...getSessionCookieOptions(req), path: "/api/auth/workos", maxAge: HOSTED_LINK_MAX_AGE_MS });
  return { status: "signed_in", openId: account.openId };
}

/**
 * Session revocation is stored at one-second granularity and MySQL rounds the
 * fraction, so sessionsValidAfter can land up to a second after "now". A
 * session signed before that second would be rejected by verifySession, so
 * wait (at most two seconds) until a fresh session's iat is valid.
 */
export async function waitForSessionEpoch(openId: string, sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<void> {
  const account = await db.getUserByOpenId(openId);
  const validAfter = account?.sessionsValidAfter?.getTime() ?? 0;
  const delay = validAfter - Date.now();
  if (delay > 0) await sleep(Math.min(delay + 1, 2_000));
}

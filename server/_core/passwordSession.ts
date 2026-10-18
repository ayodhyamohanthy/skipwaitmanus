import type { Request, Response } from "express";
import * as db from "../db";
import type { PasswordAuthentication } from "./passwordWorkosClient";
import { completeWorkosLogin, waitForSessionEpoch } from "./workosSession";

/**
 * The only way a WorkOS password user becomes a SkipWait session (D-049).
 *  - Refuses an unverified email: identity rule, never create or link an account on an address nobody proved.
 *  - Resolves through completeWorkosLogin, the canonical resolver every WorkOS provider uses, so a person who
 *    signed in with Google or an email code before lands on the same account through verified-email linking.
 *  - Refuses a referrer's own verified work email: referrers re-prove employment with a work-email code on
 *    every sign-in (D-030, D-049), so a password must never carry referrer access for someone who left.
 *  - On reset, signs every other session out before this browser's new one is signed.
 */
export type PasswordLoginMode = "sign_in" | "reset";
export type PasswordLoginRefusal = "account_review" | "account_inactive" | "use_work_email_code";
export type PasswordLoginOutcome =
  | { readonly status: "signed_in"; readonly userId?: number }
  | { readonly status: "refused"; readonly code: PasswordLoginRefusal };

class WorkEmailPasswordRefused extends Error {
  constructor() { super("WORK_EMAIL_PASSWORD_REFUSED"); this.name = "WorkEmailPasswordRefused"; }
}

/** True when the email is at the verified work domain (or a subdomain of it). */
export function isOwnWorkEmailDomain(email: string, workEmailDomain: string | null | undefined): boolean {
  const verified = (workEmailDomain ?? "").trim().toLowerCase();
  if (!verified) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase();
  return domain === verified || domain.endsWith(`.${verified}`);
}

export async function finishPasswordLogin(req: Request, res: Response, input: { readonly authentication: PasswordAuthentication; readonly mode: PasswordLoginMode }): Promise<PasswordLoginOutcome> {
  const { user, accessToken } = input.authentication;
  if (user.emailVerified !== true) throw new Error("PASSWORD_EMAIL_UNVERIFIED");
  let userId: number | undefined;
  try {
    const outcome = await completeWorkosLogin(req, res, {
      user,
      ...(accessToken ? { accessToken } : {}),
      beforeSession: async account => {
        userId = account.id;
        if (input.mode === "reset") {
          await db.revokeUserSessions(account.openId);
          await waitForSessionEpoch(account.openId);
        }
        const access = await db.getVerifiedWorkEmailAccess(account.id);
        if (isOwnWorkEmailDomain(user.email, access?.workEmailDomain)) throw new WorkEmailPasswordRefused();
      },
    });
    if (outcome.status === "blocked") return { status: "refused", code: outcome.code === "IDENTITY_REVIEW_REQUIRED" ? "account_review" : "account_inactive" };
    return { status: "signed_in", ...(userId === undefined ? {} : { userId }) };
  } catch (error) {
    if (error instanceof WorkEmailPasswordRefused) return { status: "refused", code: "use_work_email_code" };
    // sdk.createSessionToken refuses an account suspended or revoked between resolve and signing.
    if (error instanceof Error && error.message === "ACCOUNT_NOT_ACTIVE") return { status: "refused", code: "account_inactive" };
    throw error;
  }
}

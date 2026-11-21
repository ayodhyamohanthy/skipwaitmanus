import type { Request, Response } from "express";
import * as db from "../db";
import type { PasswordWitnessStore } from "../passwordWitness";
import type { PasswordEmailStandingLookup } from "./passwordResponses";
import type { PasswordAuthentication } from "./passwordWorkosClient";
import { completeWorkosLogin, resolveWorkosOpenId, waitForSessionEpoch, type CompleteWorkosLoginInput } from "./workosSession";

/**
 * The only way a WorkOS password user becomes a SkipWait session (D-049).
 *  - Refuses an unverified email: identity rule, never create or link an account on an address nobody proved.
 *  - Decides every refusal it can with read-only lookups first (D-078 ruling 3, S-2): a referrer's verified work
 *    email is refused before the canonical resolver writes an alias or audit row and before any session is
 *    revoked, so a refused sign-in leaves no trace. Referrers re-prove employment with a work-email code on every
 *    sign-in (D-030, D-049), so a password must never carry referrer access for someone who left.
 *  - A sign-in counts a password only after its setter proved the inbox (D-078 ruling 5, S-5): without the
 *    workos_password witness the answer is inbox_proof_required (the caller emails a link), still with no write.
 *    A reset is that proof, so it records the witness just before the session is signed.
 *  - Resolves through completeWorkosLogin, the canonical resolver every WorkOS provider uses, so a person who
 *    signed in with Google or an email code before lands on the same account through verified-email linking.
 *    The resolved account's own work domain is checked again there (defence in depth), still before revocation.
 *  - On reset, signs every other session out before this browser's new one is signed.
 */
export type PasswordLoginMode = "sign_in" | "reset";
export type PasswordLoginRefusal = "account_review" | "account_inactive" | "use_work_email_code";
export type PasswordLoginOutcome =
  | { readonly status: "signed_in"; readonly userId?: number }
  | { readonly status: "inbox_proof_required" }
  | { readonly status: "refused"; readonly code: PasswordLoginRefusal };

/** The resolver enforces this flag before identity writes, under its canonical/email locks. */
type PasswordSessionInput = CompleteWorkosLoginInput & { readonly passwordLogin: true };

/** True when the email is at the verified work domain (or a subdomain of it). */
export function isOwnWorkEmailDomain(email: string, workEmailDomain: string | null | undefined): boolean {
  const verified = (workEmailDomain ?? "").trim().toLowerCase();
  if (!verified) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase();
  return domain === verified || domain.endsWith(`.${verified}`);
}

export type PasswordLoginInput = {
  readonly authentication: PasswordAuthentication;
  readonly mode: PasswordLoginMode;
  readonly emailStanding: PasswordEmailStandingLookup;
  readonly witness: PasswordWitnessStore;
};

export async function finishPasswordLogin(req: Request, res: Response, input: PasswordLoginInput): Promise<PasswordLoginOutcome> {
  const { user, accessToken } = input.authentication;
  if (user.emailVerified !== true) throw new Error("PASSWORD_EMAIL_UNVERIFIED");
  if ((await input.emailStanding(user.email, { workosUserId: user.id })) === "referrer_work_email") return { status: "refused", code: "use_work_email_code" };
  // Read-only defence for an already-known provider account; never discover this refusal in beforeSession,
  // where the resolver may already have written a canonical person, alias and audit. The resolver's
  // passwordLogin guard repeats this against the actual canonical account while holding its write locks.
  const existing = await db.getUserByOpenId(resolveWorkosOpenId(user.id));
  if (existing) {
    const access = await db.getVerifiedWorkEmailAccess(existing.id);
    if (isOwnWorkEmailDomain(user.email, access?.workEmailDomain)) return { status: "refused", code: "use_work_email_code" };
  }
  if (input.mode === "sign_in" && !(await input.witness.has(user.id))) return { status: "inbox_proof_required" };
  let userId: number | undefined;
  try {
    const sessionInput: PasswordSessionInput = {
      user,
      passwordLogin: true,
      ...(accessToken ? { accessToken } : {}),
      beforeSession: async account => {
        userId = account.id;
        if (input.mode === "reset") {
          await db.revokeUserSessions(account.openId);
          await waitForSessionEpoch(account.openId);
          await input.witness.record({ workosUserId: user.id });
        }
      },
    };
    const outcome = await completeWorkosLogin(req, res, sessionInput);
    if (outcome.status === "blocked") return { status: "refused", code: outcome.code === "IDENTITY_REVIEW_REQUIRED" ? "account_review" : "account_inactive" };
    return { status: "signed_in", ...(userId === undefined ? {} : { userId }) };
  } catch (error) {
    if (error instanceof Error && error.message === "WORK_EMAIL_PASSWORD_REFUSED") return { status: "refused", code: "use_work_email_code" };
    // sdk.createSessionToken refuses an account suspended or revoked between resolve and signing.
    if (error instanceof Error && error.message === "ACCOUNT_NOT_ACTIVE") return { status: "refused", code: "account_inactive" };
    throw error;
  }
}

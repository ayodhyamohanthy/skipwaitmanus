import type { Request, Response } from "express";
import { requestWorkosPasswordReset } from "../passwordLinks";
import { recordPasswordActivity, sendPasswordError, sendPasswordStep, type PasswordRouteContext } from "./passwordResponses";
import { finishPasswordLogin } from "./passwordSession";
import type { PasswordAuthentication, PasswordWorkosClient } from "./passwordWorkosClient";

/** The two answers a password sign-in or sign-up can end with: "check your email" or "signed in". */
export type SignInOrigin = "sign_in" | "sign_up";
export const PASSWORD_ACTIVITY: Readonly<Record<SignInOrigin, string>> = { sign_in: "auth.password_sign_in", sign_up: "auth.password_sign_up" };

/**
 * "Check your email" (D-049, D-078 ruling 2): no six-digit code. The emailed link sets the password on
 * /reset-password, which proves the inbox and signs in there. The link is requested after the answer.
 */
export function answerCheckEmail(ctx: PasswordRouteContext, client: PasswordWorkosClient, res: Response, email: string, origin: SignInOrigin): void {
  recordPasswordActivity(PASSWORD_ACTIVITY[origin], "success", { step: "check_email" });
  sendPasswordStep(res, { ok: true, step: "check_email" });
  ctx.defer(() => requestWorkosPasswordReset(ctx, client, email, "set"));
}

/** Signs in a WorkOS user whose email WorkOS has verified, or answers why not (or emails a link, D-078 ruling 5). */
export async function respondSignedIn(ctx: PasswordRouteContext, client: PasswordWorkosClient, req: Request, res: Response, authentication: PasswordAuthentication, at: { readonly email: string; readonly redirectTo: string; readonly origin: SignInOrigin }): Promise<void> {
  const { redirectTo, origin } = at;
  const outcome = await finishPasswordLogin(req, res, { authentication, mode: "sign_in", emailStanding: ctx.emailStanding, witness: ctx.witness });
  if (outcome.status === "inbox_proof_required") return answerCheckEmail(ctx, client, res, at.email, origin);
  if (outcome.status === "refused") {
    recordPasswordActivity(PASSWORD_ACTIVITY[origin], "denied", { code: outcome.code });
    return sendPasswordError(res, outcome.code);
  }
  recordPasswordActivity(PASSWORD_ACTIVITY[origin], "success", { step: "signed_in" }, outcome.userId);
  sendPasswordStep(res, { ok: true, step: "signed_in", redirectTo });
}

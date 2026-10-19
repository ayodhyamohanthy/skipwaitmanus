import type { Request, Response } from "express";
import { PASSWORD_TICKET_RETURN_TO_MAX, sealPasswordTicket, setPasswordTicketCookie, type PasswordTicketInput } from "./passwordPending";
import { recordPasswordActivity, sendPasswordError, sendPasswordStep, type PasswordRouteContext } from "./passwordResponses";
import { finishPasswordLogin } from "./passwordSession";
import type { PasswordAuthentication } from "./passwordWorkosClient";

/** The two answers a password sign-in, sign-up or verification can end with: "check your email" or "signed in". */
export type SignInOrigin = "sign_in" | "sign_up";
export const PASSWORD_ACTIVITY: Readonly<Record<SignInOrigin, string>> = { sign_in: "auth.password_sign_in", sign_up: "auth.password_sign_up" };

export async function issueVerifyStep(ctx: PasswordRouteContext, req: Request, res: Response, ticket: PasswordTicketInput): Promise<void> {
  const returnTo = ticket.returnTo.length > PASSWORD_TICKET_RETURN_TO_MAX ? "/explore" : ticket.returnTo;
  const { value } = await sealPasswordTicket({ ...ticket, returnTo }, ctx.ticketSecret);
  setPasswordTicketCookie(req, res, value);
  recordPasswordActivity(PASSWORD_ACTIVITY[ticket.origin], "success", { step: "verify_email" });
  sendPasswordStep(res, { ok: true, step: "verify_email" });
}

/** Signs in a WorkOS user whose email WorkOS has verified, or answers why not. */
export async function respondSignedIn(ctx: PasswordRouteContext, req: Request, res: Response, authentication: PasswordAuthentication, redirectTo: string, origin: SignInOrigin): Promise<void> {
  const outcome = await finishPasswordLogin(req, res, { authentication, mode: "sign_in", emailStanding: ctx.emailStanding });
  if (outcome.status === "refused") {
    recordPasswordActivity(PASSWORD_ACTIVITY[origin], "denied", { code: outcome.code });
    return sendPasswordError(res, outcome.code);
  }
  recordPasswordActivity(PASSWORD_ACTIVITY[origin], "success", { step: "signed_in" }, outcome.userId);
  sendPasswordStep(res, { ok: true, step: "signed_in", redirectTo });
}

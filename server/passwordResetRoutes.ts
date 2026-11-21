import type { Express, Request, Response } from "express";
import { passwordForgotAcceptedSchema, passwordForgotRequestSchema, passwordPolicyError, passwordResetConfirmRequestSchema, passwordResetConfirmSuccessSchema } from "@shared/passwordAuth";
import { clearDurableKeys } from "./_core/durableRateLimit";
import { emailLockResetKeys, forgotLimits, requestIp, resetConfirmLimits } from "./_core/passwordLimits";
import {
  deferPasswordWork, failUnexpectedly, guardPasswordPost, passLimits, recordPasswordActivity, reportPasswordFailure, sendPasswordError, signedInDestination, type PasswordRouteContext,
} from "./_core/passwordResponses";
import { finishPasswordLogin } from "./_core/passwordSession";
import type { PasswordUser } from "./_core/passwordWorkosClient";
import { classifyWorkosPasswordError } from "./_core/workosPasswordErrors";
import { startPasswordReset } from "./passwordLinks";

/**
 * Seeker forgot / reset password through WorkOS (D-049). /forgot answers before any WorkOS work, so neither the
 * body nor the timing says whether an account exists; the deferred work (server/passwordLinks.ts) has WorkOS create
 * and email the reset link through its confirmed default mailer (D-350). No SkipWait sender is called.
 * Requests for referrer work emails are skipped. A confirm token is opaque: WorkOS identifies its owner only
 * after the reset succeeds. Local work-email refusal then precedes identity, witness and session mutations.
 */
function sendResetDone(req: Request, res: Response, signedIn: boolean, returnTo?: string): void {
  const redirectTo = signedIn ? signedInDestination(req, returnTo) : "/sign-in";
  res.set("Cache-Control", "no-store").status(200).json(passwordResetConfirmSuccessSchema.parse({ ok: true, signedIn, redirectTo }));
}

export function registerPasswordResetRoutes(app: Express, ctx: PasswordRouteContext): void {
  app.post("/api/auth/password/forgot", async (req, res) => {
    try {
      const body = guardPasswordPost(req, res, passwordForgotRequestSchema);
      if (!body) return;
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      if (!(await passLimits(ctx, res, forgotLimits(body.email, requestIp(req))))) return;
      res.set("Cache-Control", "no-store").status(200).json(passwordForgotAcceptedSchema.parse({ ok: true }));
      recordPasswordActivity("auth.password_forgot", "success", {});
      deferPasswordWork(ctx, res, () => startPasswordReset(ctx, client, body.email));
    } catch (error) {
      failUnexpectedly(res, "forgot", error);
    }
  });

  app.post("/api/auth/password/reset/confirm", async (req, res) => {
    try {
      const body = guardPasswordPost(req, res, passwordResetConfirmRequestSchema);
      if (!body) return;
      const policy = passwordPolicyError(body.password, body.confirm);
      if (policy) return sendPasswordError(res, "weak_password", { message: `${policy}.` });
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      if (!(await passLimits(ctx, res, resetConfirmLimits(requestIp(req))))) return;
      let user: PasswordUser;
      try {
        ({ user } = await client.resetPassword({ token: body.token, newPassword: body.password }));
      } catch (error) {
        const failure = classifyWorkosPasswordError(error, "reset");
        recordPasswordActivity("auth.password_reset", "failure", { code: failure.kind });
        if (failure.kind === "expired") return sendPasswordError(res, "expired");
        if (failure.kind === "weak_password") return sendPasswordError(res, "weak_password");
        if (failure.kind === "rate_limited") return sendPasswordError(res, "rate_limited", { retryAfterSeconds: failure.retryAfterSeconds });
        reportPasswordFailure("reset", failure.kind, error);
        return sendPasswordError(res, "temporarily_unavailable");
      }
      // The password is set. Sign this browser in only when every session rule allows it; otherwise say so plainly.
      try {
        const outcome = user.emailVerified === true ? await finishPasswordLogin(req, res, { authentication: { user }, mode: "reset", emailStanding: ctx.emailStanding, witness: ctx.witness }) : undefined;
        // WorkOS already consumed the opaque token. A refused work email gets no local identity/witness/session
        // mutation; do not claim the provider password or provider sessions were unchanged.
        if (outcome?.status === "refused" && outcome.code === "use_work_email_code") {
          recordPasswordActivity("auth.password_reset", "denied", { code: outcome.code });
          return sendPasswordError(res, "use_work_email_code");
        }
        const signedIn = outcome?.status === "signed_in";
        if (signedIn) {
          // S-8: only an accepted reset clears email locks. A refusal never deletes local security state.
          try {
            const cleared = await clearDurableKeys(emailLockResetKeys(user.email.trim().toLowerCase()), { store: ctx.store, now: ctx.now() });
            if (cleared !== "cleared") reportPasswordFailure("reset", "lock_not_cleared", undefined);
          } catch (error) {
            reportPasswordFailure("reset", "lock_not_cleared", error);
          }
        }
        recordPasswordActivity("auth.password_reset", "success", { signedIn: signedIn ? "yes" : "no" }, outcome?.status === "signed_in" ? outcome.userId : undefined);
        return sendResetDone(req, res, signedIn, body.returnTo);
      } catch (error) {
        reportPasswordFailure("reset", "session_not_issued", error);
        return sendResetDone(req, res, false);
      }
    } catch (error) {
      failUnexpectedly(res, "reset", error);
    }
  });
}

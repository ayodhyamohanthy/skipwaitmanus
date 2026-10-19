import type { Express, Response } from "express";
import { passwordForgotRequestSchema, passwordPolicyError, passwordResetConfirmRequestSchema } from "@shared/passwordAuth";
import { forgotLimits, requestIp, resetConfirmLimits } from "./_core/passwordLimits";
import {
  failUnexpectedly, guardPasswordPost, passLimits, recordPasswordActivity, reportPasswordFailure, sendPasswordError, type PasswordRouteContext,
} from "./_core/passwordResponses";
import { finishPasswordLogin } from "./_core/passwordSession";
import type { PasswordUser } from "./_core/passwordWorkosClient";
import { classifyWorkosPasswordError } from "./_core/workosPasswordErrors";
import { startPasswordReset } from "./passwordLinks";

/**
 * Seeker forgot / reset password through WorkOS (D-049). /forgot answers before any WorkOS work, so neither the
 * body nor the timing says whether an account exists; the deferred work (server/passwordLinks.ts) has WorkOS create
 * the reset token and emails a link to skipwait.me/reset-password through SkipWait's own sender (D-078 ruling 6),
 * never to a referrer's work email (referrers never get a password). Reset sets the password in WorkOS (which also
 * verifies the email and ends WorkOS sessions), then signs this browser in and every other session out.
 */
function sendResetDone(res: Response, signedIn: boolean): void {
  res.set("Cache-Control", "no-store").status(200).json({ ok: true, signedIn, redirectTo: signedIn ? "/explore" : "/sign-in" });
}

export function registerPasswordResetRoutes(app: Express, ctx: PasswordRouteContext): void {
  app.post("/api/auth/password/forgot", async (req, res) => {
    try {
      const body = guardPasswordPost(req, res, passwordForgotRequestSchema);
      if (!body) return;
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      if (!(await passLimits(ctx, res, forgotLimits(body.email, requestIp(req))))) return;
      res.set("Cache-Control", "no-store").status(200).json({ ok: true });
      recordPasswordActivity("auth.password_forgot", "success", {});
      ctx.defer(() => startPasswordReset(ctx, client, body.email));
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
        // A referrer's work email gets the work-email-code answer: no session, nobody signed out (D-078 ruling 3).
        if (outcome?.status === "refused" && outcome.code === "use_work_email_code") {
          recordPasswordActivity("auth.password_reset", "denied", { code: outcome.code });
          return sendPasswordError(res, "use_work_email_code");
        }
        const signedIn = outcome?.status === "signed_in";
        recordPasswordActivity("auth.password_reset", "success", { signedIn: signedIn ? "yes" : "no" }, outcome?.status === "signed_in" ? outcome.userId : undefined);
        return sendResetDone(res, signedIn);
      } catch (error) {
        reportPasswordFailure("reset", "session_not_issued", error);
        return sendResetDone(res, false);
      }
    } catch (error) {
      failUnexpectedly(res, "reset", error);
    }
  });
}

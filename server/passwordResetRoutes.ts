import type { Express, Response } from "express";
import { passwordForgotRequestSchema, passwordPolicyError, passwordResetConfirmRequestSchema } from "@shared/passwordAuth";
import { configuredPublicOrigin } from "./_core/authPostGuard";
import { forgotLimits, requestIp, resetConfirmLimits } from "./_core/passwordLimits";
import {
  failUnexpectedly, guardPasswordPost, passLimits, recordPasswordActivity, reportPasswordFailure, sendPasswordError, type PasswordRouteContext,
} from "./_core/passwordResponses";
import { finishPasswordLogin } from "./_core/passwordSession";
import type { PasswordUser, PasswordWorkosClient } from "./_core/passwordWorkosClient";
import { classifyWorkosPasswordError } from "./_core/workosPasswordErrors";
import { captureServerError } from "./sentry";

/**
 * Seeker forgot / reset password through WorkOS (D-049). WorkOS creates the reset token and sends the email
 * (free for SkipWait; nothing goes through our paid ZeptoMail sender), linking to the dashboard's "Password
 * reset URL", which must be https://skipwait.me/reset-password; a mismatch is reported to Sentry. SkipWait
 * never sees or returns the token, and /forgot answers before any WorkOS work, so neither the body nor the
 * timing says whether an account exists. Referrers never get a password (their work email is skipped).
 * Reset sets the password in WorkOS (which also verifies the email and ends WorkOS sessions), then signs this
 * browser in and every other SkipWait session out.
 */
function resetUrlPointsHome(url: string): boolean {
  const origin = configuredPublicOrigin();
  if (!origin) return true;
  try {
    const parsed = new URL(url);
    return parsed.origin === origin && parsed.pathname === "/reset-password";
  } catch { return false; }
}

/**
 * The one place a password reset is requested, so every path (forgot, sign-up, sign-in) skips a referrer's work
 * email before any WorkOS call (D-078 ruling 3, S-3). Checks where the link points. Never logs the token or email.
 */
export async function requestWorkosPasswordReset(ctx: Pick<PasswordRouteContext, "emailStanding">, client: PasswordWorkosClient, email: string): Promise<void> {
  try {
    if ((await ctx.emailStanding(email)) === "referrer_work_email") return;
    const reset = await client.createPasswordReset({ email });
    if (!resetUrlPointsHome(reset.passwordResetUrl)) captureServerError(new Error("WorkOS password reset URL is not skipwait.me/reset-password"), { operation: "forgot", kind: "reset_url_misconfigured" });
  } catch (error) {
    const failure = classifyWorkosPasswordError(error, "forgot");
    if (failure.kind === "rate_limited") console.warn("[password-auth]", { operation: "forgot", kind: "rate_limited" });
    else reportPasswordFailure("forgot", failure.kind, error);
  }
}

/** The WorkOS side of /forgot, run after the response. */
async function startWorkosReset(ctx: PasswordRouteContext, client: PasswordWorkosClient, email: string): Promise<void> {
  try {
    const standing = await ctx.emailStanding(email);
    if (standing === "referrer_work_email") return;
    const found = await client.listUsers({ email, limit: 1 });
    if (!found.data.some(user => user.email.trim().toLowerCase() === email)) {
      // A seeker who only ever signed in with an emailed code has no WorkOS user yet: create one without a
      // password (WorkOS marks the email verified when the reset succeeds), then send the reset.
      if (standing !== "verified_seeker") return;
      await client.createUser({ email });
    }
    await requestWorkosPasswordReset(ctx, client, email);
  } catch (error) {
    reportPasswordFailure("forgot", classifyWorkosPasswordError(error, "forgot").kind, error);
  }
}

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
      ctx.defer(() => startWorkosReset(ctx, client, body.email));
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
        const outcome = user.emailVerified === true ? await finishPasswordLogin(req, res, { authentication: { user }, mode: "reset", emailStanding: ctx.emailStanding }) : undefined;
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

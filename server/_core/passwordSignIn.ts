import type { Express, Request, Response } from "express";
import { passwordPolicyError, passwordSignInRequestSchema, passwordSignUpRequestSchema } from "@shared/passwordAuth";
import { recordDurableFailures } from "./durableRateLimit";
import { failureCounters, passwordLockKeys, requestIp, signInLimits, signUpLimits } from "./passwordLimits";
import {
  clientContext, failUnexpectedly, guardPasswordPost, noteWorkosSuccess, noteWorkosUnauthorized, passLimits, passLock, recordPasswordActivity,
  reportPasswordFailure, sendPasswordError, signedInDestination, type PasswordRouteContext,
} from "./passwordResponses";
import { issueVerifyStep, PASSWORD_ACTIVITY, respondSignedIn, type SignInOrigin } from "./passwordSteps";
import type { PasswordAuthentication, PasswordWorkosClient } from "./passwordWorkosClient";
import { classifyWorkosPasswordError, type WorkosPasswordFailure } from "./workosPasswordErrors";

/**
 * Seeker email + password sign-in and sign-up on skipwait.me (D-049), server-side through WorkOS User
 * Management; never the hosted WorkOS page, never for referrers (no intent is accepted, and a referrer's own
 * work email is refused at session time). An unverified email never gets a session: WorkOS's verification
 * code finishes it (server/_core/passwordVerification.ts). Sign-up never says whether an email already has an
 * account: the existing-account answer looks exactly like the new-account one, and the real owner gets a
 * WorkOS password-reset email instead.
 */
type Attempt = { readonly type: "authenticated"; readonly authentication: PasswordAuthentication } | { readonly type: "failed"; readonly failure: WorkosPasswordFailure; readonly error: unknown };
type AttemptContext = { readonly email: string; readonly ip: string; readonly redirectTo: string; readonly origin: SignInOrigin };

async function authenticate(client: PasswordWorkosClient, req: Request, email: string, password: string): Promise<Attempt> {
  try {
    const authentication = await client.authenticateWithPassword({ email, password, ...clientContext(req) });
    noteWorkosSuccess();
    return { type: "authenticated", authentication };
  } catch (error) {
    return { type: "failed", failure: classifyWorkosPasswordError(error, "sign_in"), error };
  }
}

async function continueAuthenticated(ctx: PasswordRouteContext, client: PasswordWorkosClient, req: Request, res: Response, authentication: PasswordAuthentication, at: AttemptContext): Promise<void> {
  if (authentication.user.emailVerified === true) return respondSignedIn(req, res, authentication, at.redirectTo, at.origin);
  // WorkOS let an unverified email through (verification not required in its dashboard): we still require it.
  try {
    await client.sendVerificationEmail({ userId: authentication.user.id });
  } catch (error) {
    const failure = classifyWorkosPasswordError(error, "resend");
    // A rate-limited send means a code went out moments ago; the person can use it.
    if (failure.kind !== "rate_limited") { reportPasswordFailure(at.origin, `verification_send_${failure.kind}`, error); return sendPasswordError(res, "temporarily_unavailable"); }
  }
  return issueVerifyStep(ctx, req, res, { kind: "user", userId: authentication.user.id, email: at.email, returnTo: at.redirectTo, origin: at.origin });
}

async function answerFailure(ctx: PasswordRouteContext, req: Request, res: Response, attempt: Extract<Attempt, { type: "failed" }>, at: AttemptContext): Promise<void> {
  const { failure, error } = attempt;
  switch (failure.kind) {
    case "verify_email": {
      if (failure.pendingAuthenticationToken) return issueVerifyStep(ctx, req, res, { kind: "pending", token: failure.pendingAuthenticationToken, ...(failure.userId ? { userId: failure.userId } : {}), ...(failure.emailVerificationId ? { emailVerificationId: failure.emailVerificationId } : {}), email: at.email, returnTo: at.redirectTo, origin: at.origin });
      if (failure.userId) return issueVerifyStep(ctx, req, res, { kind: "user", userId: failure.userId, email: at.email, returnTo: at.redirectTo, origin: at.origin });
      reportPasswordFailure(at.origin, "verification_without_token", error);
      return sendPasswordError(res, "temporarily_unavailable");
    }
    case "invalid_credentials":
      await recordFailure(ctx, at.email, at.ip);
      noteWorkosUnauthorized(error);
      recordPasswordActivity(PASSWORD_ACTIVITY[at.origin], "failure", { code: "invalid_credentials" });
      return sendPasswordError(res, "invalid_credentials");
    case "rate_limited":
      return sendPasswordError(res, "rate_limited", { retryAfterSeconds: failure.retryAfterSeconds });
    case "use_another_method":
      return sendPasswordError(res, "use_another_method");
    case "password_sign_in_unavailable":
      reportPasswordFailure(at.origin, failure.kind, error);
      return sendPasswordError(res, "password_sign_in_unavailable");
    default:
      reportPasswordFailure(at.origin, failure.kind, error);
      return sendPasswordError(res, "temporarily_unavailable");
  }
}

async function recordFailure(ctx: PasswordRouteContext, email: string, ip: string): Promise<void> {
  try {
    await recordDurableFailures(failureCounters(email, ip), { store: ctx.store, now: ctx.now() });
  } catch (error) {
    reportPasswordFailure("failure_counter", "not_recorded", error);
  }
}

export function registerPasswordSignInRoutes(app: Express, ctx: PasswordRouteContext, requestReset: (client: PasswordWorkosClient, email: string) => Promise<void>): void {
  app.post("/api/auth/password/sign-in", async (req, res) => {
    try {
      const body = guardPasswordPost(req, res, passwordSignInRequestSchema);
      if (!body) return;
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      const ip = requestIp(req);
      if (!(await passLimits(ctx, res, signInLimits(body.email, ip)))) return;
      if (!(await passLock(ctx, res, passwordLockKeys(body.email, ip)))) return;
      const at: AttemptContext = { email: body.email, ip, redirectTo: signedInDestination(req, body.returnTo), origin: "sign_in" };
      const attempt = await authenticate(client, req, body.email, body.password);
      if (attempt.type === "authenticated") return await continueAuthenticated(ctx, client, req, res, attempt.authentication, at);
      return await answerFailure(ctx, req, res, attempt, at);
    } catch (error) {
      return failUnexpectedly(res, "sign_in", error);
    }
  });

  app.post("/api/auth/password/sign-up", async (req, res) => {
    try {
      const body = guardPasswordPost(req, res, passwordSignUpRequestSchema);
      if (!body) return;
      const policy = passwordPolicyError(body.password, body.password);
      if (policy) return sendPasswordError(res, "weak_password", { message: `${policy}.` });
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      const ip = requestIp(req);
      if (!(await passLimits(ctx, res, signUpLimits(body.email, ip)))) return;
      if (!(await passLock(ctx, res, passwordLockKeys(body.email, ip)))) return;
      const at: AttemptContext = { email: body.email, ip, redirectTo: signedInDestination(req, body.returnTo), origin: "sign_up" };
      let existingAccount = false;
      try {
        await client.createUser({ email: body.email, password: body.password, ...clientContext(req) });
      } catch (error) {
        const failure = classifyWorkosPasswordError(error, "sign_up");
        if (failure.kind === "email_taken") existingAccount = true;
        else if (failure.kind === "weak_password") return sendPasswordError(res, "weak_password");
        else if (failure.kind === "rate_limited") return sendPasswordError(res, "rate_limited", { retryAfterSeconds: failure.retryAfterSeconds });
        else if (failure.kind === "use_another_method") return sendPasswordError(res, "use_another_method");
        else {
          reportPasswordFailure("sign_up", failure.kind, error);
          return sendPasswordError(res, failure.kind === "password_sign_in_unavailable" ? "password_sign_in_unavailable" : "temporarily_unavailable");
        }
      }
      const attempt = await authenticate(client, req, body.email, body.password);
      if (attempt.type === "authenticated") return await continueAuthenticated(ctx, client, req, res, attempt.authentication, at);
      if (existingAccount && attempt.failure.kind === "invalid_credentials") {
        // Someone else's (or a forgotten) account: answer exactly like a new account, and let the real owner reset.
        await recordFailure(ctx, body.email, ip);
        ctx.defer(() => requestReset(client, body.email));
        return await issueVerifyStep(ctx, req, res, { kind: "decoy", email: body.email, returnTo: at.redirectTo, origin: "sign_up" });
      }
      return await answerFailure(ctx, req, res, attempt, at);
    } catch (error) {
      return failUnexpectedly(res, "sign_up", error);
    }
  });

}

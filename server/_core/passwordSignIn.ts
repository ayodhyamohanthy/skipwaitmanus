import type { Express, Request, Response } from "express";
import { passwordSignInRequestSchema, passwordSignUpRequestSchema } from "@shared/passwordAuth";
import { startPasswordSetup } from "../passwordLinks";
import { recordDurableFailures } from "./durableRateLimit";
import { failureCounters, passwordLockKeys, requestIp, signInLimits, signUpLimits } from "./passwordLimits";
import {
  clientContext, failUnexpectedly, guardPasswordPost, holdAnswersUntilFloor, noteWorkosSuccess, noteWorkosUnauthorized, passLimits, passLock, recordPasswordActivity,
  reportPasswordFailure, sendPasswordError, sendPasswordStep, signedInDestination, type PasswordRouteContext,
} from "./passwordResponses";
import { answerCheckEmail, PASSWORD_ACTIVITY, respondSignedIn, type SignInOrigin } from "./passwordSteps";
import type { PasswordAuthentication, PasswordWorkosClient } from "./passwordWorkosClient";
import { classifyWorkosPasswordError, type WorkosPasswordFailure } from "./workosPasswordErrors";

/**
 * Seeker email + password sign-in and sign-up on skipwait.me (D-049, D-078), server-side through WorkOS User
 * Management; never the hosted WorkOS page, never for referrers (no intent is accepted, and a referrer's work email
 * is refused or skipped by a read-only lookup). There is no six-digit code: an address WorkOS has not verified gets
 * a link to set the password instead (server/passwordLinks.ts), which proves the inbox. Sign-up takes only the email
 * and always answers "check your email" at once; its WorkOS work runs after the answer, so neither the body nor the
 * timing says whether the address already has an account.
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

async function answerFailure(ctx: PasswordRouteContext, client: PasswordWorkosClient, res: Response, attempt: Extract<Attempt, { type: "failed" }>, at: AttemptContext): Promise<void> {
  const { failure, error } = attempt;
  switch (failure.kind) {
    case "verify_email":
      // The password was right but WorkOS has not verified the address: a link, never a code (D-078 ruling 2).
      return answerCheckEmail(ctx, client, res, at.email, at.origin);
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

export function registerPasswordSignInRoutes(app: Express, ctx: PasswordRouteContext): void {
  app.post("/api/auth/password/sign-in", async (req, res) => {
    holdAnswersUntilFloor(res, ctx.responseFloorMs);
    try {
      const body = guardPasswordPost(req, res, passwordSignInRequestSchema);
      if (!body) return;
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      const ip = requestIp(req);
      if (!(await passLimits(ctx, res, signInLimits(body.email, ip)))) return;
      if (!(await passLock(ctx, res, passwordLockKeys(body.email, ip)))) return;
      // D-081: an address at a verified referrer domain never reaches WorkOS for a password; the answer depends only on
      // the domain, so it says nothing about whether this exact address has an account.
      if ((await ctx.emailStanding(body.email)) === "referrer_work_email") {
        recordPasswordActivity(PASSWORD_ACTIVITY.sign_in, "denied", { code: "use_work_email_code" });
        return sendPasswordError(res, "use_work_email_code");
      }
      const at: AttemptContext = { email: body.email, ip, redirectTo: signedInDestination(req, body.returnTo), origin: "sign_in" };
      const attempt = await authenticate(client, req, body.email, body.password);
      if (attempt.type === "failed") return await answerFailure(ctx, client, res, attempt, at);
      // WorkOS let an unverified email through (verification not required in its dashboard): we still require it.
      if (attempt.authentication.user.emailVerified !== true) return answerCheckEmail(ctx, client, res, at.email, at.origin);
      return await respondSignedIn(ctx, client, req, res, attempt.authentication, at);
    } catch (error) {
      return failUnexpectedly(res, "sign_in", error);
    }
  });

  app.post("/api/auth/password/sign-up", async (req, res) => {
    holdAnswersUntilFloor(res, ctx.responseFloorMs);
    try {
      const body = guardPasswordPost(req, res, passwordSignUpRequestSchema);
      if (!body) return;
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      if (!(await passLimits(ctx, res, signUpLimits(body.email, requestIp(req))))) return;
      // D-078 ruling 2: the same answer at once for a new address, an existing account or a referrer's work email.
      recordPasswordActivity(PASSWORD_ACTIVITY.sign_up, "success", { step: "check_email" });
      sendPasswordStep(res, { ok: true, step: "check_email" });
      ctx.defer(() => startPasswordSetup(ctx, client, body.email));
    } catch (error) {
      return failUnexpectedly(res, "sign_up", error);
    }
  });
}

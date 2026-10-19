import { passwordLinkEmail, passwordLinkEmailText, type PasswordLinkPurpose } from "@shared/passwordEmails";
import { resetTokenSchema } from "@shared/passwordAuth";
import { configuredPublicOrigin } from "./_core/authPostGuard";
import { consumeDurableLimits } from "./_core/durableRateLimit";
import { passwordLinkEmailLimits } from "./_core/passwordLimits";
import { reportPasswordFailure, type PasswordRouteContext } from "./_core/passwordResponses";
import type { PasswordWorkosClient } from "./_core/passwordWorkosClient";
import { classifyWorkosPasswordError } from "./_core/workosPasswordErrors";
import { captureServerError } from "./sentry";

/**
 * Every emailed seeker password link (D-049, D-078 rulings 2, 3 and 6), each run after the HTTP answer:
 *  - requestWorkosPasswordReset is the one place a link is requested: it skips a referrer's work email before any
 *    WorkOS call, applies one durable send cap per address, has WorkOS create the reset token, and emails a link to
 *    SkipWait's own /reset-password through SkipWait's sender. It never uses the URL WorkOS built, so the hosted
 *    authkit.app page is never linked (D-030); a mismatched dashboard Password reset URL is still reported.
 *  - startPasswordSetup (sign-up) creates a WorkOS user without a password when none exists, then sends the link.
 *  - startPasswordReset (/forgot) resets an existing WorkOS user, or a code-only seeker who has none yet.
 * Failures are reported with no email, token or link; nothing is retried around them.
 */
type LinkContext = Pick<PasswordRouteContext, "emailStanding" | "store" | "now" | "sendEmail">;

export function passwordResetLink(origin: string, token: string): string {
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function resetUrlPointsHome(url: string, origin: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === origin && parsed.pathname === "/reset-password";
  } catch { return false; }
}

export async function requestWorkosPasswordReset(ctx: LinkContext, client: PasswordWorkosClient, email: string, purpose: PasswordLinkPurpose): Promise<void> {
  try {
    if ((await ctx.emailStanding(email)) === "referrer_work_email") return;
    const origin = configuredPublicOrigin();
    if (!origin) return reportPasswordFailure("reset_email", "origin_not_configured", undefined);
    const cap = await consumeDurableLimits(passwordLinkEmailLimits(email), { store: ctx.store, now: ctx.now() });
    if (!cap.allowed) {
      if (cap.reason === "unavailable") return reportPasswordFailure("reset_email", "limiter_unavailable", undefined);
      console.warn("[password-auth]", { operation: "reset_email", kind: "rate_limited" });
      return;
    }
    const reset = await client.createPasswordReset({ email });
    if (!resetUrlPointsHome(reset.passwordResetUrl, origin)) captureServerError(new Error("WorkOS password reset URL is not skipwait.me/reset-password"), { operation: "forgot", kind: "reset_url_misconfigured" });
    const token = resetTokenSchema.safeParse(reset.passwordResetToken);
    if (!token.success) return reportPasswordFailure("reset_email", "token_unusable", undefined);
    const message = passwordLinkEmail(purpose, passwordResetLink(origin, token.data));
    const sent = await ctx.sendEmail({ to: email, subject: message.subject, text: passwordLinkEmailText(message) });
    if (!sent.sent) reportPasswordFailure("reset_email", sent.reason, undefined);
  } catch (error) {
    const failure = classifyWorkosPasswordError(error, "forgot");
    if (failure.kind === "rate_limited") console.warn("[password-auth]", { operation: "forgot", kind: "rate_limited" });
    else reportPasswordFailure("forgot", failure.kind, error);
  }
}

async function hasWorkosUser(client: PasswordWorkosClient, email: string): Promise<boolean> {
  const found = await client.listUsers({ email, limit: 1 });
  return found.data.some(user => user.email.trim().toLowerCase() === email);
}

/** Sign-up (D-078 ruling 2): a WorkOS user without a password when none exists, then the link that sets one. */
export async function startPasswordSetup(ctx: LinkContext, client: PasswordWorkosClient, email: string): Promise<void> {
  try {
    if ((await ctx.emailStanding(email)) === "referrer_work_email") return;
    if (!(await hasWorkosUser(client, email))) {
      try {
        await client.createUser({ email });
      } catch (error) {
        const failure = classifyWorkosPasswordError(error, "sign_up");
        // Another sign-up may have created the user meanwhile: the link still goes to that one account.
        if (failure.kind !== "email_taken") return reportPasswordFailure("sign_up", failure.kind, error);
      }
    }
    await requestWorkosPasswordReset(ctx, client, email, "set");
  } catch (error) {
    reportPasswordFailure("sign_up", classifyWorkosPasswordError(error, "sign_up").kind, error);
  }
}

/** /forgot: an existing WorkOS user, or a code-only seeker who has none yet (created without a password first). */
export async function startPasswordReset(ctx: LinkContext, client: PasswordWorkosClient, email: string): Promise<void> {
  try {
    const standing = await ctx.emailStanding(email);
    if (standing === "referrer_work_email") return;
    if (!(await hasWorkosUser(client, email))) {
      // A seeker who only ever signed in with an emailed code has no WorkOS user yet: create one without a
      // password (WorkOS marks the email verified when the reset succeeds), then send the reset.
      if (standing !== "verified_seeker") return;
      await client.createUser({ email });
    }
    await requestWorkosPasswordReset(ctx, client, email, "reset");
  } catch (error) {
    reportPasswordFailure("forgot", classifyWorkosPasswordError(error, "forgot").kind, error);
  }
}

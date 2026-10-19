import type { Express } from "express";
import { resendVerificationRequestSchema, verifyEmailRequestSchema } from "@shared/passwordAuth";
import { claimDurableOnce, consumeDurableLimits, releaseDurableClaim } from "./durableRateLimit";
import { RESEND_COOLDOWN_SECONDS, requestIp, resendCooldownClaim, resendLimits, verifyLimits } from "./passwordLimits";
import { clearPasswordTicketCookie, openPasswordTicket, PASSWORD_TICKET_TTL_MS } from "./passwordPending";
import { clientContext, failUnexpectedly, guardPasswordPost, passLimits, reportPasswordFailure, sendPasswordError, sendPasswordStep, type PasswordRouteContext } from "./passwordResponses";
import { respondSignedIn } from "./passwordSteps";
import type { PasswordAuthentication } from "./passwordWorkosClient";
import { classifyWorkosPasswordError } from "./workosPasswordErrors";

/**
 * The email-verification step WorkOS requires before a seeker password session (D-049): the six-digit code
 * WorkOS emails (free for SkipWait), checked against the encrypted ticket cookie (passwordPending.ts).
 * Five codes per ticket, twenty per IP per 10 minutes, one resend every 30 seconds and five an hour.
 * A decoy ticket (sign-up hit an existing account) behaves like a real one and never verifies.
 */
const decoyPause = () => new Promise<void>(resolve => setTimeout(resolve, 150 + Math.floor(Math.random() * 250)));

export function registerPasswordVerificationRoutes(app: Express, ctx: PasswordRouteContext): void {
  app.post("/api/auth/password/verify-email", async (req, res) => {
    try {
      const body = guardPasswordPost(req, res, verifyEmailRequestSchema);
      if (!body) return;
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      const ticket = await openPasswordTicket(req, ctx.ticketSecret);
      if (!(await passLimits(ctx, res, verifyLimits(ticket, requestIp(req), PASSWORD_TICKET_TTL_MS)))) return;
      if (!ticket) { clearPasswordTicketCookie(req, res); return sendPasswordError(res, "expired"); }
      if (ticket.kind === "decoy") { await decoyPause(); return sendPasswordError(res, "invalid_code"); }
      let authentication: PasswordAuthentication;
      try {
        authentication = ticket.kind === "pending"
          ? await client.authenticateWithEmailVerification({ code: body.code, pendingAuthenticationToken: ticket.token, ...clientContext(req) })
          : { user: (await client.verifyEmail({ userId: ticket.userId, code: body.code })).user };
      } catch (error) {
        const failure = classifyWorkosPasswordError(error, "verify");
        switch (failure.kind) {
          case "invalid_code": return sendPasswordError(res, "invalid_code");
          case "expired": clearPasswordTicketCookie(req, res); return sendPasswordError(res, "expired");
          case "rate_limited": return sendPasswordError(res, "rate_limited", { retryAfterSeconds: failure.retryAfterSeconds });
          case "use_another_method": clearPasswordTicketCookie(req, res); return sendPasswordError(res, "use_another_method");
          default: reportPasswordFailure("verify", failure.kind, error); return sendPasswordError(res, "temporarily_unavailable");
        }
      }
      if (authentication.user.emailVerified !== true) {
        reportPasswordFailure("verify", "still_unverified", undefined);
        return sendPasswordError(res, "temporarily_unavailable");
      }
      clearPasswordTicketCookie(req, res);
      return await respondSignedIn(ctx, req, res, authentication, ticket.returnTo, ticket.origin);
    } catch (error) {
      return failUnexpectedly(res, "verify", error);
    }
  });

  app.post("/api/auth/password/verify-email/resend", async (req, res) => {
    try {
      const body = guardPasswordPost(req, res, resendVerificationRequestSchema);
      if (!body) return;
      const client = ctx.client;
      if (!client) return sendPasswordError(res, "password_sign_in_unavailable");
      const ticket = await openPasswordTicket(req, ctx.ticketSecret);
      if (!ticket) { clearPasswordTicketCookie(req, res); return sendPasswordError(res, "expired"); }
      const options = { store: ctx.store, now: ctx.now() };
      const cooldown = resendCooldownClaim(ticket, options.now);
      const claimed = await claimDurableOnce(cooldown, options);
      if (claimed === "unavailable") return sendPasswordError(res, "temporarily_unavailable");
      if (claimed === "already_claimed") return sendPasswordError(res, "rate_limited", { retryAfterSeconds: RESEND_COOLDOWN_SECONDS });
      const hourly = await consumeDurableLimits(resendLimits(ticket.email), options);
      if (!hourly.allowed) {
        await releaseDurableClaim(cooldown, options);
        return hourly.reason === "unavailable" ? sendPasswordError(res, "temporarily_unavailable") : sendPasswordError(res, "rate_limited", { retryAfterSeconds: hourly.retryAfterSeconds });
      }
      if (ticket.kind === "decoy") { await decoyPause(); return sendPasswordStep(res, { ok: true, step: "verify_email" }); }
      const userId = ticket.kind === "user" ? ticket.userId : ticket.userId ?? (ticket.emailVerificationId ? (await client.getEmailVerification(ticket.emailVerificationId)).userId : undefined);
      if (!userId) { clearPasswordTicketCookie(req, res); return sendPasswordError(res, "expired"); }
      try {
        await client.sendVerificationEmail({ userId });
      } catch (error) {
        const failure = classifyWorkosPasswordError(error, "resend");
        if (failure.kind === "rate_limited") return sendPasswordError(res, "rate_limited", { retryAfterSeconds: failure.retryAfterSeconds });
        reportPasswordFailure("resend", failure.kind, error);
        return sendPasswordError(res, "temporarily_unavailable");
      }
      return sendPasswordStep(res, { ok: true, step: "verify_email" });
    } catch (error) {
      return failUnexpectedly(res, "resend", error);
    }
  });
}

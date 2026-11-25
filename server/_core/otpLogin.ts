import { COOKIE_NAME } from "@shared/const";
import { OTP_RESEND_COOLDOWN_SECONDS, OtpLockedError } from "../otpPolicy";
import type { Express, Request, Response } from "express";
import { resolveTrustedClientIp } from "./trustedClientIp";
import * as db from "../db";
import { isWorkEmailDomain } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";
import { workEmailOtpService } from "../workEmailOtp";
import { revokeReferrerStepUpsForSessionToken } from "../referrerStepUp";
import { recordAuthEvent, type AuthReason } from "../authEvents";

/**
 * Referrer OTP-first login: the work-email OTP IS the sign-in.
 *
 * Flow: POST /api/auth/otp/send { email }  -> code via ZeptoMail (work domains only)
 *       POST /api/auth/otp/verify { email, code } -> app_session_id JWT issued.
 *
 * The verified company email becomes the identity (openId workemail_<email>),
 * enrolled as a referrer profile on first login, so the referrer lands ready
 * to receive their company's private requests. Seekers and admins keep their
 * separate entries (AuthKit / admin gate).
 */

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** ADMIN-activity-log (D-393): the referrer's work-email code, sent and verified, success or not. */
function otpEvent(req: Request, action: "auth.work_email_code_sent" | "auth.work_email_code_verified", outcome: "success" | "failure" | "denied", email: string, extra: { reason?: AuthReason; userId?: number } = {}) {
  const domain = email.split("@")[1];
  void recordAuthEvent(req, { action, outcome, email, method: "work_email_code", plane: "referrer", ...(domain && /^[a-z0-9.-]+$/.test(domain) ? { companyDomain: domain } : {}), ...extra });
}

/** The signed-in account behind a session cookie, for the sign-out row; undefined when it is not a live session. */
export async function sessionAccountId(token: string | undefined): Promise<number | undefined> {
  try {
    const session = await sdk.verifySession(token);
    return session ? (await db.getUserByOpenId(session.openId))?.id : undefined;
  } catch { return undefined; }
}

// API runtime marker: first-sign-in provisioning and hosted-link fixes.
export function registerReferrerOtpLoginRoutes(app: Express) {
  app.post("/api/auth/otp/send", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 320) {
        return res.status(400).json({ error: "Enter a valid work email address" });
      }
      const domain = email.split("@")[1];
      if (!isWorkEmailDomain(domain)) {
        otpEvent(req, "auth.work_email_code_sent", "denied", email, { reason: "not_work_email" });
        return res.status(400).json({ error: "Referrers sign in with a company email. Personal email providers are not accepted." });
      }
      const result = await workEmailOtpService.sendCode(email, { ip: resolveTrustedClientIp(req) });
      otpEvent(req, "auth.work_email_code_sent", result.sent ? "success" : result.reason === "rate_limited" ? "denied" : "failure", email, result.sent ? {} : { reason: result.reason === "rate_limited" ? "rate_limited" : result.reason === "invalid_domain" ? "not_work_email" : result.reason === "not_configured" ? "unavailable" : "provider_error" });
      if (!result.sent) console.warn("[OTP] send failed:", result.reason, "| zepto key len:", (process.env.ZEPTOMAIL_API_KEY || "").length, "| from:", process.env.ZEPTOMAIL_FROM_EMAIL);
      if (result.sent) return res.json({ sent: true });
      if (result.reason === "rate_limited") { const retryAfterSeconds = result.retryAfterSeconds ?? 600; res.set("Retry-After", String(retryAfterSeconds)); return res.status(429).json({ error: retryAfterSeconds <= OTP_RESEND_COOLDOWN_SECONDS ? "Wait a moment before requesting another code." : "Too many code requests. Wait before trying again.", retryAfterSeconds }); }
      if (result.reason === "invalid_domain") return res.status(400).json({ error: "Enter a deliverable work email address" });
      if (result.reason === "not_configured") return res.status(503).json({ error: "Email delivery is not configured yet" });
      return res.status(502).json({ error: "We could not deliver the code. Try again shortly." });
    } catch {
      res.status(500).json({ error: "We could not send the verification code" });
    }
  });

  app.post("/api/auth/otp/verify", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const code = normalizeEmail(req.body?.code);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "Enter the six-digit code from your company email" });
      }
      const verified = await workEmailOtpService.verifyCode(email, code, { ip: resolveTrustedClientIp(req) });
      if (!verified) {
        otpEvent(req, "auth.work_email_code_verified", "failure", email, { reason: "wrong_code" });
        return res.status(400).json({ error: "That code could not be verified. Check the latest code and try again." });
      }
      const openId = `workemail_${email}`;
      // No display name from the address: its local part plus the company rebuilds the work
      // email, and a referrer stays anonymous until they accept. Existing names are untouched.
      const account = await db.resolveLoginIdentity({ provider: "work_email_otp", subject: email, openId, email, emailVerified: true, name: null, loginMethod: "otp_work_email" });
      // Do not refresh profile, sign-in timestamps, or identity state for a
      // suspended account. Keep this response generic to avoid account-state
      // disclosure from the OTP endpoint.
      if (account.suspended) {
        otpEvent(req, "auth.work_email_code_verified", "denied", email, { reason: "suspended", userId: account.id });
        return res.status(403).json({ error: "We could not complete sign-in." });
      }
      const existingProfile = await db.getVerifiedWorkEmailAccess(account.id).catch(() => undefined);
      if (!existingProfile?.workEmailDomain) await db.saveVerifiedWorkEmail(account.id, email).catch(() => undefined);
      const token = await sdk.createSessionToken(openId, { name: account.name ?? email, amr: "work_email_otp" });
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
      otpEvent(req, "auth.work_email_code_verified", "success", email, { userId: account.id });
      res.json({ signedIn: true, role: account.role, email });
    } catch (error) {
      const email = normalizeEmail(req.body?.email);
      if (error instanceof OtpLockedError) { otpEvent(req, "auth.work_email_code_verified", "denied", email, { reason: "locked" }); res.set("Retry-After", String(error.retryAfterSeconds)); return res.status(429).json({ error: "Too many tries. Try again later.", retryAfterSeconds: error.retryAfterSeconds, lockedUntil: error.lockedUntil.toISOString() }); }
      if (error instanceof Error && error.message === "ACCOUNT_NOT_ACTIVE") { otpEvent(req, "auth.work_email_code_verified", "denied", email, { reason: "suspended" }); return res.status(403).json({ error: "We could not complete sign-in." }); }
      otpEvent(req, "auth.work_email_code_verified", "failure", email, { reason: "unavailable" });
      res.status(500).json({ error: "We could not verify the code" });
    }
  });

  app.post("/api/auth/otp/logout", async (req: Request, res: Response) => {
    const token = req.headers.cookie?.match(/(?:^|;\s*)app_session_id=([^;]+)/)?.[1];
    // D-057 §0b.3: mark this account's step-up proofs revoked for the audit trail (the revocation below already ends them).
    const userId = await sessionAccountId(token);
    await revokeReferrerStepUpsForSessionToken(token);
    await sdk.revokeSession(token);
    if (userId !== undefined) void recordAuthEvent(req, { action: "auth.sign_out", outcome: "success", userId, method: "work_email_code", plane: "referrer" });
    res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
    res.json({ signedOut: true });
  });
}



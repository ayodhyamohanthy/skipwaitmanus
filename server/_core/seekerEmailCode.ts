import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { resolveLoginIdentity } from "../db";
import { OtpLockedError } from "../otpPolicy";
import { workEmailOtpService } from "../workEmailOtp";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";
import { resolveTrustedClientIp } from "./trustedClientIp";

/**
 * Job-seeker email sign-in on skipwait.me (no hosted authkit.app screen, no WorkOS dashboard feature needed).
 * We create and verify the six-digit code ourselves with the same hardened store the referrer OTP uses
 * (hashed codes, single use, 10 minute expiry, attempt cap, send and verify rate limits, lockout), email it from
 * our own sender, then resolve the verified email to the one canonical account and issue the normal session.
 * The seeker path does NOT enrol a work email, so it never makes anyone a referrer. Referrers keep the work-email
 * OTP only (server/_core/otpLogin.ts). FOUNDER-LOCKED login rule, Oct 16 2026.
 * Send never reveals whether an account exists. Codes are never logged.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";

type Deps = { service?: Pick<typeof workEmailOtpService, "sendCode" | "verifyCode"> };

export function registerSeekerEmailCodeRoutes(app: Express, deps: Deps = {}) {
  const service = deps.service ?? workEmailOtpService;

  app.post("/api/auth/workos/email-code/send", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!EMAIL.test(email) || email.length > 320) return res.status(400).json({ error: "Enter a valid email address" });
      const result = await service.sendCode(email, { ip: resolveTrustedClientIp(req) || "unknown", seeker: true });
      if (result.sent) return res.json({ sent: true });
      if (result.reason === "rate_limited") {
        const retryAfterSeconds = result.retryAfterSeconds ?? 600;
        res.set("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({ error: retryAfterSeconds <= 30 ? "Wait a moment before requesting another code." : "Too many code requests. Wait before trying again.", retryAfterSeconds });
      }
      if (result.reason === "invalid_domain" || result.reason === "invalid_email") return res.status(400).json({ error: "Enter a deliverable email address" });
      if (result.reason === "not_configured") return res.status(503).json({ error: "Email delivery is not configured yet" });
      return res.status(502).json({ error: "We could not deliver the code. Try again shortly." });
    } catch {
      res.status(500).json({ error: "We could not send the sign-in code" });
    }
  });

  app.post("/api/auth/workos/email-code/verify", async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!EMAIL.test(email) || email.length > 320 || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the six-digit code from your email" });
    try {
      const verified = await service.verifyCode(email, code, { ip: resolveTrustedClientIp(req) || "unknown" });
      if (!verified) return res.status(400).json({ error: "That code could not be verified. Check the latest code and try again." });
      const openId = `emailcode_${email}`;
      const account = await resolveLoginIdentity({ provider: "email_code", subject: email, openId, email, emailVerified: true, name: email.split("@")[0], loginMethod: "email_code" });
      if (account.suspended) return res.status(403).json({ error: "We could not complete sign-in. Contact support@skipwait.me." });
      const token = await sdk.createSessionToken(account.openId, { name: account.name ?? email });
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
      res.json({ signedIn: true });
    } catch (error) {
      if (error instanceof OtpLockedError) { res.set("Retry-After", String(error.retryAfterSeconds)); return res.status(429).json({ error: "Too many tries. Try again later.", retryAfterSeconds: error.retryAfterSeconds }); }
      if (error instanceof Error && (error.message === "ACCOUNT_NOT_ACTIVE" || error.message === "IDENTITY_REVIEW_REQUIRED")) return res.status(403).json({ error: "We could not complete sign-in. Contact support@skipwait.me." });
      res.status(500).json({ error: "We could not verify the code" });
    }
  });
}

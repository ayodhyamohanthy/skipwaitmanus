import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { resolveLoginIdentity } from "../db";
import { OtpLockedError } from "../otpPolicy";
import { workEmailOtpService } from "../workEmailOtp";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";
import { resolveTrustedClientIp } from "./trustedClientIp";

/**
 * The retired job-seeker email code (D-049, D-078 ruling 1). Seekers now sign in with a social provider or email +
 * password; each code was an email SkipWait paid to send. Send answers 410 for everyone and never emails anything.
 * Verify keeps finishing a code that was already emailed until SEEKER_CODE_VERIFY_UNTIL (cached app versions), then
 * answers 410 too. It still uses the hardened referrer OTP store (hashed codes, single use, attempt cap, lockout),
 * resolves the verified email to the one canonical account and never enrols a work email. Codes are never logged.
 */
/**
 * The last instant an already-emailed seeker code can sign anyone in. Whoever lands this branch on main sets it to
 * the landing time + 24 hours (D-078 ruling 1); the default below is that day for a landing on Oct 21 2026.
 */
export const SEEKER_CODE_VERIFY_UNTIL = new Date("2026-10-22T00:00:00Z");
export const SEEKER_CODE_RETIRED_MESSAGE = "Email codes are retired. Sign in with your password, or use Forgot password.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";

type Deps = { service?: Pick<typeof workEmailOtpService, "verifyCode">; now?: () => number };

export function registerSeekerEmailCodeRoutes(app: Express, deps: Deps = {}) {
  const service = deps.service ?? workEmailOtpService;
  const now = deps.now ?? (() => Date.now());
  const retired = (res: Response) => res.status(410).set("Cache-Control", "no-store").json({ error: SEEKER_CODE_RETIRED_MESSAGE });

  app.post("/api/auth/workos/email-code/send", (_req: Request, res: Response) => { retired(res); });

  app.post("/api/auth/workos/email-code/verify", async (req: Request, res: Response) => {
    if (now() >= SEEKER_CODE_VERIFY_UNTIL.getTime()) return retired(res);
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!EMAIL.test(email) || email.length > 320 || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the six-digit code from your email" });
    try {
      const verified = await service.verifyCode(email, code, { ip: resolveTrustedClientIp(req) || "unknown", seeker: true });
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

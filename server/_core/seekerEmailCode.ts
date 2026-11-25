import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { PASSWORD_AUTH_COPY } from "@shared/passwordAuth";
import { resolveLoginIdentity } from "../db";
import { OTP_RESEND_COOLDOWN_SECONDS, OtpLockedError } from "../otpPolicy";
import { workEmailOtpService } from "../workEmailOtp";
import { isTrustedAuthPost } from "./authPostGuard";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";
import { resolveTrustedClientIp } from "./trustedClientIp";
import { isEmailShape, recordAuthEvent, type AuthReason } from "../authEvents";
import { EMAIL_SIGN_IN_LINK_ENABLED } from "@shared/emailSignIn";
import type { PasswordEmailStanding } from "./passwordResponses";

/**
 * D-406 (owner, Nov 25 2026) brings the seeker email code back, with a one-click link in the same email, behind
 * EMAIL_SIGN_IN_LINK_ENABLED. While that switch is off everything below behaves exactly as retired.
 *
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
export const SEEKER_CODE_VERIFY_UNTIL = new Date("2026-11-25T00:00:00Z");
export const SEEKER_USE_WORK_EMAIL_MESSAGE = "Work emails at companies on skipwait.me sign in with a work-email code under Give a referral. Use a personal email here.";
export const SEEKER_CODE_RETIRED_MESSAGE = "Email codes are retired. Sign in with your password, or use Forgot password.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";

type Deps = {
  service?: Pick<typeof workEmailOtpService, "verifyCode" | "sendCode">;
  now?: () => number;
  /** D-406: tests turn the email link + code on; production reads EMAIL_SIGN_IN_LINK_ENABLED. */
  enabled?: boolean;
  /** D-081: an address at a verified referrer domain is a referrer work email, never a seeker email login. */
  standing?: (email: string) => Promise<PasswordEmailStanding>;
};

const defaultStanding = async (email: string) => (await import("../passwordAccountLookup")).passwordEmailStanding(email);

export function registerSeekerEmailCodeRoutes(app: Express, deps: Deps = {}) {
  const service = deps.service ?? workEmailOtpService;
  const now = deps.now ?? (() => Date.now());
  const enabled = deps.enabled ?? EMAIL_SIGN_IN_LINK_ENABLED;
  const standing = deps.standing ?? defaultStanding;
  const useWorkEmail = (res: Response) => res.status(403).set("Cache-Control", "no-store").json({ error: SEEKER_USE_WORK_EMAIL_MESSAGE, code: "use_work_email_code" });
  const retired = (res: Response) => res.status(410).set("Cache-Control", "no-store").json({ error: SEEKER_CODE_RETIRED_MESSAGE });
  // ADMIN-activity-log (D-393): a cached app still using the retired code shows up in the log, never the code.
  const event = (req: Request, outcome: "success" | "failure" | "denied", extra: { reason?: AuthReason; userId?: number } = {}) => {
    const email = normalizeEmail(req.body?.email);
    void recordAuthEvent(req, { action: "auth.seeker_email_code", outcome, method: "email_code", plane: "seeker", ...(isEmailShape(email) ? { email } : {}), ...extra });
  };

  app.post("/api/auth/workos/email-code/send", async (req: Request, res: Response) => {
    if (!enabled) { event(req, "denied", { reason: "retired" }); return retired(res); }
    // D-406: anyone enters an email and gets one email with a code and a sign-in link. Same login-CSRF guard as every auth POST.
    if (!isTrustedAuthPost(req)) return res.status(403).set("Cache-Control", "no-store").json({ error: PASSWORD_AUTH_COPY.forbidden_origin });
    const email = normalizeEmail(req.body?.email);
    if (!EMAIL.test(email) || email.length > 320) return res.status(400).json({ error: "Enter a valid email address" });
    try {
      if ((await standing(email)) === "referrer_work_email") { event(req, "denied", { reason: "use_work_email_code" }); return useWorkEmail(res); }
      const result = await service.sendCode(email, { ip: resolveTrustedClientIp(req) || "unknown", seeker: true });
      if (result.sent) { event(req, "success", { reason: "check_email" }); return res.set("Cache-Control", "no-store").json({ sent: true }); }
      event(req, result.reason === "rate_limited" ? "denied" : "failure", { reason: result.reason === "rate_limited" ? "rate_limited" : result.reason === "invalid_domain" || result.reason === "invalid_email" ? "invalid_request" : result.reason === "not_configured" ? "unavailable" : "provider_error" });
      if (result.reason === "rate_limited") {
        const retryAfterSeconds = result.retryAfterSeconds ?? 600;
        res.set("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({ error: retryAfterSeconds <= OTP_RESEND_COOLDOWN_SECONDS ? "Wait a moment before requesting another email." : "Too many sign-in emails. Wait before trying again.", retryAfterSeconds });
      }
      if (result.reason === "invalid_domain" || result.reason === "invalid_email") return res.status(400).json({ error: "That email address can't receive mail. Check it and try again." });
      if (result.reason === "not_configured") return res.status(503).json({ error: "Email sign-in is unavailable right now. Continue with Google or use a password." });
      return res.status(502).json({ error: "We could not send the email. Try again shortly." });
    } catch {
      event(req, "failure", { reason: "unavailable" });
      return res.status(500).json({ error: "We could not send the email. Try again shortly." });
    }
  });

  app.post("/api/auth/workos/email-code/verify", async (req: Request, res: Response) => {
    if (!enabled && now() >= SEEKER_CODE_VERIFY_UNTIL.getTime()) { event(req, "denied", { reason: "retired" }); return retired(res); }
    // Review F3: the same login-CSRF guard as every auth POST, so a cross-site form cannot sign a victim in.
    if (!isTrustedAuthPost(req)) return res.status(403).set("Cache-Control", "no-store").json({ error: PASSWORD_AUTH_COPY.forbidden_origin });
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!EMAIL.test(email) || email.length > 320 || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the six-digit code from your email" });
    try {
      if (enabled && (await standing(email)) === "referrer_work_email") { event(req, "denied", { reason: "use_work_email_code" }); return useWorkEmail(res); }
      const verified = await service.verifyCode(email, code, { ip: resolveTrustedClientIp(req) || "unknown", seeker: true });
      if (!verified) { event(req, "failure", { reason: "wrong_code" }); return res.status(400).json({ error: "That code could not be verified. Check the latest code and try again." }); }
      const openId = `emailcode_${email}`;
      const account = await resolveLoginIdentity({ provider: "email_code", subject: email, openId, email, emailVerified: true, name: email.split("@")[0], loginMethod: "email_code" });
      if (account.suspended) { event(req, "denied", { reason: "suspended", userId: account.id }); return res.status(403).json({ error: "We could not complete sign-in. Contact support@skipwait.me." }); }
      const token = await sdk.createSessionToken(account.openId, { name: account.name ?? email, authTime: Math.floor(Date.now() / 1000) });
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
      event(req, "success", { userId: account.id });
      res.json({ signedIn: true });
    } catch (error) {
      event(req, error instanceof OtpLockedError ? "denied" : "failure", { reason: error instanceof OtpLockedError ? "locked" : error instanceof Error && error.message === "ACCOUNT_NOT_ACTIVE" ? "suspended" : "unavailable" });
      if (error instanceof OtpLockedError) { res.set("Retry-After", String(error.retryAfterSeconds)); return res.status(429).json({ error: "Too many tries. Try again later.", retryAfterSeconds: error.retryAfterSeconds }); }
      if (error instanceof Error && (error.message === "ACCOUNT_NOT_ACTIVE" || error.message === "IDENTITY_REVIEW_REQUIRED")) return res.status(403).json({ error: "We could not complete sign-in. Contact support@skipwait.me." });
      res.status(500).json({ error: "We could not verify the code" });
    }
  });
}

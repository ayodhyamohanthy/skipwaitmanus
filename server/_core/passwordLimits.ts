import type { Request } from "express";
import { OTP_LOCK_AFTER_FAILURES, OTP_LOCK_MS } from "../otpPolicy";
import { durableLimiterKey, type DurableFailureCounter, type DurableLimit } from "./durableRateLimit";

/**
 * Durable limits for seeker password auth (D-049), all below WorkOS's own per-environment limits
 * (authenticate 10/60 s per email, reset sends 3/60 s). Keys are hashed and namespaced
 * ("pw-*"), so the shared workEmailOtpRateLimits table never holds a raw email or IP.
 *
 * Per-IP keys use req.ip: Express trusts the proxy and the Worker rewrites X-Forwarded-For to the
 * CF-Connecting-IP (shared/clientIp.ts). resolveTrustedClientIp is deliberately not used: without
 * TRUST_CLOUDFLARE_CONNECTING_IP it returns the container's socket address, which would turn every
 * per-IP lock below into a site-wide lockout that one attacker could trigger.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** A whole IP (an office, a campus) is locked only by a much larger spray of failures. */
const IP_LOCK_AFTER_FAILURES = 30;
const EMAIL_LOCK_AFTER_FAILURES_PER_HOUR = 20;

export function requestIp(req: Request): string {
  const ip = (req.ip ?? "").trim();
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return normalized && normalized.length <= 64 ? normalized : "unknown";
}

const key = (namespace: string, value: string) => durableLimiterKey(namespace, value);

export function signInLimits(email: string, ip: string): DurableLimit[] {
  return [
    { key: key("pw-signin-ip", ip), windowMs: 10 * MINUTE, limit: 30 },
    { key: key("pw-signin-email", email), windowMs: 15 * MINUTE, limit: 10 },
  ];
}

export function signUpLimits(email: string, ip: string): DurableLimit[] {
  return [
    { key: key("pw-signup-ip", ip), windowMs: HOUR, limit: 10 },
    { key: key("pw-signup-email", email), windowMs: HOUR, limit: 3 },
  ];
}

/**
 * Every emailed password link (forgot, sign-up, a sign-in that must prove the inbox) shares one cap per address:
 * three an hour. Each one is an email SkipWait pays to send (D-078 ruling 6), and the cap is checked before WorkOS.
 */
export function passwordLinkEmailLimits(email: string): DurableLimit[] {
  return [{ key: key("pw-link-email", email), windowMs: HOUR, limit: 3 }];
}

export function forgotLimits(email: string, ip: string): DurableLimit[] {
  return [
    { key: key("pw-forgot-email", email), windowMs: HOUR, limit: 3 },
    { key: key("pw-forgot-ip", ip), windowMs: HOUR, limit: 10 },
  ];
}

export function resetConfirmLimits(ip: string): DurableLimit[] {
  return [{ key: key("pw-reset-ip", ip), windowMs: HOUR, limit: 20 }];
}

/** Wrong passwords: the (email, IP) pair locks after 5, the IP after 30, the email after 20 in an hour. */
export function failureCounters(email: string, ip: string): DurableFailureCounter[] {
  const locks = passwordLockKeys(email, ip);
  return [
    { key: key("pw-fail-pair", `${email}|${ip}`), windowMs: OTP_LOCK_MS, threshold: OTP_LOCK_AFTER_FAILURES, lockKey: locks[0], lockMs: OTP_LOCK_MS },
    { key: key("pw-fail-ip", ip), windowMs: OTP_LOCK_MS, threshold: IP_LOCK_AFTER_FAILURES, lockKey: locks[1], lockMs: OTP_LOCK_MS },
    { key: key("pw-fail-email", email), windowMs: HOUR, threshold: EMAIL_LOCK_AFTER_FAILURES_PER_HOUR, lockKey: locks[2], lockMs: OTP_LOCK_MS },
  ];
}

/**
 * What a successful reset clears for that email (S-8): its lock and its hourly failure count, so wrong passwords
 * sprayed by someone else cannot keep the owner locked out after they proved the inbox. Per-network locks stay.
 */
export function emailLockResetKeys(email: string): [string, string] {
  return [key("pw-lock-email", email), key("pw-fail-email", email)];
}

export function passwordLockKeys(email: string, ip: string): [string, string, string] {
  return [key("pw-lock-pair", `${email}|${ip}`), key("pw-lock-ip", ip), key("pw-lock-email", email)];
}

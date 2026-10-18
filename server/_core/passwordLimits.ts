import type { Request } from "express";
import { OTP_LOCK_AFTER_FAILURES, OTP_LOCK_MS, OTP_RESEND_COOLDOWN_SECONDS } from "../otpPolicy";
import { durableLimiterKey, type DurableClaim, type DurableFailureCounter, type DurableLimit } from "./durableRateLimit";

/**
 * Durable limits for seeker password auth (D-049), all below WorkOS's own per-environment limits
 * (authenticate 10/60 s per email, verification and reset sends 3/60 s). Keys are hashed and namespaced
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

/** Five codes per ticket over its whole life (the window is anchored to the ticket), twenty per IP per 10 minutes. */
export function verifyLimits(ticket: { readonly jti: string; readonly issuedAtMs: number } | null, ip: string, ticketTtlMs: number): DurableLimit[] {
  const limits: DurableLimit[] = [{ key: key("pw-verify-ip", ip), windowMs: 10 * MINUTE, limit: 20 }];
  if (ticket) limits.push({ key: key("pw-verify-ticket", ticket.jti), windowMs: ticketTtlMs + MINUTE, limit: 5, anchorMs: ticket.issuedAtMs });
  return limits;
}

/** A sliding 30-second cooldown per ticket: the claim row lives until 30 s after the last send. */
export function resendCooldownClaim(ticket: { readonly jti: string; readonly issuedAtMs: number }, now: number): DurableClaim {
  return { key: key("pw-resend-ticket", ticket.jti), windowStart: new Date(ticket.issuedAtMs), expiresAt: new Date(now + OTP_RESEND_COOLDOWN_SECONDS * 1000) };
}
export const RESEND_COOLDOWN_SECONDS = OTP_RESEND_COOLDOWN_SECONDS;

export function resendLimits(email: string): DurableLimit[] {
  return [{ key: key("pw-resend-email", email), windowMs: HOUR, limit: 5 }];
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

export function passwordLockKeys(email: string, ip: string): [string, string, string] {
  return [key("pw-lock-pair", `${email}|${ip}`), key("pw-lock-ip", ip), key("pw-lock-email", email)];
}

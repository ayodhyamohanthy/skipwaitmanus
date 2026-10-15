// Work-email OTP policy shared by the service and the routes (queue task 6, otp-policy-kit).
/** Thrown while a (email, IP) pair or an IP is locked out after repeated wrong codes. */
export class OtpLockedError extends Error {
  constructor(readonly lockedUntil: Date, readonly retryAfterSeconds: number) { super("OTP_LOCKED"); }
}
/** Minimum gap between code sends to one address. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
/** Wrong codes before a lockout, counted per (email, IP). */
export const OTP_LOCK_AFTER_FAILURES = 5;
export const OTP_LOCK_MS = 15 * 60 * 1000;

import { createHmac } from "node:crypto";

/**
 * Queue task 3 (work-email-hmac-storage), stage 1. When WORK_EMAIL_HMAC_KEY is set, the OTP code and
 * receipt tables store `h:<HMAC-SHA256 of the email>` in the email column instead of the address.
 * Reads accept both forms so codes and receipts issued just before the key was set (10 minute TTL)
 * still verify. With the key absent behaviour is exactly the old plaintext behaviour.
 */
export function workEmailStorageKeys(email: string, secret: string | undefined = process.env.WORK_EMAIL_HMAC_KEY): { write: string; read: string[] } {
  const normalized = email.trim().toLowerCase();
  if (!secret) return { write: normalized, read: [normalized] };
  const write = `h:${createHmac("sha256", secret).update(normalized).digest("hex")}`;
  return { write, read: [write, normalized] };
}

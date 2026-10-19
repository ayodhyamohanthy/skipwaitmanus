import { createHmac } from "node:crypto";

/**
 * Queue task 3 (work-email-hmac-storage): the work-email OTP tables store
 * `h:<HMAC-SHA256 of the normalized address>` in their email column, never the
 * address, so the verify aside's "A one-way fingerprint of your email" line is
 * true in every deployment.
 *
 * The key is `WORK_EMAIL_HMAC_KEY` when that secret is set, otherwise it derives
 * from `JWT_SECRET` with its own `work-email:` prefix (the same in-repo pattern
 * as the Slack webhook key), so no owner action is required to stop storing
 * plaintext. Changing the key - rotating `JWT_SECRET` or setting the secret
 * later - invalidates only codes and receipts already in flight, each of which
 * lives 10 minutes. Reads always also accept the legacy plaintext form, so a row
 * written before the change still verifies; the hourly `work-email-otp-purge`
 * job rewrites the rest.
 */
export const WORK_EMAIL_FINGERPRINT_PREFIX = "h:";

export function workEmailFingerprintSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.WORK_EMAIL_HMAC_KEY?.trim();
  return configured ? `work-email:${configured}` : `work-email-jwt:${env.JWT_SECRET?.trim() || "skipwait-local-development-secret"}`;
}

export function workEmailStorageKeys(email: string, secret: string | undefined = workEmailFingerprintSecret()): { write: string; read: string[] } {
  const normalized = email.trim().toLowerCase();
  const write = `${WORK_EMAIL_FINGERPRINT_PREFIX}${createHmac("sha256", secret).update(normalized).digest("hex")}`;
  return { write, read: [write, normalized] };
}

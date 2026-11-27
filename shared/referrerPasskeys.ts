import { z } from "zod";

/** D-408: enabled only by the separate referrer passkey release. */
export const REFERRER_PASSKEY_SIGNIN_ENABLED = false;
export const REFERRER_PASSKEY_WORK_EMAIL_MAX_AGE_MS = 30 * 86_400_000;
export const REFERRER_PASSKEY_UNAVAILABLE_CODE = "referrer_passkey_unavailable";
export const REFERRER_PASSKEY_UNAVAILABLE_MESSAGE = "Passkey sign-in for referrers is not available yet. Sign in with your work-email code.";
export const REFERRER_PASSKEY_WORK_EMAIL_REQUIRED_CODE = "work_email_code_required";
export const REFERRER_PASSKEY_WORK_EMAIL_REQUIRED_MESSAGE = "Enter your work-email code to continue";

/** An authenticated alias must already contain the exact normalized address. */
export const referrerPasskeyWorkEmailSchema = z.string().max(320).email()
  .refine(email => email === email.trim().toLowerCase(), "Use the exact normalized work email.");

// Seeker email + password on skipwait.me (D-049): the one contract for /api/auth/password/*
// (server/_core/passwordSignIn.ts, server/passwordResetRoutes.ts) and the pages that call them
// (client/src/components/SeekerSignIn.tsx, ForgotPassword.tsx, ResetPassword.tsx). Requests are strict
// objects; every response is parsed with these schemas on both sides, so nothing else defines these shapes.
// Seekers only: no request carries an intent (referrers sign in with a work-email code, D-030), and nothing
// continues on the hosted WorkOS page.
import { z } from "zod";

export const EMAIL_MAX = 320;
export const PASSWORD_MAX = 256;
export const RETURN_TO_MAX = 2048;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX).regex(EMAIL_PATTERN);
/** Passwords are never trimmed or normalised: what the person typed is what WorkOS checks. */
const passwordSchema = z.string().min(1).max(PASSWORD_MAX);
const returnToSchema = z.string().max(RETURN_TO_MAX).optional();

/** A same-origin app path: no scheme, no protocol-relative `//`, no API path. */
export const appPathSchema = z.string().max(RETURN_TO_MAX).regex(/^\/(?![/\\])(?!api\/)[^\s\\]*$/);

export const passwordSignInRequestSchema = z.strictObject({ email: emailSchema, password: passwordSchema, returnTo: returnToSchema });
export type PasswordSignInRequest = z.infer<typeof passwordSignInRequestSchema>;
/** The password policy (passwordPolicyError) is checked separately, before WorkOS is called. */
export const passwordSignUpRequestSchema = z.strictObject({ email: emailSchema, password: passwordSchema, returnTo: returnToSchema });
export type PasswordSignUpRequest = z.infer<typeof passwordSignUpRequestSchema>;
export const verifyEmailRequestSchema = z.strictObject({ code: z.string().regex(VERIFICATION_CODE_PATTERN) });
export const resendVerificationRequestSchema = z.strictObject({});
export const passwordForgotRequestSchema = z.strictObject({ email: emailSchema });

/** WorkOS reset tokens are opaque; this bounds the length and keeps them to URL-safe characters. */
export const resetTokenSchema = z.string().min(8).max(4096).regex(/^[A-Za-z0-9._~+/=-]+$/);
export const passwordResetConfirmRequestSchema = z.strictObject({
  token: resetTokenSchema,
  password: z.string().max(PASSWORD_MAX),
  confirm: z.string().max(PASSWORD_MAX),
});

/** Sign-in, sign-up and verification answer with the next step: signed in, or check your email for a code. */
export const passwordStepSchema = z.discriminatedUnion("step", [
  z.strictObject({ ok: z.literal(true), step: z.literal("signed_in"), redirectTo: appPathSchema }),
  z.strictObject({ ok: z.literal(true), step: z.literal("verify_email") }),
]);
export type PasswordStep = z.infer<typeof passwordStepSchema>;
export const passwordForgotAcceptedSchema = z.strictObject({ ok: z.literal(true) });
export const passwordResetConfirmSuccessSchema = z.strictObject({
  ok: z.literal(true),
  /** True when this browser now holds a fresh session; false when the person signs in again themselves. */
  signedIn: z.boolean(),
  redirectTo: appPathSchema,
});
export type PasswordResetConfirmSuccess = z.infer<typeof passwordResetConfirmSuccessSchema>;

export const PASSWORD_AUTH_ERROR_CODES = [
  "invalid_input",
  "invalid_credentials",
  "invalid_code",
  "expired",
  "weak_password",
  "rate_limited",
  "forbidden_origin",
  "account_review",
  "account_inactive",
  "use_work_email_code",
  "use_another_method",
  "password_sign_in_unavailable",
  "temporarily_unavailable",
] as const;
export const passwordAuthErrorCodeSchema = z.enum(PASSWORD_AUTH_ERROR_CODES);
export type PasswordAuthErrorCode = z.infer<typeof passwordAuthErrorCodeSchema>;

export const passwordAuthErrorSchema = z.strictObject({
  ok: z.literal(false),
  code: passwordAuthErrorCodeSchema,
  message: z.string().min(1).max(300),
  retryAfterSeconds: z.number().int().positive().max(86_400).optional(),
});
export type PasswordAuthError = z.infer<typeof passwordAuthErrorSchema>;

/** One copy deck for every error code; the server sends it and the pages render it. */
export const PASSWORD_AUTH_COPY: Readonly<Record<PasswordAuthErrorCode, string>> = {
  invalid_input: "Enter a valid email address and password.",
  invalid_credentials: "That email and password don't match. Try again, or reset your password.",
  invalid_code: "That code didn't work. Check the newest email from us and try again.",
  expired: "This has expired. Start again and we'll send a new one.",
  weak_password: "Choose a stronger password: at least 10 characters with a number or symbol, and not one used on other sites.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  forbidden_origin: "This request did not come from SkipWait. Refresh the page and try again.",
  account_review: "This account needs a quick review before it can sign in. Contact support@skipwait.me.",
  account_inactive: "This account is not active. Contact support@skipwait.me.",
  use_work_email_code: "This is a verified work email. Sign in with a work-email code under Give a referral.",
  use_another_method: "This account needs a different sign-in method. Continue with Google, Microsoft or GitHub, or contact support@skipwait.me.",
  password_sign_in_unavailable: "Email and password sign-in isn't available right now. Continue with Google, Microsoft or GitHub.",
  temporarily_unavailable: "We couldn't reach the sign-in service. Try again in a moment.",
};

/**
 * Where a social sign-in with a referrer's verified work email lands instead of a session (D-078 ruling 4): the
 * referrer side of /sign-in, which shows PASSWORD_AUTH_COPY.use_work_email_code. Referrers sign in with a code only.
 */
export const USE_WORK_EMAIL_CODE_REASON = "use_work_email_code";
export const USE_WORK_EMAIL_CODE_PATH = `/sign-in?intent=referrer&reason=${USE_WORK_EMAIL_CODE_REASON}`;

/** Kit rules for setting a password (sign-up and reset only, never sign-in); the server enforces the same three. */
export function passwordPolicyChecks(password: string, confirm: string): ReadonlyArray<{ readonly label: string; readonly passed: boolean }> {
  return [
    { label: "At least 10 characters", passed: password.length >= 10 },
    { label: "A number or symbol", passed: /[\d\W]/.test(password) },
    { label: "Passwords match", passed: password.length > 0 && password === confirm },
  ];
}

export function passwordPolicyError(password: string, confirm: string): string | undefined {
  if (password.length < 10) return "Use at least 10 characters";
  if (!/[\d\W]/.test(password)) return "Add a number or symbol";
  if (password !== confirm) return "Passwords do not match";
  return undefined;
}

/** Whole minutes to show for a retry-after, never zero. */
export function retryMinutes(retryAfterSeconds: number | undefined): number {
  return Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
}

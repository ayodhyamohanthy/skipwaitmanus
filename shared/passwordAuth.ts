// Email + password sign-in and SkipWait-issued password reset: the one
// contract for /api/auth/password/* (server/passwordAuthRoutes.ts,
// server/passwordResetRoutes.ts) and the kit pages that call them
// (client/src/pages/SignIn.tsx, ForgotPassword.tsx, ResetPassword.tsx).
// Requests are strict objects; every response is parsed with these schemas on
// both sides, so nothing else defines these shapes.
import { z } from "zod";

export const SIGN_IN_INTENTS = ["seeker", "referrer"] as const;
export const signInIntentSchema = z.enum(SIGN_IN_INTENTS);
export type SignInIntent = z.infer<typeof signInIntentSchema>;

/** Where each intent lands after sign-in: the job search, or referrer setup (work-email verification). */
export const INTENT_RETURN_TO: Readonly<Record<SignInIntent, string>> = { seeker: "/explore", referrer: "/referrer-setup" };

export const EMAIL_MAX = 320;
export const PASSWORD_MAX = 256;
export const RETURN_TO_MAX = 2048;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX).regex(EMAIL_PATTERN);
/** Passwords are never trimmed or normalised: what the person typed is what WorkOS checks. */
const signInPasswordSchema = z.string().min(1).max(PASSWORD_MAX);

/** A same-origin app path: no scheme, no protocol-relative `//`, no API path. */
export const appPathSchema = z.string().max(RETURN_TO_MAX).regex(/^\/(?![/\\])(?!api\/)[^\s\\]*$/);
/** The hosted AuthKit continuation (server/_core/workosAuth.ts sign-in start route). */
export const hostedSignInPathSchema = z.string().max(4096).regex(/^\/api\/auth\/workos\/sign-in(?:\?[^\s\\]*)?$/);

export const passwordSignInRequestSchema = z.strictObject({
  email: emailSchema,
  password: signInPasswordSchema,
  intent: signInIntentSchema.optional(),
  returnTo: z.string().max(RETURN_TO_MAX).optional(),
});
export type PasswordSignInRequest = z.infer<typeof passwordSignInRequestSchema>;

/** Why a correct sign-in still has to finish on hosted AuthKit. */
export const HOSTED_REASONS = ["verify_email", "two_step", "organization", "extra_check"] as const;
export const hostedReasonSchema = z.enum(HOSTED_REASONS);
export type HostedReason = z.infer<typeof hostedReasonSchema>;

export const PASSWORD_AUTH_ERROR_CODES = [
  "invalid_input",
  "invalid_credentials",
  "continue_hosted",
  "password_sign_in_unavailable",
  "account_review",
  "account_inactive",
  "rate_limited",
  "forbidden_origin",
  "weak_password",
  "expired",
  "consumed",
  "temporarily_unavailable",
] as const;
export const passwordAuthErrorCodeSchema = z.enum(PASSWORD_AUTH_ERROR_CODES);
export type PasswordAuthErrorCode = z.infer<typeof passwordAuthErrorCodeSchema>;

export const passwordAuthErrorSchema = z.strictObject({
  ok: z.literal(false),
  code: passwordAuthErrorCodeSchema,
  message: z.string().min(1).max(300),
  reason: hostedReasonSchema.optional(),
  redirectTo: hostedSignInPathSchema.optional(),
  retryAfterSeconds: z.number().int().positive().max(86_400).optional(),
});
export type PasswordAuthError = z.infer<typeof passwordAuthErrorSchema>;

export const passwordSignInSuccessSchema = z.strictObject({ ok: z.literal(true), redirectTo: appPathSchema });
export type PasswordSignInSuccess = z.infer<typeof passwordSignInSuccessSchema>;

export const passwordAvailabilitySchema = z.strictObject({ passwordSignIn: z.boolean() });
export type PasswordAvailability = z.infer<typeof passwordAvailabilitySchema>;

export const passwordForgotRequestSchema = z.strictObject({ email: emailSchema });
export const passwordForgotAcceptedSchema = z.strictObject({ ok: z.literal(true) });

/** Reset tokens are compact JWS strings issued by server/passwordResetRoutes.ts. */
export const resetTokenSchema = z.string().min(16).max(4096).regex(/^[A-Za-z0-9_.-]+$/);
export const passwordResetCheckRequestSchema = z.strictObject({ token: resetTokenSchema });
export const passwordResetCheckResponseSchema = z.strictObject({ status: z.enum(["valid", "expired"]) });
export type PasswordResetCheckResponse = z.infer<typeof passwordResetCheckResponseSchema>;

export const passwordResetConfirmRequestSchema = z.strictObject({
  token: resetTokenSchema,
  password: z.string().max(PASSWORD_MAX),
  confirm: z.string().max(PASSWORD_MAX),
});
export const passwordResetConfirmSuccessSchema = z.strictObject({
  ok: z.literal(true),
  /** True when this browser now holds a fresh session; false when sign-in must finish on hosted AuthKit. */
  signedIn: z.boolean(),
  redirectTo: z.union([appPathSchema, hostedSignInPathSchema]),
});
export type PasswordResetConfirmSuccess = z.infer<typeof passwordResetConfirmSuccessSchema>;

/** Kit reset rules (app/src/routes/reset-password.tsx); the server enforces the same three. */
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

/** Hosted AuthKit start URL. Parameter order is stable so callers and tests agree. */
export function hostedSignInPath(input: { readonly returnTo: string; readonly email?: string; readonly provider?: "google" }): string {
  const params = new URLSearchParams({ returnTo: input.returnTo });
  if (input.provider) params.set("provider", input.provider);
  const hint = input.email?.trim().toLowerCase() ?? "";
  if (hint && hint.length <= EMAIL_MAX && EMAIL_PATTERN.test(hint)) params.set("login_hint", hint);
  return `/api/auth/workos/sign-in?${params}`;
}

/** One copy deck for every error code; the server sends it and the pages render it. */
export const PASSWORD_AUTH_COPY: Readonly<Record<PasswordAuthErrorCode, string>> = {
  invalid_input: "Enter your email address and password.",
  invalid_credentials: "That email and password don't match. Try again or reset your password.",
  continue_hosted: "Finish signing in on the next secure screen.",
  password_sign_in_unavailable: "Password sign-in isn't available right now. Continue with email on the secure sign-in screen.",
  account_review: "This account needs a quick review before it can sign in. Contact support@skipwait.me.",
  account_inactive: "This account is not active. Contact support@skipwait.me.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  forbidden_origin: "This request did not come from SkipWait. Refresh the page and try again.",
  weak_password: "Choose a stronger password. This one is too common or has appeared in a data breach.",
  expired: "This link has expired. Request a new one.",
  consumed: "This link was already used. Request a new one.",
  temporarily_unavailable: "We couldn't reach the sign-in service. Try again in a moment.",
};

export const HOSTED_REASON_COPY: Readonly<Record<HostedReason, string>> = {
  verify_email: "Confirm your email to finish signing in. We'll send a code on the next secure screen.",
  two_step: "Your account uses two-step verification. Finish signing in on the next secure screen.",
  organization: "Your organization manages sign-in for this email. Continue on the next secure screen.",
  extra_check: "We need one more check to keep your account safe. Continue on the next secure screen.",
};

/** Whole minutes to show for a retry-after, never zero. */
export function retryMinutes(retryAfterSeconds: number | undefined): number {
  return Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
}

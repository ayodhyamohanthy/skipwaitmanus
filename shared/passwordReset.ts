import { z } from "zod";

/**
 * Password reset contract shared by /forgot-password, /reset-password and
 * server/passwordResetRoutes.ts. WorkOS AuthKit stays the only credential
 * store: the server asks WorkOS for a one-time reset token, wraps it in a
 * signed link that lives at most one hour, and confirms through WorkOS.
 */

export const PASSWORD_RESET_PATHS = {
  send: "/api/auth/password-reset/send",
  status: "/api/auth/password-reset/status",
  confirm: "/api/auth/password-reset/confirm",
} as const;

export const PASSWORD_RESET_LINK_TTL_MS = 60 * 60_000;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

const NUMBER_OR_SYMBOL = /[\d\W_]/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LINK_TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type PasswordRuleId = "length" | "numberOrSymbol" | "match";
export type PasswordRule = { readonly id: PasswordRuleId; readonly label: string; readonly met: boolean };

/** The kit's live checklist, in display order. The server enforces the first two. */
export function passwordRules(password: string, confirm: string): readonly PasswordRule[] {
  return [
    { id: "length", label: "At least 10 characters", met: password.length >= PASSWORD_MIN_LENGTH },
    { id: "numberOrSymbol", label: "A number or symbol", met: NUMBER_OR_SYMBOL.test(password) },
    { id: "match", label: "Passwords match", met: password.length > 0 && password === confirm },
  ];
}

export function isResetEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 320 && EMAIL_SHAPE.test(email);
}

export const resetEmailSchema = z.string().trim().toLowerCase().max(320).regex(EMAIL_SHAPE);
export const resetLinkTokenSchema = z.string().min(20).max(4096).regex(LINK_TOKEN_SHAPE);
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).regex(NUMBER_OR_SYMBOL);

export const passwordResetSendRequestSchema = z.object({ email: resetEmailSchema }).strict();
export const passwordResetStatusRequestSchema = z.object({ token: resetLinkTokenSchema }).strict();
export const passwordResetConfirmRequestSchema = z.object({ token: resetLinkTokenSchema, password: newPasswordSchema }).strict();

const rateLimited = z.object({ status: z.literal("rate_limited"), retryAfterSeconds: z.number().int().positive() }).strict();
const unavailable = z.object({ status: z.literal("unavailable") }).strict();
const failed = z.object({ status: z.literal("failed") }).strict();
const expired = z.object({ status: z.literal("expired") }).strict();
const invalid = z.object({ status: z.literal("invalid") }).strict();

/** `sent` is returned whether or not an account exists (no account enumeration). */
export const passwordResetSendResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("sent") }).strict(),
  z.object({ status: z.literal("invalid_email") }).strict(),
  rateLimited,
  unavailable,
]);

export const passwordResetStatusResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("valid") }).strict(),
  expired,
  invalid,
  rateLimited,
  unavailable,
]);

export const passwordResetConfirmResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("updated"), otherSessionsSignedOut: z.boolean() }).strict(),
  z.object({ status: z.literal("weak_password") }).strict(),
  z.object({ status: z.literal("password_rejected") }).strict(),
  expired,
  invalid,
  rateLimited,
  unavailable,
  failed,
]);

export type PasswordResetSendResponse = z.infer<typeof passwordResetSendResponseSchema>;
export type PasswordResetStatusResponse = z.infer<typeof passwordResetStatusResponseSchema>;
export type PasswordResetConfirmResponse = z.infer<typeof passwordResetConfirmResponseSchema>;

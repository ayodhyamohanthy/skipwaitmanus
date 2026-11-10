// In-session work-email step-up (D-057, D-245; packet docs/plans/D-057-session-gate.md §0b).
//
// A person already signed in with a personal login (Google/WorkOS, password)
// confirms their verified work email with a fresh code inside the same session.
// The server records a proof bound to the account, the session key, the exact
// work email and the purpose below. It never signs anyone in, never creates or
// links an account, and never sets the session claim (`amr`).
import { z } from "zod";

export const REFERRER_STEP_UP_SEND_PATH = "/api/referrer/step-up/send";
export const REFERRER_STEP_UP_VERIFY_PATH = "/api/referrer/step-up/verify";

/** The one purpose a proof is written for (referrerStepUps.purpose). */
export const REFERRER_STEP_UP_PURPOSE = "referrer_actions" as const;
export type ReferrerStepUpPurpose = typeof REFERRER_STEP_UP_PURPOSE;

/** The code lives 10 minutes and allows 5 tries (the numbers of server/workEmailOtp.ts). */
export const STEP_UP_CODE_TTL_MS = 10 * 60_000;
export const STEP_UP_MAX_ATTEMPTS = 5;
/** A proof lasts 12 hours from verification; renewal never extends it (changeable, D-245). */
export const STEP_UP_PROOF_TTL_MS = 12 * 60 * 60_000;

/** The gate's refusal on a referrer action route (packet §0b.5, §4.4). */
export const WORK_EMAIL_CODE_REQUIRED = "work_email_code_required" as const;
export const WORK_EMAIL_CODE_REQUIRED_ERROR = "Confirm your work email with a code to continue.";
export const workEmailCodeRequiredBody = () => ({ error: WORK_EMAIL_CODE_REQUIRED_ERROR, code: WORK_EMAIL_CODE_REQUIRED });

export const stepUpErrorCodes = [
  "not_verified_referrer",
  "step_up_email_mismatch",
  "session_unbindable",
  "step_up_session_mismatch",
  "step_up_code_invalid",
  "step_up_rate_limited",
  "step_up_locked",
  "step_up_unavailable",
  WORK_EMAIL_CODE_REQUIRED,
] as const;
export type StepUpErrorCode = (typeof stepUpErrorCodes)[number];

const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Challenge ids are 32 random bytes, base64url (43 characters). */
const challengeIdShape = /^[A-Za-z0-9_-]{43}$/;

export const stepUpSendRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(320).regex(emailShape),
});
export type StepUpSendRequest = z.infer<typeof stepUpSendRequestSchema>;

export const stepUpSendResponseSchema = z.object({
  sent: z.literal(true),
  challengeId: z.string().regex(challengeIdShape),
  expiresAt: z.string().datetime(),
});
export type StepUpSendResponse = z.infer<typeof stepUpSendResponseSchema>;

export const stepUpVerifyRequestSchema = z.object({
  challengeId: z.string().regex(challengeIdShape),
  code: z.string().trim().regex(/^\d{6}$/),
});
export type StepUpVerifyRequest = z.infer<typeof stepUpVerifyRequestSchema>;

export const stepUpVerifyResponseSchema = z.object({
  verified: z.literal(true),
  expiresAt: z.string().datetime(),
});
export type StepUpVerifyResponse = z.infer<typeof stepUpVerifyResponseSchema>;

export const stepUpErrorResponseSchema = z.object({
  error: z.string(),
  code: z.enum(stepUpErrorCodes).optional(),
  retryAfterSeconds: z.number().int().positive().optional(),
});
export type StepUpErrorResponse = z.infer<typeof stepUpErrorResponseSchema>;

export const isChallengeId = (value: string): boolean => challengeIdShape.test(value);

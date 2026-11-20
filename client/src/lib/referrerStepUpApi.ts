// D-057-session-gate (D-245, packet §0b.6): the in-session work-email step-up
// client, and the one signal every referrer fetch raises when the server
// refuses a referrer action with work_email_code_required. A signed-in person
// is never sent to referrerSignInHref() or /api/auth/otp/* from here: those
// stay the signed-out sign-in.
import {
  REFERRER_STEP_UP_SEND_PATH, REFERRER_STEP_UP_VERIFY_PATH, WORK_EMAIL_CODE_REQUIRED,
  stepUpErrorResponseSchema, stepUpSendResponseSchema, stepUpVerifyResponseSchema,
} from "@shared/referrerStepUp";

type TokenSource = () => Promise<string | null | undefined>;
type Failure = { ok: false; error: string; code?: string; retryAfterSeconds?: number; offline?: boolean };
export type StepUpSendResult = { ok: true; challengeId: string; expiresAt: string } | Failure;
export type StepUpConfirmResult = { ok: true; expiresAt: string } | Failure;

const listeners = new Set<() => void>();
/** Subscribe to work_email_code_required refusals; returns the unsubscribe. */
export function onWorkEmailCodeRequired(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyWorkEmailCodeRequired(): void {
  Array.from(listeners).forEach(listener => listener());
}
/** The server's refusal of a referrer action in a session without a code or a fresh step-up. */
export function isWorkEmailCodeRequired(status: number, payload: Record<string, unknown>): boolean {
  return status === 403 && payload.code === WORK_EMAIL_CODE_REQUIRED;
}

const OFFLINE = "You seem to be offline. Check your connection and try again. Nothing was sent.";
const FALLBACK = "We could not reach skipwait.me. Nothing changed. Try again in a moment.";

async function post(path: string, body: unknown, getToken: TokenSource): Promise<{ status: number; payload: unknown; retryAfter: number | undefined } | Failure> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: OFFLINE, offline: true };
  }
  let payload: unknown = {};
  try { payload = await response.json(); } catch { payload = {}; }
  const header = Number(response.headers?.get?.("retry-after"));
  return { status: response.status, payload, retryAfter: Number.isFinite(header) && header > 0 ? header : undefined };
}

function failureOf(status: number, payload: unknown, retryAfter: number | undefined): Failure {
  const parsed = stepUpErrorResponseSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: status === 401 ? "Sign in to continue." : FALLBACK };
  return { ok: false, error: parsed.data.error, ...(parsed.data.code ? { code: parsed.data.code } : {}), ...(parsed.data.retryAfterSeconds ?? retryAfter ? { retryAfterSeconds: parsed.data.retryAfterSeconds ?? retryAfter } : {}) };
}

export async function sendStepUpCode(email: string, getToken: TokenSource): Promise<StepUpSendResult> {
  const reply = await post(REFERRER_STEP_UP_SEND_PATH, { email }, getToken);
  if ("ok" in reply) return reply;
  if (reply.status !== 200) return failureOf(reply.status, reply.payload, reply.retryAfter);
  const parsed = stepUpSendResponseSchema.safeParse(reply.payload);
  return parsed.success ? { ok: true, challengeId: parsed.data.challengeId, expiresAt: parsed.data.expiresAt } : { ok: false, error: FALLBACK };
}

export async function confirmStepUpCode(challengeId: string, code: string, getToken: TokenSource): Promise<StepUpConfirmResult> {
  const reply = await post(REFERRER_STEP_UP_VERIFY_PATH, { challengeId, code }, getToken);
  if ("ok" in reply) return reply;
  if (reply.status !== 200) return failureOf(reply.status, reply.payload, reply.retryAfter);
  const parsed = stepUpVerifyResponseSchema.safeParse(reply.payload);
  return parsed.success ? { ok: true, expiresAt: parsed.data.expiresAt } : { ok: false, error: FALLBACK };
}

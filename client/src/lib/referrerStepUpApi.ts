// D-057-session-gate (§0b.6): the in-session step-up client and the
// work_email_code_required signal. Contract only in this commit (red first).
type TokenSource = () => Promise<string | null | undefined>;
export type StepUpSendResult = { ok: true; challengeId: string; expiresAt: string } | { ok: false; error: string; code?: string; retryAfterSeconds?: number; offline?: boolean };
export type StepUpConfirmResult = { ok: true; expiresAt: string } | { ok: false; error: string; code?: string; retryAfterSeconds?: number; offline?: boolean };

export function onWorkEmailCodeRequired(_listener: () => void): () => void { return () => undefined; }
export function notifyWorkEmailCodeRequired(): void { /* contract only (red first) */ }
export function isWorkEmailCodeRequired(_status: number, _payload: Record<string, unknown>): boolean { return false; }
export async function sendStepUpCode(_email: string, _getToken: TokenSource): Promise<StepUpSendResult> { return { ok: false, error: "not built" }; }
export async function confirmStepUpCode(_challengeId: string, _code: string, _getToken: TokenSource): Promise<StepUpConfirmResult> { return { ok: false, error: "not built" }; }

import type { z } from "zod";
import {
  PASSWORD_RESET_PATHS, passwordResetConfirmResponseSchema, passwordResetSendResponseSchema, passwordResetStatusResponseSchema,
  type PasswordResetConfirmResponse, type PasswordResetSendResponse, type PasswordResetStatusResponse,
} from "@shared/passwordReset";
import { captureClientError } from "./sentry";

/**
 * Client side of server/passwordResetRoutes.ts. Every answer is parsed against
 * the shared contract; anything else (offline, gateway HTML, an unknown shape)
 * is a `PasswordResetNetworkError` the page renders as a retryable failure.
 */
export class PasswordResetNetworkError extends Error {
  constructor(message = "We couldn't reach SkipWait. Check your connection and try again.") { super(message); this.name = "PasswordResetNetworkError"; }
}

async function post<T>(path: string, body: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new PasswordResetNetworkError();
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { payload = null; }
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  if (response.status >= 500 || response.status === 404) captureClientError(new Error(`Password reset ${response.status}`), { source: "password-reset", path });
  throw new PasswordResetNetworkError();
}

export function sendPasswordReset(email: string): Promise<PasswordResetSendResponse> {
  return post(PASSWORD_RESET_PATHS.send, { email: email.trim() }, passwordResetSendResponseSchema);
}

export function checkPasswordResetLink(token: string): Promise<PasswordResetStatusResponse> {
  return post(PASSWORD_RESET_PATHS.status, { token }, passwordResetStatusResponseSchema);
}

export function confirmPasswordReset(token: string, password: string): Promise<PasswordResetConfirmResponse> {
  return post(PASSWORD_RESET_PATHS.confirm, { token, password }, passwordResetConfirmResponseSchema);
}

/** "Try again in 3 minutes." from a Retry-After in seconds. */
export function retryAfterText(seconds: number): string {
  if (seconds < 60) return `Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
  const minutes = Math.ceil(seconds / 60);
  return `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

const TOKEN_KEY = "skipwait.passwordResetLink";
let memoryToken: string | null = null;

/**
 * Moves the emailed link token out of the address bar (so it never reaches
 * analytics, screenshots or a shared URL) into this tab's session storage, so
 * a reload still works. Returns the token to use, or null when there is none.
 */
export function takeResetLinkToken(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    memoryToken = fromUrl;
    try { window.sessionStorage.setItem(TOKEN_KEY, fromUrl); } catch { /* storage blocked: keep it in memory only */ }
    url.searchParams.delete("token");
    try { window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`); } catch { /* non-browser */ }
    return fromUrl;
  }
  try { return window.sessionStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
}

export function forgetResetLinkToken(): void {
  memoryToken = null;
  try { window.sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

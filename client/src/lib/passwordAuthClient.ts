import type { z } from "zod";
import { PASSWORD_AUTH_COPY, passwordAuthErrorSchema, retryMinutes, type PasswordAuthErrorCode } from "@shared/passwordAuth";

/**
 * Calls /api/auth/password/* and parses every answer with the shared contract (shared/passwordAuth.ts):
 * anything that does not match is an error, never a success, so a page can only navigate to a redirect the
 * contract allows (a same-site app path).
 */
export type PasswordCallResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: PasswordAuthErrorCode | "network"; readonly message: string; readonly retryAfterSeconds?: number };

export const NETWORK_FAILURE_MESSAGE = "We couldn't reach skipwait.me. Check your connection and try again.";

export function rateLimitedMessage(retryAfterSeconds: number | undefined): string {
  const minutes = retryMinutes(retryAfterSeconds);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

const unavailable = { ok: false, code: "temporarily_unavailable", message: PASSWORD_AUTH_COPY.temporarily_unavailable } as const;

export async function postPasswordAuth<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<PasswordCallResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, code: "network", message: NETWORK_FAILURE_MESSAGE };
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const parsed = schema.safeParse(payload);
    return parsed.success ? { ok: true, data: parsed.data } : unavailable;
  }
  const failure = passwordAuthErrorSchema.safeParse(payload);
  if (!failure.success) return unavailable;
  const { code, message, retryAfterSeconds } = failure.data;
  return { ok: false, code, message: code === "rate_limited" ? rateLimitedMessage(retryAfterSeconds) : message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
}

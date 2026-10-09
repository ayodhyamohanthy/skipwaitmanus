import { z } from "zod";
import { readApiJson } from "@/lib/apiResponse";

/** Work-email verification on the live endpoints: send a code, check it for an
 * enrollment receipt, then redeem that receipt so the referrer badge is real. */

export type TokenSource = () => Promise<string | null>;

const UNAVAILABLE = "Work-email verification is unavailable right now";
export const NETWORK_MESSAGE = "We couldn't reach SkipWait. Check your connection and try again.";

const errorPayload = z.object({ error: z.string().optional(), retryAfterSeconds: z.number().optional() });
const sentPayload = z.object({ sent: z.literal(true) });
const verifiedPayload = z.object({ verified: z.literal(true), receipt: z.string().min(1) });
const enrolledPayload = z.object({ verified: z.literal(true), workEmailDomain: z.string().nullish() });

/** status 0 = the request never got a response (offline, DNS, aborted). */
export class VerifyRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "VerifyRequestError";
    this.status = status;
  }
}

async function post(path: string, body: Record<string, string>, getToken: TokenSource, fallback: string): Promise<Record<string, unknown>> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new VerifyRequestError(NETWORK_MESSAGE, 0);
  }
  const payload = await readApiJson<Record<string, unknown>>(response, fallback).catch((reason: unknown) => {
    throw new VerifyRequestError(reason instanceof Error ? reason.message : fallback, response.ok ? 502 : response.status);
  });
  if (!response.ok) {
    const parsed = errorPayload.safeParse(payload);
    const retry = parsed.success ? parsed.data.retryAfterSeconds ?? 0 : 0;
    const message = parsed.success && parsed.data.error ? parsed.data.error : fallback + (retry > 0 ? ` Try again in ${Math.ceil(retry / 60)} minutes.` : "");
    throw new VerifyRequestError(message, response.status);
  }
  return payload;
}

export async function sendWorkEmailCode(email: string, getToken: TokenSource): Promise<void> {
  const payload = await post("/api/work-email/otp/send", { email }, getToken, UNAVAILABLE);
  if (!sentPayload.safeParse(payload).success) throw new VerifyRequestError("We could not send the verification code", 502);
}

/** Resolves the single-use enrollment receipt the server issues for a correct code. */
export async function checkWorkEmailCode(email: string, code: string, getToken: TokenSource): Promise<string> {
  const payload = await post("/api/work-email/otp/verify", { email, code }, getToken, UNAVAILABLE);
  const parsed = verifiedPayload.safeParse(payload);
  if (!parsed.success) throw new VerifyRequestError("We could not verify the code", 502);
  return parsed.data.receipt;
}

/** Redeems the receipt; only this call puts the verified company on the profile. */
export async function enrollWorkEmail(email: string, receipt: string, getToken: TokenSource): Promise<void> {
  const payload = await post("/api/company-referrals/verify-work-email", { email, receipt }, getToken, "We could not confirm this work email");
  if (!enrolledPayload.safeParse(payload).success) throw new VerifyRequestError("We could not confirm this work email", 502);
}

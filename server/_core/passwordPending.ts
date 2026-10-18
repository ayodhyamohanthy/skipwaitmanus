import { createHash, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import { getSessionCookieOptions } from "./cookies";

/**
 * The email-verification step between "password accepted" and "session issued" (D-049). WorkOS's pending
 * token and user id never reach the browser's JavaScript: they ride in an encrypted (A256GCM), HttpOnly,
 * 10-minute cookie scoped to /api/auth/password. Kinds:
 *  - pending: WorkOS answered email_verification_required (finish with authenticateWithEmailVerification);
 *  - user: WorkOS authenticated an unverified email (finish with verifyEmail);
 *  - decoy: sign-up hit an existing account with the wrong password; it looks the same and never verifies.
 * Every ticket is padded to the same length, so the cookie does not reveal which kind it is.
 */
export const PASSWORD_TICKET_COOKIE = "pw_verify";
export const PASSWORD_TICKET_PATH = "/api/auth/password";
export const PASSWORD_TICKET_TTL_MS = 10 * 60_000;
const AUDIENCE = "skipwait-password-verify";
/** Every ticket's JSON is padded to exactly this many bytes (the field bounds below keep it under), so the cookie
 * is always the same length (about 2.8 KB) whatever its kind. */
const SEALED_BYTES = 2048;
/** The longest destination a ticket carries; longer ones fall back to the job search. */
export const PASSWORD_TICKET_RETURN_TO_MAX = 512;

const commonFields = { email: z.string().min(3).max(320), returnTo: z.string().min(1).max(PASSWORD_TICKET_RETURN_TO_MAX), jti: z.string().uuid(), issuedAtMs: z.number().int().positive(), origin: z.enum(["sign_in", "sign_up"]) };
const ticketSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pending"), token: z.string().min(1).max(512), userId: z.string().max(64).optional(), emailVerificationId: z.string().max(64).optional(), ...commonFields }),
  z.object({ kind: z.literal("user"), userId: z.string().min(1).max(64), ...commonFields }),
  z.object({ kind: z.literal("decoy"), ...commonFields }),
]);
export type PasswordTicket = z.infer<typeof ticketSchema>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type PasswordTicketInput = DistributiveOmit<PasswordTicket, "jti" | "issuedAtMs">;

function ticketKey(secret: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`skipwait-password-verify:${secret}`).digest());
}

export async function sealPasswordTicket(input: PasswordTicketInput, secret: string, now: number = Date.now()): Promise<{ readonly value: string; readonly ticket: PasswordTicket }> {
  const issuedAtSeconds = Math.floor(now / 1000);
  const ticket = ticketSchema.parse({ ...input, jti: randomUUID(), issuedAtMs: issuedAtSeconds * 1000 });
  const claims: Record<string, unknown> = { ...ticket, aud: AUDIENCE, iat: issuedAtSeconds, exp: issuedAtSeconds + PASSWORD_TICKET_TTL_MS / 1000 };
  const unpadded = new TextEncoder().encode(JSON.stringify({ ...claims, pad: "" })).length;
  if (unpadded > SEALED_BYTES) throw new Error("PASSWORD_TICKET_TOO_LARGE");
  claims.pad = "x".repeat(SEALED_BYTES - unpadded);
  const value = await new EncryptJWT(claims).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).encrypt(ticketKey(secret));
  return { value, ticket };
}

/** The ticket in this request, or null when it is missing, tampered, expired or malformed. */
export async function openPasswordTicket(req: Request, secret: string): Promise<PasswordTicket | null> {
  const value = cookieValue(req, PASSWORD_TICKET_COOKIE);
  if (!value || value.length > 8192) return null;
  try {
    const { payload } = await jwtDecrypt(value, ticketKey(secret), { audience: AUDIENCE, keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
    const parsed = ticketSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function setPasswordTicketCookie(req: Request, res: Response, value: string): void {
  res.cookie(PASSWORD_TICKET_COOKIE, value, { ...getSessionCookieOptions(req), path: PASSWORD_TICKET_PATH, maxAge: PASSWORD_TICKET_TTL_MS });
}

export function clearPasswordTicketCookie(req: Request, res: Response): void {
  res.clearCookie(PASSWORD_TICKET_COOKIE, { ...getSessionCookieOptions(req), path: PASSWORD_TICKET_PATH });
}

function cookieValue(req: Request, name: string): string | undefined {
  return parseCookieHeader(req.headers.cookie ?? "")[name];
}

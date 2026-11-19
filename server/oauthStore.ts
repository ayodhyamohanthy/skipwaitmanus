import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { oauthAuthCodes, oauthClients } from "../drizzle/schema";
import { getDb } from "./db";

export const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");
export const pkceChallengeFor = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** https only, or http on a loopback host (desktop assistants). No fragments, no credentials. */
export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
}

export type OAuthClient = { clientId: string; clientName: string; redirectUris: string[] };

export async function registerOAuthClient(input: { clientName?: unknown; redirectUris?: unknown }): Promise<OAuthClient> {
  const clientName = typeof input.clientName === "string" ? input.clientName.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  if (!clientName) throw new Error("client_name is required");
  const uris = Array.isArray(input.redirectUris) ? input.redirectUris : [];
  if (uris.length < 1 || uris.length > 5 || !uris.every(isAllowedRedirectUri)) throw new Error("redirect_uris must be 1 to 5 https URLs (or loopback http)");
  const redirectUris = Array.from(new Set(uris as string[]));
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const clientId = `swc_${randomBytes(18).toString("base64url")}`;
  await db.insert(oauthClients).values({ clientId, clientName, redirectUris: JSON.stringify(redirectUris) });
  return { clientId, clientName, redirectUris };
}

export async function getOAuthClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== "string" || !/^swc_[A-Za-z0-9_-]{20,40}$/.test(clientId)) return null;
  const db = await getDb(); if (!db) return null;
  const row = (await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1))[0];
  if (!row) return null;
  try { return { clientId: row.clientId, clientName: row.clientName, redirectUris: JSON.parse(row.redirectUris) as string[] }; } catch { return null; }
}

/** Called only after the signed-in owner pressed Allow. Returns the one-time code. */
export async function issueAuthCode(userId: number, input: { clientId: string; redirectUri: string; codeChallenge: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const code = randomBytes(32).toString("base64url");
  await db.insert(oauthAuthCodes).values({ codeHash: sha256Hex(code), clientId: input.clientId, userId, redirectUri: input.redirectUri, codeChallenge: input.codeChallenge, expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS) });
  return code;
}

/** Single use: the conditional update means a second exchange of the same code finds nothing. */
export async function consumeAuthCode(code: string, input: { clientId: string; redirectUri: string; codeVerifier: string }): Promise<{ userId: number } | null> {
  const db = await getDb(); if (!db) return null;
  const hash = sha256Hex(code);
  const row = (await db.select().from(oauthAuthCodes).where(and(eq(oauthAuthCodes.codeHash, hash), isNull(oauthAuthCodes.usedAt), gt(oauthAuthCodes.expiresAt, new Date()))).limit(1))[0];
  if (!row) return null;
  const claimed = await db.update(oauthAuthCodes).set({ usedAt: new Date() }).where(and(eq(oauthAuthCodes.id, row.id), isNull(oauthAuthCodes.usedAt)));
  if (Number((claimed as unknown as [{ affectedRows?: number }])[0]?.affectedRows) !== 1) return null;
  if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) return null;
  if (pkceChallengeFor(input.codeVerifier) !== row.codeChallenge) return null;
  return { userId: row.userId };
}

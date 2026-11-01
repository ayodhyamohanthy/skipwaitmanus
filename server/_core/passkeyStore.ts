// DEVICE-SIGNIN-passkeys: passkey credential + challenge store.
// Lives beside the routes (not in the shared server/db.ts barrel) so the row
// owns every line it adds; tables come from drizzle/schema.ts directly.
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { passkeyChallenges, passkeyCredentials } from "../../drizzle/schema";
import { getDb } from "../db";

export async function listPasskeyCredentials(openId: string) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select().from(passkeyCredentials).where(eq(passkeyCredentials.openId, openId));
  return rows.map(r => ({ ...r, transports: r.transports ? (r.transports.split(",").filter(Boolean) as string[]) : null }));
}
export async function getPasskeyCredentialByCredentialId(credentialId: string) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(passkeyCredentials).where(eq(passkeyCredentials.credentialId, credentialId)).limit(1);
  const r = rows[0]; if (!r) return null;
  return { ...r, transports: r.transports ? (r.transports.split(",").filter(Boolean) as string[]) : null };
}
export async function insertPasskeyCredential(input: { openId: string; credentialId: string; publicKey: string; counter: number; transports: string | null; deviceName: string | null }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(passkeyCredentials).values(input);
}
export async function bumpPasskeyCounter(id: number, counter: number) {
  const db = await getDb(); if (!db) return;
  await db.update(passkeyCredentials).set({ counter, lastUsedAt: new Date() }).where(eq(passkeyCredentials.id, id));
}
export async function savePasskeyChallenge(openId: string | null, challenge: string, kind: "registration" | "login", expiresAt: Date) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expiresAt, new Date()));
  if (openId) await db.delete(passkeyChallenges).where(and(eq(passkeyChallenges.openId, openId), eq(passkeyChallenges.kind, kind)));
  await db.insert(passkeyChallenges).values({ openId, challenge, kind, expiresAt });
}
export async function consumePasskeyChallenge(openId: string | null, kind: "registration" | "login"): Promise<string | null> {
  const db = await getDb(); if (!db) return null;
  const where = openId
    ? and(eq(passkeyChallenges.openId, openId), eq(passkeyChallenges.kind, kind))
    : and(isNull(passkeyChallenges.openId), eq(passkeyChallenges.kind, kind));
  const rows = await db.select().from(passkeyChallenges).where(where).orderBy(desc(passkeyChallenges.id)).limit(1);
  const row = rows[0]; if (!row) return null;
  await db.delete(passkeyChallenges).where(eq(passkeyChallenges.id, row.id));
  if (row.expiresAt < new Date()) return null;
  return row.challenge;
}

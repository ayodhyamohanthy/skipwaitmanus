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

export async function deletePasskeyCredential(openId: string, credentialId: string): Promise<boolean> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [result] = await db.delete(passkeyCredentials).where(and(eq(passkeyCredentials.openId, openId), eq(passkeyCredentials.credentialId, credentialId)));
  return result.affectedRows === 1;
}

export async function savePasskeyChallenge(openId: string | null, challenge: string, kind: "registration" | "login", expiresAt: Date): Promise<number | undefined> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expiresAt, new Date()));
  if (openId) await db.delete(passkeyChallenges).where(and(eq(passkeyChallenges.openId, openId), eq(passkeyChallenges.kind, kind)));
  const [result] = await db.insert(passkeyChallenges).values({ openId, challenge, kind, expiresAt });
  return (result as { insertId?: number } | undefined)?.insertId ? Number((result as { insertId?: number }).insertId) : undefined;
}

export async function consumePasskeyChallenge(openId: string | null, kind: "registration" | "login", ceremonyId?: number | string | null): Promise<string | null> {
  const db = await getDb(); if (!db) return null;
  const hasId = ceremonyId !== undefined && ceremonyId !== null;
  const idNum = typeof ceremonyId === "number" || (typeof ceremonyId === "string" && /^[1-9]\d*$/.test(ceremonyId)) ? Number(ceremonyId) : null;
  if (hasId && (idNum === null || !Number.isSafeInteger(idNum) || idNum <= 0)) return null;
  // Anonymous login must identify its own ceremony; only authenticated
  // registration may look up the current account's latest challenge.
  if (!hasId && (kind !== "registration" || !openId)) return null;
  const scope = and(
    openId === null ? isNull(passkeyChallenges.openId) : eq(passkeyChallenges.openId, openId),
    eq(passkeyChallenges.kind, kind),
  );
  const where = hasId && idNum !== null ? and(scope, eq(passkeyChallenges.id, idNum)) : scope;
  const rows = await db.select().from(passkeyChallenges).where(where).orderBy(desc(passkeyChallenges.id)).limit(1);
  const row = rows[0]; if (!row) return null;
  // The SELECT supplies the challenge, but only the conditional DELETE winner
  // may use it. Concurrent readers of this same row receive affectedRows=0.
  if (!(await commitPasskeyChallenge(openId, kind, row.id, row.challenge)) || row.expiresAt <= new Date()) return null;
  return row.challenge;
}

/**
 * Login ceremony lookup WITHOUT consuming it (G1, PR #697 review). Ceremony ids
 * are sequential, so a sign-in attempt must not delete a challenge before its
 * assertion verifies: that let any passkey holder cancel other people's
 * sign-ins. The route verifies first, then calls commitPasskeyChallenge.
 */
export async function readPasskeyLoginChallenge(ceremonyId: number): Promise<{ id: number; challenge: string } | null> {
  if (!Number.isSafeInteger(ceremonyId) || ceremonyId <= 0) return null;
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(passkeyChallenges)
    .where(and(isNull(passkeyChallenges.openId), eq(passkeyChallenges.kind, "login"), eq(passkeyChallenges.id, ceremonyId)))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt <= new Date()) return null;
  return { id: row.id, challenge: row.challenge };
}

/**
 * The single-use commit: one conditional DELETE of exactly this row. Only the
 * caller whose DELETE removes it gets true, so a replay or a concurrent second
 * use of the same challenge gets false.
 */
export async function commitPasskeyChallenge(openId: string | null, kind: "registration" | "login", id: number, challenge: string): Promise<boolean> {
  const db = await getDb(); if (!db) return false;
  const scope = and(
    openId === null ? isNull(passkeyChallenges.openId) : eq(passkeyChallenges.openId, openId),
    eq(passkeyChallenges.kind, kind),
  );
  const [result] = await db.delete(passkeyChallenges).where(and(scope, eq(passkeyChallenges.id, id), eq(passkeyChallenges.challenge, challenge)));
  return result.affectedRows === 1;
}

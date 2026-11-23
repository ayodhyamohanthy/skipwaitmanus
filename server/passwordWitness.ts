import { and, eq } from "drizzle-orm";
import { identityLinkAudits, verifiedLoginAliases } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * D-078 ruling 5 (finding S-5, pre-account takeover): a seeker password counts only after whoever set it proved
 * the inbox. Anyone can create a WorkOS user with someone else's address and a password; if that address later
 * becomes verified (a Google sign-in, say), WorkOS may keep the planted password. So a password sign-in needs this
 * witness: a verifiedLoginAliases row with provider "workos_password" and subject = the WorkOS user id, written only
 * when a reset confirm succeeds (the emailed link proves the inbox; a link sign-up is a reset too).
 *  - Same canonical person and account as that WorkOS user's own "workos" alias, read under a row lock; it never
 *    links anything new and refuses to land on anyone else.
 *  - No email (normalizedVerifiedEmail null) and an openId no session is ever issued for, so no other lookup sees it.
 *  - Written once, with an identityLinkAudits row; repeats change nothing. Existing tables, no migration.
 */
export const PASSWORD_WITNESS_PROVIDER = "workos_password";

export type PasswordWitnessStore = {
  has(workosUserId: string): Promise<boolean>;
  record(input: { readonly workosUserId: string }): Promise<void>;
};

const witnessOpenId = (workosUserId: string) => `workospw_${workosUserId}`.slice(0, 64);
const isWitness = (workosUserId: string) => and(eq(verifiedLoginAliases.provider, PASSWORD_WITNESS_PROVIDER), eq(verifiedLoginAliases.subject, workosUserId));

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export const passwordWitnessStore: PasswordWitnessStore = {
  async has(workosUserId) {
    const db = await database();
    const rows = await db.select({ id: verifiedLoginAliases.id }).from(verifiedLoginAliases).where(isWitness(workosUserId)).limit(1);
    return rows.length === 1;
  },

  async record({ workosUserId }) {
    const db = await database();
    await db.transaction(async tx => {
      const owner = (await tx
        .select({ canonicalPersonId: verifiedLoginAliases.canonicalPersonId, canonicalUserId: verifiedLoginAliases.canonicalUserId })
        .from(verifiedLoginAliases)
        .where(and(eq(verifiedLoginAliases.provider, "workos"), eq(verifiedLoginAliases.subject, workosUserId)))
        .limit(1)
        .for("update"))[0];
      if (!owner) throw new Error("PASSWORD_WITNESS_WITHOUT_ACCOUNT");
      const existing = (await tx
        .select({ canonicalPersonId: verifiedLoginAliases.canonicalPersonId, canonicalUserId: verifiedLoginAliases.canonicalUserId })
        .from(verifiedLoginAliases)
        .where(isWitness(workosUserId))
        .limit(1)
        .for("update"))[0];
      if (existing) {
        if (existing.canonicalPersonId !== owner.canonicalPersonId || existing.canonicalUserId !== owner.canonicalUserId) throw new Error("PASSWORD_WITNESS_CONFLICT");
        return;
      }
      await tx.insert(verifiedLoginAliases).values({ provider: PASSWORD_WITNESS_PROVIDER, subject: workosUserId, openId: witnessOpenId(workosUserId), canonicalPersonId: owner.canonicalPersonId, canonicalUserId: owner.canonicalUserId, normalizedVerifiedEmail: null, verifiedAt: new Date() });
      await tx.insert(identityLinkAudits).values({ canonicalPersonId: owner.canonicalPersonId, canonicalUserId: owner.canonicalUserId, provider: PASSWORD_WITNESS_PROVIDER, subject: workosUserId, action: "password_inbox_proven" });
    });
  },
};

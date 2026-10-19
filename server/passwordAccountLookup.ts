import { and, eq, sql } from "drizzle-orm";
import { users, verifiedLoginAliases } from "../drizzle/schema";
import type { PasswordEmailStanding } from "./_core/passwordResponses";
import { isOwnWorkEmailDomain } from "./_core/passwordSession";
import { getDb, getVerifiedWorkEmailAccess, normalizeVerifiedEmail } from "./db";

/**
 * What SkipWait knows about an email before any password step writes, revokes, calls WorkOS or sends an email
 * (D-049, D-078 ruling 3):
 *  - referrer_work_email: a verified referrer's own work email (or a subdomain of it). Referrers never get a
 *    password or a non-code session (D-030, D-049), so sign-up, every reset and every sign-in skip or refuse it.
 *    Found through the account behind any verified alias holding this email, the account behind the WorkOS alias
 *    of the same WorkOS user (when given), or a legacy account row with this email from before canonical identity.
 *  - verified_seeker: a seeker who signed in with an emailed code (a verified email_code alias) and may have no
 *    WorkOS user yet; /forgot creates one without a password so the reset can set it.
 *  - unknown: anything else.
 * Read-only. Only verified aliases count (an unverified email never decides anything), and a missing database
 * throws so every caller fails closed instead of treating a referrer's address as unknown.
 */
const LOOKUP_LIMIT = 20;

export async function passwordEmailStanding(email: string, lookup: { readonly workosUserId?: string } = {}): Promise<PasswordEmailStanding> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const normalized = normalizeVerifiedEmail(email);
  const byEmail = await db
    .select({ provider: verifiedLoginAliases.provider, userId: verifiedLoginAliases.canonicalUserId })
    .from(verifiedLoginAliases)
    .where(eq(verifiedLoginAliases.normalizedVerifiedEmail, normalized))
    .limit(LOOKUP_LIMIT);
  const bySubject = lookup.workosUserId
    ? await db
      .select({ provider: verifiedLoginAliases.provider, userId: verifiedLoginAliases.canonicalUserId })
      .from(verifiedLoginAliases)
      .where(and(eq(verifiedLoginAliases.provider, "workos"), eq(verifiedLoginAliases.subject, lookup.workosUserId)))
      .limit(1)
    : [];
  const legacy = await db
    .select({ userId: users.id })
    .from(users)
    .where(sql`LOWER(TRIM(${users.email})) = ${normalized}`)
    .limit(LOOKUP_LIMIT);
  const candidates = new Set([...byEmail, ...bySubject, ...legacy].map(row => row.userId));
  for (const userId of Array.from(candidates)) {
    const access = await getVerifiedWorkEmailAccess(userId);
    if (isOwnWorkEmailDomain(normalized, access?.workEmailDomain)) return "referrer_work_email";
  }
  return byEmail.some(alias => alias.provider === "email_code") ? "verified_seeker" : "unknown";
}

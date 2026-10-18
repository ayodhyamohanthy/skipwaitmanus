import { eq } from "drizzle-orm";
import { verifiedLoginAliases } from "../drizzle/schema";
import type { PasswordEmailStanding } from "./_core/passwordResponses";
import { isOwnWorkEmailDomain } from "./_core/passwordSession";
import { getDb, getVerifiedWorkEmailAccess, normalizeVerifiedEmail } from "./db";

/**
 * What SkipWait knows about an email before /forgot asks WorkOS for anything (D-049):
 *  - referrer_work_email: a verified referrer's own work email. Referrers never get a password, so no reset.
 *  - verified_seeker: a seeker who signed in with an emailed code (a verified email_code alias) and may have no
 *    WorkOS user yet; /forgot creates one without a password so the WorkOS reset can set it.
 *  - unknown: anything else; /forgot only resets an existing WorkOS user.
 * Read-only, and only verified aliases count (an unverified email never decides anything).
 */
export async function passwordEmailStanding(email: string): Promise<PasswordEmailStanding> {
  const db = await getDb();
  if (!db) return "unknown";
  const normalized = normalizeVerifiedEmail(email);
  const aliases = await db
    .select({ provider: verifiedLoginAliases.provider, userId: verifiedLoginAliases.canonicalUserId })
    .from(verifiedLoginAliases)
    .where(eq(verifiedLoginAliases.normalizedVerifiedEmail, normalized))
    .limit(20);
  for (const userId of Array.from(new Set(aliases.map(alias => alias.userId)))) {
    const access = await getVerifiedWorkEmailAccess(userId);
    if (isOwnWorkEmailDomain(normalized, access?.workEmailDomain)) return "referrer_work_email";
  }
  return aliases.some(alias => alias.provider === "email_code") ? "verified_seeker" : "unknown";
}

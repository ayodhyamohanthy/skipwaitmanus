import { eq } from "drizzle-orm";
import { referrerFastTrackLinks, users, verifiedLoginAliases } from "../drizzle/schema";
import {
  GENERATED_SCREEN_NAME_PREFIX,
  SCREEN_NAME_REFUSALS,
  isIdentifyingScreenName,
  isSafeFastTrackAlias,
  normalizeScreenName,
} from "../shared/requestInboxLink";
import { getDb, getOrCreateReferrerFastTrackLink } from "./db";

/**
 * D-089.server (D-327 §4.3): choose the screen name on the referrer's own link.
 *
 * The name is the link's `vanityAlias` (§4.2), so the impact card (D-106) and the vanity URL use it
 * with no second field and no migration. Uniqueness comes from the unique index, never a pre-read:
 * a duplicate is ER_DUP_ENTRY and becomes 409 `screen_name_taken`. Nothing is ever filled in from
 * the person's name or email; the real-name check only refuses an accidental copy of them.
 */

export type ScreenNameRefusalCode = "screen_name_identifying" | "screen_name_taken" | "screen_name_invalid";

export class ScreenNameRefusedError extends Error {
  readonly code: ScreenNameRefusalCode;
  constructor(code: ScreenNameRefusalCode) {
    super(SCREEN_NAME_REFUSALS[code === "screen_name_identifying" ? "identifying" : code === "screen_name_taken" ? "taken" : "invalid"].error);
    this.name = "ScreenNameRefusedError";
    this.code = code;
  }
}

export type ScreenNameStore = {
  /** `getOrCreateReferrerFastTrackLink`: enforces the verified-employee check and mints a row if needed. */
  ensureLink: (userId: number) => Promise<{ vanityAlias: string; companyDomain: string }>;
  /** The person's own name and verified work email, for the §4.3 real-name check. */
  readIdentity: (userId: number, companyDomain: string) => Promise<{ fullName: string | null; workEmail: string | null }>;
  /** Writes `vanityAlias` for the owner's row. Throws on the unique index (ER_DUP_ENTRY). */
  updateAlias: (userId: number, vanityAlias: string) => Promise<void>;
};

const isDuplicateEntry = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "ER_DUP_ENTRY") return true;
  const message = error instanceof Error ? error.message : "";
  return /duplicate entry/i.test(message);
};

const databaseStore: ScreenNameStore = {
  ensureLink: async userId => {
    const link = await getOrCreateReferrerFastTrackLink(userId);
    return { vanityAlias: link.vanityAlias, companyDomain: link.companyDomain };
  },
  readIdentity: async (userId, companyDomain) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    const aliases = await db.select({ email: verifiedLoginAliases.normalizedVerifiedEmail })
      .from(verifiedLoginAliases).where(eq(verifiedLoginAliases.canonicalUserId, userId));
    const suffix = `@${companyDomain.trim().toLowerCase()}`;
    const workEmail = aliases.map(row => row.email?.trim().toLowerCase() ?? "").find(email => email.endsWith(suffix)) ?? null;
    return { fullName: user?.name ?? null, workEmail };
  },
  updateAlias: async (userId, vanityAlias) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(referrerFastTrackLinks).set({ vanityAlias }).where(eq(referrerFastTrackLinks.referrerId, userId));
  },
};

export type SetScreenNameResult = { vanityAlias: string; renamed: boolean };

/**
 * §4.3: normalize, refuse a generated or unsafe form, refuse the person's own name or email, then
 * write the alias. Returns `renamed` so the route can record it without the name in the metadata.
 */
export async function setReferrerScreenName(
  userId: number,
  input: { screenName: string },
  store: ScreenNameStore = databaseStore,
): Promise<SetScreenNameResult> {
  const normalized = normalizeScreenName(input.screenName);
  if (normalized.startsWith(GENERATED_SCREEN_NAME_PREFIX) || !isSafeFastTrackAlias(normalized)) {
    throw new ScreenNameRefusedError("screen_name_invalid");
  }
  // The verified-employee check and the row itself come from the one existing mint path.
  const link = await store.ensureLink(userId);
  const identity = await store.readIdentity(userId, link.companyDomain);
  if (isIdentifyingScreenName(normalized, identity)) throw new ScreenNameRefusedError("screen_name_identifying");
  const renamed = link.vanityAlias !== normalized;
  if (renamed) {
    try {
      await store.updateAlias(userId, normalized);
    } catch (error) {
      if (isDuplicateEntry(error)) throw new ScreenNameRefusedError("screen_name_taken");
      throw error;
    }
  }
  return { vanityAlias: normalized, renamed };
}

/** The route's own mapping: a refusal is a 422 or 409 with its code, anything else is a 500. */
export function screenNameRefusalStatus(code: ScreenNameRefusalCode): 409 | 422 {
  return code === "screen_name_taken" ? 409 : 422;
}

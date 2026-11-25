import { and, eq } from "drizzle-orm";
import { referrerFastTrackLinks, users, verifiedLoginAliases } from "../drizzle/schema";
import {
  GENERATED_SCREEN_NAME_PREFIX,
  isChosenScreenName,
  isIdentifyingScreenName,
  isSafeFastTrackAlias,
  normalizeScreenName,
  screenNameRefusalFor,
  type ScreenNameRefusalCode,
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

export type { ScreenNameRefusalCode };

export class ScreenNameRefusedError extends Error {
  readonly code: ScreenNameRefusalCode;
  constructor(code: ScreenNameRefusalCode) {
    super(screenNameRefusalFor(code).error);
    this.name = "ScreenNameRefusedError";
    this.code = code;
  }
}

export type ScreenNameStore = {
  /** `getOrCreateReferrerFastTrackLink`: enforces the verified-employee check and mints a row if needed. */
  ensureLink: (userId: number) => Promise<{ vanityAlias: string; companyDomain: string }>;
  /** The person's own name and verified work email, for the §4.3 real-name check. */
  readIdentity: (userId: number, companyDomain: string) => Promise<{ fullName: string | null; workEmail: string | null }>;
  /**
   * Writes `vanityAlias` for the owner's row, only while it still holds `fromAlias` (the generated
   * form read above), so two concurrent sets cannot both replace it. Throws on the unique index
   * (ER_DUP_ENTRY); a lost compare-and-set throws `ScreenNameRefusedError("screen_name_locked")`.
   */
  updateAlias: (userId: number, fromAlias: string, vanityAlias: string) => Promise<void>;
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
  updateAlias: async (userId, fromAlias, vanityAlias) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.update(referrerFastTrackLinks).set({ vanityAlias })
      .where(and(eq(referrerFastTrackLinks.referrerId, userId), eq(referrerFastTrackLinks.vanityAlias, fromAlias)));
    if (Number(result[0]?.affectedRows ?? 0) !== 1) throw new ScreenNameRefusedError("screen_name_locked");
  },
};

export type SetScreenNameResult = { vanityAlias: string; renamed: boolean };

/**
 * §4.3: normalize, refuse a generated or unsafe form, refuse the person's own name or email, then
 * write the alias. Returns `renamed` so the route can record it without the name in the metadata.
 *
 * D-398 (§4.4, T9): a chosen name is set once. Asking for the same name again is a no-op; asking for
 * a different one is refused with `screen_name_locked`, so a link already shared under the chosen
 * name reaches its person or nobody (never a colleague who took a freed name). The generated `ref-`
 * form can be replaced because nobody can ever choose a `ref-` name.
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
  if (link.vanityAlias === normalized) return { vanityAlias: normalized, renamed: false };
  if (isChosenScreenName(link.vanityAlias)) throw new ScreenNameRefusedError("screen_name_locked");
  const identity = await store.readIdentity(userId, link.companyDomain);
  if (isIdentifyingScreenName(normalized, identity)) throw new ScreenNameRefusedError("screen_name_identifying");
  try {
    await store.updateAlias(userId, link.vanityAlias, normalized);
  } catch (error) {
    if (isDuplicateEntry(error)) throw new ScreenNameRefusedError("screen_name_taken");
    throw error;
  }
  return { vanityAlias: normalized, renamed: true };
}

/** The route's own mapping: a refusal is a 422 or 409 with its code, anything else is a 500. */
export function screenNameRefusalStatus(code: ScreenNameRefusalCode): 409 | 422 {
  return code === "screen_name_taken" || code === "screen_name_locked" ? 409 : 422;
}

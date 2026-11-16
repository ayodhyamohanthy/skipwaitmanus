import { eq, sql } from "drizzle-orm";
import { accountPreferences, users } from "../drizzle/schema";
import { LANGUAGE_CAPTURE_ENABLED, isVisibleLanguage, type LanguageCode, type SignupLanguage } from "../shared/languages";
import { getDb } from "./db";

// D-093.capture §5.1 step 3. The capture switch starts false; nothing is
// written and no signup value is ever returned by any endpoint. The gateway is
// injectable so the write-once/24-hour rules can be proved without a database.
export type SignupAccountState = { signupLanguage: string | null; createdAt: Date };

export type AccountLanguageGateway = {
  enabled: boolean;
  accountState(userId: number): Promise<SignupAccountState | undefined>;
  writeSignupLanguage(userId: number, value: SignupLanguage): Promise<void>;
  readLanguage(userId: number): Promise<string | null>;
  writeLanguage(userId: number, value: LanguageCode | null): Promise<void>;
};

const SIGNUP_WINDOW_MS = 24 * 60 * 60 * 1000;

async function dbAccountState(userId: number): Promise<SignupAccountState | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({
    signupLanguage: accountPreferences.signupLanguage,
    createdAt: users.createdAt,
  }).from(users)
    .leftJoin(accountPreferences, eq(accountPreferences.userId, users.id))
    .where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  return row ? { signupLanguage: row.signupLanguage ?? null, createdAt: row.createdAt } : undefined;
}

async function dbWriteSignupLanguage(userId: number, value: SignupLanguage): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // One guarded upsert. COALESCE keeps an existing value even if two requests
  // race past the read above, so a signup value is written at most once.
  await db.insert(accountPreferences)
    .values({ userId, signupLanguage: value })
    .onDuplicateKeyUpdate({ set: { signupLanguage: sql`COALESCE(${accountPreferences.signupLanguage}, ${value})` } });
}

async function dbReadLanguage(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ language: accountPreferences.language })
    .from(accountPreferences).where(eq(accountPreferences.userId, userId)).limit(1);
  return rows[0]?.language ?? null;
}

async function dbWriteLanguage(userId: number, value: LanguageCode | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(accountPreferences)
    .values({ userId, language: value })
    .onDuplicateKeyUpdate({ set: { language: value } });
}

export const productionGateway: AccountLanguageGateway = {
  enabled: LANGUAGE_CAPTURE_ENABLED,
  accountState: dbAccountState,
  writeSignupLanguage: dbWriteSignupLanguage,
  readLanguage: dbReadLanguage,
  writeLanguage: dbWriteLanguage,
};

/** The chosen language is a setting, visible only when reviewed. */
export async function getAccountLanguage(userId: number, gateway: AccountLanguageGateway = productionGateway): Promise<LanguageCode | null> {
  const stored = await gateway.readLanguage(userId);
  return isVisibleLanguage(stored) ? stored : null;
}

export async function saveAccountLanguage(userId: number, code: LanguageCode | null, gateway: AccountLanguageGateway = productionGateway): Promise<void> {
  if (code !== null && !isVisibleLanguage(code)) throw new Error("Choose a language we offer");
  await gateway.writeLanguage(userId, code);
}

/**
 * Writes the signup language once, only inside the first 24 hours, only when
 * the switch is on and only when the account has no value yet. Returns whether
 * it wrote; callers must not turn that into an oracle for the account's age.
 */
export async function recordSignupLanguage(
  userId: number,
  value: SignupLanguage | null,
  now: Date,
  gateway: AccountLanguageGateway = productionGateway,
): Promise<boolean> {
  if (!gateway.enabled || value === null) return false;
  const state = await gateway.accountState(userId);
  if (!state || state.signupLanguage != null) return false;
  const age = now.getTime() - state.createdAt.getTime();
  if (!(age >= 0 && age < SIGNUP_WINDOW_MS)) return false;
  await gateway.writeSignupLanguage(userId, value);
  return true;
}

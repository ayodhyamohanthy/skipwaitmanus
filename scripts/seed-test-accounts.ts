/**
 * QA test-account seeder. Test gateway only — never point this at production
 * billing. Real-money QA is prohibited; test payments run against the
 * Chargebee TEST site (see docs/QA_PAYMENTS.md).
 *
 * Usage:
 *   DATABASE_URL='mysql://...' JWT_SECRET='...' VITE_APP_ID=skipwait \
 *     pnpm tsx scripts/seed-test-accounts.ts [--reset]
 *
 * Creates (idempotently, fixed openIds) one seeker, one referrer and one
 * admin, each clearly marked loginMethod=test_seed. Prints fresh
 * app_session_id cookies (30-minute TTL — re-run to rotate).
 */
import { eq } from "drizzle-orm";
import { profiles, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { sdk } from "../server/_core/sdk";

export type SeedAccount = {
  openId: string;
  name: string;
  email: string;
  role: "user" | "admin";
  profile: {
    accountType: "job_seeker" | "referrer";
    headline?: string;
    location?: string;
    company?: string;
    workEmailDomain?: string;
    workEmailVerifiedAt?: Date;
    isOnboarded: boolean;
  } | null;
};

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    openId: "test_seeker_qa",
    name: "QA Seeker",
    email: "qa.seeker@example.com",
    role: "user",
    profile: { accountType: "job_seeker", headline: "QA product designer", location: "Remote", isOnboarded: true },
  },
  {
    openId: "test_referrer_qa",
    name: "QA Referrer",
    email: "qa.referrer@acme.example",
    role: "user",
    profile: { accountType: "referrer", company: "acme.example", workEmailDomain: "acme.example", workEmailVerifiedAt: new Date(), isOnboarded: true },
  },
  {
    openId: "test_admin_qa",
    name: "QA Admin",
    email: "qa.admin@example.com",
    role: "admin",
    profile: null,
  },
];

type SeedDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type SeedDeps = {
  db: SeedDb;
  createSessionToken: typeof sdk.createSessionToken;
  log?: (message: string) => void;
};

export async function seedTestAccounts(deps: SeedDeps, options: { reset?: boolean } = {}): Promise<Array<{ name: string; email: string; userId: number; openId: string; cookie: string }>> {
  const { db, createSessionToken, log = console.log } = deps;
  const seeded = [];
  for (const account of SEED_ACCOUNTS) {
    if (options.reset) await db.delete(users).where(eq(users.openId, account.openId));
    const existing = (await db.select({ id: users.id }).from(users).where(eq(users.openId, account.openId)).limit(1))[0] as { id: number } | undefined;
    let userId: number;
    if (existing) {
      userId = existing.id;
    } else {
      const inserted = await db.insert(users).values({
        openId: account.openId, name: account.name, email: account.email,
        loginMethod: "test_seed", role: account.role, lastSignedIn: new Date(),
      });
      userId = Number(inserted[0].insertId);
    }
    if (account.profile) {
      await db.insert(profiles).values({ userId, ...account.profile }).onDuplicateKeyUpdate({ set: { ...account.profile } });
    }
    const token = await createSessionToken(account.openId, { name: account.name });
    log(`--- ${account.name} (${account.email}) ---`);
    log(`userId=${userId} openId=${account.openId}`);
    log(`cookie: app_session_id=${token}`);
    seeded.push({ name: account.name, email: account.email, userId, openId: account.openId, cookie: token });
  }
  log("\nCookies expire in 30 minutes. Re-run to rotate. See docs/QA_PAYMENTS.md for the payment loop.");
  return seeded;
}

async function main() {
  const reset = process.argv.includes("--reset");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required (local or staging database — never production billing data)");
  if (!process.env.JWT_SECRET || !process.env.VITE_APP_ID) throw new Error("JWT_SECRET and VITE_APP_ID are required to mint session cookies");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable — check DATABASE_URL");
  await seedTestAccounts({ db, createSessionToken: (openId, options) => sdk.createSessionToken(openId, options) }, { reset });
}

if (process.argv[1]?.endsWith("seed-test-accounts.ts")) {
  main().catch(error => {
    console.error("seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

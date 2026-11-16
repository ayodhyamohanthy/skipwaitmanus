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
 *
 * Local e2e harness only (NODE_ENV=test and a localhost DATABASE_URL, which is
 * how scripts/e2e-server.mjs runs it): the seeded referrer's printed session
 * then also confirms its work email through the real step-up handlers
 * (POST /api/referrer/step-up/send, then /verify; D-057 §0b.8a), with the code
 * captured in this process instead of a provider call. The account stays a
 * test_seed account; nothing here signs in, relabels, links or merges it.
 */
import { parse as parseCookieHeader } from "cookie";
import { eq } from "drizzle-orm";
import express from "express";
import type { AddressInfo } from "node:net";
import { COOKIE_NAME } from "@shared/const";
import { profiles, users } from "../drizzle/schema";
import { getDb, recordOperationalActivity } from "../server/db";
import { sdk } from "../server/_core/sdk";
import { resolveDevIdentity } from "../server/_core/devAuth";
import { registerReferrerStepUpRoutes, type ReferrerStepUpRouteDeps } from "../server/referrerStepUpRoutes";
import { REFERRER_STEP_UP_SEND_PATH, REFERRER_STEP_UP_VERIFY_PATH } from "../shared/referrerStepUp";

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

export type SeededAccount = { name: string; email: string; userId: number; openId: string; cookie: string };

export async function seedTestAccounts(deps: SeedDeps, options: { reset?: boolean; afterSeed?: (seeded: SeededAccount[]) => Promise<void> } = {}): Promise<SeededAccount[]> {
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
  // Before the closing line: scripts/e2e-server.mjs stops this process as soon as it reads it.
  if (options.afterSeed) await options.afterSeed(seeded);
  log("\nCookies expire in 30 minutes. Re-run to rotate. See docs/QA_PAYMENTS.md for the payment loop.");
  return seeded;
}

/** The local e2e harness: NODE_ENV=test and a localhost database (scripts/e2e-server.mjs refuses any other host). */
export function isLocalSeedHarness(env: Record<string, string | undefined>): boolean {
  if (env.NODE_ENV !== "test" || !env.DATABASE_URL) return false;
  try { return ["127.0.0.1", "localhost"].includes(new URL(env.DATABASE_URL).hostname); } catch { return false; }
}

export type SeededStepUpDeps = Omit<ReferrerStepUpRouteDeps, "sendCode">;

/**
 * D-057 §0b.8a: confirms the seeded referrer's work email inside its own seeded
 * session through the real step-up handlers, mounted on a loopback-only server
 * in this process. Delivery goes to an in-process outbox (the handlers' own
 * sendCode dependency), never a provider. The proof it leaves is the ordinary
 * account- and session-bound one a person gets; any refusal stops the seed.
 */
export async function stepUpSeededReferrer(input: { cookie: string; email: string }, deps: SeededStepUpDeps, log: (message: string) => void = console.log): Promise<{ deliveredTo: string; expiresAt: string }> {
  const outbox: Array<{ to: string; code: string }> = [];
  const app = express();
  app.use(express.json());
  registerReferrerStepUpRoutes(app, { ...deps, sendCode: async ({ to, code }) => { outbox.push({ to, code }); return { sent: true, reason: "sent" }; } });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)).on("error", reject); });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { "content-type": "application/json", cookie: `${COOKIE_NAME}=${input.cookie}` };
    const post = async (path: string, body: object) => {
      const response = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      return { response, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
    };
    const sent = await post(REFERRER_STEP_UP_SEND_PATH, { email: input.email });
    if (!sent.response.ok || typeof sent.body.challengeId !== "string") throw new Error(`step-up send answered ${sent.response.status} ${String(sent.body.code ?? sent.body.error ?? "")}`.trim());
    // A re-signed cookie would be a different credential from the one the journeys use.
    const renewed = sent.response.headers.get("set-cookie");
    if (renewed && parseCookieHeader(renewed)[COOKIE_NAME]) throw new Error("step-up send re-signed the seeded session; the seeded cookie must already carry its session key");
    const mail = outbox.filter(message => message.to === input.email);
    if (outbox.length !== 1 || mail.length !== 1) throw new Error(`expected one captured code for ${input.email}, captured ${outbox.length}`);
    const verified = await post(REFERRER_STEP_UP_VERIFY_PATH, { challengeId: sent.body.challengeId, code: mail[0].code });
    if (!verified.response.ok || verified.body.verified !== true || typeof verified.body.expiresAt !== "string") throw new Error(`step-up verify answered ${verified.response.status} ${String(verified.body.code ?? verified.body.error ?? "")}`.trim());
    log(`step-up: ${input.email} confirmed in its seeded session (proof until ${verified.body.expiresAt})`);
    return { deliveredTo: mail[0].to, expiresAt: verified.body.expiresAt };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function main() {
  const reset = process.argv.includes("--reset");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required (local or staging database — never production billing data)");
  if (!process.env.JWT_SECRET || !process.env.VITE_APP_ID) throw new Error("JWT_SECRET and VITE_APP_ID are required to mint session cookies");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable — check DATABASE_URL");
  const afterSeed = isLocalSeedHarness(process.env) ? async (seeded: SeededAccount[]) => {
    const referrer = seeded.find(account => account.openId === "test_referrer_qa");
    if (!referrer) throw new Error("the seeded referrer is missing");
    // The e2e server's own resolver (no WorkOS keys there): the identity and session key come from the verified cookie.
    await stepUpSeededReferrer({ cookie: referrer.cookie, email: referrer.email }, {
      resolveIdentity: async req => { const identity = await resolveDevIdentity(req); return identity ? { account: identity.account, ...(identity.sessionAmr ? { sessionAmr: identity.sessionAmr } : {}), ...(identity.sessionKey ? { sessionKey: identity.sessionKey } : {}) } : undefined; },
      recordActivity: async entry => { await recordOperationalActivity(entry); },
    });
  } : undefined;
  await seedTestAccounts({ db, createSessionToken: (openId, options) => sdk.createSessionToken(openId, options) }, { reset, afterSeed });
}

if (process.argv[1]?.endsWith("seed-test-accounts.ts")) {
  main().catch(error => {
    console.error("seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

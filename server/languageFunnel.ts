import { and, count, eq, gte, isNotNull, lt } from "drizzle-orm";
import type { Express, Request } from "express";
import { accountPreferences, referralRequests, users } from "../drizzle/schema";
import { LANGUAGE_CAPTURE_ENABLED, LANGUAGES, visibleLanguages } from "../shared/languages";
import { getDb } from "./db";

/*
 * D-093.metrics §5.2. The admin language funnel: who signs up in which
 * language and who reaches a first referral request. Aggregate only — no user
 * ids, emails or dates per person leave this handler, and the numbers are
 * never committed. The switch starts off (LANGUAGE_CAPTURE_ENABLED = false);
 * while it is off the route answers 404 as if it does not exist. Chosen is a
 * current-state count (accountPreferences carries no chosen-at), so it is not
 * windowed; windows cover created-account counts and their first requests.
 */

const DAY_MS = 86_400_000;
const SIGNUP_CODES = [...LANGUAGES.map(entry => entry.code), "other"] as const;
type SignupCode = (typeof SIGNUP_CODES)[number];
type WindowKey = "7d" | "30d" | "all";
type SignupCell = Record<SignupCode, { signups: number; firstRequest: number }>;

const emptyWindow = (): SignupCell =>
  Object.fromEntries(SIGNUP_CODES.map(code => [code, { signups: 0, firstRequest: 0 }])) as SignupCell;

export type LanguageFunnelDeps = {
  resolveIdentity: (req: Request) => Promise<{ account: { id: number; role?: string } } | undefined>;
  /** Capture switch; defaults to the shared constant so tests can flip it. */
  enabled?: () => boolean;
  now?: () => Date;
  /** Database reader; defaults to the app's cached getDb (injectable so tests can force the unavailable path). */
  getDb?: typeof getDb;
};

export function registerLanguageFunnelRoutes(app: Express, deps: LanguageFunnelDeps): void {
  const enabled = deps.enabled ?? (() => LANGUAGE_CAPTURE_ENABLED);
  const now = deps.now ?? (() => new Date());
  const readDb = deps.getDb ?? getDb;

  app.get("/api/admin/language-funnel", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!enabled()) return res.status(404).json({ error: "Not found" });
    const identity = await deps.resolveIdentity(req).catch(() => undefined);
    if (!identity) return res.status(401).json({ error: "Sign in to view this page" });
    if (identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });

    const until = now();
    const windows: Record<WindowKey, SignupCell> = { "7d": emptyWindow(), "30d": emptyWindow(), all: emptyWindow() };
    try {
      const db = await readDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      // "all" is intentionally unbounded: no capture era exists before the
      // first recorded signup language, so dropping the lower bound is exactly
      // "since the first recorded signup language".
      const windowSpecs: ReadonlyArray<readonly [WindowKey, Date | undefined]> = [
        ["7d", new Date(until.getTime() - 7 * DAY_MS)],
        ["30d", new Date(until.getTime() - 30 * DAY_MS)],
        ["all", undefined],
      ];

      for (const [key, since] of windowSpecs) {
        const createdIn = and(isNotNull(accountPreferences.signupLanguage), since ? gte(users.createdAt, since) : undefined, lt(users.createdAt, until));
        const signups = await db
          .select({ signupLanguage: accountPreferences.signupLanguage, signups: count() })
          .from(users)
          .innerJoin(accountPreferences, eq(accountPreferences.userId, users.id))
          .where(createdIn)
          .groupBy(accountPreferences.signupLanguage);
        for (const row of signups) {
          const code = String(row.signupLanguage ?? "") as SignupCode;
          if (code in windows[key]) windows[key][code].signups = Number(row.signups);
        }
        // A first request counts whenever the account was created inside the
        // window, regardless of the request's own time; ids are dropped in JS.
        const firsts = await db
          .select({ signupLanguage: accountPreferences.signupLanguage, jobSeekerId: referralRequests.jobSeekerId })
          .from(referralRequests)
          .innerJoin(users, eq(users.id, referralRequests.jobSeekerId))
          .innerJoin(accountPreferences, eq(accountPreferences.userId, users.id))
          .where(createdIn);
        const perLanguage = new Map<string, Set<number>>();
        for (const row of firsts) {
          const code = String(row.signupLanguage ?? "");
          const jobSeekerId = Number(row.jobSeekerId);
          if (!(code in windows[key]) || !Number.isInteger(jobSeekerId)) continue;
          let bucket = perLanguage.get(code);
          if (!bucket) { bucket = new Set(); perLanguage.set(code, bucket); }
          bucket.add(jobSeekerId);
        }
        perLanguage.forEach((bucket, code) => { windows[key][code as SignupCode].firstRequest = bucket.size; });
      }

      const chosenRows = await db
        .select({ language: accountPreferences.language, chosen: count() })
        .from(accountPreferences)
        .where(isNotNull(accountPreferences.language))
        .groupBy(accountPreferences.language);
      const visible = new Set(visibleLanguages().map(entry => entry.code as string));
      const chosen: Record<string, number> = {};
      for (const row of chosenRows) {
        const code = String(row.language ?? "");
        if (visible.has(code)) chosen[code] = Number(row.chosen);
      }

      res.json({ generatedAt: until.toISOString(), captureEnabled: true, windows, chosen });
    } catch (error) {
      console.error("[language-funnel] query failed", error instanceof Error ? error.name : "unknown");
      res.status(500).json({ error: "Language funnel query failed" });
    }
  });
}

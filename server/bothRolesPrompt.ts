// MOBILE-both-prompt (D-414 (2), packet docs/plans/MOBILE-app-flow.md): the one account read the "Where do you work
// now?" sheet needs. GET /api/account/both-roles-prompt?requestId=<the request just sent> answers { show }.
//
// No new state and no migration: the answer is derived from what the account already stores. "The person" is the
// whole canonical person (every users row sharing canonicalPersonId, read through the own-employer guard's store),
// so a linked login (D-057) sees the same answer. The sheet shows only when the request just sent is the person's
// first request ever and no row of the person holds a verified work email (profiles.workEmailVerifiedAt). A later
// request, a "Not now" or a verification therefore never brings it back. Reads only; it never writes, verifies,
// signs in or links anyone (the sheet's code steps are the existing /api/work-email/otp/* routes).
import type { Express, Request } from "express";
import { asc, inArray } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { BOTH_ROLES_PROMPT, BOTH_ROLES_PROMPT_PATH, bothRolesPromptQuerySchema, shouldShowBothRolesPrompt } from "../shared/bothRolesPrompt";
import { drizzleOwnEmployerStore, type OwnEmployerDb } from "./ownEmployerGuard";
import { captureServerError } from "./sentry";

/** Plain reads; the decision is shouldShowBothRolesPrompt (shared/bothRolesPrompt.ts). */
export type BothRolesPromptStore = {
  /** The account's own row and every row of the same canonical person. */
  personUserIds(userId: number): Promise<readonly number[]>;
  /** True when any of these rows holds a verified work email. */
  hasVerifiedWorkEmail(userIds: readonly number[]): Promise<boolean>;
  /** The first two requests these rows created, oldest first (two is enough to know "not the first"). */
  firstRequestIds(userIds: readonly number[]): Promise<readonly number[]>;
};

/** The store's own query as an unexecuted drizzle builder, so a contract test can read its SQL with .toSQL(). */
export function bothRolesPromptQueries(db: OwnEmployerDb) {
  return {
    firstRequests: (userIds: readonly number[]) => db.select({ id: referralRequests.id }).from(referralRequests)
      .where(inArray(referralRequests.jobSeekerId, [...userIds])).orderBy(asc(referralRequests.id)).limit(2),
  };
}

export function drizzleBothRolesPromptStore(db: OwnEmployerDb): BothRolesPromptStore {
  const person = drizzleOwnEmployerStore(db);
  const q = bothRolesPromptQueries(db);
  return {
    personUserIds: userId => person.personUserIds(userId),
    async hasVerifiedWorkEmail(userIds) {
      const rows = await person.verifiedWorkEmails(userIds);
      return rows.some(row => row.workEmailVerifiedAt !== null && Boolean(row.workEmailDomain));
    },
    async firstRequestIds(userIds) {
      if (userIds.length === 0) return [];
      return (await q.firstRequests(userIds)).map(row => row.id);
    },
  };
}

/** True when the sheet should open now for this account and the request it just sent. */
export async function bothRolesPromptFor(store: BothRolesPromptStore, input: { userId: number; requestId: number }): Promise<boolean> {
  const userIds = await store.personUserIds(input.userId);
  const firstRequestIds = await store.firstRequestIds(userIds);
  // The cheap check first: anyone past their first request never needs the verification read.
  if (firstRequestIds.length !== 1 || firstRequestIds[0] !== input.requestId) return false;
  return shouldShowBothRolesPrompt({ requestId: input.requestId, firstRequestIds, hasVerifiedWorkEmail: await store.hasVerifiedWorkEmail(userIds) });
}

export type BothRolesPromptRouteDeps = {
  resolveIdentity(req: Request): Promise<{ account: { id: number } } | undefined>;
  enabled?: () => boolean;
  /** Defaults to the drizzle store on the pool; tests inject an in-memory one. */
  store?: () => Promise<BothRolesPromptStore | null>;
};

async function defaultStore(): Promise<BothRolesPromptStore | null> {
  const { getDb } = await import("./db");
  const db = await getDb();
  return db ? drizzleBothRolesPromptStore(db) : null;
}

export function registerBothRolesPromptRoutes(app: Express, deps: BothRolesPromptRouteDeps): void {
  const enabled = deps.enabled ?? (() => BOTH_ROLES_PROMPT);
  const loadStore = deps.store ?? defaultStore;
  app.get(BOTH_ROLES_PROMPT_PATH, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    // Off: the route does not exist yet, before identity or any read.
    if (!enabled()) return res.status(404).json({ error: "Not found" });
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to continue" });
      const query = bothRolesPromptQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: "Send the request you just sent" });
      const store = await loadStore();
      if (!store) return res.status(503).json({ error: "This is unavailable right now" });
      return res.json({ show: await bothRolesPromptFor(store, { userId: identity.account.id, requestId: query.data.requestId }) });
    } catch (error) {
      captureServerError(error, { area: "both_roles_prompt" });
      return res.status(500).json({ error: "This is unavailable right now" });
    }
  });
}

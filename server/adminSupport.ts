// ADMIN-support-view (D-393): assembles one person's support view for /admin/users/:id/support — identity,
// wallet and keyed ledger, checkout intents, their referral requests with the reason each waits or failed,
// the referrer side, blocks and their last 90 days of activity — plus the trouble signals on /admin.
// Every read is scoped to the one account the admin opened: MySQL has no row-level security, so each query
// carries its own ownership predicate. Nothing here writes, impersonates or edits a person's data.
import { and, count, desc, eq, gte, inArray, like, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  canonicalPeople, jobs, operationalActivityLogs, profiles, referralRequests, referralReviewDeliveries,
  referralTransitionEvents, subscriptionCheckoutIntents, tokenBalances, tokenTransactions, userBlocks, users,
  verifiedLoginAliases,
} from "../drizzle/schema";
import {
  SUPPORT_ACTIVITY_DAYS, SUPPORT_ACTIVITY_LIMIT, SUPPORT_LEDGER_LIMIT, SUPPORT_REQUEST_LIMIT,
  SUPPORT_SIGNAL_WINDOWS, SUPPORT_SIGNAL_WINDOW_HOURS, SUPPORT_TIMELINE_LIMIT,
  sandboxAskTarget, supportCauseOf, supportRequestStateOf,
  type SupportAccount, type SupportActivityRow, type SupportBlock, type SupportCheckoutIntent,
  type SupportReferrer, type SupportRequest, type SupportSignalCount, type SupportSignalWindow,
  type SupportSignalWindowCounts, type SupportSignals, type SupportTimelineRow, type SupportView,
  type SupportWallet,
} from "../shared/adminSupport";

/** The reads the view is assembled from, injected so the assembly is testable without a database. */
export type SupportReaders = {
  account: (userId: number) => Promise<SupportAccount | null>;
  wallet: (userId: number) => Promise<SupportWallet | null>;
  checkoutIntents: (userId: number) => Promise<SupportCheckoutIntent[]>;
  referrer: (userId: number) => Promise<SupportReferrer | null>;
  blocks: (userId: number) => Promise<SupportBlock[]>;
  requests: (userId: number) => Promise<SupportRequest[]>;
  activity: (userId: number, since: Date, limit: number) => Promise<SupportActivityRow[]>;
  signals: (window: SupportSignalWindow, since: Date) => Promise<SupportSignalWindowCounts>;
};

const DAY_MS = 86_400_000;
const EMPTY_SIGNAL_WINDOW: SupportSignalWindowCounts = { signInFailures: [], sendRefusals: [], checkoutRefusals: [], heldRequests: 0, reviewEmailFailures: 0, clientErrors: 0 };
const iso = (value: Date | string | null | undefined): string | null => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString() : value);

/** The newest failures with their plain-words cause; a row we cannot explain keeps its action and no cause. */
export function newestFailuresOf(rows: readonly SupportActivityRow[]) {
  return rows.filter(row => row.outcome !== "success").slice(0, 10).map(row => ({ ...row, cause: supportCauseOf(row.action, row.outcome) }));
}

/** The whole view for one account, or null when the account does not exist. */
export async function buildSupportView(readers: SupportReaders, userId: number, nowMs = Date.now()): Promise<SupportView | null> {
  const account = await readers.account(userId);
  if (!account) return null;
  const since = new Date(nowMs - SUPPORT_ACTIVITY_DAYS * DAY_MS);
  const [wallet, checkoutIntents, referrer, blocks, requests, activity] = await Promise.all([
    readers.wallet(userId),
    readers.checkoutIntents(userId),
    readers.referrer(userId),
    readers.blocks(userId),
    readers.requests(userId),
    readers.activity(userId, since, SUPPORT_ACTIVITY_LIMIT),
  ]);
  return { account, wallet, checkoutIntents, referrer, blocks, requests, activity, newestFailures: newestFailuresOf(activity) };
}

/** Both trouble-signal windows, each counted from the activity log and the review-delivery table. */
export async function buildSupportSignals(readers: Pick<SupportReaders, "signals">, nowMs = Date.now()): Promise<SupportSignals> {
  const windows: Partial<Record<SupportSignalWindow, SupportSignalWindowCounts>> = {};
  for (const window of SUPPORT_SIGNAL_WINDOWS) {
    const since = new Date(nowMs - SUPPORT_SIGNAL_WINDOW_HOURS[window] * 3_600_000);
    windows[window] = await readers.signals(window, since);
  }
  return { windows: { "24h": windows["24h"] ?? EMPTY_SIGNAL_WINDOW, "7d": windows["7d"] ?? EMPTY_SIGNAL_WINDOW } };
}

// ---------- the database readers ----------

const reasonOf = (metadata: string | null): string | null => {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed !== "object" || parsed === null) return null;
    const reason = (parsed as Record<string, unknown>).reason;
    return typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 80) : null;
  } catch { return null; }
};

/** Group counted rows into `{ reason, count }`, largest first, at most `limit` reasons. */
function byReason(rows: ReadonlyArray<{ action: string; metadata: string | null; total: number }>, limit = 8): SupportSignalCount[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const reason = reasonOf(row.metadata) ?? row.action;
    totals.set(reason, (totals.get(reason) ?? 0) + row.total);
  }
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([reason, total]) => ({ reason, count: total }));
}

async function counted(where: ReturnType<typeof and>) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ action: operationalActivityLogs.action, metadata: operationalActivityLogs.metadata, total: count() })
    .from(operationalActivityLogs).where(where).groupBy(operationalActivityLogs.action, operationalActivityLogs.metadata);
  return rows.map(row => ({ action: row.action, metadata: row.metadata, total: Number(row.total) }));
}

export const databaseReaders: SupportReaders = {
  async account(userId) {
    const db = await getDb(); if (!db) return null;
    const row = (await db.select({
      id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt,
      suspended: users.suspended, canonicalPersonId: users.canonicalPersonId,
      accountType: profiles.accountType, company: profiles.company,
      workEmailVerifiedAt: profiles.workEmailVerifiedAt, workEmailDomain: profiles.workEmailDomain,
    }).from(users).leftJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, userId)).limit(1))[0];
    if (!row) return null;
    const aliases = await db.select({ provider: verifiedLoginAliases.provider, email: verifiedLoginAliases.normalizedVerifiedEmail, verifiedAt: verifiedLoginAliases.verifiedAt })
      .from(verifiedLoginAliases).where(eq(verifiedLoginAliases.canonicalUserId, userId)).orderBy(desc(verifiedLoginAliases.verifiedAt)).limit(20);
    const person = row.canonicalPersonId
      ? (await db.select({ suspended: canonicalPeople.suspended }).from(canonicalPeople).where(eq(canonicalPeople.id, row.canonicalPersonId)).limit(1))[0]
      : undefined;
    return {
      id: row.id, email: row.email, name: row.name, role: row.role, accountType: row.accountType, company: row.company,
      createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
      suspended: Boolean(row.suspended) || Boolean(person?.suspended),
      canonicalPersonId: row.canonicalPersonId, workEmailVerifiedAt: iso(row.workEmailVerifiedAt), workEmailDomain: row.workEmailDomain,
      signInMethods: Array.from(new Set(aliases.map(alias => alias.provider))),
      aliases: aliases.map(alias => ({ provider: alias.provider, email: alias.email, verifiedAt: iso(alias.verifiedAt) })),
    };
  },

  async wallet(userId) {
    const db = await getDb(); if (!db) return null;
    const rows = await db.select().from(tokenBalances).where(eq(tokenBalances.userId, userId)).limit(2);
    const row = rows.find(candidate => candidate.role === "job_seeker") ?? rows[0];
    if (!row) return null;
    const ledger = await db.select({ id: tokenTransactions.id, kind: tokenTransactions.kind, credits: tokenTransactions.tokenCount, source: tokenTransactions.source, createdAt: tokenTransactions.createdAt })
      .from(tokenTransactions).where(and(eq(tokenTransactions.userId, userId), eq(tokenTransactions.role, row.role)))
      .orderBy(desc(tokenTransactions.id)).limit(SUPPORT_LEDGER_LIMIT);
    return {
      role: row.role === "referrer" ? "referrer" : "job_seeker",
      plan: row.plan, totalAvailable: row.balance + row.monthlyCreditsRemaining,
      monthlyCreditsRemaining: row.monthlyCreditsRemaining, purchasedCreditsRemaining: row.balance,
      promoCreditsRemaining: 0, subscriptionStatus: row.subscriptionStatus,
      subscriptionCurrentTermEnd: iso(row.subscriptionCurrentTermEnd),
      cardValidated: Boolean(row.cardValidatedAt), freeCreditsLocked: false,
      ledger: ledger.map(entry => ({ id: entry.id, kind: entry.kind, credits: entry.credits, bucket: entry.source ?? null, createdAt: iso(entry.createdAt) ?? new Date(0).toISOString() })),
    };
  },

  async checkoutIntents(userId) {
    const db = await getDb(); if (!db) return [];
    const rows = await db.select({ id: subscriptionCheckoutIntents.id, plan: subscriptionCheckoutIntents.plan, status: subscriptionCheckoutIntents.status, createdAt: subscriptionCheckoutIntents.createdAt })
      .from(subscriptionCheckoutIntents).where(eq(subscriptionCheckoutIntents.userId, userId)).orderBy(desc(subscriptionCheckoutIntents.id)).limit(10);
    return rows.map(row => ({ id: row.id, kind: row.plan, status: row.status, createdAt: iso(row.createdAt) ?? new Date(0).toISOString() }));
  },

  async referrer(userId) {
    const db = await getDb(); if (!db) return null;
    const row = (await db.select({ domain: profiles.workEmailDomain, verifiedAt: profiles.workEmailVerifiedAt })
      .from(profiles).where(eq(profiles.userId, userId)).limit(1))[0];
    if (!row?.verifiedAt) return null;
    const [open] = await db.select({ total: count() }).from(referralRequests)
      .where(and(eq(referralRequests.referrerId, userId), eq(referralRequests.status, "pending")));
    const openClaims = Number(open?.total ?? 0);
    return { verifiedDomain: row.domain, verifiedAt: iso(row.verifiedAt), openClaims, available: openClaims < 5 };
  },

  async blocks(userId) {
    const db = await getDb(); if (!db) return [];
    const rows = await db.select({ blockerUserId: userBlocks.blockerUserId, blockedUserId: userBlocks.blockedUserId, createdAt: userBlocks.createdAt })
      .from(userBlocks).where(or(eq(userBlocks.blockerUserId, userId), eq(userBlocks.blockedUserId, userId))).orderBy(desc(userBlocks.id)).limit(20);
    return rows.map(row => ({
      otherUserId: row.blockerUserId === userId ? row.blockedUserId : row.blockerUserId,
      direction: row.blockerUserId === userId ? "blocked_by_them" as const : "they_blocked" as const,
      createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    }));
  },

  async requests(userId) {
    const db = await getDb(); if (!db) return [];
    const rows = await db.select({
      id: referralRequests.id, title: jobs.title, companyDomain: jobs.company, targetRoleUrl: jobs.targetRoleUrl,
      status: referralRequests.status, waitingForCoverage: referralRequests.waitingForCoverage,
      coverageHeldAt: referralRequests.coverageHeldAt, referrerId: referralRequests.referrerId,
      createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt,
    }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id))
      .where(eq(referralRequests.jobSeekerId, userId)).orderBy(desc(referralRequests.updatedAt)).limit(SUPPORT_REQUEST_LIMIT);
    if (rows.length === 0) return [];
    const events = await db.select({
      id: referralTransitionEvents.id, requestId: referralTransitionEvents.referralRequestId,
      action: referralTransitionEvents.action, fromStatus: referralTransitionEvents.fromStatus,
      resultingStatus: referralTransitionEvents.resultingStatus, actorUserId: referralTransitionEvents.actorUserId,
      createdAt: referralTransitionEvents.createdAt,
    }).from(referralTransitionEvents).where(inArray(referralTransitionEvents.referralRequestId, rows.map(row => row.id)))
      .orderBy(desc(referralTransitionEvents.id)).limit(rows.length * SUPPORT_TIMELINE_LIMIT);
    // The table records who acted, not their role: derive it the way listPersonRequestTransitions does.
    const referrerOf = new Map(rows.map(row => [row.id, row.referrerId]));
    const timelines = new Map<number, SupportTimelineRow[]>();
    for (const event of events) {
      const list = timelines.get(event.requestId) ?? [];
      if (list.length >= SUPPORT_TIMELINE_LIMIT) continue;
      const referrerId = referrerOf.get(event.requestId) ?? null;
      const role = event.actorUserId === userId ? "seeker" as const : referrerId !== null && event.actorUserId === referrerId ? "referrer" as const : "actor" as const;
      list.push({
        id: event.id, action: event.action, fromStatus: event.fromStatus, resultingStatus: event.resultingStatus,
        role, createdAt: iso(event.createdAt) ?? new Date(0).toISOString(),
      });
      timelines.set(event.requestId, list);
    }
    return rows.map(row => ({
      id: row.id, title: row.title, companyDomain: row.companyDomain, targetRoleUrl: row.targetRoleUrl,
      status: row.status, waitingForCoverage: Boolean(row.waitingForCoverage), referrerId: row.referrerId,
      createdAt: iso(row.createdAt) ?? new Date(0).toISOString(), updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
      state: supportRequestStateOf({ status: row.status, waitingForCoverage: Boolean(row.waitingForCoverage), coverageHeldAt: row.coverageHeldAt, referrerId: row.referrerId }),
      timeline: timelines.get(row.id) ?? [],
      sandbox: sandboxAskTarget({ companySlug: row.companyDomain, targetRoleUrl: row.targetRoleUrl }),
    }));
  },

  async activity(userId, since, limit) {
    const db = await getDb(); if (!db) return [];
    const rows = await db.select({ id: operationalActivityLogs.id, action: operationalActivityLogs.action, outcome: operationalActivityLogs.outcome, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt })
      .from(operationalActivityLogs).where(and(eq(operationalActivityLogs.actorUserId, userId), gte(operationalActivityLogs.createdAt, since)))
      .orderBy(desc(operationalActivityLogs.id)).limit(limit);
    return rows.map(row => ({ id: row.id, action: row.action, outcome: row.outcome, metadata: row.metadata, createdAt: iso(row.createdAt) ?? new Date(0).toISOString() }));
  },

  async signals(_window, since) {
    const db = await getDb();
    if (!db) return { signInFailures: [], sendRefusals: [], checkoutRefusals: [], heldRequests: 0, reviewEmailFailures: 0, clientErrors: 0 };
    const failed = ne(operationalActivityLogs.outcome, "success");
    const [signIn, sends, checkouts, client, held, review] = await Promise.all([
      counted(and(gte(operationalActivityLogs.createdAt, since), failed, like(operationalActivityLogs.action, "auth.%"))),
      counted(and(gte(operationalActivityLogs.createdAt, since), failed, like(operationalActivityLogs.action, "company_referral.%"))),
      counted(and(gte(operationalActivityLogs.createdAt, since), failed, like(operationalActivityLogs.action, "billing.%"))),
      counted(and(gte(operationalActivityLogs.createdAt, since), failed, like(operationalActivityLogs.action, "client.%"))),
      db.select({ total: count() }).from(referralRequests).where(sql`${referralRequests.coverageHeldAt} IS NOT NULL`),
      db.select({ total: count() }).from(referralReviewDeliveries).where(and(eq(referralReviewDeliveries.channel, "email"), inArray(referralReviewDeliveries.status, ["failed", "unknown"]), lt(referralReviewDeliveries.nextAttemptAt, new Date()))),
    ]);
    return {
      signInFailures: byReason(signIn), sendRefusals: byReason(sends), checkoutRefusals: byReason(checkouts),
      heldRequests: Number(held[0]?.total ?? 0), reviewEmailFailures: Number(review[0]?.total ?? 0),
      clientErrors: client.reduce((sum, row) => sum + row.total, 0),
    };
  },
};

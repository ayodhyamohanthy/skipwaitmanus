// Scheduled job "referral-timer-sweep": D-038's clocks, no longer waiting for
// someone to read.
//
// Every hourly window does four bounded, oldest-first batches:
//   1. claims past 48 hours without an accept or decline -> lapse, return the
//      ask to the company's queue, and end that employee's turn on it;
//   2. accepted asks past 5 days (8 with the one 3-day extension) without
//      "Referred — submitted in our system" -> reopen to colleagues, release
//      the credit once under a reversal-unique ledger row (D-038);
//   3. claims at the 24-hour mark -> one in-app reminder to the employee;
//   4. accepted asks at the day-2 and day-4 marks -> one in-app reminder each.
// Every action re-checks status, owner and clock under the ask's row lock in
// server/db.ts, so a concurrent accept, mark-referred, step back or repeated
// sweep can never act twice. Anything left over is picked up next window.
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { notifications, referralRequests } from "../drizzle/schema";
import {
  CLAIM_LAPSE_HOURS,
  CLAIM_REMINDER_HOURS,
  REFERRAL_EXTENSION_DAYS,
  REFERRAL_MARK_DAYS,
  REFERRAL_REMINDER_DAYS,
  TIMER_DAY_MS,
  TIMER_HOUR_MS,
} from "../shared/referralTimers";
import { getDb, lapseStaleClaim, releaseUnreferredReferralRequest } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const REFERRAL_TIMER_SWEEP_BATCH = 100;
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ClaimTimerRow = { id: number; referrerId: number; claimedAt: Date };
export type ReferralTimerRow = { id: number; referrerId: number; acceptedAt: Date };

export async function listClaimsToLapse(before: Date, limit: number): Promise<ClaimTimerRow[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const rows = await db.select({ id: referralRequests.id, referrerId: referralRequests.referrerId, claimedAt: referralRequests.claimedAt })
    .from(referralRequests)
    .where(and(eq(referralRequests.status, "pending"), isNotNull(referralRequests.claimedAt), isNotNull(referralRequests.referrerId), lt(referralRequests.claimedAt, before)))
    .orderBy(asc(referralRequests.claimedAt), asc(referralRequests.id))
    .limit(limit);
  return rows.filter((row): row is ClaimTimerRow => row.referrerId !== null && row.claimedAt !== null);
}

export async function listClaimsToRemind(from: Date, to: Date, limit: number): Promise<ClaimTimerRow[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const rows = await db.select({ id: referralRequests.id, referrerId: referralRequests.referrerId, claimedAt: referralRequests.claimedAt })
    .from(referralRequests)
    .where(and(eq(referralRequests.status, "pending"), isNotNull(referralRequests.claimedAt), isNotNull(referralRequests.referrerId), gte(referralRequests.claimedAt, from), lt(referralRequests.claimedAt, to)))
    .orderBy(asc(referralRequests.claimedAt), asc(referralRequests.id))
    .limit(limit);
  const candidates = rows.filter((row): row is ClaimTimerRow => row.referrerId !== null && row.claimedAt !== null);
  // The window spans a day, so an hourly sweep would see the same claim 24
  // times. The eventKey is the one-per-claim guard: skip a claim already reminded.
  const sent = await sentEventKeys(db, candidates.map(row => row.id));
  return candidates.filter(row => !sent.has(`claim-reminder:${row.id}:${row.claimedAt.toISOString()}`));
}

/**
 * Accepted asks past their referral deadline. The extended deadline is a
 * separate cutoff so a row that used its one extension is never released
 * early; both cases require an acceptedAt (pre-0096 acceptances stay exempt).
 */
export async function listReferralsToRelease(standardBefore: Date, extendedBefore: Date, limit: number): Promise<ReferralTimerRow[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const rows = await db.select({ id: referralRequests.id, referrerId: referralRequests.referrerId, acceptedAt: referralRequests.acceptedAt })
    .from(referralRequests)
    .where(and(
      eq(referralRequests.status, "approved"), isNull(referralRequests.referredAt), isNotNull(referralRequests.acceptedAt), isNotNull(referralRequests.referrerId),
      or(
        and(isNull(referralRequests.referralExtendedAt), lt(referralRequests.acceptedAt, standardBefore)),
        and(isNotNull(referralRequests.referralExtendedAt), lt(referralRequests.acceptedAt, extendedBefore)),
      ),
    ))
    .orderBy(asc(referralRequests.acceptedAt), asc(referralRequests.id))
    .limit(limit);
  return rows.filter((row): row is ReferralTimerRow => row.referrerId !== null && row.acceptedAt !== null);
}

export async function listReferralsToRemind(day: (typeof REFERRAL_REMINDER_DAYS)[number], from: Date, to: Date, limit: number): Promise<ReferralTimerRow[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  // The window is exactly [day, day+1) after acceptance, so each row enters it
  // once. The reminder's eventKey is a second, unique guard against repeats.
  const rows = await db.select({ id: referralRequests.id, referrerId: referralRequests.referrerId, acceptedAt: referralRequests.acceptedAt })
    .from(referralRequests)
    .where(and(
      eq(referralRequests.status, "approved"), isNull(referralRequests.referredAt), isNotNull(referralRequests.acceptedAt), isNotNull(referralRequests.referrerId),
      gte(referralRequests.acceptedAt, from), lt(referralRequests.acceptedAt, to),
    ))
    .orderBy(asc(referralRequests.acceptedAt), asc(referralRequests.id))
    .limit(limit);
  const candidates = rows.filter((row): row is ReferralTimerRow => row.referrerId !== null && row.acceptedAt !== null);
  // Same guard as the claim reminder: one hour of the window has already sent it.
  const sent = await sentEventKeys(db, candidates.map(row => row.id));
  return candidates.filter(row => !sent.has(`referral-reminder:${row.id}:d${day}`));
}

/** Event keys already recorded for these asks, so an hourly sweep nudges once. */
async function sentEventKeys(db: Db, requestIds: readonly number[]): Promise<Set<string>> {
  if (requestIds.length === 0) return new Set();
  const rows = await db.select({ eventKey: notifications.eventKey }).from(notifications).where(inArray(notifications.refId, [...requestIds]));
  return new Set(rows.map(row => row.eventKey).filter((key): key is string => typeof key === "string"));
}

async function notifyOnce(input: { userId: number; requestId: number; eventKey: string; title: string; body: string }): Promise<true> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const eventKey = input.eventKey.slice(0, 120);
  await db.insert(notifications).values({ userId: input.userId, category: "status", kind: "ask_update", refId: input.requestId, title: input.title, body: input.body, eventKey }).onDuplicateKeyUpdate({ set: { eventKey } });
  return true;
}

/** One reminder, at the 24-hour mark, that the employee's claim lapses in a day. */
export async function remindClaim(row: ClaimTimerRow): Promise<true> {
  return notifyOnce({
    userId: row.referrerId,
    requestId: row.id,
    eventKey: `claim-reminder:${row.id}:${row.claimedAt.toISOString()}`,
    title: "Your claim lapses in 24 hours",
    body: "You picked up a referral request 24 hours ago. Accept it or decline it within a day, or it returns to the company's queue.",
  });
}

/** D-038's day-2 and day-4 nudges to submit through the company and mark it referred. */
export async function remindReferral(row: ReferralTimerRow, day: 2 | 4): Promise<true> {
  const daysLeft = REFERRAL_MARK_DAYS - day;
  return notifyOnce({
    userId: row.referrerId,
    requestId: row.id,
    eventKey: `referral-reminder:${row.id}:d${day}`,
    title: daysLeft === 1 ? "Your referral window closes tomorrow" : `${daysLeft} days left to mark the referral`,
    body: "Submit the referral through your company's process, then tap \"Referred — submitted in our system\" in the private thread. If you can't, step back and the ask returns to colleagues.",
  });
}

export type ReferralTimerSweepDeps = {
  listClaimsToLapse: typeof listClaimsToLapse;
  listClaimsToRemind: typeof listClaimsToRemind;
  listReferralsToRelease: typeof listReferralsToRelease;
  listReferralsToRemind: typeof listReferralsToRemind;
  lapseClaim: (requestId: number, nowMs: number) => Promise<{ lapsed: boolean }>;
  releaseUnreferred: (requestId: number, nowMs: number) => Promise<{ released: boolean }>;
  remindClaim: (row: ClaimTimerRow) => Promise<true>;
  remindReferral: (row: ReferralTimerRow, day: 2 | 4) => Promise<true>;
};

const defaultDeps: ReferralTimerSweepDeps = {
  listClaimsToLapse, listClaimsToRemind, listReferralsToRelease, listReferralsToRemind,
  lapseClaim: lapseStaleClaim, releaseUnreferred: releaseUnreferredReferralRequest, remindClaim, remindReferral,
};

export function createReferralTimerSweep(deps: Partial<ReferralTimerSweepDeps> = {}) {
  const runDeps: ReferralTimerSweepDeps = { ...defaultDeps, ...deps };
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const output: JobRunOutput = { processed: 0, failed: 0 };
    const run = async (work: () => Promise<{ acted?: boolean } | boolean>) => {
      try {
        const result = await work();
        if (result === true || (typeof result === "object" && result.acted !== false)) output.processed += 1;
      } catch (error) {
        output.failed += 1;
        if (output.firstError === undefined) output.firstError = error;
      }
    };

    const lapsedBefore = new Date(nowMs - CLAIM_LAPSE_HOURS * TIMER_HOUR_MS);
    for (const row of await runDeps.listClaimsToLapse(lapsedBefore, REFERRAL_TIMER_SWEEP_BATCH)) {
      await run(() => runDeps.lapseClaim(row.id, nowMs).then(result => ({ acted: result.lapsed })));
    }

    const standardBefore = new Date(nowMs - REFERRAL_MARK_DAYS * TIMER_DAY_MS);
    const extendedBefore = new Date(nowMs - (REFERRAL_MARK_DAYS + REFERRAL_EXTENSION_DAYS) * TIMER_DAY_MS);
    for (const row of await runDeps.listReferralsToRelease(standardBefore, extendedBefore, REFERRAL_TIMER_SWEEP_BATCH)) {
      await run(() => runDeps.releaseUnreferred(row.id, nowMs).then(result => ({ acted: result.released })));
    }

    const remindFrom = new Date(nowMs - CLAIM_LAPSE_HOURS * TIMER_HOUR_MS);
    const remindTo = new Date(nowMs - CLAIM_REMINDER_HOURS * TIMER_HOUR_MS);
    for (const row of await runDeps.listClaimsToRemind(remindFrom, remindTo, REFERRAL_TIMER_SWEEP_BATCH)) {
      await run(() => runDeps.remindClaim(row));
    }

    for (const day of REFERRAL_REMINDER_DAYS) {
      const from = new Date(nowMs - (day + 1) * TIMER_DAY_MS);
      const to = new Date(nowMs - day * TIMER_DAY_MS);
      for (const row of await runDeps.listReferralsToRemind(day, from, to, REFERRAL_TIMER_SWEEP_BATCH)) {
        await run(() => runDeps.remindReferral(row, day));
      }
    }

    return output;
  };
}

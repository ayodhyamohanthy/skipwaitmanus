// Scheduled job "referral-timers": D-038-A/B clocks, no longer waiting for someone to read.
//
// Every hourly window reads its candidates once, then runs four bounded, oldest-first, isolated steps:
//   1. reminders — one 24-hour notice per claim or allocation approaching its 48-hour lapse, plus the
//      day-2 and day-4 nudges to the accepting referrer to mark Referred;
//   2. claim lapses — a claim nobody accepts or passes within 48 h returns the ask to colleagues,
//      ends that referrer's turn on it, and writes a lapsed_claim exclusion;
//   3. allocation lapses — an allocation nobody claims within 48 h of first visibility returns the
//      ask to colleagues and writes a lapsed_allocation exclusion;
//   4. referred lapses — an accepted ask whose Referred deadline (5 days, or 8 with the extension)
//      passed without a Referred mark reopens to colleagues and releases the credit.
// Every item re-decides under its row lock in server/db.ts before writing, so a concurrent accept,
// mark-referred, step-back, repeated sweep or another job step can never act twice. Anything left over
// is picked up next window. A failing step is reported to Sentry and the other steps still run.
import { notifications } from "../drizzle/schema";
import { getDb, lapseAllocationTx, lapseClaimTx, lapseReferredTx, listReferralTimerCandidates, stepBackFromReferral } from "./db";
import type { LedgerTx } from "./creditLedger";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { captureServerError } from "./sentry";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const REFERRAL_TIMERS_SWEEP_BATCH = 100;
export const REFERRAL_TIMERS_JOB_NAME = "referral-timers";

type TimerCandidate = { id: number; referrerId: number; companyDomain: string; claimEventId?: number; claimCreatedAt?: number; slotId?: number; coverageVisibleAt?: number | null; acceptEventId?: number; acceptCreatedAt?: number; extended?: boolean; reminderDay?: number };

export type ReferralTimerCandidates = {
  claimsToLapse: TimerCandidate[];
  claimsToRemind: TimerCandidate[];
  allocationsToLapse: TimerCandidate[];
  allocationsToRemind: TimerCandidate[];
  referredToLapse: TimerCandidate[];
  referredToRemind: TimerCandidate[];
};

type ReferralTimersDeps = {
  listCandidates: (limit: number, nowMs: number) => Promise<ReferralTimerCandidates>;
  lapseClaim: (tx: LedgerTx, requestId: number, nowMs: number) => Promise<{ lapsed: boolean; reason?: string }>;
  lapseAllocation: (tx: LedgerTx, requestId: number, nowMs: number) => Promise<{ lapsed: boolean; reason?: string }>;
  lapseReferred: (tx: LedgerTx, requestId: number, nowMs: number) => Promise<{ lapsed: boolean; reason?: string }>;
  stepBack: (tx: LedgerTx, requestId: number, nowMs: number) => Promise<{ lapsed: boolean; reason?: string }>;
};

const reminderBody = (companyDomain: string) => `You have an ask from a ${companyDomain} candidate. Accept or pass when you can. After 48 hours it goes back to your colleagues.`;

async function remindClaim(tx: LedgerTx, candidate: TimerCandidate): Promise<void> {
  if (!candidate.claimEventId || !candidate.claimCreatedAt) return;
  const eventKey = `claim-reminder:${candidate.id}:${candidate.claimEventId}`.slice(0, 120);
  await tx.insert(notifications).values({ userId: candidate.referrerId, category: "status", kind: "ask_update", refId: candidate.id, title: "An ask is waiting for your decision", body: reminderBody(candidate.companyDomain), eventKey }).onDuplicateKeyUpdate({ set: { eventKey } });
}

async function remindAllocation(tx: LedgerTx, candidate: TimerCandidate): Promise<void> {
  const eventKey = `allocation-reminder:${candidate.id}`.slice(0, 120);
  await tx.insert(notifications).values({ userId: candidate.referrerId, category: "status", kind: "ask_update", refId: candidate.id, title: "An ask is waiting for your decision", body: reminderBody(candidate.companyDomain), eventKey }).onDuplicateKeyUpdate({ set: { eventKey } });
}

async function remindReferred(tx: LedgerTx, candidate: TimerCandidate): Promise<void> {
  if (!candidate.acceptEventId || !candidate.acceptCreatedAt || candidate.reminderDay === undefined) return;
  const eventKey = `referred-reminder:${candidate.id}:${candidate.acceptEventId}:${candidate.reminderDay}`.slice(0, 120);
  await tx.insert(notifications).values({ userId: candidate.referrerId, category: "status", kind: "ask_update", refId: candidate.id, title: "Did you submit the referral?", body: `When you have referred them in ${candidate.companyDomain}'s system, tap Referred so they know. If you can't, you can step back with no fault.`, eventKey }).onDuplicateKeyUpdate({ set: { eventKey } });
}

export function createReferralTimers(deps: ReferralTimersDeps = {
  listCandidates: listReferralTimerCandidates,
  lapseClaim: lapseClaimTx,
  lapseAllocation: lapseAllocationTx,
  lapseReferred: lapseReferredTx,
  stepBack: stepBackFromReferral,
}) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const output: JobRunOutput = { processed: 0, failed: 0 };
    const record = (error: unknown, step: string, extra: Record<string, unknown> = {}) => {
      output.failed += 1;
      if (output.firstError === undefined) output.firstError = error;
      captureServerError(error, { job: REFERRAL_TIMERS_JOB_NAME, step, ...extra });
    };

    // One read per run: every step acts on the same snapshot, and a step that fails cannot change
    // what the next one sees. The listing is bounded and oldest-first, so nothing is starved.
    let candidates: ReferralTimerCandidates;
    try {
      candidates = await deps.listCandidates(REFERRAL_TIMERS_SWEEP_BATCH, nowMs);
    } catch (error) {
      record(error, "candidates");
      return output;
    }

    // Step 1: reminders — one 24-hour notice per claim or allocation approaching its lapse, and the
    // day-2 / day-4 nudges on an accepted ask. Each insert is idempotent on its unique eventKey.
    try {
      const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
      await db.transaction(async tx => {
        for (const candidate of [...candidates.claimsToRemind, ...candidates.allocationsToRemind, ...candidates.referredToRemind]) {
          try {
            if (candidate.reminderDay !== undefined) await remindReferred(tx, candidate);
            else if (candidate.claimEventId !== undefined) await remindClaim(tx, candidate);
            else await remindAllocation(tx, candidate);
            output.processed += 1;
          } catch (error) { record(error, "reminders", { requestId: candidate.id }); }
        }
      });
    } catch (error) { record(error, "reminders"); }

    // Step 2: claim lapses — each isolated under its own request row lock.
    try {
      const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
      for (const candidate of candidates.claimsToLapse) {
        try {
          const result = await db.transaction(async tx => await deps.lapseClaim(tx, candidate.id, nowMs));
          if (result.lapsed) output.processed += 1;
        } catch (error) { record(error, "claim-lapse", { requestId: candidate.id }); }
      }
    } catch (error) { record(error, "claim-lapses"); }

    // Step 3: allocation lapses — each isolated under its own request row lock.
    try {
      const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
      for (const candidate of candidates.allocationsToLapse) {
        try {
          const result = await db.transaction(async tx => await deps.lapseAllocation(tx, candidate.id, nowMs));
          if (result.lapsed) output.processed += 1;
        } catch (error) { record(error, "allocation-lapse", { requestId: candidate.id }); }
      }
    } catch (error) { record(error, "allocation-lapses"); }

    // Step 4: referred lapses — each isolated under its own request row lock.
    try {
      const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
      for (const candidate of candidates.referredToLapse) {
        try {
          const result = await db.transaction(async tx => await deps.lapseReferred(tx, candidate.id, nowMs));
          if (result.lapsed) output.processed += 1;
        } catch (error) { record(error, "referred-lapse", { requestId: candidate.id }); }
      }
    } catch (error) { record(error, "referred-lapses"); }

    return output;
  };
}

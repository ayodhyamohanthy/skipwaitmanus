// Scheduled job "referral-timers": D-038-A clocks, no longer waiting for someone to read.
//
// Every hourly window does three bounded, oldest-first, isolated steps:
//   1. reminders — one 24-hour notice per claim or allocation approaching its 48-hour lapse;
//   2. claim lapses — a claim nobody accepts or passes within 48 h returns the ask to colleagues,
//      ends that referrer's turn on it, and writes a lapsed_claim exclusion;
//   3. allocation lapses — an allocation nobody claims within 48 h of first visibility returns the
//      ask to colleagues and writes a lapsed_allocation exclusion.
// Every item re-decides under its row lock in server/db.ts before writing, so a concurrent accept,
// pass, repeated sweep or another job step can never act twice. Anything left over is picked up
// next window. A failing step is reported to Sentry and the other steps still run.
import { notifications } from "../drizzle/schema";
import { getDb, lapseAllocationTx, lapseClaimTx, listReferralTimerCandidates } from "./db";
import type { LedgerTx } from "./creditLedger";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import { captureServerError } from "./sentry";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const REFERRAL_TIMERS_SWEEP_BATCH = 100;
export const REFERRAL_TIMERS_JOB_NAME = "referral-timers";

type TimerCandidate = { id: number; referrerId: number; companyDomain: string; claimEventId?: number; claimCreatedAt?: number; slotId?: number; coverageVisibleAt?: number | null };

type ReferralTimersDeps = {
  listCandidates: (limit: number, nowMs: number) => Promise<{ claimsToLapse: TimerCandidate[]; claimsToRemind: TimerCandidate[]; allocationsToLapse: TimerCandidate[]; allocationsToRemind: TimerCandidate[] }>;
  lapseClaim: (tx: LedgerTx, requestId: number, nowMs: number) => Promise<{ lapsed: boolean; reason?: string }>;
  lapseAllocation: (tx: LedgerTx, requestId: number, nowMs: number) => Promise<{ lapsed: boolean; reason?: string }>;
};

async function remindClaim(tx: LedgerTx, candidate: TimerCandidate): Promise<void> {
  if (!candidate.claimEventId || !candidate.claimCreatedAt) return;
  const eventKey = `claim-reminder:${candidate.id}:${candidate.claimEventId}`.slice(0, 120);
  await tx.insert(notifications).values({ userId: candidate.referrerId, category: "status", kind: "ask_update", refId: candidate.id, title: "An ask is waiting for your decision", body: `You have an ask from a ${candidate.companyDomain} candidate. Accept or pass when you can. After 48 hours it goes back to your colleagues.`, eventKey }).onDuplicateKeyUpdate({ set: { eventKey } });
}

async function remindAllocation(tx: LedgerTx, candidate: TimerCandidate): Promise<void> {
  const eventKey = `allocation-reminder:${candidate.id}`.slice(0, 120);
  await tx.insert(notifications).values({ userId: candidate.referrerId, category: "status", kind: "ask_update", refId: candidate.id, title: "An ask is waiting for your decision", body: `You have an ask from a ${candidate.companyDomain} candidate. Accept or pass when you can. After 48 hours it goes back to your colleagues.`, eventKey }).onDuplicateKeyUpdate({ set: { eventKey } });
}

export function createReferralTimers(deps: ReferralTimersDeps = {
  listCandidates: listReferralTimerCandidates,
  lapseClaim: lapseClaimTx,
  lapseAllocation: lapseAllocationTx,
}) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const output: JobRunOutput = { processed: 0, failed: 0 };

    // Step 1: reminders — one 24-hour notice per claim or allocation approaching its lapse.
    try {
      const candidates = await deps.listCandidates(REFERRAL_TIMERS_SWEEP_BATCH, nowMs);
      const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
      await db.transaction(async tx => {
        for (const candidate of candidates.claimsToRemind) {
          try { await remindClaim(tx, candidate); output.processed += 1; } catch (error) { output.failed += 1; if (output.firstError === undefined) output.firstError = error; }
        }
        for (const candidate of candidates.allocationsToRemind) {
          try { await remindAllocation(tx, candidate); output.processed += 1; } catch (error) { output.failed += 1; if (output.firstError === undefined) output.firstError = error; }
        }
      });
    } catch (error) {
      output.failed += 1;
      if (output.firstError === undefined) output.firstError = error;
      captureServerError(error, { job: REFERRAL_TIMERS_JOB_NAME, step: "reminders" });
    }

    // Step 2: claim lapses — each isolated under its own request row lock.
    try {
      const candidates = await deps.listCandidates(REFERRAL_TIMERS_SWEEP_BATCH, nowMs);
      const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
      for (const candidate of candidates.claimsToLapse) {
        try {
          const result = await db.transaction(async tx => await deps.lapseClaim(tx, candidate.id, nowMs));
          if (result.lapsed) output.processed += 1;
        } catch (error) {
          output.failed += 1;
          if (output.firstError === undefined) output.firstError = error;
          captureServerError(error, { job: REFERRAL_TIMERS_JOB_NAME, step: "claim-lapse", requestId: candidate.id });
        }
      }
    } catch (error) {
      output.failed += 1;
      if (output.firstError === undefined) output.firstError = error;
      captureServerError(error, { job: REFERRAL_TIMERS_JOB_NAME, step: "claim-lapses" });
    }

    // Step 3: allocation lapses — each isolated under its own request row lock.
    try {
      const candidates = await deps.listCandidates(REFERRAL_TIMERS_SWEEP_BATCH, nowMs);
      const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
      for (const candidate of candidates.allocationsToLapse) {
        try {
          const result = await db.transaction(async tx => await deps.lapseAllocation(tx, candidate.id, nowMs));
          if (result.lapsed) output.processed += 1;
        } catch (error) {
          output.failed += 1;
          if (output.firstError === undefined) output.firstError = error;
          captureServerError(error, { job: REFERRAL_TIMERS_JOB_NAME, step: "allocation-lapse", requestId: candidate.id });
        }
      }
    } catch (error) {
      output.failed += 1;
      if (output.firstError === undefined) output.firstError = error;
      captureServerError(error, { job: REFERRAL_TIMERS_JOB_NAME, step: "allocation-lapses" });
    }

    return output;
  };
}

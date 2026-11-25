// Scheduled job "work-email-otp-purge" (queue task 3: work-email-hmac-storage).
//
// The verification tables must not keep a work address in the clear. New rows
// already store the one-way fingerprint (server/workEmailKey.ts); this job
// rewrites the rows written before that change and drops spent ones, so the
// verify aside's "A one-way fingerprint of your email" line stays true and no
// dead row lives on. Every step is bounded by WORK_EMAIL_PURGE_BATCH and
// idempotent: a rewritten row no longer matches the plaintext predicate, and
// deleting a spent row twice deletes nothing.
//
// Receipts keep RECEIPT_REPLAY_GRACE_MS of grace past use or expiry: a client
// that retries enrollment after a lost response must still replay as
// already-verified instead of being told its receipt is invalid. Codes carry no
// such replay path (a consumed code is unusable by design), and an expired OTP
// rate-limit window is dead the moment it ends.
import { and, asc, eq, inArray, isNotNull, lte, notLike, or } from "drizzle-orm";
import { operationalActivityLogs, workEmailOtpCodes, workEmailOtpRateLimits, workEmailOtpReceipts } from "../drizzle/schema";
import { getDb } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";
import { WORK_EMAIL_FINGERPRINT_PREFIX, workEmailStorageKeys } from "./workEmailKey";

export const WORK_EMAIL_PURGE_BATCH = 500;
export const RECEIPT_REPLAY_GRACE_MS = 24 * 60 * 60 * 1000;

export type WorkEmailPurgeResult = { deletedCodes: number; deletedReceipts: number; deletedRateLimits: number; rewrittenCodes: number; rewrittenReceipts: number };
export type WorkEmailPurgeDeps = { purge: (now: Date, limit: number) => Promise<WorkEmailPurgeResult> };

const affectedRows = (result: unknown) => Number((result as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0);

export async function purgeWorkEmailOtpRows(now: Date, limit: number = WORK_EMAIL_PURGE_BATCH): Promise<WorkEmailPurgeResult> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const batch = Math.max(1, Math.min(Math.floor(limit), WORK_EMAIL_PURGE_BATCH));
  const graceBefore = new Date(now.getTime() - RECEIPT_REPLAY_GRACE_MS);

  return db.transaction(async tx => {
    const codeRows = await tx.select({ id: workEmailOtpCodes.id, consumedAt: workEmailOtpCodes.consumedAt, expiresAt: workEmailOtpCodes.expiresAt }).from(workEmailOtpCodes)
      .where(or(isNotNull(workEmailOtpCodes.consumedAt), lte(workEmailOtpCodes.expiresAt, now)))
      .orderBy(asc(workEmailOtpCodes.id)).limit(batch).for("update");
    const consumed = codeRows.filter(row => row.consumedAt != null).length;
    const expiredUnused = codeRows.filter(row => row.consumedAt == null && row.expiresAt != null && row.expiresAt <= now).length;
    const deletedCodes = codeRows.length ? affectedRows(await tx.delete(workEmailOtpCodes).where(inArray(workEmailOtpCodes.id, codeRows.map(row => row.id)))) : 0;
    if (deletedCodes !== codeRows.length) throw new Error("Work-email code purge did not delete every selected row");

    const receiptIds = await tx.select({ id: workEmailOtpReceipts.id }).from(workEmailOtpReceipts)
      .where(or(and(isNotNull(workEmailOtpReceipts.usedAt), lte(workEmailOtpReceipts.usedAt, graceBefore)), lte(workEmailOtpReceipts.expiresAt, graceBefore)))
      .orderBy(asc(workEmailOtpReceipts.id)).limit(batch);
    const deletedReceipts = receiptIds.length ? affectedRows(await tx.delete(workEmailOtpReceipts).where(inArray(workEmailOtpReceipts.id, receiptIds.map(row => row.id)))) : 0;

    const rateLimitIds = await tx.select({ id: workEmailOtpRateLimits.id }).from(workEmailOtpRateLimits)
      .where(lte(workEmailOtpRateLimits.expiresAt, now))
      .orderBy(asc(workEmailOtpRateLimits.id)).limit(batch);
    const deletedRateLimits = rateLimitIds.length ? affectedRows(await tx.delete(workEmailOtpRateLimits).where(inArray(workEmailOtpRateLimits.id, rateLimitIds.map(row => row.id)))) : 0;

    const plaintextCodes = await tx.select({ id: workEmailOtpCodes.id, email: workEmailOtpCodes.email }).from(workEmailOtpCodes)
      .where(notLike(workEmailOtpCodes.email, `${WORK_EMAIL_FINGERPRINT_PREFIX}%`))
      .orderBy(asc(workEmailOtpCodes.id)).limit(batch);
    let rewrittenCodes = 0;
    for (const row of plaintextCodes) {
      // Compare-and-set on the value read, so a concurrent replace of the same row is never overwritten.
      const written = await tx.update(workEmailOtpCodes).set({ email: workEmailStorageKeys(row.email).write })
        .where(and(eq(workEmailOtpCodes.id, row.id), eq(workEmailOtpCodes.email, row.email)));
      if (affectedRows(written) === 1) rewrittenCodes += 1;
    }

    const plaintextReceipts = await tx.select({ id: workEmailOtpReceipts.id, email: workEmailOtpReceipts.email }).from(workEmailOtpReceipts)
      .where(notLike(workEmailOtpReceipts.email, `${WORK_EMAIL_FINGERPRINT_PREFIX}%`))
      .orderBy(asc(workEmailOtpReceipts.id)).limit(batch);
    let rewrittenReceipts = 0;
    for (const row of plaintextReceipts) {
      const written = await tx.update(workEmailOtpReceipts).set({ email: workEmailStorageKeys(row.email).write })
        .where(and(eq(workEmailOtpReceipts.id, row.id), eq(workEmailOtpReceipts.email, row.email)));
      if (affectedRows(written) === 1) rewrittenReceipts += 1;
    }

    await tx.insert(operationalActivityLogs).values({
      action: "work_email_otp.purged", outcome: "success", resourceType: "work_email_otp_purge", resourceId: now.toISOString(), metadata: JSON.stringify({ consumed, expiredUnused }),
    });
    return { deletedCodes, deletedReceipts, deletedRateLimits, rewrittenCodes, rewrittenReceipts };
  });
}

export function createWorkEmailOtpPurgeJob(deps: WorkEmailPurgeDeps = { purge: purgeWorkEmailOtpRows }) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const result = await deps.purge(new Date(nowMs), WORK_EMAIL_PURGE_BATCH);
    return {
      processed: result.deletedCodes + result.deletedReceipts + result.deletedRateLimits + result.rewrittenCodes + result.rewrittenReceipts,
      failed: 0,
    };
  };
}

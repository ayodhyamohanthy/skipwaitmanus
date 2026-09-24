import { eq, inArray } from "drizzle-orm";
import { referralRequests, referralTransitionEvents } from "../drizzle/schema";
import {
  computeJobSeekerReliability,
  computeReferrerReputation,
  type JobSeekerReliability,
  type ReferrerReputation,
  type ReputationReferralRow,
  type ReputationTransitionEvent,
} from "../shared/reputation";
import { getDb, getVerifiedWorkEmailAccess } from "./db";

/**
 * Reputation reads are derived on demand from the durable transition log.
 * No materialized table and no migration: the CAS-guarded
 * `referralTransitionEvents` stream is the source of truth, so terminal
 * statuses can never erase a participant's earlier outcomes.
 */

type ReputationDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function listEventsForRequests(db: ReputationDb, requestIds: readonly number[]): Promise<ReputationTransitionEvent[]> {
  if (requestIds.length === 0) return [];
  return db
    .select({
      referralRequestId: referralTransitionEvents.referralRequestId,
      actorUserId: referralTransitionEvents.actorUserId,
      action: referralTransitionEvents.action,
      resultingStatus: referralTransitionEvents.resultingStatus,
      createdAt: referralTransitionEvents.createdAt,
    })
    .from(referralTransitionEvents)
    .where(inArray(referralTransitionEvents.referralRequestId, [...requestIds]));
}

export async function getReferrerReputation(userId: number): Promise<ReferrerReputation> {
  const access = await getVerifiedWorkEmailAccess(userId);
  if (!access) throw new Error("Verify your company email to view your referral track record");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows: ReputationReferralRow[] = await db
    .select({
      id: referralRequests.id,
      referrerId: referralRequests.referrerId,
      jobSeekerId: referralRequests.jobSeekerId,
      status: referralRequests.status,
      createdAt: referralRequests.createdAt,
    })
    .from(referralRequests)
    .where(eq(referralRequests.referrerId, userId));
  const events = await listEventsForRequests(db, rows.map(row => row.id));
  return computeReferrerReputation(userId, rows, events);
}

export async function getJobSeekerReliability(userId: number): Promise<JobSeekerReliability> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows: ReputationReferralRow[] = await db
    .select({
      id: referralRequests.id,
      referrerId: referralRequests.referrerId,
      jobSeekerId: referralRequests.jobSeekerId,
      status: referralRequests.status,
      createdAt: referralRequests.createdAt,
    })
    .from(referralRequests)
    .where(eq(referralRequests.jobSeekerId, userId));
  const events = await listEventsForRequests(db, rows.map(row => row.id));
  return computeJobSeekerReliability(userId, rows, events);
}

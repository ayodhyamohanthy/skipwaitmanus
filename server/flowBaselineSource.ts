// Read side of the D-018 baseline: the SQL the aggregate is built from.
//
// Isolated from the maths (server/flowBaseline.ts) so the panel's numbers can
// be tested against a fixture source without a database. Every row here is an
// aggregate or a timestamp: no names, emails, domains-of-people or request text
// leave this layer.
import { and, count, eq, gte, inArray, isNull } from "drizzle-orm";
import { isReferrerExclusionCode } from "../shared/passReasons";
import { canonicalPeople, companyDomains, jobs, profiles, referralAvailabilitySlots, referralRequests, referralRequestPasses, referralTransitionEvents, tokenBalances, users } from "../drizzle/schema";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type BaselineRequestRow = { id: number; companyDomain: string; status: string; referrerId: number | null; createdAt: Date | string; coverageVisibleAt?: Date | string | null };
export type BaselineReferrerRow = { userId: number; accountType: string | null; workEmailDomain: string | null; workEmailVerifiedAt: Date | null; paused: boolean; referralCapacity: number | null; userSuspended: boolean; personSuspended: boolean | null };
export type BaselineTransitionRow = { requestId: number; actorUserId: number; action: string; createdAt: Date | string; resultingStatus?: string | null };
export type BaselineWalletRow = { plan: string; trialEndsAt: Date | null; subscriptionCurrentTermEnd: Date | null };

export type FlowBaselineSource = {
  loadRequests(): Promise<BaselineRequestRow[]>;
  loadPassedRequestIds(): Promise<number[]>;
  loadTransitionsSince(sinceMs: number): Promise<BaselineTransitionRow[]>;
  loadReferrerProfiles(): Promise<BaselineReferrerRow[]>;
  loadAllocatedSlotCounts(userIds: readonly number[]): Promise<ReadonlyMap<number, number>>;
  loadCompanyDomains(): Promise<Array<{ companyId: number; domain: string }>>;
  loadSubscriberWallets(): Promise<BaselineWalletRow[]>;
  countRequestsWithoutTransitions(): Promise<number>;
};

export function drizzleFlowBaselineSource(db: Db): FlowBaselineSource {
  return {
    // Statuses, timestamps and company domains only; a seeker's note never enters this query.
    loadRequests: () => db.select({ id: referralRequests.id, companyDomain: jobs.company, status: referralRequests.status, referrerId: referralRequests.referrerId, createdAt: referralRequests.createdAt, coverageVisibleAt: referralRequests.coverageVisibleAt })
      .from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)),
    // D-038-A/B (§4.2): a lapse writes a pass row so every exclusion applies, but it is not a pass the
    // referrer chose: counting it would credit the referrer with a decision they never made.
    loadPassedRequestIds: async () => (await db.select({ id: referralRequestPasses.referralRequestId, reasonCode: referralRequestPasses.reasonCode }).from(referralRequestPasses))
      .filter(row => !isReferrerExclusionCode(row.reasonCode))
      .map(row => row.id),
    // Accept and pass are the referrer's decisions; claim and review only mark activity.
    loadTransitionsSince: sinceMs => db.select({ requestId: referralTransitionEvents.referralRequestId, actorUserId: referralTransitionEvents.actorUserId, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt, resultingStatus: referralTransitionEvents.resultingStatus })
      .from(referralTransitionEvents).where(gte(referralTransitionEvents.createdAt, new Date(sinceMs))),
    loadReferrerProfiles: () => db.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, paused: profiles.paused, referralCapacity: profiles.referralCapacity, userSuspended: users.suspended, personSuspended: canonicalPeople.suspended })
      .from(profiles).innerJoin(users, eq(users.id, profiles.userId)).leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId)).where(eq(profiles.accountType, "referrer")),
    loadAllocatedSlotCounts: async userIds => {
      if (userIds.length === 0) return new Map<number, number>();
      const rows = await db.select({ referrerId: referralAvailabilitySlots.referrerId, allocated: count() }).from(referralAvailabilitySlots)
        .where(and(eq(referralAvailabilitySlots.status, "allocated"), inArray(referralAvailabilitySlots.referrerId, [...userIds])))
        .groupBy(referralAvailabilitySlots.referrerId);
      return new Map(rows.map(row => [row.referrerId, Number(row.allocated)]));
    },
    loadCompanyDomains: () => db.select({ companyId: companyDomains.companyId, domain: companyDomains.domain }).from(companyDomains),
    loadSubscriberWallets: () => db.select({ plan: tokenBalances.plan, trialEndsAt: tokenBalances.trialEndsAt, subscriptionCurrentTermEnd: tokenBalances.subscriptionCurrentTermEnd }).from(tokenBalances),
    // An ask with no transition at all means the state machine never recorded it: a data-quality row, not a guess.
    countRequestsWithoutTransitions: async () => {
      const rows = await db.select({ id: referralRequests.id }).from(referralRequests)
        .leftJoin(referralTransitionEvents, eq(referralTransitionEvents.referralRequestId, referralRequests.id))
        .where(isNull(referralTransitionEvents.id));
      return rows.length;
    },
  };
}

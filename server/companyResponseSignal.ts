// Read side of the company responsiveness signal. Timestamps and counts only: no names, emails, request
// text or ids leave this file. Maths and the min-3 rule live in shared/companyResponseSignal.ts.
import { and, eq, inArray, isNotNull, min } from "drizzle-orm";
import { jobs, profiles, referralRequests, referralTransitionEvents } from "../drizzle/schema";
import { computeResponseSignal, type CompanyResponseSignal } from "../shared/companyResponseSignal";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";
import { getDb } from "./db";

export const COMPANY_RESPONSE_SIGNAL_FLAG = "COMPANY_RESPONSE_SIGNAL_ENABLED";
export const companyResponseSignalEnabled = () => process.env[COMPANY_RESPONSE_SIGNAL_FLAG] === "true";

export async function loadCompanyResponseSignal(domains: readonly string[], now: Date = new Date(), dbOverride?: Awaited<ReturnType<typeof getDb>>): Promise<CompanyResponseSignal> {
  const db = dbOverride ?? await getDb();
  if (!db) throw new CompanyDirectoryUnavailableError();
  const owned = domains.map(domain => domain.trim().toLowerCase()).filter(Boolean);
  if (owned.length === 0) return { state: "insufficient" };
  const [referrers, asks] = await Promise.all([
    db.select({ userId: profiles.userId }).from(profiles).where(and(eq(profiles.accountType, "referrer"), isNotNull(profiles.workEmailVerifiedAt), inArray(profiles.workEmailDomain, owned))),
    // First decision (approve or either pass) per ask; the ask clock starts when a referrer could first see it.
    // D-035: a not-fixable pass is recorded as pass_release, and it answers the ask exactly like a pass does.
    db.select({ requestId: referralRequests.id, createdAt: referralRequests.createdAt, visibleAt: referralRequests.coverageVisibleAt, firstDecisionAt: min(referralTransitionEvents.createdAt) })
      .from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id))
      .leftJoin(referralTransitionEvents, and(eq(referralTransitionEvents.referralRequestId, referralRequests.id), inArray(referralTransitionEvents.action, ["approve", "pass", "pass_release"])))
      .where(inArray(jobs.company, owned)).groupBy(referralRequests.id, referralRequests.createdAt, referralRequests.coverageVisibleAt),
  ]);
  return computeResponseSignal(asks.map(row => ({ askedAt: row.visibleAt ?? row.createdAt, firstDecisionAt: row.firstDecisionAt ? new Date(row.firstDecisionAt) : null })), referrers.length, now);
}

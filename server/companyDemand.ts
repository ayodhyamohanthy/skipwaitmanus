// Read side of the D-086 demand list. Plain rows only: the maths and the
// k-anonymity rule live in shared/companyDemand.ts, so nothing here decides
// what a number means. No name, email, pitch, URL or request id leaves this
// module, and it reads no profile, availability, slot, wallet or plan table:
// demand is coverage-neutral (packet §4.2).
import { and, eq, inArray } from "drizzle-orm";
import { canonicalPeople, jobs, referralRequests, users } from "../drizzle/schema";
import { countDemandPeople, countUnlistedDemand, type DemandCompany, type DemandRow } from "../shared/companyDemand";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";
import { getDb } from "./db";

/** The one read shape both loaders use. Adding a field here is a contract change. */
const demandRowColumns = {
  company: jobs.company,
  userId: referralRequests.jobSeekerId,
  canonicalPersonId: users.canonicalPersonId,
  role: users.role,
  userSuspended: users.suspended,
  personSuspended: canonicalPeople.suspended,
  status: referralRequests.status,
  referrerId: referralRequests.referrerId,
  createdAt: referralRequests.createdAt,
  coverageVisibleAt: referralRequests.coverageVisibleAt,
  waitingForCoverage: referralRequests.waitingForCoverage,
};

/** Every live request row at the given domains. Timestamps are compared in JS, never against SQL NOW(). */
function liveRequestsAt(domains: readonly string[], db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  return db.select(demandRowColumns)
    .from(referralRequests)
    .innerJoin(jobs, eq(referralRequests.jobId, jobs.id))
    .innerJoin(users, eq(users.id, referralRequests.jobSeekerId))
    .leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId))
    .where(and(eq(referralRequests.status, "pending"), inArray(jobs.company, domains)));
}

/**
 * Distinct people asking at each listed company, in the order given. An empty
 * company list reads nothing at all.
 */
export async function loadCompanyDemand(companies: readonly DemandCompany[], nowMs: number, dbOverride?: Awaited<ReturnType<typeof getDb>>): Promise<Array<{ slug: string; name: string; people: number }>> {
  const domains = Array.from(new Set(companies.flatMap(company => company.domains).map(domain => domain.trim().toLowerCase()).filter(Boolean)));
  if (domains.length === 0) return companies.map(company => ({ slug: company.slug, name: company.name, people: 0 }));
  const db = dbOverride ?? await getDb();
  if (!db) throw new CompanyDirectoryUnavailableError();
  const rows = (await liveRequestsAt(domains, db)) as DemandRow[];
  return countDemandPeople(rows, companies, nowMs);
}

/**
 * The moderated-admission queue (packet §4.5 (b)): live-request domains that no
 * company owns, by distinct people. `ownedDomains` is every domain of every
 * company, listed or hidden, because a hidden company still owns its domain.
 */
export async function loadUnlistedDemand(ownedDomains: readonly string[], nowMs: number, dbOverride?: Awaited<ReturnType<typeof getDb>>): Promise<Array<{ domain: string; people: number }>> {
  const db = dbOverride ?? await getDb();
  if (!db) throw new CompanyDirectoryUnavailableError();
  // No domain filter in SQL: the unowned set is the complement of every company
  // domain, so it is resolved in the pure function where it is also bounded.
  const rows = (await db.select(demandRowColumns)
    .from(referralRequests)
    .innerJoin(jobs, eq(referralRequests.jobId, jobs.id))
    .innerJoin(users, eq(users.id, referralRequests.jobSeekerId))
    .leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId))
    .where(eq(referralRequests.status, "pending"))) as DemandRow[];
  return countUnlistedDemand(rows, ownedDomains, nowMs);
}

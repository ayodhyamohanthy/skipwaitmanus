// Read side of the company directory: where rows come from. Production reads
// MySQL; a database-less local dev server reads the deterministic launch
// seed (nobody is open, because no referrer can be verified without a
// database). Production without a database fails loudly instead of serving
// stale or invented availability.
import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { canonicalPeople, companies, companyDomains, profiles, referralAvailabilitySlots, users } from "../drizzle/schema";
import type { CompanyStatus } from "../shared/companies";
import { ENV } from "./_core/env";
import { LAUNCH_COMPANY_SEED } from "./companyDirectorySeed";
import { getDb } from "./db";

export class CompanyDirectoryUnavailableError extends Error {
  constructor() { super("The company directory is unavailable right now"); this.name = "CompanyDirectoryUnavailableError"; }
}

export type CompanyRecord = { id: number; slug: string; name: string; initials: string; industry: string; location: string; functions: string; blurb: string; status: CompanyStatus; sortOrder: number; updatedAt: Date };
export type CompanyDomainRecord = { companyId: number; domain: string; isPrimary: boolean };
/** Read only to derive a yes/no availability flag; never serialized. */
export type ReferrerCandidate = { userId: number; accountType: string | null; workEmailDomain: string | null; workEmailVerifiedAt: Date | null; paused: boolean; referralCapacity: number | null; userSuspended: boolean; personSuspended: boolean | null };

export type CompanyDirectorySource = {
  loadCompanies(): Promise<CompanyRecord[]>;
  loadDomains(): Promise<CompanyDomainRecord[]>;
  loadReferrerCandidates(domains: readonly string[]): Promise<ReferrerCandidate[]>;
  loadAllocatedSlotCounts(userIds: readonly number[]): Promise<ReadonlyMap<number, number>>;
};

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function drizzleCompanySource(db: Db): CompanyDirectorySource {
  return {
    loadCompanies: () => db.select({ id: companies.id, slug: companies.slug, name: companies.name, initials: companies.initials, industry: companies.industry, location: companies.location, functions: companies.functions, blurb: companies.blurb, status: companies.status, sortOrder: companies.sortOrder, updatedAt: companies.updatedAt }).from(companies).orderBy(asc(companies.sortOrder), asc(companies.name)),
    loadDomains: () => db.select({ companyId: companyDomains.companyId, domain: companyDomains.domain, isPrimary: companyDomains.isPrimary }).from(companyDomains).orderBy(asc(companyDomains.id)),
    async loadReferrerCandidates(domains) {
      if (domains.length === 0) return [];
      return db.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, paused: profiles.paused, referralCapacity: profiles.referralCapacity, userSuspended: users.suspended, personSuspended: canonicalPeople.suspended })
        .from(profiles)
        .innerJoin(users, eq(users.id, profiles.userId))
        .leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId))
        .where(and(eq(profiles.accountType, "referrer"), isNotNull(profiles.workEmailVerifiedAt), inArray(profiles.workEmailDomain, [...domains])));
    },
    async loadAllocatedSlotCounts(userIds) {
      if (userIds.length === 0) return new Map();
      const rows = await db.select({ referrerId: referralAvailabilitySlots.referrerId, allocated: count() }).from(referralAvailabilitySlots)
        .where(and(eq(referralAvailabilitySlots.status, "allocated"), inArray(referralAvailabilitySlots.referrerId, [...userIds])))
        .groupBy(referralAvailabilitySlots.referrerId);
      return new Map(rows.map(row => [row.referrerId, Number(row.allocated)]));
    },
  };
}

const SEED_UPDATED_AT = new Date("2026-10-13T00:00:00.000Z");

/** The launch seed as directory rows: the database-less dev fallback and a test fixture. */
export function seedCompanySource(): CompanyDirectorySource {
  const records: CompanyRecord[] = LAUNCH_COMPANY_SEED.map((seed, index) => ({ id: index + 1, slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: JSON.stringify(seed.functions), blurb: seed.blurb, status: "listed", sortOrder: seed.sortOrder, updatedAt: SEED_UPDATED_AT }));
  const domains: CompanyDomainRecord[] = LAUNCH_COMPANY_SEED.flatMap((seed, index) => seed.domains.map((domain, position) => ({ companyId: index + 1, domain, isPrimary: position === 0 })));
  return {
    loadCompanies: async () => records.map(record => ({ ...record })),
    loadDomains: async () => domains.map(domain => ({ ...domain })),
    loadReferrerCandidates: async () => [],
    loadAllocatedSlotCounts: async () => new Map(),
  };
}

/** The live source for this process, or an explicit unavailable error in production. */
export async function resolveCompanySource(): Promise<CompanyDirectorySource> {
  const db = await getDb();
  if (db) return drizzleCompanySource(db);
  if (ENV.isProduction) throw new CompanyDirectoryUnavailableError();
  return seedCompanySource();
}

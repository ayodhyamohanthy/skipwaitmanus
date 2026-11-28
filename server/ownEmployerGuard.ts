// PRIVACY-own-employer-guard (D-414 (3), D-415 (2)): a person's referral request never reaches their own current
// employer. createCompanyReferralRequest (server/db.ts) calls assertNotOwnEmployer before any wallet read, lock or
// write, so a refusal creates, reserves and spends nothing and sends no notice.
//
// "The person" is the whole canonical person: every users row sharing the requester's canonicalPersonId, so a
// linked personal login (D-057) cannot sidestep the guard. "Their employer" is any company where one of those rows
// holds a verified work email (profiles.workEmailVerifiedAt set), whatever the row's current accountType: a referrer
// who also job-hunts still works there. The company is the request's company domain plus every domain the company
// directory lists for it, and subdomains either way (shared/ownEmployer.ts). An unverified work email never blocks.
// A replay of a request created before the guard (same seeker, same idempotency key) still returns that request.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { companies, companyDomains, profiles, referralRequests, users } from "../drizzle/schema";
import { OWN_EMPLOYER, isOwnEmployer, normalizeEmployerDomain, ownEmployerMessage, type PersonWorkEmail } from "../shared/ownEmployer";

export class OwnEmployerError extends Error {
  readonly code = OWN_EMPLOYER;
  constructor(readonly companyDomain: string, readonly companyName: string) {
    super(ownEmployerMessage(companyName));
    this.name = "OwnEmployerError";
  }
}

/** Plain reads; the decision is made in assertNotOwnEmployer. */
export type OwnEmployerStore = {
  /** The requester's own row and every row of the same canonical person. */
  personUserIds(userId: number): Promise<readonly number[]>;
  /** Verified work emails held by these accounts. */
  verifiedWorkEmails(userIds: readonly number[]): Promise<readonly PersonWorkEmail[]>;
  /** The directory company that owns this domain, with all its domains; null when the directory has none. */
  companyOf(domain: string): Promise<{ readonly name: string; readonly domains: readonly string[] } | null>;
  /** True when this seeker already has a request under this idempotency key (a replay). */
  hasRequestWithKey(userId: number, idempotencyKey: string): Promise<boolean>;
};

export type OwnEmployerCheck = {
  readonly userId: number;
  readonly companyDomain: string;
  readonly idempotencyKey: string;
  /** The company page the request was sent from, when there was one (its directory domains). */
  readonly selectedCompany?: { readonly name: string; readonly domains: readonly string[] };
};

/** Throws OwnEmployerError when the request would reach the requester's own employer. */
export async function assertNotOwnEmployer(store: OwnEmployerStore, check: OwnEmployerCheck): Promise<void> {
  const workEmails = await store.verifiedWorkEmails(await store.personUserIds(check.userId));
  if (workEmails.length === 0) return;
  const directory = await store.companyOf(normalizeEmployerDomain(check.companyDomain));
  const domains = Array.from(new Set([check.companyDomain, ...(directory?.domains ?? []), ...(check.selectedCompany?.domains ?? [])].map(normalizeEmployerDomain)));
  if (!isOwnEmployer(workEmails, domains)) return;
  if (await store.hasRequestWithKey(check.userId, check.idempotencyKey)) return;
  throw new OwnEmployerError(normalizeEmployerDomain(check.companyDomain), directory?.name ?? check.selectedCompany?.name ?? normalizeEmployerDomain(check.companyDomain));
}

/** Works on the pool; it runs before the create transaction opens. */
export type OwnEmployerDb = Pick<MySql2Database<Record<string, never>>, "select">;

/** The store's queries as unexecuted drizzle builders, so a contract test can read their SQL with .toSQL(). */
export function ownEmployerQueries(db: OwnEmployerDb) {
  return {
    userRow: (userId: number) => db.select({ id: users.id, canonicalPersonId: users.canonicalPersonId }).from(users).where(eq(users.id, userId)).limit(1),
    personRows: (personId: number) => db.select({ id: users.id }).from(users).where(eq(users.canonicalPersonId, personId)),
    verifiedWorkEmails: (userIds: readonly number[]) => db.select({ workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(profiles)
      .where(and(inArray(profiles.userId, [...userIds]), isNotNull(profiles.workEmailVerifiedAt))),
    companyIdOf: (domain: string) => db.select({ companyId: companyDomains.companyId }).from(companyDomains).where(eq(companyDomains.domain, domain)).limit(1),
    companyName: (companyId: number) => db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1),
    companyDomainsOf: (companyId: number) => db.select({ domain: companyDomains.domain }).from(companyDomains).where(eq(companyDomains.companyId, companyId)),
    requestWithKey: (userId: number, idempotencyKey: string) => db.select({ id: referralRequests.id }).from(referralRequests)
      .where(and(eq(referralRequests.jobSeekerId, userId), eq(referralRequests.idempotencyKey, idempotencyKey))).limit(1),
  };
}

export function drizzleOwnEmployerStore(db: OwnEmployerDb): OwnEmployerStore {
  const q = ownEmployerQueries(db);
  return {
    async personUserIds(userId) {
      const own = (await q.userRow(userId))[0];
      if (!own || own.canonicalPersonId === null) return [userId];
      const ids = new Set<number>([userId]);
      for (const row of await q.personRows(own.canonicalPersonId)) ids.add(row.id);
      return Array.from(ids);
    },
    async verifiedWorkEmails(userIds) {
      return userIds.length === 0 ? [] : q.verifiedWorkEmails(userIds);
    },
    async companyOf(domain) {
      const owner = (await q.companyIdOf(domain))[0];
      if (!owner) return null;
      const [named, domains] = await Promise.all([q.companyName(owner.companyId), q.companyDomainsOf(owner.companyId)]);
      const name = named[0]?.name;
      return name ? { name, domains: domains.map(row => row.domain) } : null;
    },
    async hasRequestWithKey(userId, idempotencyKey) {
      return (await q.requestWithKey(userId, idempotencyKey)).length > 0;
    },
  };
}

// Company directory service. Builds the public and admin views from the
// directory rows and derives two facts on read from the same referrer rows:
// - availability (openToReferrals): at least one referrer verified on one of
//   the company's domains is unpaused, unsuspended (account and canonical
//   person) and below their referral capacity. Backend routing only (D-176):
//   it reaches the admin view and internal readers (getCompanyDirectoryRecord),
//   never a public response (D-174 public-payload).
// - presence (referrerPresence): at least one verified, unsuspended referrer
//   has joined at the company, paused or full included (D-360 (5)/D-363).
//   Sent only on the single-company public response.
// Never a count, an id or a name leaves the server.
import { adminCompanySchema, companyDirectoryResponseSchema, companyFunctionsSchema, publicCompanySchema, type AdminCompany, type CompanyDirectoryResponse, type PublicCompany, type ReferrerPresence } from "../shared/companies";
import { resolveCompanySource, type CompanyDirectorySource, type CompanyDomainRecord, type CompanyRecord } from "./companyDirectorySource";
import { notifySeekerAlertsForCompany } from "./db";
import { isOpenReferrer, isVerifiedEmployeeOfCompany, type ReferrerAvailability, type ReferrerCandidate } from "./referrerAvailability";

// The availability rule moved to server/referrerAvailability.ts (D-034/D-047/
// D-062) so db.ts can use the exact same predicate; these re-exports keep every
// existing caller green.
export { DEFAULT_REFERRAL_CAPACITY, isOpenReferrer } from "./referrerAvailability";

const normalize = (domain: string) => domain.trim().toLowerCase();
const unique = <T,>(values: readonly T[]) => Array.from(new Set(values));

export function computeOpenCompanyIds(domains: readonly CompanyDomainRecord[], candidates: readonly ReferrerCandidate[], allocated: ReadonlyMap<number, number>): Set<number> {
  const companyByDomain = new Map(domains.map(row => [normalize(row.domain), row.companyId]));
  const open = new Set<number>();
  for (const candidate of candidates) {
    const domain = normalize(candidate.workEmailDomain ?? "");
    const companyId = companyByDomain.get(domain);
    if (companyId !== undefined && isOpenReferrer(candidate, domain, allocated.get(candidate.userId) ?? 0)) open.add(companyId);
  }
  return open;
}

/** D-360 (5)/D-363: a verified referrer who has joined and is not suspended (account or canonical person). Pause and capacity do not matter. */
export function isJoinedReferrer(candidate: ReferrerAvailability, companyDomain: string): boolean {
  return isVerifiedEmployeeOfCompany(candidate, companyDomain) && !candidate.userSuspended && candidate.personSuspended !== true;
}

export function computePresentCompanyIds(domains: readonly CompanyDomainRecord[], candidates: readonly ReferrerCandidate[]): Set<number> {
  const companyByDomain = new Map(domains.map(row => [normalize(row.domain), row.companyId]));
  const present = new Set<number>();
  for (const candidate of candidates) {
    const domain = normalize(candidate.workEmailDomain ?? "");
    const companyId = companyByDomain.get(domain);
    if (companyId !== undefined && isJoinedReferrer(candidate, domain)) present.add(companyId);
  }
  return present;
}

/** Rows that fail the contract (corrupt functions JSON, no domain) are left out, never guessed. */
export function assembleCompanies(records: readonly CompanyRecord[], domains: readonly CompanyDomainRecord[], openCompanyIds: ReadonlySet<number>): AdminCompany[] {
  const assembled: AdminCompany[] = [];
  for (const record of records) {
    const own = domains.filter(row => row.companyId === record.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    let functions: unknown;
    try { functions = JSON.parse(record.functions); } catch { functions = null; }
    const parsedFunctions = companyFunctionsSchema.safeParse(functions);
    const primary = own[0];
    if (!parsedFunctions.success || !primary) continue;
    const candidate = adminCompanySchema.safeParse({ id: record.id, slug: record.slug, name: record.name, initials: record.initials, industry: record.industry, location: record.location, functions: parsedFunctions.data, blurb: record.blurb, domains: own.map(row => normalize(row.domain)), primaryDomain: normalize(primary.domain), openToReferrals: openCompanyIds.has(record.id), status: record.status, sortOrder: record.sortOrder, updatedAt: record.updatedAt.toISOString() });
    if (candidate.success) assembled.push(candidate.data);
  }
  return assembled.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The public shape: never availability (D-176); presence only when the caller passes it (the single-company read). */
export function toPublicCompany(company: AdminCompany, referrerPresence?: ReferrerPresence): PublicCompany {
  return publicCompanySchema.parse({ slug: company.slug, name: company.name, initials: company.initials, industry: company.industry, location: company.location, functions: company.functions, blurb: company.blurb, domains: company.domains, ...(referrerPresence ? { referrerPresence } : {}) });
}

export type CompanyIdentityRecord = { slug: string; name: string; initials: string };

export function createCompanyDirectory(source: CompanyDirectorySource) {
  // One candidate read per call; presence reuses the rows availability already loaded (no extra query).
  async function loadWithPresence(only?: (record: CompanyRecord) => boolean): Promise<{ companies: AdminCompany[]; presentIds: ReadonlySet<number> }> {
    const [allRecords, allDomains] = await Promise.all([source.loadCompanies(), source.loadDomains()]);
    const records = only ? allRecords.filter(only) : allRecords;
    const ids = new Set(records.map(record => record.id));
    const domains = allDomains.filter(row => ids.has(row.companyId));
    const candidates = await source.loadReferrerCandidates(unique(domains.map(row => normalize(row.domain))));
    const allocated = await source.loadAllocatedSlotCounts(unique(candidates.map(candidate => candidate.userId)));
    return { companies: assembleCompanies(records, domains, computeOpenCompanyIds(domains, candidates, allocated)), presentIds: computePresentCompanyIds(domains, candidates) };
  }
  const load = async (only?: (record: CompanyRecord) => boolean) => (await loadWithPresence(only)).companies;
  const listedSlug = (slug: string) => (record: CompanyRecord) => record.status === "listed" && record.slug === slug;
  return {
    /** Public list: no availability, no count, no presence (D-176, D-174 public-payload). */
    async list(): Promise<CompanyDirectoryResponse> {
      const companies = (await load(record => record.status === "listed")).map(company => toPublicCompany(company));
      return companyDirectoryResponseSchema.parse({ companies });
    },
    /** Public single company: adds referrerPresence, never availability (D-360 (5)/D-363). */
    async get(slug: string): Promise<PublicCompany | undefined> {
      const { companies: [company], presentIds } = await loadWithPresence(listedSlug(slug));
      return company ? toPublicCompany(company, presentIds.has(company.id) ? "present" : "none") : undefined;
    },
    /** Internal: one listed company with its routing availability. Never serialized to a public reader. */
    async record(slug: string): Promise<AdminCompany | undefined> {
      return (await load(listedSlug(slug)))[0];
    },
    async adminList(query?: string): Promise<AdminCompany[]> {
      const needle = query?.trim().toLowerCase() ?? "";
      const all = await load();
      return needle ? all.filter(company => `${company.name} ${company.slug} ${company.industry} ${company.domains.join(" ")}`.toLowerCase().includes(needle)) : all;
    },
    async adminGet(id: number): Promise<AdminCompany | undefined> {
      return (await load(record => record.id === id))[0];
    },
    /** Name and initials for any registered domain, listed or hidden. Unknown domains are absent. */
    async resolveIdentities(domains: readonly string[]): Promise<Map<string, CompanyIdentityRecord>> {
      const wanted = new Set(domains.map(normalize).filter(Boolean));
      const result = new Map<string, CompanyIdentityRecord>();
      if (wanted.size === 0) return result;
      const [records, rows] = await Promise.all([source.loadCompanies(), source.loadDomains()]);
      const byId = new Map(records.map(record => [record.id, record]));
      for (const row of rows) {
        const record = byId.get(row.companyId);
        if (record && wanted.has(normalize(row.domain))) result.set(normalize(row.domain), { slug: record.slug, name: record.name, initials: record.initials });
      }
      return result;
    },
    /** Every domain of the company that owns `domain`, primary first, plus its name. */
    async findByDomain(domain: string): Promise<{ name: string; domains: string[] } | undefined> {
      const [records, rows] = await Promise.all([source.loadCompanies(), source.loadDomains()]);
      const owner = rows.find(row => normalize(row.domain) === normalize(domain));
      const record = owner ? records.find(item => item.id === owner.companyId) : undefined;
      if (!owner || !record) return undefined;
      const domains = rows.filter(row => row.companyId === owner.companyId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map(row => normalize(row.domain));
      return { name: record.name, domains };
    },
  };
}

const live = async () => createCompanyDirectory(await resolveCompanySource());
export const listCompanyDirectory = async () => (await live()).list();
export const getCompanyDirectoryEntry = async (slug: string) => (await live()).get(slug);
/** Internal reader (company-claim dashboard): the listed record, availability included. Not a public response. */
export const getCompanyDirectoryRecord = async (slug: string): Promise<AdminCompany | undefined> => (await live()).record(slug);
export const listAdminCompanies = async (query?: string) => (await live()).adminList(query);
export const getAdminCompany = async (id: number) => (await live()).adminGet(id);
export const resolveCompanyIdentities = async (domains: readonly string[]) => (await live()).resolveIdentities(domains);

export type CompanyIdentityLookup = (domains: readonly string[]) => Promise<ReadonlyMap<string, CompanyIdentityRecord>>;
export type CompanyIdentityFields = { companyName: string | null; companyInitials: string | null };

/**
 * Adds the directory's companyName / companyInitials to each row (null for a
 * domain outside the directory). Display-only and fail-open: a lookup error
 * leaves the names null so a list never fails because of them.
 */
export async function attachCompanyIdentities<T extends object>(rows: readonly T[], domainOf: (row: T) => unknown, lookup: CompanyIdentityLookup = resolveCompanyIdentities): Promise<Array<T & CompanyIdentityFields>> {
  const domainFor = (row: T) => { const value = domainOf(row); return typeof value === "string" ? normalize(value) : ""; };
  let identities: ReadonlyMap<string, CompanyIdentityRecord> = new Map();
  try { identities = await lookup(unique(rows.map(domainFor).filter(Boolean))); } catch { identities = new Map(); }
  return rows.map(row => { const identity = identities.get(domainFor(row)); return { ...row, companyName: identity?.name ?? null, companyInitials: identity?.initials ?? null }; });
}

/**
 * A referrer verified at `domain`: notify alert watchers of every domain of
 * the owning company, named by the directory. Unknown domains notify their
 * own watchers by domain, as before.
 */
export async function notifySeekerAlertsForCompanyDomain(domain: string) {
  let company: { name: string; domains: string[] } | undefined;
  try { company = await (await live()).findByDomain(domain); } catch { company = undefined; }
  return notifySeekerAlertsForCompany(domain, new Date(), company);
}

// Admin writes to the company directory (POST/PATCH /api/admin/companies).
// Callers are admin-gated in server/companyDirectoryRoutes.ts and pass input
// already parsed by the strict shared Zod schemas. Each write is one
// transaction; slug and domain uniqueness are re-checked inside it and backed
// by the unique indexes, so a lost race surfaces as a conflict, never a
// half-written company. Timestamps come from the JS clock (invariant 5).
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { companies, companyDomains, profiles } from "../drizzle/schema";
import { COMPANY_SLUG_PATTERN, deriveCompanyInitials, deriveCompanySlug, type AdminCompany, type AdminCompanyCreate, type AdminCompanyUpdate } from "../shared/companies";
import { getAdminCompany } from "./companyDirectory";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";
import { getDb } from "./db";
import { isDuplicateKeyError } from "./dbErrors";

export class CompanyConflictError extends Error { constructor(message: string) { super(message); this.name = "CompanyConflictError"; } }
export class CompanyNotFoundError extends Error { constructor() { super("This company could not be found"); this.name = "CompanyNotFoundError"; } }
export class CompanyInputError extends Error { constructor(message: string) { super(message); this.name = "CompanyInputError"; } }

const DEFAULT_SORT_ORDER = 1000;

/** Which domain rows a PATCH adds and removes. The primary domain is never removable. */
export function planDomainChanges(owned: ReadonlyArray<{ domain: string; isPrimary: boolean }>, add: readonly string[], remove: readonly string[]): { insert: string[]; delete: string[] } {
  const ownedDomains = new Set(owned.map(row => row.domain));
  const removing = Array.from(new Set(remove));
  const adding = Array.from(new Set(add)).filter(domain => !ownedDomains.has(domain));
  if (adding.some(domain => removing.includes(domain))) throw new CompanyInputError("A domain can't be added and removed at once");
  for (const domain of removing) {
    const row = owned.find(item => item.domain === domain);
    if (!row) throw new CompanyInputError(`${domain} is not a domain of this company`);
    if (row.isPrimary) throw new CompanyInputError("The primary domain can't be removed");
  }
  return { insert: adding, delete: removing };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new CompanyDirectoryUnavailableError();
  return db;
}

async function reread(id: number): Promise<AdminCompany> {
  const company = await getAdminCompany(id);
  if (!company) throw new CompanyNotFoundError();
  return company;
}

export async function createCompany(input: AdminCompanyCreate, now: Date = new Date()): Promise<AdminCompany> {
  const slug = input.slug ?? deriveCompanySlug(input.name);
  if (!COMPANY_SLUG_PATTERN.test(slug)) throw new CompanyInputError("Add a slug: the name has no letters or digits to build one from");
  const domains = Array.from(new Set([input.primaryDomain, ...(input.aliasDomains ?? [])]));
  const db = await requireDb();
  let id: number;
  try {
    id = await db.transaction(async tx => {
      if ((await tx.select({ id: companies.id }).from(companies).where(eq(companies.slug, slug)).limit(1))[0]) throw new CompanyConflictError("A company already uses this slug");
      const taken = (await tx.select({ domain: companyDomains.domain }).from(companyDomains).where(inArray(companyDomains.domain, domains)).limit(1))[0];
      if (taken) throw new CompanyConflictError(`${taken.domain} already belongs to a company`);
      const inserted = await tx.insert(companies).values({ slug, name: input.name, initials: input.initials ?? deriveCompanyInitials(input.name), industry: input.industry, location: input.location, functions: JSON.stringify(input.functions), blurb: input.blurb, status: input.status ?? "listed", sortOrder: input.sortOrder ?? DEFAULT_SORT_ORDER, createdAt: now, updatedAt: now });
      const companyId = Number(inserted[0].insertId);
      await tx.insert(companyDomains).values(domains.map((domain, index) => ({ companyId, domain, isPrimary: index === 0, createdAt: now })));
      return companyId;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new CompanyConflictError("This slug or domain was just taken by another company");
    throw error;
  }
  return reread(id);
}

export async function updateCompany(id: number, patch: AdminCompanyUpdate, now: Date = new Date()): Promise<AdminCompany> {
  const db = await requireDb();
  try {
    await db.transaction(async tx => {
      if (!(await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1).for("update"))[0]) throw new CompanyNotFoundError();
      const owned = await tx.select({ domain: companyDomains.domain, isPrimary: companyDomains.isPrimary }).from(companyDomains).where(eq(companyDomains.companyId, id));
      const plan = planDomainChanges(owned, patch.addDomains ?? [], patch.removeDomains ?? []);
      if (plan.insert.length) {
        const taken = (await tx.select({ domain: companyDomains.domain }).from(companyDomains).where(inArray(companyDomains.domain, plan.insert)).limit(1))[0];
        if (taken) throw new CompanyConflictError(`${taken.domain} already belongs to a company`);
        await tx.insert(companyDomains).values(plan.insert.map(domain => ({ companyId: id, domain, isPrimary: false, createdAt: now })));
      }
      if (plan.delete.length) await tx.delete(companyDomains).where(and(eq(companyDomains.companyId, id), eq(companyDomains.isPrimary, false), inArray(companyDomains.domain, plan.delete)));
      const { addDomains: _add, removeDomains: _remove, functions, ...fields } = patch;
      await tx.update(companies).set({ ...fields, ...(functions ? { functions: JSON.stringify(functions) } : {}), updatedAt: now }).where(eq(companies.id, id));
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new CompanyConflictError("This domain was just taken by another company");
    throw error;
  }
  return reread(id);
}

export type UnmatchedWorkDomain = { domain: string; verifiedReferrers: number; firstVerifiedAt: string };

/**
 * Pure: verified work-email domains that no company owns (D-100 follow-up). Counts only; never ids, names or
 * emails. Sorted by most referrers, then domain, so the admin sees what to map first.
 */
export function planUnmatchedWorkDomains(verified: ReadonlyArray<{ domain: string | null; verifiedAt: Date | null }>, owned: readonly string[]): UnmatchedWorkDomain[] {
  const ownedSet = new Set(owned.map(domain => domain.trim().toLowerCase()));
  const byDomain = new Map<string, { n: number; first: Date }>();
  for (const row of verified) {
    const domain = row.domain?.trim().toLowerCase();
    if (!domain || !row.verifiedAt || ownedSet.has(domain)) continue;
    const entry = byDomain.get(domain);
    if (!entry) byDomain.set(domain, { n: 1, first: row.verifiedAt });
    else { entry.n += 1; if (row.verifiedAt < entry.first) entry.first = row.verifiedAt; }
  }
  return Array.from(byDomain.entries()).map(([domain, v]) => ({ domain, verifiedReferrers: v.n, firstVerifiedAt: v.first.toISOString() }))
    .sort((a, b) => b.verifiedReferrers - a.verifiedReferrers || a.domain.localeCompare(b.domain));
}

export async function listUnmatchedWorkDomains(): Promise<UnmatchedWorkDomain[]> {
  const db = await getDb();
  if (!db) throw new CompanyDirectoryUnavailableError();
  const [verified, owned] = await Promise.all([
    db.select({ domain: profiles.workEmailDomain, verifiedAt: profiles.workEmailVerifiedAt }).from(profiles).where(and(eq(profiles.accountType, "referrer"), isNotNull(profiles.workEmailVerifiedAt))),
    db.select({ domain: companyDomains.domain }).from(companyDomains),
  ]);
  return planUnmatchedWorkDomains(verified, owned.map(row => row.domain));
}

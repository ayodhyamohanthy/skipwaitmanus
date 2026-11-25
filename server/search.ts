// SEARCH-universal (D-394): the one search answer. One box takes a job title,
// a job link, a company name or a company website and answers with careers job
// links, referrer presence, "Apply on the careers site" and "Ask for a
// referral". Classification and ranking are pure; the route
// (server/searchRoutes.ts) owns HTTP and the default wiring reads the same
// directory, discovery, preview and catalog sources the existing surfaces use.
//
// No new data source and no paid API: the directory (companies +
// companyDomains), worldwide discovery (Wikidata), the existing job-link
// preview and the catalog jobs table. Presence is the one referrer fact a
// public answer may carry (D-360 (5), D-363) and is never availability (D-176).
import { and, eq, isNull, like, or } from "drizzle-orm";
import type { AdminCompany, DiscoveredCompany } from "../shared/companies";
import { JOB_CATALOG_ENABLED } from "../shared/jobCatalog";
import { SEARCH_COMPANY_LIMIT, SEARCH_JOB_LIMIT, searchResponseSchema, type SearchCompanyHit, type SearchInputKind, type SearchJobHit, type SearchJobLink, type SearchResponse } from "../shared/search";
import { completeTargetRoleUrl, isValidTargetRoleUrl } from "../shared/referralUrl";
import { catalogJobs, companies as companiesTable, companyJobSources } from "../drizzle/schema";
import { COMPANY_DISCOVERY_ENABLED, COMPANY_DISCOVERY_LIMIT, COMPANY_DISCOVERY_MIN_QUERY, discoverCompanies, type DiscoveryOutcome } from "./companyDiscovery";
import { assembleCompanies, computePresentCompanyIds } from "./companyDirectory";
import { resolveCompanySource } from "./companyDirectorySource";
import { searchCompanies } from "./companySearch";
import { workDomainFor } from "./companyWorkDomain";
import { getDb, likeSearchPattern } from "./db";
import { previewJobLink, type JobLinkPreview } from "./jobLinkPreview";

/** What the input is, before any data is read. */
export type SearchInputShape = "job-link" | "company-website" | "text";

/**
 * A bare host (or a host with only a trailing slash) is a company website;
 * any http(s) link with a path is a posting candidate the preview resolves.
 * Plain words are text: the answer decides between a company name and a job
 * title. Anything that cannot become an http(s) link is text, never a URL.
 */
export function classifySearchInput(raw: string): SearchInputShape {
  const value = raw.trim();
  if (!value) return "text";
  const completed = completeTargetRoleUrl(value);
  if (!isValidTargetRoleUrl(completed)) return "text";
  try {
    const url = new URL(completed);
    return url.pathname.replace(/\/+$/, "") ? "job-link" : "company-website";
  } catch {
    return "text";
  }
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** A host from any accepted link form, lowercase and without `www.` or a trailing dot. */
export function hostOf(value: string): string | null {
  try {
    return new URL(completeTargetRoleUrl(value.trim())).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return null;
  }
}

/**
 * 0 title equals the phrase, 1 title starts with it, 2 title contains it,
 * 3 a location contains it, undefined for no match. The phrase is compared
 * after case and whitespace folding, so "Product  Designer" still ranks first.
 */
export function rankJobTitle(title: string, locations: readonly string[], query: string): number | undefined {
  const q = normalize(query);
  if (!q) return undefined;
  const name = normalize(title);
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (locations.some(location => normalize(location).includes(q))) return 3;
  return undefined;
}

/** One catalog row as the search reads it; `closedAt` is how "open only" is enforced. */
export type CatalogJobRow = {
  id: number;
  companyId: number;
  companySlug: string;
  companyName: string;
  title: string;
  locations: string[];
  applyUrl: string;
  publishedAt: string | null;
  level: number;
  closedAt: string | null;
};

function publishedTime(row: CatalogJobRow): number {
  const time = row.publishedAt ? Date.parse(row.publishedAt) : NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** Open jobs only, ranked by rankJobTitle, newest first inside a rank, id descending as the stable tiebreak. */
export function searchCatalogJobs(rows: readonly CatalogJobRow[], query: string, limit: number): CatalogJobRow[] {
  return rows
    .filter(row => row.closedAt === null)
    .map(row => ({ row, rank: rankJobTitle(row.title, row.locations, query) }))
    .filter((hit): hit is { row: CatalogJobRow; rank: number } => hit.rank !== undefined)
    .sort((a, b) => a.rank - b.rank || publishedTime(b.row) - publishedTime(a.row) || b.row.id - a.row.id)
    .slice(0, Math.max(0, limit))
    .map(hit => hit.row);
}

/** The directory rows and the presence ids one search answer needs, read once. */
export type DirectorySnapshot = {
  companies: readonly AdminCompany[];
  presentIds: ReadonlySet<number>;
};

export type UniversalSearchDeps = {
  loadDirectory: () => Promise<DirectorySnapshot>;
  discover: (query: string, clientKey?: string) => Promise<DiscoveryOutcome>;
  preview: (url: string) => Promise<JobLinkPreview>;
  /** Candidate rows for a text query (bounded); ranking happens here. */
  searchJobs: (query: string, candidateLimit: number) => Promise<CatalogJobRow[]>;
  catalogEnabled: () => boolean;
};

const domainMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`);

/** The directory company that owns a host, subdomain-aware in both directions and after the work-domain rules. */
function companyForHost(snapshot: DirectorySnapshot, host: string): AdminCompany | undefined {
  const candidates = [host, workDomainFor(host)];
  return snapshot.companies.find(company => company.domains.some(domain => candidates.some(candidate => domainMatches(candidate, domain))));
}

function companyForDomain(snapshot: DirectorySnapshot, domain: string): AdminCompany | undefined {
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!host) return undefined;
  return snapshot.companies.find(company => company.domains.some(own => domainMatches(host, own)));
}

function companyHit(company: AdminCompany, presentIds: ReadonlySet<number>): SearchCompanyHit {
  return {
    slug: company.slug,
    name: company.name,
    initials: company.initials,
    industry: company.industry,
    location: company.location,
    functions: company.functions,
    blurb: company.blurb,
    domains: company.domains,
    referrerPresence: presentIds.has(company.id) ? "present" : "none",
  };
}

function jobHit(row: CatalogJobRow, presentIds: ReadonlySet<number>): SearchJobHit {
  return {
    id: row.id,
    companySlug: row.companySlug,
    companyName: row.companyName,
    title: row.title,
    locations: row.locations,
    applyUrl: row.applyUrl,
    publishedAt: row.publishedAt,
    level: row.level,
    referrerPresence: presentIds.has(row.companyId) ? "present" : "none",
  };
}

function jobLinkOf(preview: JobLinkPreview, snapshot: DirectorySnapshot): SearchJobLink {
  const owner = preview.companyDomain ? companyForDomain(snapshot, preview.companyDomain) : undefined;
  return {
    url: preview.canonicalUrl,
    companySlug: owner?.slug ?? null,
    companyName: owner?.name ?? preview.companyName?.trim() ?? null,
    roleTitle: preview.roleTitle?.trim() || null,
    employerConfidence: preview.employerConfidence,
    status: preview.status,
  };
}

/** Discovery candidates the directory does not hold, deduped by domain (the existing route's rule). */
function discoveredOnly(snapshot: DirectorySnapshot, outcome: DiscoveryOutcome): DiscoveredCompany[] {
  const held = snapshot.companies.flatMap(company => company.domains);
  return outcome.companies
    .filter(candidate => !held.some(domain => domainMatches(candidate.domain, domain)))
    .slice(0, COMPANY_DISCOVERY_LIMIT);
}

async function discoverSafely(deps: UniversalSearchDeps, query: string, clientKey?: string): Promise<{ discovered: DiscoveredCompany[]; state: "ok" | "degraded" }> {
  if (!COMPANY_DISCOVERY_ENABLED || normalize(query).length < COMPANY_DISCOVERY_MIN_QUERY) return { discovered: [], state: "ok" };
  try {
    const outcome = await deps.discover(query, clientKey);
    return { discovered: outcome.companies, state: outcome.degraded ? "degraded" : "ok" };
  } catch {
    return { discovered: [], state: "degraded" };
  }
}

/**
 * The one answer. A URL resolves to its company (the preview's domain first,
 * then the host after the work-domain rules); text answers with directory
 * companies, worldwide candidates and open catalog jobs. Every branch parses
 * with the shared strict schema before it leaves.
 */
export async function runUniversalSearch(rawQuery: string, deps: UniversalSearchDeps, clientKey?: string): Promise<SearchResponse> {
  const query = rawQuery.trim();
  const shape = classifySearchInput(query);
  const snapshot = await deps.loadDirectory();
  const catalogState: SearchResponse["catalogState"] = deps.catalogEnabled() ? "ok" : "unavailable";

  if (shape !== "text") {
    const url = completeTargetRoleUrl(query);
    const host = hostOf(url);
    let jobLink: SearchJobLink | null = null;
    if (shape === "job-link" && isValidTargetRoleUrl(url)) {
      try {
        jobLink = jobLinkOf(await deps.preview(url), snapshot);
      } catch {
        jobLink = null;
      }
    }
    const owner = (jobLink?.companySlug ? snapshot.companies.find(company => company.slug === jobLink?.companySlug) : undefined)
      ?? (host ? companyForHost(snapshot, host) : undefined);
    let discovered: DiscoveredCompany[] = [];
    let discoveryState: "ok" | "degraded" | undefined;
    if (!owner && host) {
      const label = workDomainFor(host).split(".")[0] ?? "";
      const outcome = await discoverSafely(deps, label, clientKey);
      discoveryState = outcome.state;
      discovered = discoveredOnly(snapshot, { companies: outcome.discovered, degraded: outcome.state === "degraded" })
        .filter(candidate => domainMatches(host, candidate.domain) || domainMatches(workDomainFor(host), candidate.domain));
    }
    return searchResponseSchema.parse({
      kind: shape,
      query,
      companies: owner ? [companyHit(owner, snapshot.presentIds)] : [],
      discovered,
      ...(discoveryState ? { discoveryState } : {}),
      jobLink,
      jobs: [],
      catalogState,
    });
  }

  const bySlug = new Map(snapshot.companies.map(company => [company.slug, company]));
  const companies = searchCompanies(snapshot.companies, query)
    .map(company => bySlug.get(company.slug))
    .filter((company): company is AdminCompany => company !== undefined)
    .slice(0, SEARCH_COMPANY_LIMIT)
    .map(company => companyHit(company, snapshot.presentIds));
  const outcome = await discoverSafely(deps, query, clientKey);
  const discovered = discoveredOnly(snapshot, { companies: outcome.discovered, degraded: outcome.state === "degraded" });
  const jobs = deps.catalogEnabled()
    ? searchCatalogJobs(await deps.searchJobs(query, SEARCH_JOB_LIMIT * 5), query, SEARCH_JOB_LIMIT).map(row => jobHit(row, snapshot.presentIds))
    : [];
  const kind: SearchInputKind = companies.length > 0 || discovered.length > 0 ? "company-name" : "job-title";
  return searchResponseSchema.parse({
    kind,
    query,
    companies,
    discovered,
    ...(COMPANY_DISCOVERY_ENABLED && normalize(query).length >= COMPANY_DISCOVERY_MIN_QUERY ? { discoveryState: outcome.state } : {}),
    jobLink: null,
    jobs,
    catalogState,
  });
}

/** The live directory read: listed rows plus the presence ids, one read of each table. */
async function loadDirectorySnapshot(): Promise<DirectorySnapshot> {
  const source = await resolveCompanySource();
  const [records, domains] = await Promise.all([source.loadCompanies(), source.loadDomains()]);
  const listed = records.filter(record => record.status === "listed");
  const ids = new Set(listed.map(record => record.id));
  const own = domains.filter(row => ids.has(row.companyId));
  const candidates = await source.loadReferrerCandidates(Array.from(new Set(own.map(row => row.domain.trim().toLowerCase()))));
  return { companies: assembleCompanies(listed, own, new Set<number>()), presentIds: computePresentCompanyIds(own, candidates) };
}

function parseLocations(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Candidate rows: verified sources only, listed companies only, open jobs only, bounded before ranking. */
async function searchCatalogJobRows(query: string, candidateLimit: number): Promise<CatalogJobRow[]> {
  const db = await getDb();
  if (!db) return [];
  const pattern = likeSearchPattern(query);
  const rows = await db
    .select({
      id: catalogJobs.id,
      companyId: catalogJobs.companyId,
      companySlug: companiesTable.slug,
      companyName: companiesTable.name,
      title: catalogJobs.title,
      locations: catalogJobs.locations,
      applyUrl: catalogJobs.applyUrl,
      publishedAt: catalogJobs.publishedAt,
      level: catalogJobs.level,
      closedAt: catalogJobs.closedAt,
    })
    .from(catalogJobs)
    .innerJoin(companiesTable, eq(companiesTable.id, catalogJobs.companyId))
    .innerJoin(companyJobSources, eq(companyJobSources.id, catalogJobs.sourceId))
    .where(and(
      isNull(catalogJobs.closedAt),
      eq(companyJobSources.status, "verified"),
      eq(companiesTable.status, "listed"),
      or(like(catalogJobs.title, pattern), like(catalogJobs.locations, pattern)),
    ))
    .limit(Math.min(Math.max(candidateLimit, 1), 200));
  return rows.map(row => ({
    ...row,
    locations: parseLocations(row.locations),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  }));
}

/** Production wiring: the same sources the existing directory, discovery, preview and catalog surfaces read. */
export function createUniversalSearchDeps(resolveEmployerDomainFromTargetUrl: (url: string) => Promise<string | undefined>): UniversalSearchDeps {
  return {
    loadDirectory: loadDirectorySnapshot,
    discover: (query, clientKey) => discoverCompanies(query, { clientKey }),
    preview: url => previewJobLink(url, resolveEmployerDomainFromTargetUrl),
    searchJobs: searchCatalogJobRows,
    catalogEnabled: () => JOB_CATALOG_ENABLED,
  };
}

export function createUniversalSearch(resolveEmployerDomainFromTargetUrl: (url: string) => Promise<string | undefined>) {
  const deps = createUniversalSearchDeps(resolveEmployerDomainFromTargetUrl);
  return (query: string, clientKey?: string) => runUniversalSearch(query, deps, clientKey);
}

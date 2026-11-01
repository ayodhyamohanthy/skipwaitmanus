// D-086 demand-list contract: a public, k-anonymous count of the people asking
// for a referral at a listed company, plus the admin-only queue of unlisted
// company domains. Two switches, both false until the release row (D-223 (3)).
//
// Liveness is the runtime's own predicate, imported from shared/referral.ts:
// status "pending" and not `isAskExpired`. This module applies no age cutoff of
// its own, so when D-174-expiry-clock-removal lands nothing here changes.
//
// Nothing here reads referrer, availability, slot, wallet or plan data:
// coverage-neutral demand is the owner's own reading (packet §4.2). No name,
// email, request id or request text ever leaves these functions.
import { z } from "zod";
import { isCorporateEmailDomain } from "./const";
import { isAskExpired, type ReferralStatus } from "./referral";

/** Public demand routes and client hooks. One reviewed line; there is no env key. */
export const COMPANY_DEMAND_PUBLIC_ENABLED = false;
/** The admin queue of unlisted domains. */
export const COMPANY_DEMAND_ADMIN_ENABLED = false;
/** D-086 (2): a number only from 3 people up. */
export const DEMAND_PUBLIC_MIN = 3;
/** The admin queue's output bound. */
export const UNLISTED_DEMAND_MAX_ROWS = 200;

export type PublicDemand = { state: "none" } | { state: "few" } | { state: "count"; people: number };

const noneDemandSchema = z.strictObject({ state: z.literal("none") });
const fewDemandSchema = z.strictObject({ state: z.literal("few") });
const countDemandSchema = z.strictObject({ state: z.literal("count"), people: z.number().int().min(DEMAND_PUBLIC_MIN) });

/** none | few | count, and nothing else: no total, no request count, no domain. */
export const publicDemandSchema = z.union([noneDemandSchema, fewDemandSchema, countDemandSchema]);

export const demandListEntrySchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9-]{1,48}$/),
  name: z.string().min(1).max(160),
  demand: publicDemandSchema,
});
export type DemandListEntry = z.infer<typeof demandListEntrySchema>;

export const companyDemandListResponseSchema = z.strictObject({ companies: z.array(demandListEntrySchema) });
export const companyDemandDetailResponseSchema = z.strictObject({ demand: publicDemandSchema });
export const unlistedDemandAdminResponseSchema = z.strictObject({
  domains: z.array(z.strictObject({ domain: z.string().min(1).max(255), people: z.number().int().positive() })),
});

/** One directory company as the count sees it: slug, display name, owned domains. */
export type DemandCompany = { slug: string; name: string; domains: readonly string[] };

/** One request row, read plain so the maths stays pure and testable. */
export type DemandRow = {
  /** `jobs.company`: the employer domain (never a company name). */
  company: string;
  userId: number;
  canonicalPersonId?: number | null;
  role?: string | null;
  userSuspended?: boolean | null;
  personSuspended?: boolean | null;
  status: ReferralStatus;
  referrerId?: number | null;
  createdAt: Date | string | number | null;
  coverageVisibleAt?: Date | string | number | null;
  waitingForCoverage?: boolean | null;
};

/** The operator's own page is not demand (shared/flowBaseline.ts). */
const OPERATOR_SLUG = "skipwait";

const normalizeDomain = (domain: string) => domain.trim().toLowerCase();

/** A request is live while it is pending and the runtime has not ended it. */
export function isLiveDemandRow(row: DemandRow, nowMs: number): boolean {
  if (row.status !== "pending") return false;
  return !isAskExpired(
    { status: row.status, referrerId: row.referrerId ?? null, createdAt: row.createdAt, coverageVisibleAt: row.coverageVisibleAt ?? null, waitingForCoverage: row.waitingForCoverage ?? false },
    nowMs,
  );
}

/** Nothing about an excluded person is published, whatever else the row says. */
function countsAsDemand(row: DemandRow, nowMs: number): boolean {
  if (!isLiveDemandRow(row, nowMs)) return false;
  if (row.role === "admin") return false;
  if (row.userSuspended === true || row.personSuspended === true) return false;
  return true;
}

/** The person behind a row: the canonical person when known, the login otherwise. */
const personOf = (row: DemandRow) => row.canonicalPersonId ?? row.userId;

/**
 * Distinct people per listed company, over all of that company's domains.
 * Every company passed in comes back, including the ones at zero, in the order
 * given: ordering for display is `orderDemandList`'s job.
 */
export function countDemandPeople(rows: readonly DemandRow[], companies: readonly DemandCompany[], nowMs: number): Array<{ slug: string; name: string; people: number }> {
  const byDomain = new Map<string, string>();
  for (const company of companies) {
    if (company.slug === OPERATOR_SLUG) continue;
    for (const domain of company.domains) byDomain.set(normalizeDomain(domain), company.slug);
  }
  const people = new Map<string, Set<number>>(companies.filter(company => company.slug !== OPERATOR_SLUG).map(company => [company.slug, new Set<number>()]));
  for (const row of rows) {
    if (!countsAsDemand(row, nowMs)) continue;
    const slug = byDomain.get(normalizeDomain(row.company));
    if (slug === undefined) continue;
    people.get(slug)?.add(personOf(row));
  }
  return companies.map(company => ({ slug: company.slug, name: company.name, people: people.get(company.slug)?.size ?? 0 }));
}

/** D-086 (2): no number below the floor, and never a total. */
export function toPublicDemand(people: number): PublicDemand {
  if (!Number.isFinite(people) || people <= 0) return { state: "none" };
  if (people < DEMAND_PUBLIC_MIN) return { state: "few" };
  return { state: "count", people: Math.floor(people) };
}

/**
 * Display order: counts by people descending then name, and every "few" after
 * them by name alone, so the order cannot reveal one person from two.
 */
export function orderDemandList(counts: ReadonlyArray<{ slug: string; name: string; people: number }>): DemandListEntry[] {
  const entries = counts.map(entry => ({ slug: entry.slug, name: entry.name, people: entry.people, demand: toPublicDemand(entry.people) }));
  const counted = entries
    .filter(entry => entry.demand.state === "count")
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name))
    .map(entry => ({ slug: entry.slug, name: entry.name, demand: entry.demand }));
  const few = entries
    .filter(entry => entry.demand.state === "few")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => ({ slug: entry.slug, name: entry.name, demand: entry.demand }));
  return [...counted, ...few];
}

/**
 * The moderated-admission queue (packet §4.5 (b)): live-request domains that no
 * company owns, by distinct people. Personal-mail domains are never companies,
 * so they are excluded; the output is bounded.
 */
export function countUnlistedDemand(rows: readonly DemandRow[], ownedDomains: readonly string[], nowMs: number): Array<{ domain: string; people: number }> {
  const owned = new Set(ownedDomains.map(normalizeDomain).filter(Boolean));
  const people = new Map<string, Set<number>>();
  for (const row of rows) {
    if (!countsAsDemand(row, nowMs)) continue;
    const domain = normalizeDomain(row.company);
    if (!domain || owned.has(domain) || !isCorporateEmailDomain(domain)) continue;
    const seen = people.get(domain) ?? new Set<number>();
    seen.add(personOf(row));
    people.set(domain, seen);
  }
  return Array.from(people, ([domain, seen]) => ({ domain, people: seen.size }))
    .sort((a, b) => b.people - a.people || a.domain.localeCompare(b.domain))
    .slice(0, UNLISTED_DEMAND_MAX_ROWS);
}

/** Packet §4.8, the approved copy. It replaces the PRD's demand-list section at release. */
export const DEMAND_LIST_HEADING = "Companies in our directory where people are asking for a referral";
export const DEMAND_UNLISTED_SEEKER_LINE = "Your company isn't listed? Request a referral with a job link from its careers site.";
export const DEMAND_UNLISTED_EMPLOYEE_LINE = "Work at a company that isn't listed? Verify your work email to help people asking there.";

export function demandCountLine(companyName: string, people: number): string {
  return `${people} people are asking for a referral at ${companyName}.`;
}

export function demandFewLine(companyName: string): string {
  return `A few people are asking for a referral at ${companyName}.`;
}

/** The one sentence a page shows, or null when nothing renders. */
export function demandLine(demand: PublicDemand, companyName: string): string | null {
  if (demand.state === "count") return demandCountLine(companyName, demand.people);
  if (demand.state === "few") return demandFewLine(companyName);
  return null;
}

/** A plain link, never a black commit: the referrer sign-in is the work-email code (D-030/D-057). */
export function demandHelpLine(companyName: string): string {
  return `Work at ${companyName}? Verify your work email to help.`;
}

/** Informational only: no figure (those come from D-099 with a source), no guarantee (D-055, D-088). */
export function demandBonusLine(companyName: string): string {
  return `If ${companyName} pays employees a referral bonus, ${companyName} sets and pays it under its own rules. skipwait.me never pays referrers.`;
}

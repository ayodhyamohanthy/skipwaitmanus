// Pure helpers for Find a referral (design/goal-ui/pick/find-a-referral.*).
// The directory is alphabetical so open companies are not pushed to the top;
// availability is a fact from the server (openToReferrals), never a guess.
// Money lines say what the code does (shared/moneyCopy.ts, D-063): an open
// company spends a credit when a verified employee can see the ask, a company
// with no available employee waits for free (D-034) and holds the ask if the
// seeker has no credit then (D-047).
import type { PublicCompany } from "@shared/companies";
import { JOB_FUNCTIONS, parseJobFunction, type JobFunction } from "@shared/jobFunctions";
import { CREDIT_ENDED_CAVEAT } from "@shared/moneyCopy";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { HOSTED_JOB_PLATFORMS, isValidTargetRoleUrl, jobLinkFitsCompany, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";

export type DirectoryFilter = { query: string; openOnly: boolean; fn: JobFunction | null };
export const FILTER_FUNCTIONS: readonly JobFunction[] = JOB_FUNCTIONS;

export function companyMatches(company: PublicCompany, filter: DirectoryFilter): boolean {
  const query = filter.query.trim().toLowerCase();
  if (query && !`${company.name} ${company.industry} ${company.functions.join(" ")}`.toLowerCase().includes(query)) return false;
  if (filter.openOnly && !company.openToReferrals) return false;
  if (filter.fn && !company.functions.some(label => label === filter.fn || parseJobFunction(label) === filter.fn)) return false;
  return true;
}

export function filterCompanies(companies: readonly PublicCompany[], filter: DirectoryFilter): PublicCompany[] {
  return companies.filter(company => companyMatches(company, filter)).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export const directorySummary = (shown: readonly PublicCompany[]) => ({ total: shown.length, open: shown.filter(company => company.openToReferrals).length });

export type LinkHint = { tone: "pass" | "muted"; text: string } | { tone: "error"; text: string } | null;

const possessive = (name: string) => `${name}${name.toLowerCase().endsWith("s") ? "’" : "’s"}`;

const hostOf = (value: string) => {
  try { return new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
};

/** What the job-link field says under itself. `touched` decides whether an unfinished link is an error yet. */
export function linkHint(url: string, company: Pick<PublicCompany, "name" | "domains"> | null, touched: boolean): LinkHint {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!isValidTargetRoleUrl(trimmed)) return touched ? { tone: "error", text: TARGET_ROLE_URL_ERROR } : null;
  if (!company) return { tone: "muted", text: "We’ll confirm the employer when you send." };
  if (!jobLinkFitsCompany(trimmed, company.domains)) return { tone: "error", text: `This link isn’t from ${company.name}. Paste a job link from ${possessive(company.name)} own careers page.` };
  const host = hostOf(trimmed);
  const onJobBoard = host !== null && HOSTED_JOB_PLATFORMS.some(domain => host === domain || host.endsWith(`.${domain}`)) && !company.domains.some(domain => host === domain || host.endsWith(`.${domain}`));
  return onJobBoard ? { tone: "muted", text: `We’ll confirm it’s a ${company.name} role when you send.` } : { tone: "pass", text: `Matches ${possessive(company.name)} careers site` };
}

const GENERIC_SEGMENTS = new Set(["jobs", "job", "view", "careers", "career", "apply", "application", "positions", "position", "openings", "opening", "detail", "details", "en", "us", "in", "www"]);

/**
 * A role title read from the job link the seeker pasted, for the drawer's
 * context line. It never invents one: a link with no readable slug (a numeric
 * job id) returns null, and the line shows the company alone.
 */
export function roleTitleFromUrl(url: string): string | null {
  let segments: string[];
  try { segments = new URL(url.trim()).pathname.split("/").map(segment => decodeURIComponent(segment)).filter(Boolean); }
  catch { return null; }
  const candidate = [...segments].reverse().find(segment => /[a-z]{2,}/i.test(segment) && !GENERIC_SEGMENTS.has(segment.toLowerCase()) && !/^\d+$/.test(segment));
  if (!candidate) return null;
  const words = candidate
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return words.map(word => (word.length <= 3 && word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join(" ").slice(0, 80);
}

export type CostLine = { line: string; detail: string; blockedReason: string | null };

/** The cost line beside Send ask, visible from the moment the drawer opens (no drip pricing). */
export function costLine(input: { open: boolean | null; balance: number | null }): CostLine {
  if (input.open === false) {
    return {
      line: "No credit used until a verified employee can see it",
      detail: `It waits up to ${COVERAGE_WAIT_DAYS} days. When one can, 1 credit is used; if you have none then, we hold it until you add one.`,
      blockedReason: null,
    };
  }
  const detail = `Comes back if you withdraw before anyone picks it up, or if nobody picks it up within ${ASK_TTL_DAYS} days, ${CREDIT_ENDED_CAVEAT}. Once picked up, it stays spent, even if they pass.`;
  if (input.open === null) return { line: "Uses 1 credit when a verified employee can see it", detail, blockedReason: null };
  if (input.balance === null) return { line: "Uses 1 credit", detail, blockedReason: null };
  if (input.balance <= 0) return { line: "You have no credits left", detail: "Add a credit pack in Plans and credits to send this ask now.", blockedReason: "You have no credits left. Add a credit pack in Plans and credits." };
  return { line: `Uses 1 of your ${input.balance} ${input.balance === 1 ? "credit" : "credits"}`, detail, blockedReason: null };
}

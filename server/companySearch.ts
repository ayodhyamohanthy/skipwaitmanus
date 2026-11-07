// Company name search for the seeker journey (D-174-company-search).
// Matches the NAME and its aliases only, never industry or functions (D-176).
// Not employer routing: server/employerRouting.ts keeps its own key.
import { COMPANY_NAME_ALIASES } from "../shared/companyNameAliases";
import type { PublicCompany } from "../shared/companies";

export const COMPANY_SEARCH_LIMIT = 10;
const LEGAL_SUFFIXES = new Set(["ltd", "limited", "pvt", "private", "inc", "llc", "gmbh", "corp", "corporation"]);

/** NFKD fold, lowercase, punctuation stripped, legal suffixes dropped. */
export function normalizeCompanyName(value: string): string {
  const words = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const kept = words.filter(word => !LEGAL_SUFFIXES.has(word));
  return (kept.length ? kept : words).join(" ");
}

/** Rank: 0 name prefix, 1 alias match, 2 name contains; undefined for no match. */
function rank(company: PublicCompany, q: string, aliases: Readonly<Record<string, readonly string[]>>): number | undefined {
  const name = normalizeCompanyName(company.name);
  if (name.startsWith(q)) return 0;
  if ((aliases[company.slug] ?? []).some(alias => normalizeCompanyName(alias).includes(q))) return 1;
  if (name.includes(q)) return 2;
  return undefined;
}

export function searchCompanies(companies: readonly PublicCompany[], query: string, aliases: Readonly<Record<string, readonly string[]>> = COMPANY_NAME_ALIASES, limit = COMPANY_SEARCH_LIMIT): PublicCompany[] {
  const q = normalizeCompanyName(query);
  if (!q) return [];
  return companies
    .map((company, index) => ({ company, index, r: rank(company, q, aliases) }))
    .filter((hit): hit is { company: PublicCompany; index: number; r: number } => hit.r !== undefined)
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .slice(0, Math.min(limit, COMPANY_SEARCH_LIMIT))
    .map(hit => hit.company);
}

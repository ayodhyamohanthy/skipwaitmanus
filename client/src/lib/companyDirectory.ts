// Company directory client boundary. The server owns the directory
// (GET /api/companies, /api/companies/:slug); every payload is parsed with
// the shared Zod contract here, and screens read it through React Query.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { companyDetailResponseSchema, companyDirectoryResponseSchema, type CompanyDirectoryResponse, type PublicCompany } from "@shared/companies";
import { readApiJson } from "@/lib/apiResponse";

export type { PublicCompany } from "@shared/companies";

export const COMPANY_DIRECTORY_ERROR = "We could not load companies. Check your connection and try again.";
const COMPANY_ERROR = "We could not load this company. Check your connection and try again.";

/** The slug is not a listed company: render the app's 404, never retry. */
export class CompanyNotFoundError extends Error {}

export const companyDirectoryKeys = {
  all: ["company-directory"] as const,
  one: (slug: string) => ["company-directory", "company", slug] as const,
};

async function getJson(path: string, fallback: string): Promise<{ status: number; payload: Record<string, unknown> }> {
  let response: Response;
  try { response = await fetch(path, { credentials: "same-origin" }); } catch { throw new Error(fallback); }
  if (response.status === 404) return { status: 404, payload: {} };
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  return { status: response.status, payload };
}

export async function fetchCompanyDirectory(): Promise<CompanyDirectoryResponse> {
  const { status, payload } = await getJson("/api/companies", COMPANY_DIRECTORY_ERROR);
  const parsed = companyDirectoryResponseSchema.safeParse(payload);
  if (status === 404 || !parsed.success) throw new Error(COMPANY_DIRECTORY_ERROR);
  return parsed.data;
}

export async function fetchCompany(slug: string): Promise<PublicCompany> {
  const { status, payload } = await getJson(`/api/companies/${encodeURIComponent(slug)}`, COMPANY_ERROR);
  if (status === 404) throw new CompanyNotFoundError("This door doesn't lead anywhere");
  const parsed = companyDetailResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(COMPANY_ERROR);
  return parsed.data.company;
}

/** One retry for a transient failure; a 404 is final. */
const retryTransient = (count: number, error: Error) => !(error instanceof CompanyNotFoundError) && count < 1;

export function useCompanyDirectory(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: companyDirectoryKeys.all, queryFn: fetchCompanyDirectory, staleTime: 60_000, retry: retryTransient, enabled: options.enabled ?? true });
}

/** One door. A directory already in the cache paints it instantly while the detail confirms it. */
export function useCompany(slug: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: companyDirectoryKeys.one(slug),
    queryFn: () => fetchCompany(slug),
    staleTime: 60_000,
    retry: retryTransient,
    placeholderData: () => client.getQueryData<CompanyDirectoryResponse>(companyDirectoryKeys.all)?.companies.find(company => company.slug === slug),
  });
}

/** The listed company that owns a work-email or job domain, if any. */
export function findCompanyByDomain(companies: readonly PublicCompany[], domain: string): PublicCompany | undefined {
  const wanted = domain.trim().toLowerCase();
  return wanted ? companies.find(company => company.domains.includes(wanted)) : undefined;
}

/** A typed name that already has a door: the kit's prefix match, case-insensitive. */
export function findListedCompanyByName(companies: readonly PublicCompany[], typed: string, mode: "prefix" | "exact"): PublicCompany | undefined {
  const needle = typed.trim().toLowerCase();
  if (needle.length < 2) return undefined;
  return companies.find(company => (mode === "exact" ? company.name.toLowerCase() === needle : company.name.toLowerCase().startsWith(needle)));
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"] as const;

/** Number words up to twenty, numerals after ("five", "21"). */
export function numberWord(value: number): string {
  const word = Number.isInteger(value) && value >= 0 ? WORDS[value] : undefined;
  return word ?? String(value);
}

/** "Find people open to referral requests at A, B, and C." from the live directory. */
export function exploreDescription(companies: readonly PublicCompany[]): string | undefined {
  if (companies.length === 0) return undefined;
  return `Find people open to referral requests at ${new Intl.ListFormat("en-US", { type: "conjunction" }).format(companies.map(company => company.name))}.`;
}

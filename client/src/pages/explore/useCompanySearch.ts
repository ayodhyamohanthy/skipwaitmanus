// D-174-seeker-journey-build.search (packet §6.4, ruling 8): the client side of
// GET /api/companies/search (D-174-company-search). The release row turns the
// switch on; while it is false, /explore keeps today's client filter byte-for-byte
// and nothing here sends a request.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { companySearchResponseSchema } from "@shared/companies";
import { readApiJson } from "@/lib/apiResponse";

export const COMPANY_TYPEAHEAD_ENABLED = false;
export const COMPANY_SEARCH_DEBOUNCE_MS = 150;
export const COMPANY_SEARCH_MAX = 10;
const COMPANY_SEARCH_ERROR = "We could not search companies. Check your connection and try again.";

export type CompanySuggestion = ReturnType<typeof companySearchResponseSchema.parse>["companies"][number];

/** One `q`, trimmed; the response is parsed with the route's own strict schema (no availability key, at most 10). */
export async function fetchCompanySearch(query: string): Promise<CompanySuggestion[]> {
  const q = query.trim();
  let response: Response;
  try {
    response = await fetch(`/api/companies/search?${new URLSearchParams({ q }).toString()}`, { credentials: "same-origin" });
  } catch {
    throw new Error(COMPANY_SEARCH_ERROR);
  }
  const payload = await readApiJson<Record<string, unknown>>(response, COMPANY_SEARCH_ERROR);
  if (!response.ok) throw new Error(COMPANY_SEARCH_ERROR);
  const parsed = companySearchResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(COMPANY_SEARCH_ERROR);
  return parsed.data.companies;
}

function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export interface CompanySearchState {
  /** The trimmed query the suggestions answer (empty while nothing is asked). */
  query: string;
  suggestions: CompanySuggestion[];
  /** The settled query got an answer with no company in it. */
  noMatch: boolean;
}

/** Debounced 150 ms, at least one non-space character; a failed request adds nothing. */
export function useCompanySearch(input: string, enabled: boolean): CompanySearchState {
  const query = useDebounced(input.trim(), COMPANY_SEARCH_DEBOUNCE_MS);
  const active = enabled && query.length >= 1 && query === input.trim();
  const result = useQuery({
    queryKey: ["company-directory", "search", query] as const,
    queryFn: () => fetchCompanySearch(query),
    enabled: enabled && query.length >= 1,
    staleTime: 60_000,
    retry: false,
  });
  if (!active || !result.isSuccess) return { query: active ? query : "", suggestions: [], noMatch: false };
  return { query, suggestions: result.data, noMatch: result.data.length === 0 };
}

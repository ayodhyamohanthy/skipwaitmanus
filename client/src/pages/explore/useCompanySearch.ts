// D-174-seeker-journey-build.search (packet §6.4, ruling 8): the client side of
// GET /api/companies/search (D-174-company-search). The release row turns the
// switch on; while it is false, /explore keeps today's client filter byte-for-byte
// and nothing here sends a request.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { companySearchQuerySchema, companySearchResponseSchema } from "@shared/companies";
import { readApiJson } from "@/lib/apiResponse";

export const COMPANY_TYPEAHEAD_ENABLED = false;
export const COMPANY_SEARCH_DEBOUNCE_MS = 150;
export const COMPANY_SEARCH_MAX = 10;
const COMPANY_SEARCH_ERROR = "We could not search companies. Check your connection and try again.";

/**
 * The route answers 400 when `q` breaks its own query contract
 * (`companySearchQuerySchema`: over 80 characters after trim). That is invalid
 * input, not a connection failure: asking again cannot succeed, so it is never retried.
 */
class CompanySearchInvalidError extends Error {
  constructor() { super("Invalid search"); this.name = "CompanySearchInvalidError"; }
}
export const isCompanySearchInvalid = (error: unknown): boolean => error instanceof CompanySearchInvalidError;
/** The route's own contract, read client-side so a query it would refuse is never sent (no silent truncation). */
const acceptedByRoute = (q: string) => companySearchQuerySchema.safeParse({ q }).success;

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
  if (response.status === 400) throw new CompanySearchInvalidError();
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

/** idle: nothing asked (switch off or a blank box); loading: settling or in flight; error: the request failed (retryable);
 * invalid: the route's contract refuses the query (400, never retried); ready: answered. */
export type CompanySearchStatus = "idle" | "loading" | "error" | "invalid" | "ready";
/** Why a query is invalid: "too-long" when the shared schema refuses it (over its 80-character limit after trim,
 * never sent, never truncated); "refused" when the route answered 400 to a query the schema accepts (cause unknown). */
export type CompanySearchInvalidReason = "too-long" | "refused";

export interface CompanySearchState {
  status: CompanySearchStatus;
  /** The trimmed query the state answers (empty while idle). */
  query: string;
  suggestions: CompanySuggestion[];
  /** The settled query got an answer with no company in it. */
  noMatch: boolean;
  /** Set only while status is "invalid". */
  invalidReason?: CompanySearchInvalidReason;
  /** Re-runs the settled query (the error state's retry line). */
  retry(): void;
}

/** Debounced 150 ms, at least one non-space character; a failed request is the error state, never a fake empty answer. */
export function useCompanySearch(input: string, enabled: boolean): CompanySearchState {
  const typed = input.trim();
  const query = useDebounced(typed, COMPANY_SEARCH_DEBOUNCE_MS);
  const result = useQuery({
    queryKey: ["company-directory", "search", query] as const,
    queryFn: () => fetchCompanySearch(query),
    enabled: enabled && query.length >= 1 && acceptedByRoute(query),
    staleTime: 60_000,
    retry: false,
  });
  const retry = () => { void result.refetch(); };
  const empty = { suggestions: [] as CompanySuggestion[], noMatch: false, retry };
  if (!enabled || typed.length === 0) return { status: "idle", query: "", ...empty };
  if (query === typed && !acceptedByRoute(query)) return { status: "invalid", invalidReason: "too-long", query, ...empty };
  if (query !== typed || result.isFetching || result.isPending) return { status: "loading", query: typed, ...empty };
  if (result.isError && isCompanySearchInvalid(result.error)) return { status: "invalid", invalidReason: "refused", query, ...empty };
  if (result.isError) return { status: "error", query, ...empty };
  return { status: "ready", query, suggestions: result.data, noMatch: result.data.length === 0, retry };
}

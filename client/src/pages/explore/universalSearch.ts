// SEARCH-universal (D-394): the client side of GET /api/search. One box takes
// a job title, a job link, a company name or a company website; the answer is
// parsed with the route's own strict schema, so a shape the server would not
// send is an error, never a half-rendered result.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DiscoveredCompany } from "@shared/companies";
import { searchQuerySchema, searchResponseSchema, type SearchJobHit, type SearchJobLink, type SearchResponse } from "@shared/search";
import { readApiJson } from "@/lib/apiResponse";

export const UNIVERSAL_SEARCH_DEBOUNCE_MS = 250;
const SEARCH_ERROR = "We could not search. Check your connection and try again.";

/** The route answers 400 when `q` breaks its own contract (over 200 characters after trim): asking again cannot succeed. */
class UniversalSearchInvalidError extends Error {
  constructor() { super("Invalid search"); this.name = "UniversalSearchInvalidError"; }
}
export const isUniversalSearchInvalid = (error: unknown): boolean => error instanceof UniversalSearchInvalidError;
/** The route's own contract, read client-side so a query it would refuse is never sent (no silent truncation). */
const acceptedByRoute = (q: string) => searchQuerySchema.safeParse({ q }).success;

/** One `q`, trimmed; the response is parsed with the route's own strict schema. */
export async function fetchUniversalSearch(query: string): Promise<SearchResponse> {
  const q = query.trim();
  let response: Response;
  try {
    response = await fetch(`/api/search?${new URLSearchParams({ q }).toString()}`, { credentials: "same-origin" });
  } catch {
    throw new Error(SEARCH_ERROR);
  }
  if (response.status === 400) throw new UniversalSearchInvalidError();
  const payload = await readApiJson<Record<string, unknown>>(response, SEARCH_ERROR);
  if (!response.ok) throw new Error(SEARCH_ERROR);
  const parsed = searchResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(SEARCH_ERROR);
  return parsed.data;
}

function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export type UniversalSearchStatus = "idle" | "loading" | "error" | "invalid" | "ready";
/** "too-long" when the shared schema refuses it (never sent, never truncated); "refused" when the route answered 400 to a query the schema accepts. */
export type UniversalSearchInvalidReason = "too-long" | "refused";

export interface UniversalSearchState {
  status: UniversalSearchStatus;
  /** The trimmed query the state answers (empty while idle). */
  query: string;
  /** What the server decided the input is; null until an answer arrives. */
  kind: SearchResponse["kind"] | null;
  /** Directory companies (the typeahead's suggestions), presence included. */
  suggestions: SearchResponse["companies"];
  /** Worldwide candidates the directory does not hold. */
  discovered: DiscoveredCompany[];
  /** "degraded" means worldwide search was limited, so an empty `discovered` is not "no such company". */
  discoveryState?: "ok" | "degraded";
  /** The posting URL's resolution when the input was a job link. */
  jobLink: SearchJobLink | null;
  /** Open catalog jobs for a title or keyword, newest first. */
  jobs: SearchJobHit[];
  /** "unavailable" when no job source is live: an empty `jobs` then says nothing about the query. */
  catalogState: "ok" | "unavailable";
  /** The settled query got an answer with no company, no job and no resolved link. */
  noMatch: boolean;
  /** Set only while status is "invalid". */
  invalidReason?: UniversalSearchInvalidReason;
  /** Re-runs the settled query (the error state's retry line). */
  retry(): void;
}

/** Debounced 250 ms, at least one non-space character; a failed request is the error state, never a fake empty answer. */
export function useUniversalSearch(input: string, enabled: boolean): UniversalSearchState {
  const typed = input.trim();
  const query = useDebounced(typed, UNIVERSAL_SEARCH_DEBOUNCE_MS);
  const result = useQuery({
    queryKey: ["universal-search", query] as const,
    queryFn: () => fetchUniversalSearch(query),
    enabled: enabled && query.length >= 1 && acceptedByRoute(query),
    staleTime: 60_000,
    retry: false,
  });
  const retry = () => { void result.refetch(); };
  const empty = {
    kind: null, suggestions: [] as SearchResponse["companies"], discovered: [] as DiscoveredCompany[],
    jobLink: null, jobs: [] as SearchJobHit[], catalogState: "unavailable" as const, noMatch: false, retry,
  };
  if (!enabled || typed.length === 0) return { status: "idle", query: "", ...empty };
  if (query === typed && !acceptedByRoute(query)) return { status: "invalid", invalidReason: "too-long", query, ...empty };
  if (query !== typed || result.isFetching || result.isPending) return { status: "loading", query: typed, ...empty };
  if (result.isError && isUniversalSearchInvalid(result.error)) return { status: "invalid", invalidReason: "refused", query, ...empty };
  if (result.isError) return { status: "error", query, ...empty };
  const data = result.data;
  // A degraded discovery answer is not a no-match: worldwide search was limited, so empty here says nothing.
  const noMatch = data.companies.length === 0 && data.discovered.length === 0 && data.jobs.length === 0 && data.jobLink === null && data.discoveryState !== "degraded";
  return {
    status: "ready", query, kind: data.kind, suggestions: data.companies, discovered: data.discovered,
    discoveryState: data.discoveryState, jobLink: data.jobLink, jobs: data.jobs, catalogState: data.catalogState, noMatch, retry,
  };
}

// FIX-jobs-catalog-search (issue 1706): what /jobs shows when the employer-posted list
// (/api/jobs) has no role for a search. The same query is answered from company
// careers sites through the universal search (/api/search, D-360, D-394), the rows
// /explore already shows. These rows are never JobPosting markup or sitemap entries
// (D-193: catalog rows stay out of /api/jobs); GoalJobs publishes JSON-LD for the
// posted list only. A failed search is said as a failure, never as "no match".
import { GoalEmptyState, GoalErrorState } from "@/components/goal";
import { UniversalSearchResults } from "@/pages/explore/UniversalSearchResults";
import { fetchUniversalSearch, isUniversalSearchInvalid, type UniversalSearchState } from "@/pages/explore/universalSearch";
import type { SearchJobHit, SearchResponse } from "@shared/search";

export type CatalogAnswer =
  | { status: "idle" }
  | { status: "none" }
  | { status: "error" }
  | { status: "ready"; response: SearchResponse };

/** One universal search for the submitted query; a refused query is no match, a failure stays a failure. */
export async function searchCatalog(query: string): Promise<CatalogAnswer> {
  try {
    return { status: "ready", response: await fetchUniversalSearch(query) };
  } catch (error) {
    return isUniversalSearchInvalid(error) ? { status: "none" } : { status: "error" };
  }
}

/** The location box filters careers-site roles the same way it filters posted ones: a plain substring. */
export function inLocation(jobs: readonly SearchJobHit[], location: string): SearchJobHit[] {
  const wanted = location.trim().toLowerCase();
  return wanted ? jobs.filter(job => job.locations.some(place => place.toLowerCase().includes(wanted))) : [...jobs];
}

export function emptyBody(location: string): string {
  return location.trim() ? "Clear the location or search for a role title instead." : "Search for a role title or a company name instead.";
}

interface JobsCatalogAnswerProps {
  /** The query and location the answer is for (the submitted search, not the text being typed). */
  query: string;
  location: string;
  answer: CatalogAnswer;
  onRetry(): void;
  onAsk(applyUrl: string): void;
}

export function JobsCatalogAnswer({ query, location, answer, onRetry, onAsk }: JobsCatalogAnswerProps) {
  if (!query.trim()) {
    return <GoalEmptyState className="px-0 max-gdesk:px-0" title="Search a role or company to see open roles." body="We show open roles from company careers sites, whether or not a referrer works there yet." />;
  }
  if (answer.status === "error") {
    return <GoalErrorState className="px-0 max-gdesk:px-0" title="We could not search company careers sites" body="Nothing was lost. Check your connection and try again." retry={{ label: "Try again", onClick: onRetry }} />;
  }
  if (answer.status === "ready") {
    const { response } = answer;
    const jobs = inLocation(response.jobs, location);
    if (jobs.length > 0 || response.jobLink) {
      const state: UniversalSearchState = {
        status: "ready", query: response.query, kind: response.kind, suggestions: response.companies, discovered: response.discovered,
        discoveryState: response.discoveryState, jobLink: response.jobLink, jobs, catalogState: response.catalogState, noMatch: false, retry: onRetry,
      };
      return (
        <div>
          <p className="text-g-meta text-g-ink-2">Open roles on company careers sites.</p>
          <UniversalSearchResults state={state} onOpenJobLink={(_slug, url) => onAsk(url)} />
        </div>
      );
    }
  }
  return <GoalEmptyState className="px-0 max-gdesk:px-0" title="No jobs match. Try a broader search." body={emptyBody(location)} />;
}

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { companyJobsResponseSchema } from "@shared/jobCatalog";
import { readApiJson } from "@/lib/apiResponse";

// D-174 jobs-list: only the separately accepted release may enable this mount.
export const COMPANY_JOBS_ENABLED = false;

export interface CompanyJobsFilters {
  location: string;
  level: string;
  function: string;
}

const JOBS_ERROR = "We couldn’t load jobs from the careers site. Try again.";

function isWebLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function useCompanyJobs(slug: string, filters: CompanyJobsFilters, online: boolean) {
  return useInfiniteQuery({
    queryKey: ["company-jobs", slug, filters.location, filters.level, filters.function],
    initialPageParam: "",
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (filters.location) params.set("location", filters.location);
      if (filters.level) params.set("level", filters.level);
      if (filters.function) params.set("function", filters.function);
      if (pageParam) params.set("cursor", pageParam);
      const query = params.toString();
      const response = await fetch(`/api/companies/${encodeURIComponent(slug)}/jobs${query ? `?${query}` : ""}`, {
        credentials: "same-origin", signal,
      });
      const payload = await readApiJson(response, JOBS_ERROR);
      const parsed = companyJobsResponseSchema.safeParse(payload);
      if (!response.ok || !parsed.success || parsed.data.jobs.some(job => !isWebLink(job.applyUrl))) {
        throw new Error(JOBS_ERROR);
      }
      return parsed.data;
    },
    getNextPageParam: page => page.nextCursor || undefined,
    // Keep facets while a new filter loads, never render placeholder jobs as its result.
    placeholderData: keepPreviousData,
    enabled: Boolean(slug) && online,
    staleTime: 60_000,
    retry: false,
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { companySlugForJobCompany, type LaunchCompany } from "@/lib/companies";

/** Public catalog row from GET /api/jobs (server/privateReferralRoutes.ts). */
const companyJobSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  seniority: z.string(),
  workMode: z.string(),
  // Nullable column; an omitted value means "no posting link", not a bad row.
  targetRoleUrl: z.string().nullish().transform(value => value ?? null),
});
export type CompanyJob = z.infer<typeof companyJobSchema>;

const jobsResponseSchema = z.object({ jobs: z.array(z.unknown()) });
const savedRolesResponseSchema = z.object({ saved: z.array(z.object({ jobId: z.number().int().positive() })) });

export const JOBS_ERROR = "We could not load listed roles right now.";
export const SAVE_ERROR = "We could not update your saved roles. Try again.";

type TokenGetter = () => Promise<string | null | undefined>;

async function authHeaders(getToken: TokenGetter): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Only roles whose employer resolves to this exact launch company count. */
export async function fetchCompanyJobs(company: LaunchCompany, signal?: AbortSignal): Promise<CompanyJob[]> {
  const response = await fetch(`/api/jobs?query=${encodeURIComponent(company.name)}`, { signal });
  if (!response.ok) throw new Error(JOBS_ERROR);
  const payload = jobsResponseSchema.safeParse(await response.json());
  if (!payload.success) throw new Error(JOBS_ERROR);
  return payload.data.jobs.flatMap(item => {
    const job = companyJobSchema.safeParse(item);
    return job.success && companySlugForJobCompany(job.data.company) === company.slug ? [job.data] : [];
  });
}

export function useCompanyJobs(company: LaunchCompany | undefined) {
  return useQuery({
    queryKey: ["explore", "company-jobs", company?.slug ?? ""],
    enabled: Boolean(company),
    staleTime: 60_000,
    // One quiet retry, then the honest failure state with its own retry button.
    retry: 1,
    queryFn: ({ signal }) => {
      if (!company) return Promise.resolve<CompanyJob[]>([]);
      return fetchCompanyJobs(company, signal);
    },
  });
}

function savedRolesKey(userId: string | null | undefined) {
  return ["explore", "saved-role-ids", userId ?? "session"] as const;
}

/** The signed-in seeker's saved job ids. A failed read leaves every toggle unsaved. */
export function useSavedRoleIds(isSignedIn: boolean, userId: string | null | undefined, getToken: TokenGetter) {
  return useQuery({
    queryKey: savedRolesKey(userId),
    enabled: isSignedIn,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/saved-roles", { credentials: "include", headers: await authHeaders(getToken), signal });
      if (!response.ok) throw new Error("We could not load your saved roles");
      const payload = savedRolesResponseSchema.safeParse(await response.json());
      if (!payload.success) throw new Error("We could not load your saved roles");
      return payload.data.saved.map(item => item.jobId);
    },
  });
}

/** Desired-state save (PUT) / unsave (DELETE); idempotent on the server. */
export function useToggleSavedRole(userId: string | null | undefined, getToken: TokenGetter) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, save }: { jobId: number; save: boolean }) => {
      const response = await fetch(`/api/saved-roles/${jobId}`, { method: save ? "PUT" : "DELETE", credentials: "include", headers: await authHeaders(getToken) });
      if (!response.ok) throw new Error(SAVE_ERROR);
      return { jobId, save };
    },
    onSuccess: ({ jobId, save }) => {
      queryClient.setQueryData<number[]>(savedRolesKey(userId), current => {
        const ids = new Set(current ?? []);
        if (save) ids.add(jobId); else ids.delete(jobId);
        return Array.from(ids);
      });
    },
  });
}

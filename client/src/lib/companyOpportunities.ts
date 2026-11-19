// D-022 referrer-posted roles client boundary (docs/KIT_V4_BUILD_PLAN.md 3c).
// The server owns every projection: /api/companies/:slug/opportunities is the
// public, cached company read; /api/opportunities/mine is owner-only; renew and
// close are one-tap owner actions. Payloads are parsed with the shared Zod
// contract here, and screens read them through React Query.
import { useQuery } from "@tanstack/react-query";
import { companyOpportunitiesResponseSchema, myOpportunitiesResponseSchema, type OwnerOpportunityPost, type PublicOpportunityPost } from "@shared/companyOpportunities";
import { readApiJson } from "@/lib/apiResponse";

export type { OwnerOpportunityPost, PublicOpportunityPost } from "@shared/companyOpportunities";

const OPENINGS_ERROR = "We could not load the open roles. Check your connection and try again.";
const MY_OPENINGS_ERROR = "We could not load your openings. Check your connection and try again.";
const RENEW_ERROR = "We could not renew that opening. Try again in a moment.";
const CLOSE_ERROR = "We could not close that opening. Try again in a moment.";

/** The auth layer's token getter (WorkOS SDK JWT or null with the session cookie). */
export type TokenSource = () => Promise<string | null | undefined>;

export const companyOpportunityKeys = {
  company: (slug: string) => ["company-opportunities", slug] as const,
  mine: (userId: string | null) => ["company-opportunities", "mine", userId] as const,
};

export async function fetchCompanyOpportunities(slug: string): Promise<PublicOpportunityPost[]> {
  let response: Response;
  try { response = await fetch(`/api/companies/${encodeURIComponent(slug)}/opportunities`, { credentials: "same-origin" }); }
  catch { throw new Error(OPENINGS_ERROR); }
  const payload = await readApiJson<Record<string, unknown>>(response, OPENINGS_ERROR);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : OPENINGS_ERROR);
  const parsed = companyOpportunitiesResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(OPENINGS_ERROR);
  return parsed.data.opportunities;
}

/** One company's live openings; a failed load is retryable, never a 404 here. */
export function useCompanyOpportunities(slug: string) {
  return useQuery({ queryKey: companyOpportunityKeys.company(slug), queryFn: () => fetchCompanyOpportunities(slug), staleTime: 60_000, retry: count => count < 1, enabled: Boolean(slug) });
}

export async function fetchMyOpportunities(getToken: TokenSource): Promise<OwnerOpportunityPost[]> {
  const token = await getToken();
  let response: Response;
  try { response = await fetch("/api/opportunities/mine", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
  catch { throw new Error(MY_OPENINGS_ERROR); }
  const payload = await readApiJson<Record<string, unknown>>(response, MY_OPENINGS_ERROR);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : MY_OPENINGS_ERROR);
  const parsed = myOpportunitiesResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(MY_OPENINGS_ERROR);
  return parsed.data.opportunities;
}

/**
 * Renew opens a fresh 30-day window from now; close hides the post without
 * deleting it. The server answers only successes (foreign or missing ids are
 * 404s), and an unproven success is treated as a failure here so the list is
 * never updated on a response the client cannot prove.
 */
async function postOpportunityAction(opportunityId: number, action: "renew" | "close", getToken: TokenSource, fallback: string): Promise<void> {
  const token = await getToken();
  let response: Response;
  try { response = await fetch(`/api/opportunities/${opportunityId}/${action}`, { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
  catch { throw new Error(fallback); }
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  if ((action === "renew" ? payload.renewed : payload.closed) !== true) throw new Error(fallback);
}

export async function renewCompanyOpportunity(opportunityId: number, getToken: TokenSource): Promise<void> {
  return postOpportunityAction(opportunityId, "renew", getToken, RENEW_ERROR);
}

export async function closeCompanyOpportunity(opportunityId: number, getToken: TokenSource): Promise<void> {
  return postOpportunityAction(opportunityId, "close", getToken, CLOSE_ERROR);
}

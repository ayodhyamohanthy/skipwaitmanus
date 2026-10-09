// Edge contracts and fetchers for the seeker Requests screen (kit v4 /requests).
// Every number the screen draws comes from these two live endpoints:
//   GET  /api/company-referrals/mine      -> the seeker's asks
//   GET  /api/credits/summary?role=job_seeker -> the monthly credit wallet
//   POST /api/company-referrals/:id/withdraw  -> withdraw + refunded summary
// Payloads are parsed here so a malformed response reads as an error, never as
// a fabricated count.
import { z } from "zod";
import { referralStatuses } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";

export const LOAD_ERROR = "We could not load your referral requests";
export const CREDITS_ERROR = "We could not load your referral credits";
export const WITHDRAW_ERROR = "We could not withdraw this request";
export const NETWORK_ERROR = "We couldn’t reach SkipWait. Check your connection and try again.";

const referralRequestSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().nullish(),
  targetRoleUrl: z.string().nullish().transform(value => value ?? null),
  companyDomain: z.string(),
  compensation: z.string().nullish(),
  status: z.enum(referralStatuses),
  referrerId: z.number().int().nullish().transform(value => value ?? null),
  queueStatus: z.enum(["available_for_review", "waiting_for_coverage"]).nullish(),
  referrerMessage: z.string().nullish().transform(value => value ?? null),
  unreadMessageCount: z.coerce.number().int().min(0).catch(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  attachmentCount: z.coerce.number().int().min(0).catch(0),
  expiresAt: z.string().nullish(),
});

export type ReferralRequest = z.infer<typeof referralRequestSchema>;

const requestListSchema = z.object({ requests: z.array(referralRequestSchema).optional().transform(value => value ?? []) });

const creditSummarySchema = z.object({
  plan: z.string(),
  monthlyAllowance: z.number().int().min(0),
  monthlyCreditsRemaining: z.number().int(),
  purchasedCreditsRemaining: z.number().int(),
  totalAvailable: z.number().int(),
  cycleKey: z.string().nullish().transform(value => value ?? ""),
  subscriptionStatus: z.string().nullish().transform(value => value ?? null),
  subscriptionCurrentTermEnd: z.string().nullish().transform(value => value ?? null),
});

export type CreditSummary = z.infer<typeof creditSummarySchema>;

export function parseCreditSummary(payload: unknown): CreditSummary | null {
  const parsed = creditSummarySchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

type TokenSource = () => Promise<string | null | undefined>;

async function authedFetch(url: string, getToken: TokenSource, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  try {
    return await fetch(url, { ...init, credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
}

function serverMessage(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.error === "string" && payload.error ? payload.error : fallback;
}

export async function fetchMyRequests(getToken: TokenSource): Promise<ReferralRequest[]> {
  const response = await authedFetch("/api/company-referrals/mine", getToken);
  const payload = await readApiJson<Record<string, unknown>>(response, LOAD_ERROR);
  if (!response.ok) throw new Error(serverMessage(payload, LOAD_ERROR));
  const parsed = requestListSchema.safeParse(payload);
  if (!parsed.success) throw new Error(LOAD_ERROR);
  return parsed.data.requests;
}

export async function fetchSeekerCredits(getToken: TokenSource): Promise<CreditSummary> {
  const response = await authedFetch("/api/credits/summary?role=job_seeker", getToken);
  const payload = await readApiJson<Record<string, unknown>>(response, CREDITS_ERROR);
  if (!response.ok) throw new Error(serverMessage(payload, CREDITS_ERROR));
  const summary = parseCreditSummary(payload.summary);
  if (!summary) throw new Error(CREDITS_ERROR);
  return summary;
}

export type WithdrawResult = { creditSummary: CreditSummary | null };

export async function withdrawMyRequest(requestId: number, getToken: TokenSource): Promise<WithdrawResult> {
  const response = await authedFetch(`/api/company-referrals/${requestId}/withdraw`, getToken, { method: "POST" });
  const payload = await readApiJson<Record<string, unknown>>(response, "Withdraw didn't go through");
  if (!response.ok) throw new Error(serverMessage(payload, "Withdraw didn't go through"));
  return { creditSummary: parseCreditSummary(payload.creditSummary) };
}

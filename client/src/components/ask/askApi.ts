// Response boundary for the live /ask send path. The send and open-ask
// payloads are parsed with Zod before they drive the confirmation screen, and
// transport failures get plain copy instead of a raw browser error string.
import { z } from "zod";
import type { SentAsk } from "@/components/ask/AskSent";

const sendAskResponseSchema = z.object({
  requestId: z.number().int().positive(),
  companyDomain: z.string().nullish(),
  coverageStatus: z.string().nullish(),
});

const myAsksResponseSchema = z.object({
  requests: z.array(z.object({ status: z.string() })),
});

// Written by the job-link company confirmation step; browser storage is untrusted.
const companyConfirmationSchema = z.object({ canonicalUrl: z.string(), confirmedDomain: z.string().min(1) });

export const ASK_NETWORK_ERROR = "We couldn't reach SkipWait. Check your connection and try again.";

/** The created (or idempotently replayed) ask, or null when the payload is not a send result. */
export function parseSentAsk(payload: Record<string, unknown>): SentAsk | null {
  const parsed = sendAskResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const companyDomain = parsed.data.companyDomain?.trim() || null;
  return { requestId: parsed.data.requestId, companyDomain, waitingForCoverage: parsed.data.coverageStatus === "waiting_for_company_coverage" };
}

/** Pending asks from /api/company-referrals/mine; null when the list cannot be read. */
export function countOpenAsks(payload: Record<string, unknown>): number | null {
  const parsed = myAsksResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.requests.filter(request => request.status === "pending").length : null;
}

/** The confirmed employer domain, only when it was confirmed for exactly this job link. */
export function confirmedDomainFor(targetRoleUrl: string, stored: string | null): string | undefined {
  if (!stored) return undefined;
  let raw: unknown;
  try { raw = JSON.parse(stored); } catch { return undefined; }
  const parsed = companyConfirmationSchema.safeParse(raw);
  return parsed.success && parsed.data.canonicalUrl === targetRoleUrl ? parsed.data.confirmedDomain : undefined;
}

/** fetch() rejects with a TypeError when the network drops; everything else carries server copy. */
export function askErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof TypeError) return ASK_NETWORK_ERROR;
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

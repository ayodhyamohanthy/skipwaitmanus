// Response boundary for the live /ask send path. The send and open-ask
// payloads are parsed with Zod before they drive the confirmation screen, and
// transport failures get plain copy instead of a raw browser error string.
import { z } from "zod";
import type { SentAsk } from "@/components/ask/AskSent";
import type { JobFunction } from "@shared/jobFunctions";
import type { ReferrerLink } from "@shared/referrerLink";
import type { AskSendBody, ReferrerLinkFallback } from "@shared/askSend";

const sendAskResponseSchema = z.object({
  requestId: z.number().int().positive(),
  companyDomain: z.string().nullish(),
  coverageStatus: z.string().nullish(),
  fastTrack: z.boolean().nullish(),
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
  return { requestId: parsed.data.requestId, companyDomain, waitingForCoverage: parsed.data.coverageStatus === "waiting_for_company_coverage", ...(parsed.data.fastTrack ? { fastTrack: true as const } : {}) };
}

export type AskSendInput = {
  readonly targetRoleUrl: string;
  readonly attachmentId: number;
  readonly note: string;
  readonly companySlug?: string;
  readonly compensation: string;
  readonly jobFunction: JobFunction | null;
  readonly referrerLink: ReferrerLink | null;
  /** Set only on a send without a link, when the ask began on one (analytics; D-017). */
  readonly referrerLinkFallback?: ReferrerLinkFallback | null;
  readonly confirmedCompanyDomain?: string;
};

/** POST /api/company-referrals body (shared contract @shared/askSend). A personal referrer link goes as its own fields (D-017). */
export function buildAskBody(input: AskSendInput): AskSendBody {
  const compensation = input.compensation.trim().slice(0, 80);
  return {
    targetRoleUrl: input.targetRoleUrl,
    attachmentIds: [input.attachmentId],
    candidateMessage: input.note,
    // A request that began on a company page must stay with that company.
    ...(input.companySlug ? { companySlug: input.companySlug } : {}),
    ...(compensation ? { compensation } : {}),
    // Only an explicit pick is sent; otherwise the server infers the function.
    ...(input.jobFunction ? { jobFunction: input.jobFunction } : {}),
    ...(input.referrerLink ?? {}),
    ...(!input.referrerLink && input.referrerLinkFallback ? { referrerLinkFallback: input.referrerLinkFallback } : {}),
    ...(input.confirmedCompanyDomain ? { confirmedCompanyDomain: input.confirmedCompanyDomain } : {}),
  };
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

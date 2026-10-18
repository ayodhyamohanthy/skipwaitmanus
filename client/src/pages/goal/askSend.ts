// The ask send body (POST /api/company-referrals), built exactly as the old composer did so routing never changes:
// a company page's slug keeps the ask with that company, a posted role travels for the poster's first look (D-022),
// a personal link keeps the ask with its referrer (D-017), and a confirmed employer domain travels only when it was
// confirmed for exactly this link. Compensation is not sent (D-071); the server infers the job function.
import { composeWhyMe } from "@shared/whyMe";
import type { FastTrackAskFields } from "@/lib/fastTrackHandoff";

export const ASK_IDEMPOTENCY_KEY = "skipwait-ask-idempotency-key";

export function askIdempotencyKey(storage: Pick<Storage, "getItem" | "setItem"> | null): string {
  const existing = storage?.getItem(ASK_IDEMPOTENCY_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  try { storage?.setItem(ASK_IDEMPOTENCY_KEY, created); } catch { /* the server still dedupes by key within this send */ }
  return created;
}

export function buildAskBody(input: {
  targetRoleUrl: string;
  reasons: readonly string[];
  resumeId: number;
  companySlug: string | null;
  post: { opportunityId: number } | null;
  fastTrack: FastTrackAskFields;
  confirmedCompanyDomain: string | undefined;
}): Record<string, string | number | number[]> {
  const body: Record<string, string | number | number[]> = {
    targetRoleUrl: input.targetRoleUrl.trim(),
    attachmentIds: [input.resumeId],
    candidateMessage: composeWhyMe(input.reasons),
  };
  if (input.companySlug) body.companySlug = input.companySlug;
  if (input.post) body.opportunityId = input.post.opportunityId;
  if ("fastTrackCode" in input.fastTrack) body.fastTrackCode = input.fastTrack.fastTrackCode;
  if ("fastTrackCompanySlug" in input.fastTrack) {
    body.fastTrackCompanySlug = input.fastTrack.fastTrackCompanySlug;
    body.fastTrackAlias = input.fastTrack.fastTrackAlias;
  }
  if (input.confirmedCompanyDomain) body.confirmedCompanyDomain = input.confirmedCompanyDomain;
  return body;
}

// The ask send body (POST /api/company-referrals), built exactly as the live
// composer does so routing never changes: the selected company's slug keeps
// the ask with that company, a personal link keeps it with its referrer
// (D-017), and a confirmed employer domain travels only for exactly this link.
// Compensation is not sent (D-071); the server infers the job function.
import { composeWhyMe } from "@shared/whyMe";
import { dedupeAskWorkItemIds } from "@shared/askWorkItems";
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
  fastTrack: FastTrackAskFields;
  confirmedCompanyDomain: string | undefined;
  /** D-022: an ask opened from a posted role keeps the post so the poster sees it first. */
  opportunityId?: number;
  /**
   * Task 13: the showcase pieces this ask carries. Folded here, once, so the
   * body the server receives is already the body the referrer will read — and
   * both composer surfaces send it, because both build the body here.
   */
  workItemIds?: readonly number[];
  /** Set when the composer showed the free-waiting (uncovered) line: the server must refuse rather than charge if coverage opened up since (D-132 item 3). */
  expectedCoverage?: "waiting_for_company_coverage";
  /** The price the seeker saw: the server must refuse rather than charge or store a different cost (D-132 item 3). */
  expectedCost?: number;
}): Record<string, string | number | number[]> {
  const body: Record<string, string | number | number[]> = {
    targetRoleUrl: input.targetRoleUrl.trim(),
    attachmentIds: [input.resumeId],
    candidateMessage: composeWhyMe(input.reasons),
  };
  if (input.workItemIds?.length) body.workItemIds = dedupeAskWorkItemIds(input.workItemIds);
  if (input.expectedCoverage) body.expectedCoverage = input.expectedCoverage;
  if (input.expectedCost !== undefined) body.expectedCost = input.expectedCost;
  if (input.companySlug) body.companySlug = input.companySlug;
  if ("fastTrackCode" in input.fastTrack) body.fastTrackCode = input.fastTrack.fastTrackCode;
  if ("fastTrackCompanySlug" in input.fastTrack) {
    body.fastTrackCompanySlug = input.fastTrack.fastTrackCompanySlug;
    body.fastTrackAlias = input.fastTrack.fastTrackAlias;
  }
  if (input.confirmedCompanyDomain) body.confirmedCompanyDomain = input.confirmedCompanyDomain;
  if (input.opportunityId) body.opportunityId = input.opportunityId;
  return body;
}

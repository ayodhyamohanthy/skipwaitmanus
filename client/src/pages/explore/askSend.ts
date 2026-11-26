// The ask send body (POST /api/company-referrals), built exactly as the live
// composer does so routing never changes: the selected company's slug keeps
// the ask with that company, a personal link keeps it with its referrer
// (D-017), and a confirmed employer domain travels only for exactly this link.
// Compensation is not sent (D-071); the server infers the job function.
import { composeWhyMe } from "@shared/whyMe";
import { dedupeAskWorkItemIds } from "@shared/askWorkItems";
import type { FastTrackAskFields } from "@/lib/fastTrackHandoff";
import type { AcceptedAskCost } from "@shared/acceptedAskCost";

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
  /** D-174: an ask picked from careers-site jobs carries the catalog job id. */
  catalogJobId?: number;
  /** D-193 §5.8: the banded quote expected cost carries through to verify parity. */
  expectedCost?: AcceptedAskCost;
  /**
   * Task 13: the showcase pieces this ask carries. Folded here, once, so the
   * body the server receives is already the body the referrer will read — and
   * both composer surfaces send it, because both build the body here.
   */
  workItemIds?: readonly number[];
  /** Set when the composer showed the free-waiting (uncovered) line: the server must refuse rather than charge if coverage opened up since (D-132 item 3). */
  expectedCoverage?: "waiting_for_company_coverage";
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    attachmentIds: [input.resumeId],
    candidateMessage: composeWhyMe(input.reasons),
  };
  // D-174 §6.6: a picked catalog job is the job identity; an empty link is not sent as an override.
  if (!input.catalogJobId && input.targetRoleUrl.trim()) body.targetRoleUrl = input.targetRoleUrl.trim();
  if (input.workItemIds?.length) body.workItemIds = dedupeAskWorkItemIds(input.workItemIds);
  if (input.expectedCoverage) body.expectedCoverage = input.expectedCoverage;
  if (input.companySlug) body.companySlug = input.companySlug;
  if ("fastTrackCode" in input.fastTrack) body.fastTrackCode = input.fastTrack.fastTrackCode;
  if ("fastTrackCompanySlug" in input.fastTrack) {
    body.fastTrackCompanySlug = input.fastTrack.fastTrackCompanySlug;
    body.fastTrackAlias = input.fastTrack.fastTrackAlias;
  }
  if (input.confirmedCompanyDomain) body.confirmedCompanyDomain = input.confirmedCompanyDomain;
  if (input.opportunityId) body.opportunityId = input.opportunityId;
  if (input.catalogJobId) body.catalogJobId = input.catalogJobId;
  if (input.expectedCost) body.expectedCost = input.expectedCost;
  return body;
}

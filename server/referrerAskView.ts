import { z } from "zod";
import { jobFunctionFieldSchema, type JobFunction } from "../shared/jobFunctions";
import { isPostApprovalReferralStatus, referralStatuses, type ReferralStatus } from "../shared/referral";
import { toLockedAskAttachment, toOpenAskAttachment, type ReferrerAskAttachment } from "../shared/referrerAskView";
import type { PrivateReferralRouteDeps } from "./privateReferralRoutes";

/*
 * What a referrer receives about the ask assigned to them (D-019(e); Terms:
 * "Before acceptance, a Referrer sees neither the Job Seeker's name nor
 * resume"). Every view is an explicit allow-list built from a parsed store
 * row, so a column the store adds later never reaches a referrer by accident.
 * - Before acceptance (claimed, still pending): the role, the note and how
 *   many files wait. No seeker name, no file names, ids or links.
 * - After acceptance: the seeker's name, the note, and the files, linked while
 *   the referrer's document access is active.
 * Never the seeker's account id, a storage key or the grant's internals.
 */

const attachmentRowSchema = z.object({
  id: z.number().int().positive(),
  fileName: z.string(),
  mimeType: z.string().nullish(),
  fileSize: z.number().int().nonnegative().nullish(),
});

const detailRowSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().nullish(),
  targetRoleUrl: z.string().nullish(),
  companyDomain: z.string().nullish(),
  jobFunction: jobFunctionFieldSchema,
  candidateMessage: z.string().nullish(),
  // A row without a known status counts as not accepted (fails closed).
  status: z.enum(referralStatuses).optional(),
  referrerId: z.number().int().nullish(),
  revision: z.number().int().nullish(),
  candidateName: z.string().nullish(),
  documentAccessActive: z.boolean().optional(),
  attachments: z.array(attachmentRowSchema),
});

export type ClaimedAskDetailView = {
  id: number;
  title: string | null;
  targetRoleUrl: string | null;
  companyDomain: string | null;
  jobFunction: JobFunction | null;
  candidateMessage: string | null;
  status: ReferralStatus | null;
  referrerId: number | null;
  revision: number | null;
  /** Present only once the referrer has accepted. */
  candidateName?: string | null;
  attachments: ReferrerAskAttachment[];
};

export type AskViewResult<T> = { ok: true; view: T } | { ok: false; error: z.ZodError };

/** GET /api/company-referrals/:id — the ask assigned to this referrer, before or after acceptance. */
export function buildClaimedAskDetailView(row: object): AskViewResult<ClaimedAskDetailView> {
  const parsed = detailRowSchema.safeParse(row);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const data = parsed.data;
  const accepted = data.status !== undefined && isPostApprovalReferralStatus(data.status);
  const linked = accepted && data.documentAccessActive === true;
  const view: ClaimedAskDetailView = {
    id: data.id,
    title: data.title ?? null,
    targetRoleUrl: data.targetRoleUrl ?? null,
    companyDomain: data.companyDomain ?? null,
    jobFunction: data.jobFunction,
    candidateMessage: data.candidateMessage ?? null,
    status: data.status ?? null,
    referrerId: data.referrerId ?? null,
    revision: data.revision ?? null,
    attachments: data.attachments.map(attachment => (accepted ? toOpenAskAttachment(attachment, linked) : toLockedAskAttachment(attachment))),
  };
  if (accepted) view.candidateName = data.candidateName ?? null;
  return { ok: true, view };
}

/** The store's claim outcome, as the route deps declare it (one definition, no copy to drift). */
export type ClaimResult = Awaited<ReturnType<PrivateReferralRouteDeps["claimCompanyReferralRequest"]>>;

/** POST /api/company-referrals/:id/claim — the claim outcome without the seeker's account id. */
export function claimResponseView(result: ClaimResult) {
  return { requestId: result.requestId, claimed: result.claimed, companyDomain: result.companyDomain, revision: result.revision, replayed: result.replayed };
}

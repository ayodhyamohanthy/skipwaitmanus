import { z } from "zod";
import { jobFunctionFieldSchema } from "../shared/jobFunctions";
import { isPostApprovalReferralStatus, referralStatuses } from "../shared/referral";
import { toLockedAskAttachment, toOpenAskAttachment, type LockedAskAttachment, type OpenAskAttachment } from "../shared/referrerAskView";
import type { JobFunction } from "../shared/jobFunctions";
import type { ReferralStatus } from "../shared/referral";
import type { PrivateReferralRouteDeps } from "./privateReferralRoutes";

/*
 * What a referrer receives about an ask (D-019; Terms and Privacy: "Before
 * acceptance, a Referrer sees neither the Job Seeker's name nor resume").
 *
 * Every view is an explicit allow-list built from a parsed store row, so a
 * column the store adds later never reaches a referrer by accident.
 * - Before acceptance (status pending, claimed or not): the role, the note and
 *   how many files wait. No seeker name, no file names, no file ids or links,
 *   no seeker id.
 * - After acceptance (approved and later), for the referrer it is assigned to:
 *   the seeker's name, the note, and the files (linked while their document
 *   access is active).
 */

const attachmentRowSchema = z.object({
  id: z.number().int().positive(),
  fileName: z.string(),
  mimeType: z.string().nullish(),
  fileSize: z.number().int().nonnegative().nullish(),
});

const askRowSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().nullish(),
  targetRoleUrl: z.string().nullish(),
  companyDomain: z.string().nullish(),
  jobFunction: jobFunctionFieldSchema,
  candidateMessage: z.string().nullish(),
  attachments: z.array(attachmentRowSchema),
});

const detailRowSchema = askRowSchema.extend({
  // A row without a known status is treated as not accepted (fails closed).
  status: z.enum(referralStatuses).optional(),
  referrerId: z.number().int().nullish(),
  revision: z.number().int().nullish(),
  candidateName: z.string().nullish(),
  documentAccessActive: z.boolean().optional(),
});

type AskViewBase = {
  id: number;
  title: string | null;
  targetRoleUrl: string | null;
  companyDomain: string | null;
  jobFunction: JobFunction | null;
  candidateMessage: string | null;
};

export type UnclaimedAskPreviewView = AskViewBase & { attachments: LockedAskAttachment[] };

export type ClaimedAskDetailView = AskViewBase & {
  status: ReferralStatus | null;
  referrerId: number | null;
  revision: number | null;
  /** Present only once the referrer has accepted. */
  candidateName?: string | null;
  attachments: Array<LockedAskAttachment | OpenAskAttachment>;
};

export type AskViewResult<T> = { ok: true; view: T } | { ok: false; error: z.ZodError };

function baseOf(row: z.infer<typeof askRowSchema>): AskViewBase {
  return { id: row.id, title: row.title ?? null, targetRoleUrl: row.targetRoleUrl ?? null, companyDomain: row.companyDomain ?? null, jobFunction: row.jobFunction, candidateMessage: row.candidateMessage ?? null };
}

/** GET /api/company-referrals/:id/preview — always before acceptance. */
export function buildUnclaimedAskPreviewView(row: object): AskViewResult<UnclaimedAskPreviewView> {
  const parsed = askRowSchema.safeParse(row);
  if (!parsed.success) return { ok: false, error: parsed.error };
  return { ok: true, view: { ...baseOf(parsed.data), attachments: parsed.data.attachments.map(toLockedAskAttachment) } };
}

/** GET /api/company-referrals/:id — the ask assigned to this referrer, before or after acceptance. */
export function buildClaimedAskDetailView(row: object): AskViewResult<ClaimedAskDetailView> {
  const parsed = detailRowSchema.safeParse(row);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const data = parsed.data;
  const accepted = data.status !== undefined && isPostApprovalReferralStatus(data.status);
  const documentAccessActive = data.documentAccessActive === true;
  const view: ClaimedAskDetailView = {
    ...baseOf(data),
    status: data.status ?? null,
    referrerId: data.referrerId ?? null,
    revision: data.revision ?? null,
    attachments: data.attachments.map(attachment => (accepted ? toOpenAskAttachment(attachment, documentAccessActive) : toLockedAskAttachment(attachment))),
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

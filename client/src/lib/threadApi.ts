import { z } from "zod";
import { companyIdentityFieldsSchema } from "@shared/companies";
import { jobFunctionFieldSchema, type JobFunction } from "@shared/jobFunctions";
import { isPostApprovalReferralStatus, referralStatuses, type ReferralStatus } from "@shared/referral";
import { isOpenAskAttachment, referrerAskAttachmentSchema, type ReferrerAskAttachment } from "@shared/referrerAskView";
import { readApiJson } from "@/lib/apiResponse";
import { isWorkEmailCodeRequired, notifyWorkEmailCodeRequired } from "./referrerStepUpApi";

/*
 * Private referral thread API. Every response is parsed with Zod at this
 * boundary and normalized into one ThreadRequest shape so the page renders
 * the same fields whichever side of the request the viewer stands on.
 */

const FALLBACK_ERROR = "We could not complete this private thread action";
const NETWORK_ERROR = "We couldn't reach skipwait.me. Check your connection and try again.";
const MALFORMED_ERROR = "We could not read this private thread. Try again in a moment.";

const statusSchema = z.enum(referralStatuses);
const timestampSchema = z.union([z.string(), z.number()]).nullish();

// Before acceptance a file arrives locked (counted, never named or linked); after it, named (shared/referrerAskView.ts).
const attachmentSchema = referrerAskAttachmentSchema;

/** Seeker's own row from GET /api/company-referrals/mine. */
const seekerRowSchema = z.object({
  id: z.number().int(),
  title: z.string().nullish(),
  pitch: z.string().nullish(),
  targetRoleUrl: z.string().nullish(),
  companyDomain: z.string(),
  ...companyIdentityFieldsSchema.shape,
  jobFunction: jobFunctionFieldSchema,
  status: statusSchema,
  referrerId: z.number().int().nullish(),
  referrerName: z.string().nullish(),
  referrerTitle: z.string().nullish(),
  referrerMessage: z.string().nullish(),
  createdAt: timestampSchema,
  attachmentCount: z.number().nullish(),
  heldForReferrer: z.boolean().nullish().catch(null),
  unclaimedAssignment: z.boolean().optional().catch(undefined),
  // D-034/D-047: which coverage state the ask is in (server-computed); drives the waiting/held seeker copy.
  queueStatus: z.enum(["available_for_review", "waiting_for_coverage", "held_for_credit"]).nullish(),
});
const mineSchema = z.object({ requests: z.array(z.looseObject({ id: z.number() })) });

/** Unclaimed preview from GET /api/company-referrals/:id/preview (always pending). */
const previewSchema = z.object({
  request: z.object({
    id: z.number().int(),
    title: z.string().nullish(),
    targetRoleUrl: z.string().nullish(),
    companyDomain: z.string(),
    ...companyIdentityFieldsSchema.shape,
    jobFunction: jobFunctionFieldSchema,
    candidateMessage: z.string().nullish(),
    attachments: z.array(attachmentSchema).nullish(),
  }),
});

/** Claimed detail from GET /api/company-referrals/:id (verified referrer only). */
const detailSchema = z.object({
  request: z.object({
    id: z.number().int(),
    title: z.string().nullish(),
    candidateMessage: z.string().nullish(),
    targetRoleUrl: z.string().nullish(),
    companyDomain: z.string(),
    ...companyIdentityFieldsSchema.shape,
    jobFunction: jobFunctionFieldSchema,
    candidateName: z.string().nullish(),
    referrerId: z.number().int().nullish(),
    status: statusSchema,
    attachments: z.array(attachmentSchema).nullish(),
    decisionDueAt: z.string().nullish(),
    referredDueAt: z.string().nullish(),
    extensionUsed: z.boolean().nullish(),
  }),
});

const conversationSchema = z.object({
  messages: z.array(z.object({ id: z.number().int(), body: z.string(), createdAt: timestampSchema, isMine: z.boolean() })).nullish(),
  referenceId: z.string().nullish(),
});

export type ThreadAttachment = { id: number; fileName: string; url: string | null };
export type ThreadRequest = {
  id: number;
  title: string | null;
  pitch: string | null;
  /** Only ever set for a referrer who has accepted (claimed) the request. */
  candidateName: string | null;
  targetRoleUrl: string | null;
  companyDomain: string;
  /** Company directory display name and initials; null outside the directory. */
  companyName: string | null;
  companyInitials: string | null;
  /** The ask's job function (shared taxonomy); null when unknown. */
  jobFunction: JobFunction | null;
  status: ReferralStatus;
  referrerId: number | null;
  /** Revealed to the seeker only after the referrer accepts (queue task 14). */
  referrerName?: string | null;
  referrerTitle?: string | null;
  referrerMessage: string | null;
  createdAt: string | number | null;
  attachments: readonly ThreadAttachment[];
  attachmentCount: number;
  /** Seeker side only: a personal-link ask its employee has not acted on still counts as unclaimed (D-050). */
  heldForReferrer?: boolean;
  /** Seeker side only: assigned to one referrer who has not claimed it, by personal link or queue allocation (P0-allocated-ask-stuck). */
  unclaimedAssignment?: boolean;
  /** Seeker side only: coverage state of a pending ask (D-034/D-047/D-061). */
  queueStatus?: "available_for_review" | "waiting_for_coverage" | "held_for_credit" | null;
  /** Referrer side only: when the viewer's own claim/allocation decision is due (D-038-A). */
  decisionDueAt?: string | null;
  /** Referrer side only: when the Referred decision is due for an accepted ask (D-038-B). */
  referredDueAt?: string | null;
  /** Referrer side only: whether the one 3-day extension was already used (D-038-B). */
  extensionUsed?: boolean;
};
export type ThreadMessage = { id: number; body: string; isMine: boolean; createdAt?: string | number | null };
export type ThreadRole = "seeker" | "referrer-pending" | "referrer-claimed";
type TokenGetter = () => Promise<string | null>;

export async function authedFetch(path: string, getToken: TokenGetter, init?: RequestInit) {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  const payload = await readApiJson<Record<string, unknown>>(response, FALLBACK_ERROR);
  // D-057: a referrer action refused for this session re-checks the verdict, so the page shows the step-up.
  if (isWorkEmailCodeRequired(response.status, payload)) notifyWorkEmailCodeRequired();
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : FALLBACK_ERROR);
  return payload;
}

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(MALFORMED_ERROR);
  return result.data;
}

/** Named files only; a locked file counts toward attachmentCount but is never listed. */
function attachmentsOf(list: readonly ReferrerAskAttachment[] | null | undefined): ThreadAttachment[] {
  return (list ?? []).filter(isOpenAskAttachment).map(file => ({ id: file.id, fileName: file.fileName, url: file.url ?? null }));
}

/** Resolve which side of the thread the viewer stands on, then load it. */
export async function loadThread(requestId: number, getToken: TokenGetter): Promise<{ role: ThreadRole; request: ThreadRequest }> {
  const mine = parse(mineSchema, await authedFetch("/api/company-referrals/mine", getToken));
  const ownRow = mine.requests.find(item => item.id === requestId);
  if (ownRow) {
    const own = parse(seekerRowSchema, ownRow);
    return {
      role: "seeker",
      request: {
        id: own.id, title: own.title ?? null, pitch: own.pitch ?? null, candidateName: null, targetRoleUrl: own.targetRoleUrl ?? null,
        companyDomain: own.companyDomain, companyName: own.companyName ?? null, companyInitials: own.companyInitials ?? null, jobFunction: own.jobFunction ?? null, status: own.status, referrerId: own.referrerId ?? null, referrerName: own.referrerName ?? null, referrerTitle: own.referrerTitle ?? null, referrerMessage: own.referrerMessage ?? null,
        createdAt: own.createdAt ?? null, attachments: [], attachmentCount: own.attachmentCount ?? 0, heldForReferrer: own.heldForReferrer === true, unclaimedAssignment: own.unclaimedAssignment === true, queueStatus: own.queueStatus ?? null,
      },
    };
  }
  let previewPayload: Record<string, unknown> | null = null;
  try { previewPayload = await authedFetch(`/api/company-referrals/${requestId}/preview`, getToken); }
  catch { /* not an available preview for this account; try the claimed detail */ }
  if (previewPayload) {
    const { request } = parse(previewSchema, previewPayload);
    return {
      role: "referrer-pending",
      // The preview endpoint only ever serves pending, unclaimed asks. The
      // candidate's name is deliberately dropped: identity stays hidden
      // until the referrer accepts.
      request: {
        id: request.id, title: request.title ?? null, pitch: request.candidateMessage ?? null, candidateName: null, targetRoleUrl: request.targetRoleUrl ?? null,
        companyDomain: request.companyDomain, companyName: request.companyName ?? null, companyInitials: request.companyInitials ?? null, jobFunction: request.jobFunction ?? null, status: "pending", referrerId: null, referrerMessage: null, createdAt: null,
        attachments: [], attachmentCount: request.attachments?.length ?? 0,
      },
    };
  }
  const { request } = parse(detailSchema, await authedFetch(`/api/company-referrals/${requestId}`, getToken));
  const attachments = attachmentsOf(request.attachments);
  // Identity and resume are revealed only once the referrer has accepted.
  const accepted = isPostApprovalReferralStatus(request.status);
  return {
    role: accepted ? "referrer-claimed" : "referrer-pending",
    request: {
      id: request.id, title: request.title ?? null, pitch: request.candidateMessage ?? null, candidateName: accepted ? request.candidateName ?? null : null,
      targetRoleUrl: request.targetRoleUrl ?? null, companyDomain: request.companyDomain, companyName: request.companyName ?? null, companyInitials: request.companyInitials ?? null, jobFunction: request.jobFunction ?? null, status: request.status, referrerId: request.referrerId ?? null,
      referrerMessage: null, createdAt: null, attachments: accepted ? attachments : [], attachmentCount: request.attachments?.length ?? 0, decisionDueAt: request.decisionDueAt ?? null, referredDueAt: request.referredDueAt ?? null, extensionUsed: request.extensionUsed ?? false,
    },
  };
}

export async function loadConversation(requestId: number, getToken: TokenGetter): Promise<{ messages: ThreadMessage[]; referenceId: string | null }> {
  const payload = parse(conversationSchema, await authedFetch(`/api/company-referrals/${requestId}/conversation`, getToken));
  return { messages: (payload.messages ?? []).map(message => ({ id: message.id, body: message.body, isMine: message.isMine, createdAt: message.createdAt })), referenceId: payload.referenceId ?? null };
}

export async function sendConversationMessage(requestId: number, body: string, getToken: TokenGetter) {
  await authedFetch(`/api/company-referrals/${requestId}/conversation`, getToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
}

export async function decideReview(requestId: number, decision: "approved" | "declined", declineReason: string | undefined, getToken: TokenGetter, passReason?: string) {
  return authedFetch(`/api/company-referrals/${requestId}/one-click-review`, getToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(declineReason ? { decision, declineReason, ...(passReason ? { passReason } : {}) } : decision === "approved" ? { decision, ethicsConfirmed: true } : { decision }),
  });
}

export async function recordProgress(requestId: number, status: string, getToken: TokenGetter, referenceId?: string) {
  return authedFetch(`/api/company-referrals/${requestId}/progress`, getToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(referenceId ? { status, referenceId } : { status }) });
}

export async function withdrawThreadRequest(requestId: number, getToken: TokenGetter) {
  return authedFetch(`/api/company-referrals/${requestId}/withdraw`, getToken, { method: "POST" });
}

export async function extendReferredDeadline(requestId: number, getToken: TokenGetter) {
  return authedFetch(`/api/company-referrals/${requestId}/extend-referred-deadline`, getToken, { method: "POST" });
}

export async function stepBackFromReferral(requestId: number, getToken: TokenGetter) {
  return authedFetch(`/api/company-referrals/${requestId}/step-back`, getToken, { method: "POST" });
}

export async function confirmReferredBySeeker(requestId: number, getToken: TokenGetter) {
  return authedFetch(`/api/company-referrals/${requestId}/confirm-referred`, getToken, { method: "POST" });
}

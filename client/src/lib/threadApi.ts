import { z } from "zod";
import { isPostApprovalReferralStatus, referralStatuses, type ReferralStatus } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";

/*
 * Private referral thread API. Every response is parsed with Zod at this
 * boundary and normalized into one ThreadRequest shape so the page renders
 * the same fields whichever side of the request the viewer stands on.
 */

const FALLBACK_ERROR = "We could not complete this private thread action";
const NETWORK_ERROR = "We couldn't reach SkipWait. Check your connection and try again.";
const MALFORMED_ERROR = "We could not read this private thread. Try again in a moment.";

const statusSchema = z.enum(referralStatuses);
const timestampSchema = z.union([z.string(), z.number()]).nullish();

const attachmentSchema = z.object({
  id: z.number().int(),
  fileName: z.string(),
  mimeType: z.string().nullish(),
  fileSize: z.number().nullish(),
  url: z.string().nullish(),
});

/** Seeker's own row from GET /api/company-referrals/mine. */
const seekerRowSchema = z.object({
  id: z.number().int(),
  title: z.string().nullish(),
  pitch: z.string().nullish(),
  targetRoleUrl: z.string().nullish(),
  companyDomain: z.string(),
  status: statusSchema,
  referrerId: z.number().int().nullish(),
  referrerMessage: z.string().nullish(),
  createdAt: timestampSchema,
  attachmentCount: z.number().nullish(),
});
const mineSchema = z.object({ requests: z.array(z.looseObject({ id: z.number() })) });

/** Unclaimed preview from GET /api/company-referrals/:id/preview (always pending). */
const previewSchema = z.object({
  request: z.object({
    id: z.number().int(),
    title: z.string().nullish(),
    targetRoleUrl: z.string().nullish(),
    companyDomain: z.string(),
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
    candidateName: z.string().nullish(),
    referrerId: z.number().int().nullish(),
    status: statusSchema,
    attachments: z.array(attachmentSchema).nullish(),
  }),
});

const conversationSchema = z.object({
  messages: z.array(z.object({ id: z.number().int(), body: z.string(), createdAt: timestampSchema, isMine: z.boolean() })).nullish(),
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
  status: ReferralStatus;
  referrerId: number | null;
  referrerMessage: string | null;
  createdAt: string | number | null;
  attachments: readonly ThreadAttachment[];
  attachmentCount: number;
};
export type ThreadMessage = { id: number; body: string; isMine: boolean };
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
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : FALLBACK_ERROR);
  return payload;
}

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(MALFORMED_ERROR);
  return result.data;
}

function attachmentsOf(list: readonly z.infer<typeof attachmentSchema>[] | null | undefined): ThreadAttachment[] {
  return (list ?? []).map(file => ({ id: file.id, fileName: file.fileName, url: file.url ?? null }));
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
        companyDomain: own.companyDomain, status: own.status, referrerId: own.referrerId ?? null, referrerMessage: own.referrerMessage ?? null,
        createdAt: own.createdAt ?? null, attachments: [], attachmentCount: own.attachmentCount ?? 0,
      },
    };
  }
  let previewPayload: Record<string, unknown> | null = null;
  try { previewPayload = await authedFetch(`/api/company-referrals/${requestId}/preview`, getToken); }
  catch { /* not an available preview for this account; try the claimed detail */ }
  if (previewPayload) {
    const { request } = parse(previewSchema, previewPayload);
    const attachments = attachmentsOf(request.attachments);
    return {
      role: "referrer-pending",
      // The preview endpoint only ever serves pending, unclaimed asks. The
      // candidate's name is deliberately dropped: identity stays hidden
      // until the referrer accepts.
      request: {
        id: request.id, title: request.title ?? null, pitch: request.candidateMessage ?? null, candidateName: null, targetRoleUrl: request.targetRoleUrl ?? null,
        companyDomain: request.companyDomain, status: "pending", referrerId: null, referrerMessage: null, createdAt: null,
        attachments: [], attachmentCount: attachments.length,
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
      targetRoleUrl: request.targetRoleUrl ?? null, companyDomain: request.companyDomain, status: request.status, referrerId: request.referrerId ?? null,
      referrerMessage: null, createdAt: null, attachments: accepted ? attachments : [], attachmentCount: attachments.length,
    },
  };
}

export async function loadConversation(requestId: number, getToken: TokenGetter): Promise<{ messages: ThreadMessage[] }> {
  const payload = parse(conversationSchema, await authedFetch(`/api/company-referrals/${requestId}/conversation`, getToken));
  return { messages: (payload.messages ?? []).map(message => ({ id: message.id, body: message.body, isMine: message.isMine })) };
}

export async function sendConversationMessage(requestId: number, body: string, getToken: TokenGetter) {
  await authedFetch(`/api/company-referrals/${requestId}/conversation`, getToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
}

export async function decideReview(requestId: number, decision: "approved" | "declined", declineReason: string | undefined, getToken: TokenGetter) {
  return authedFetch(`/api/company-referrals/${requestId}/one-click-review`, getToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(declineReason ? { decision, declineReason } : { decision }),
  });
}

export async function recordProgress(requestId: number, status: string, getToken: TokenGetter) {
  return authedFetch(`/api/company-referrals/${requestId}/progress`, getToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
}

export async function withdrawThreadRequest(requestId: number, getToken: TokenGetter) {
  return authedFetch(`/api/company-referrals/${requestId}/withdraw`, getToken, { method: "POST" });
}

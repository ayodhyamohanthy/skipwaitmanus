import { readApiJson } from "@/lib/apiResponse";

export type ThreadAttachment = { id: number; fileName: string; mimeType: string; fileSize: number; url?: string };
export type ThreadRequest = {
  id: number;
  title?: string | null;
  pitch?: string | null;
  candidateName?: string | null;
  candidateMessage?: string | null;
  targetRoleUrl: string | null;
  companyDomain: string;
  compensation?: string | null;
  status: string;
  referrerId: number | null;
  queueStatus?: "available_for_review" | "waiting_for_coverage" | null;
  referrerMessage: string | null;
  unreadMessageCount: number;
  createdAt: string;
  updatedAt: string;
  attachments?: ThreadAttachment[];
};
export type ThreadMessage = { id: number; body: string; createdAt: string; isMine: boolean };
export type ThreadRole = "seeker" | "referrer-pending" | "referrer-claimed";

export async function authedFetch(path: string, getToken: () => Promise<string | null>, init?: RequestInit) {
  const token = await getToken();
  const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const payload = await readApiJson<Record<string, unknown>>(response, "We could not complete this private thread action");
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "We could not complete this private thread action");
  return payload;
}

/** Resolve which side of the thread the viewer stands on, then load it. */
export async function loadThread(requestId: number, getToken: () => Promise<string | null>): Promise<{ role: ThreadRole; request: ThreadRequest }> {
  const mine = await authedFetch("/api/company-referrals/mine", getToken);
  const own = Array.isArray(mine.requests) ? (mine.requests as ThreadRequest[]).find(item => item.id === requestId) : undefined;
  if (own) return { role: "seeker", request: { ...own, unreadMessageCount: own.unreadMessageCount ?? 0 } };
  try {
    const preview = await authedFetch(`/api/company-referrals/${requestId}/preview`, getToken);
    return { role: "referrer-pending", request: preview.request as ThreadRequest };
  } catch { /* not an available preview for this account; try claimed detail */ }
  const detail = await authedFetch(`/api/company-referrals/${requestId}`, getToken);
  return { role: "referrer-claimed", request: detail.request as ThreadRequest };
}

export async function loadConversation(requestId: number, getToken: () => Promise<string | null>) {
  const payload = await authedFetch(`/api/company-referrals/${requestId}/conversation`, getToken);
  return { messages: (payload.messages as ThreadMessage[] | undefined) ?? [], progressStatus: payload.progressStatus as string | undefined };
}

export async function sendConversationMessage(requestId: number, body: string, getToken: () => Promise<string | null>) {
  await authedFetch(`/api/company-referrals/${requestId}/conversation`, getToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
}

export async function decideReview(requestId: number, decision: "approved" | "declined", declineReason: string | undefined, getToken: () => Promise<string | null>) {
  return authedFetch(`/api/company-referrals/${requestId}/one-click-review`, getToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(declineReason ? { decision, declineReason } : { decision }),
  });
}

export async function recordProgress(requestId: number, status: string, getToken: () => Promise<string | null>) {
  return authedFetch(`/api/company-referrals/${requestId}/progress`, getToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
}

export async function withdrawThreadRequest(requestId: number, getToken: () => Promise<string | null>) {
  return authedFetch(`/api/company-referrals/${requestId}/withdraw`, getToken, { method: "POST" });
}

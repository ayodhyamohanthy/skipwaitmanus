// Data for the goal approval pages (D-048-p3-admin-approvals). Guardrail 1
// (D-048-admin.md §4): every request here is byte-identical to the kit pages
// (AdminApprovalQueue.tsx, AdminApprovalRecord.tsx) - same endpoints, methods,
// headers, credentials and bodies, no new fields. The shared vocabulary comes
// from lib/adminApproval.ts (read-only for this row). Guardrail 3: the one
// credit line is creditReservedPhrase(ASK_LEVEL_COST_CLIENT) from
// shared/moneyCopy - this module writes no cost string of its own.
import { creditReservedPhrase } from "@shared/moneyCopy";
import type { GoalStatusValue } from "@/components/goal/GoalStatus";
import { approvalStatusLabels, compactDate, compactDateTime, formatAmount, historyLabels, type AdminApprovalQueueItem, type AdminApprovalQueueKind, type AdminApprovalQueueStatus } from "@/lib/adminApproval";
import { readApiJson } from "@/lib/apiResponse";
import { ASK_LEVEL_COST_CLIENT } from "@/lib/goalFlags";
import { safeReturnTo } from "@/lib/referrerSignIn";

export type ApprovalDecision = "approved" | "rejected";
export type HistoryEvent = { id: string; label: string; actor: string; time: string | Date; note?: string };
export type ActivityEvent = { id: number; action: string; outcome: "success" | "failure" | "denied"; resourceType: string | null; resourceId: string | null; metadata: string | null; createdAt: string | Date; actorName: string | null; actorEmail: string | null };
type TokenSource = () => Promise<string | null | undefined>;

export const QUEUE_LOAD_FALLBACK = "We could not load the approval queue";
export const RECORD_LOAD_FALLBACK = "We could not load the approval record";
export const HISTORY_LOAD_FALLBACK = "We could not load the record history";
export const DECISION_FALLBACK = "We could not record this approval decision";
export const ACCESS_MESSAGE = "Administrator access is required.";

/** The credit line, from the shared money copy only (F-flags amendment: cost lines are Tier 1). */
export const creditLine = () => creditReservedPhrase(ASK_LEVEL_COST_CLIENT);

const readHeaders = (token: string | null | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/** GET /api/admin/approval-queue?limit=250, as the kit queue sends it. */
export async function loadApprovalQueue(getToken: TokenSource): Promise<{ denied: true } | { denied: false; items: AdminApprovalQueueItem[] }> {
  const token = await getToken();
  const response = await fetch("/api/admin/approval-queue?limit=250", { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
  if (response.status === 403) return { denied: true };
  const payload = await readApiJson<{ items?: AdminApprovalQueueItem[]; error?: string }>(response, QUEUE_LOAD_FALLBACK);
  if (!response.ok) throw new Error(payload.error || QUEUE_LOAD_FALLBACK);
  return { denied: false, items: payload.items || [] };
}

/** The kit record's two reads in parallel: the queue and the activity log. */
export async function loadApprovalRecord(getToken: TokenSource, kind: AdminApprovalQueueKind, itemId: number): Promise<{ denied: true } | { denied: false; item: AdminApprovalQueueItem | null; events: HistoryEvent[] }> {
  const token = await getToken();
  const headers = readHeaders(token);
  const [queueResponse, activityResponse] = await Promise.all([fetch("/api/admin/approval-queue?limit=250", { headers, credentials: "include" }), fetch("/api/admin/activity?limit=250", { headers, credentials: "include" })]);
  if (queueResponse.status === 403) return { denied: true };
  const queuePayload = await readApiJson<{ items?: AdminApprovalQueueItem[]; error?: string }>(queueResponse, RECORD_LOAD_FALLBACK);
  const activityPayload = await readApiJson<{ events?: ActivityEvent[]; error?: string }>(activityResponse, HISTORY_LOAD_FALLBACK);
  if (!queueResponse.ok) throw new Error(queuePayload.error || RECORD_LOAD_FALLBACK);
  if (!activityResponse.ok) throw new Error(activityPayload.error || HISTORY_LOAD_FALLBACK);
  const item = (queuePayload.items || []).find(row => row.kind === kind && row.id === itemId) || null;
  return { denied: false, item, events: item ? buildHistory(item, activityPayload.events || []) : [] };
}

/**
 * Why a decision did not confirm (owner-routed ruling, Nov 5): only a 409 is
 * known not to have been recorded - the record was already resolved, so an
 * earlier decision stands (and may already have notified someone). Any other
 * status, or no response at all, may have been recorded.
 */
export type DecisionFailure = "already_resolved" | "uncertain";
export class ApprovalDecisionError extends Error {
  constructor(message: string, readonly failure: DecisionFailure) { super(message); this.name = "ApprovalDecisionError"; }
}
export const decisionFailureOf = (error: unknown): DecisionFailure => (error instanceof ApprovalDecisionError ? error.failure : "uncertain");

/** The goal copy for a decision that did not confirm; it claims nothing about server state beyond what the status proves. */
export function decisionFailureCopy(failure: DecisionFailure, where: "the queue" | "this record") {
  return failure === "already_resolved"
    ? "This attempt was not recorded — this record was already resolved. Reload to see its current state."
    : `The decision may not have been recorded. Reload ${where} before you retry.`;
}

/**
 * POST /api/admin/approval-queue/:kind/:id/decision. The queue sends
 * { decision }; the record sends { decision, note } with an empty note left
 * out (JSON.stringify drops undefined), exactly as the kit pages do. Only the
 * reading of a failure differs: the status decides what the page may say.
 */
export async function postApprovalDecision(getToken: TokenSource, kind: AdminApprovalQueueKind, id: number, body: { decision: ApprovalDecision; note?: string }): Promise<{ ok?: boolean; status?: string; error?: string }> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(`/api/admin/approval-queue/${kind}/${id}/decision`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
  } catch (transport) {
    throw new ApprovalDecisionError(transport instanceof Error ? transport.message : DECISION_FALLBACK, "uncertain");
  }
  const failure: DecisionFailure = response.status === 409 ? "already_resolved" : "uncertain";
  let payload: { ok?: boolean; status?: string; error?: string };
  try { payload = await readApiJson<{ ok?: boolean; status?: string; error?: string }>(response, DECISION_FALLBACK); }
  catch (parse) { throw new ApprovalDecisionError(parse instanceof Error ? parse.message : DECISION_FALLBACK, failure); }
  if (!response.ok) throw new ApprovalDecisionError(payload.error || DECISION_FALLBACK, failure);
  return payload;
}

/** The status the kit page shows after a decision: the server's, else the decision's own. */
export const statusAfter = (decision: ApprovalDecision, status?: string) => (status ?? (decision === "approved" ? "approved" : "declined")) as AdminApprovalQueueStatus;
export const isResolved = (status: AdminApprovalQueueStatus) => status === "approved" || status === "declined";

const GOAL_TONE: Record<AdminApprovalQueueStatus, GoalStatusValue> = { pending: "waiting", under_review: "under_review", requires_review: "under_review", approved: "accepted", declined: "expired" };
/** Dot + text status with the queue's own labels (lib/adminApproval.ts). */
export const approvalStatus = (status: AdminApprovalQueueStatus) => ({ status: GOAL_TONE[status], label: approvalStatusLabels[status].label });

export const KIND_LABEL: Record<AdminApprovalQueueKind, string> = { referral_request: "Seeker request", referrer_enrollment: "Referrer enrollment", payment: "Credit pack" };

/** The kit card's context line, word for word. */
export function rowContext(item: AdminApprovalQueueItem) {
  if (item.kind === "referral_request") return `${item.companyDomain} · opened ${compactDate(item.createdAt)} · ${item.meta.claimTime ? `claimed ${compactDateTime(item.meta.claimTime)}` : item.meta.waitingForCoverage ? "awaiting company coverage" : "awaiting claim"}`;
  if (item.kind === "referrer_enrollment") return `${item.companyDomain} · OTP verified ${item.meta.otpTime ? compactDateTime(item.meta.otpTime) : "—"}`;
  return `${item.provider || item.meta.role || "Payment"} · ${formatAmount(item.amount ?? 0, item.currency ?? "")} · ${compactDate(item.createdAt)}`;
}

export const tokenCountLine = (count: number | null | undefined) => `${count ?? 0} token${(count ?? 0) === 1 ? "" : "s"}`;

/** The open record created first, or null. */
export function oldestOpen(items: AdminApprovalQueueItem[]): AdminApprovalQueueItem | null {
  return items.filter(item => !isResolved(item.status)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] ?? null;
}

export const recordHref = (item: { kind: AdminApprovalQueueKind; id: number }) => `/admin/approvals/${item.kind}/${item.id}`;

/** The kit's AdminSignInCta link (components/admin/AdminSignInCta.tsx), same target rules. */
export function adminSignInHref(path: string): string {
  const target = safeReturnTo(path, "/admin");
  return `/sign-in?${new URLSearchParams({ returnTo: target.startsWith("/admin") ? target : "/admin" })}`;
}

const activityResourceTypes: Record<AdminApprovalQueueKind, string[]> = { referral_request: ["referral_request"], referrer_enrollment: ["referrer_enrollment"], payment: ["payment_fulfillment"] };

function metadataNote(metadata: string | null, note: string | null | undefined): string | undefined {
  if (note) return String(note);
  if (!metadata) return undefined;
  try { const parsed = JSON.parse(metadata) as { note?: unknown }; return typeof parsed.note === "string" && parsed.note.trim() ? parsed.note : undefined; } catch { return undefined; }
}

/** The kit record's history, line for line (AdminApprovalRecord.tsx buildHistory). */
export function buildHistory(item: AdminApprovalQueueItem, activity: ActivityEvent[]): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const push = (key: string, label: string, actor: string, time: string | Date | null | undefined, note?: string) => { if (!time) return; events.push({ id: `${key}-${new Date(time).getTime()}`, label, actor, time, note }); };
  const recordEvents = activity.filter(event => event.resourceId === String(item.id) && activityResourceTypes[item.kind].includes(event.resourceType ?? ""));
  const presentActions = new Set(recordEvents.map(event => event.action));
  if (item.kind === "referral_request") {
    if (!presentActions.has("company_referral.created")) push("created", "Request created", item.meta.seekerName || "Job seeker", item.createdAt);
    push("credit", `${creditLine()} (monthly)`, "System · credit reservation", item.createdAt);
    if (!presentActions.has("company_referral.claimed")) push("claim", "Claimed by verified referrer", item.meta.referrerName || "Verified referrer", item.meta.claimTime);
  }
  if (item.kind === "referrer_enrollment") push("otp", "Work email verified", item.meta.referrerName || item.meta.referrerEmail || "Referrer", item.meta.otpTime);
  if (item.kind === "payment") push("review", `Payment requires review${item.meta.reason ? ` — ${item.meta.reason}` : ""}`, item.meta.userEmail || "Credit pack", item.createdAt);
  for (const event of recordEvents) {
    const note = metadataNote(event.metadata, undefined);
    events.push({ id: `activity-${event.id}`, label: historyLabels[event.action] || event.action.replace(/\./g, " · "), actor: event.actorName || "System", time: event.createdAt, note: note || undefined });
  }
  // The same decision is logged by the resolver and the route request; keep one line.
  return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()).filter((event, index, all) => index === 0 || event.label !== all[index - 1].label || Math.abs(new Date(event.time).getTime() - new Date(all[index - 1].time).getTime()) > 2_000);
}

/** The decision line the record adds locally after a saved decision (kit wording). */
export const decisionLabel = (decision: ApprovalDecision) => (decision === "approved" ? "Approved by admin" : "Rejected by admin");

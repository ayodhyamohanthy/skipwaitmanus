// Data for the goal approval pages (D-048-p3-admin-approvals). Guardrail 1
// (D-048-admin.md §4): every request here is byte-identical to the kit pages
// (AdminApprovalQueue.tsx, AdminApprovalRecord.tsx) - same endpoints, methods,
// headers, credentials and bodies, no new fields. The shared vocabulary comes
// from lib/adminApproval.ts (read-only for this row); the server's fourth kind,
// employer_application, is added here (review finding F1, pull request 1206). Money
// guidance states the current rules without a price (D-034/D-047/D-055/D-147,
// findings F3-F5) and reuses shared/moneyCopy where a sentence exists.
import { CREDIT_ENDED_CAVEAT, REFERRERS_NEVER_PAID } from "@shared/moneyCopy";
import type { GoalStatusValue } from "@/components/goal/GoalStatus";
import { approvalStatusLabels, compactDate, compactDateTime, formatAmount, historyLabels, itemTitle, type AdminApprovalQueueItem, type AdminApprovalQueueStatus } from "@/lib/adminApproval";
import { readApiJson } from "@/lib/apiResponse";
import { safeReturnTo } from "@/lib/referrerSignIn";

export type ApprovalDecision = "approved" | "rejected";
export type HistoryEvent = { id: string; label: string; actor: string; time: string | Date; note?: string };
export type ActivityEvent = { id: number; action: string; outcome: "success" | "failure" | "denied"; resourceType: string | null; resourceId: string | null; metadata: string | null; createdAt: string | Date; actorName: string | null; actorEmail: string | null };
type TokenSource = () => Promise<string | null | undefined>;

/** Every kind the server's approval queue emits (server/db.ts AdminApprovalQueueKind). */
export const APPROVAL_KINDS = ["referral_request", "referrer_enrollment", "payment", "employer_application"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export const isApprovalKind = (value: unknown): value is ApprovalKind => typeof value === "string" && (APPROVAL_KINDS as readonly string[]).includes(value);
/** The employer access application's read metadata, exactly as listAdminApprovalQueue sends it. */
export type EmployerApplicationMeta = { companyName?: string | null; billingEmail?: string | null; duplicatePersonCount?: number | null; duplicateDomainCount?: number | null; evidenceVersion?: string | null; reviewDueAt?: string | Date | null; approvalNote?: string | null };
export type EmployerApplicationItem = Omit<AdminApprovalQueueItem, "kind" | "meta"> & { kind: "employer_application"; meta: EmployerApplicationMeta };
export type ApprovalItem = AdminApprovalQueueItem | EmployerApplicationItem;
/** A queue row of a kind this page does not know is left out, never rendered as another kind. */
const knownItems = (items: readonly ApprovalItem[] | undefined): ApprovalItem[] => (items || []).filter(item => isApprovalKind(item?.kind));
export const approvalKey = (item: { kind: ApprovalKind; id: number }) => `${item.kind}:${item.id}`;
/** The row title: the employer's company name, else the shared vocabulary's title. */
export const approvalTitle = (item: ApprovalItem) => (item.kind === "employer_application" ? item.meta.companyName || `Employer application ${1000 + item.id}` : itemTitle(item));

export const QUEUE_LOAD_FALLBACK = "We could not load the approval queue";
export const RECORD_LOAD_FALLBACK = "We could not load the approval record";
export const HISTORY_LOAD_FALLBACK = "We could not load the record history";
export const DECISION_FALLBACK = "We could not record this approval decision";
export const ACCESS_MESSAGE = "Administrator access is required.";

/**
 * Referral money guidance for an administrator (finding F3). A credit is used
 * once, when a verified employee can first see the request; a request waiting
 * for coverage or held for lack of credit is not charged; once picked up the
 * credit stays spent, a decline included (D-147). No price is stated.
 */
export function referralCreditGuidance(item: AdminApprovalQueueItem): { title: string; body: string } {
  if (item.meta.claimTime) return { title: "Picked up: its credit stays spent", body: "A verified employee picked this request up, so the seeker's credit stays spent even if they decline or pass." };
  if (item.meta.waitingForCoverage) return { title: "Nothing charged while it waits", body: "No verified employee can see this request yet. Nothing is charged until one can; a seeker with no credit then is held, not charged." };
  return { title: "Charged once, when an employee can first see it", body: `A credit is used the first time a verified employee can see a request; a request held for lack of credit is not charged. It comes back once if the seeker withdraws before anyone picks it up, ${CREDIT_ENDED_CAVEAT}.` };
}
/** resolveAdminApproval's referral branch writes the status and the audit line only. */
export const ADMIN_DECISION_MONEY_NOTE = "Your decision here changes the request's status only. It moves no credit.";
/** The queue's short credit fact, or none when the page cannot know it. */
export const referralCreditFact = (item: AdminApprovalQueueItem): string | null => (item.meta.claimTime ? "Credit stays spent" : item.meta.waitingForCoverage ? "Nothing charged while waiting" : null);
/** Enrollment guidance (finding F5): D-055, REFERRER_ACCEPT_REWARDS_ENABLED = false. */
export const ENROLLMENT_MONEY_NOTE = `Verification grants nothing, and accepting a referral earns the referrer nothing. ${REFERRERS_NEVER_PAID}`;

const readHeaders = (token: string | null | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/** GET /api/admin/approval-queue?limit=250, as the kit queue sends it. */
export async function loadApprovalQueue(getToken: TokenSource): Promise<{ denied: true } | { denied: false; items: ApprovalItem[] }> {
  const token = await getToken();
  const response = await fetch("/api/admin/approval-queue?limit=250", { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
  if (response.status === 403) return { denied: true };
  const payload = await readApiJson<{ items?: ApprovalItem[]; error?: string }>(response, QUEUE_LOAD_FALLBACK);
  if (!response.ok) throw new Error(payload.error || QUEUE_LOAD_FALLBACK);
  return { denied: false, items: knownItems(payload.items) };
}

/** The kit record's two reads in parallel: the queue and the activity log. */
export async function loadApprovalRecord(getToken: TokenSource, kind: ApprovalKind, itemId: number): Promise<{ denied: true } | { denied: false; item: ApprovalItem | null; events: HistoryEvent[] }> {
  const token = await getToken();
  const headers = readHeaders(token);
  const [queueResponse, activityResponse] = await Promise.all([fetch("/api/admin/approval-queue?limit=250", { headers, credentials: "include" }), fetch("/api/admin/activity?limit=250", { headers, credentials: "include" })]);
  if (queueResponse.status === 403) return { denied: true };
  const queuePayload = await readApiJson<{ items?: ApprovalItem[]; error?: string }>(queueResponse, RECORD_LOAD_FALLBACK);
  const activityPayload = await readApiJson<{ events?: ActivityEvent[]; error?: string }>(activityResponse, HISTORY_LOAD_FALLBACK);
  if (!queueResponse.ok) throw new Error(queuePayload.error || RECORD_LOAD_FALLBACK);
  if (!activityResponse.ok) throw new Error(activityPayload.error || HISTORY_LOAD_FALLBACK);
  const item = knownItems(queuePayload.items).find(row => row.kind === kind && row.id === itemId) || null;
  return { denied: false, item, events: item ? buildHistory(item, activityPayload.events || []) : [] };
}

/**
 * Why a decision did not confirm (owner-routed ruling, Nov 5): only a 409 is
 * known not to have been recorded. It means "already resolved" only when the
 * server says so (the route's own resolved wording); any other 409 is a refusal
 * whose explanation is kept, such as a claimed request only its employee may
 * accept (finding F2). Any other status, or no response at all, may have been
 * recorded.
 */
export type DecisionFailure = "already_resolved" | "refused" | "uncertain";
const RESOLVED_SIGNAL = /already resolved|already reviewed|already been reviewed/i;
export class ApprovalDecisionError extends Error {
  constructor(message: string, readonly failure: DecisionFailure) { super(message); this.name = "ApprovalDecisionError"; }
}
export const decisionFailureOf = (error: unknown): DecisionFailure => (error instanceof ApprovalDecisionError ? error.failure : "uncertain");
/** The server's explanation of a refusal, kept for the copy; nothing for other failures. */
export const decisionFailureDetail = (error: unknown): string | undefined => (error instanceof ApprovalDecisionError && error.failure === "refused" && error.message !== DECISION_FALLBACK ? error.message : undefined);
/** A 409 is resolved only on the server's resolved wording; otherwise it is a refusal. */
export const decisionFailureFor = (status: number, error?: string): DecisionFailure => (status !== 409 ? "uncertain" : error && RESOLVED_SIGNAL.test(error) ? "already_resolved" : "refused");
/** A refusal recorded nothing, so the actions stay open; an unknown or resolved outcome holds them until a reload. */
export const holdsDecision = (failure: DecisionFailure | null | undefined) => failure === "already_resolved" || failure === "uncertain";

const asSentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** The goal copy for a decision that did not confirm; it claims nothing about server state beyond what the status proves. */
export function decisionFailureCopy(failure: DecisionFailure, where: "the queue" | "this record", detail?: string) {
  if (failure === "already_resolved") return "This attempt was not recorded — this record was already resolved. Reload to see its current state.";
  if (failure === "refused") return `This attempt was not recorded. ${detail ? asSentence(detail) : "The server refused it."} Reload ${where} to see its current state.`;
  return `The decision may not have been recorded. Reload ${where} before you retry.`;
}

/**
 * POST /api/admin/approval-queue/:kind/:id/decision. The queue sends
 * { decision }; the record sends { decision, note } with an empty note left
 * out (JSON.stringify drops undefined), exactly as the kit pages do. Only the
 * reading of a failure differs: the status decides what the page may say.
 */
export async function postApprovalDecision(getToken: TokenSource, kind: ApprovalKind, id: number, body: { decision: ApprovalDecision; note?: string }): Promise<{ ok?: boolean; status?: string; error?: string }> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(`/api/admin/approval-queue/${kind}/${id}/decision`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
  } catch (transport) {
    throw new ApprovalDecisionError(transport instanceof Error ? transport.message : DECISION_FALLBACK, "uncertain");
  }
  let payload: { ok?: boolean; status?: string; error?: string };
  try { payload = await readApiJson<{ ok?: boolean; status?: string; error?: string }>(response, DECISION_FALLBACK); }
  catch { throw new ApprovalDecisionError(DECISION_FALLBACK, decisionFailureFor(response.status)); }
  if (!response.ok) throw new ApprovalDecisionError(payload.error || DECISION_FALLBACK, decisionFailureFor(response.status, payload.error));
  return payload;
}

/** The status the kit page shows after a decision: the server's, else the decision's own. */
export const statusAfter = (decision: ApprovalDecision, status?: string) => (status ?? (decision === "approved" ? "approved" : "declined")) as AdminApprovalQueueStatus;
export const isResolved = (status: AdminApprovalQueueStatus) => status === "approved" || status === "declined";

const GOAL_TONE: Record<AdminApprovalQueueStatus, GoalStatusValue> = { pending: "waiting", under_review: "under_review", requires_review: "under_review", approved: "accepted", declined: "expired" };
/** Dot + text status with the queue's own labels (lib/adminApproval.ts). */
export const approvalStatus = (status: AdminApprovalQueueStatus) => ({ status: GOAL_TONE[status], label: approvalStatusLabels[status].label });

export const KIND_LABEL: Record<ApprovalKind, string> = { referral_request: "Seeker request", referrer_enrollment: "Referrer enrollment", payment: "Credit pack", employer_application: "Employer access" };

/** The kit card's context line, word for word; an employer application states its domain, submission and review due time. */
export function rowContext(item: ApprovalItem) {
  if (item.kind === "employer_application") return `${item.companyDomain || "No domain"} · submitted ${compactDate(item.createdAt)}${item.meta.reviewDueAt ? ` · review due ${compactDateTime(item.meta.reviewDueAt)}` : ""}`;
  if (item.kind === "referral_request") return `${item.companyDomain} · opened ${compactDate(item.createdAt)} · ${item.meta.claimTime ? `claimed ${compactDateTime(item.meta.claimTime)}` : item.meta.waitingForCoverage ? "awaiting company coverage" : "awaiting claim"}`;
  if (item.kind === "referrer_enrollment") return `${item.companyDomain} · OTP verified ${item.meta.otpTime ? compactDateTime(item.meta.otpTime) : "—"}`;
  return `${item.provider || item.meta.role || "Payment"} · ${formatAmount(item.amount ?? 0, item.currency ?? "")} · ${compactDate(item.createdAt)}`;
}

export const tokenCountLine = (count: number | null | undefined) => `${count ?? 0} token${(count ?? 0) === 1 ? "" : "s"}`;

/** The open record created first, or null. */
export function oldestOpen(items: ApprovalItem[]): ApprovalItem | null {
  return items.filter(item => !isResolved(item.status)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] ?? null;
}

export const recordHref = (item: { kind: ApprovalKind; id: number }) => `/admin/approvals/${item.kind}/${item.id}`;

/** The kit's AdminSignInCta link (components/admin/AdminSignInCta.tsx), same target rules. */
export function adminSignInHref(path: string): string {
  const target = safeReturnTo(path, "/admin");
  return `/sign-in?${new URLSearchParams({ returnTo: target.startsWith("/admin") ? target : "/admin" })}`;
}

const activityResourceTypes: Record<ApprovalKind, string[]> = { referral_request: ["referral_request"], referrer_enrollment: ["referrer_enrollment"], payment: ["payment_fulfillment"], employer_application: ["employer_application"] };
// The employer resolver logs admin.employer_<target> beside the route's admin.approval_<decision>; one label keeps one line.
const HISTORY_LABELS: Record<string, string> = { ...historyLabels, "admin.employer_approved": "Approved by admin", "admin.employer_rejected": "Rejected by admin" };

function metadataNote(metadata: string | null, note: string | null | undefined): string | undefined {
  if (note) return String(note);
  if (!metadata) return undefined;
  try { const parsed = JSON.parse(metadata) as { note?: unknown }; return typeof parsed.note === "string" && parsed.note.trim() ? parsed.note : undefined; } catch { return undefined; }
}

/**
 * The record's history from recorded events only. A referral shows no credit
 * reservation: the queue carries no ledger evidence of one, and an uncovered
 * request was never charged (finding F4).
 */
export function buildHistory(item: ApprovalItem, activity: ActivityEvent[]): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const push = (key: string, label: string, actor: string, time: string | Date | null | undefined, note?: string) => { if (!time) return; events.push({ id: `${key}-${new Date(time).getTime()}`, label, actor, time, note }); };
  const recordEvents = activity.filter(event => event.resourceId === String(item.id) && activityResourceTypes[item.kind].includes(event.resourceType ?? ""));
  const presentActions = new Set(recordEvents.map(event => event.action));
  if (item.kind === "referral_request") {
    if (!presentActions.has("company_referral.created")) push("created", "Request created", item.meta.seekerName || "Job seeker", item.createdAt);
    if (!presentActions.has("company_referral.claimed")) push("claim", "Claimed by verified referrer", item.meta.referrerName || "Verified referrer", item.meta.claimTime);
  }
  if (item.kind === "referrer_enrollment") push("otp", "Work email verified", item.meta.referrerName || item.meta.referrerEmail || "Referrer", item.meta.otpTime);
  if (item.kind === "employer_application") push("submitted", "Employer access application submitted", item.meta.companyName || item.meta.billingEmail || "Employer", item.createdAt);
  if (item.kind === "payment") push("review", `Payment requires review${item.meta.reason ? ` — ${item.meta.reason}` : ""}`, item.meta.userEmail || "Credit pack", item.createdAt);
  for (const event of recordEvents) {
    const note = metadataNote(event.metadata, undefined);
    events.push({ id: `activity-${event.id}`, label: HISTORY_LABELS[event.action] || event.action.replace(/\./g, " · "), actor: event.actorName || "System", time: event.createdAt, note: note || undefined });
  }
  // The same decision is logged by the resolver and the route request; keep one line.
  return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()).filter((event, index, all) => index === 0 || event.label !== all[index - 1].label || Math.abs(new Date(event.time).getTime() - new Date(all[index - 1].time).getTime()) > 2_000);
}

/** The decision line the record adds locally after a saved decision (kit wording). */
export const decisionLabel = (decision: ApprovalDecision) => (decision === "approved" ? "Approved by admin" : "Rejected by admin");

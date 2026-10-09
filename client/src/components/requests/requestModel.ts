// Pure view-model helpers for the seeker Requests screen (kit v4 /requests).
// Every value here is derived from the live server payloads parsed in
// ./requestsApi; nothing is sampled or illustrative.
import { ASK_EXPIRING_SOON_MS, askDaysLeft, formatAskExpiry, getAskExpiresAtMs, getJobSeekerReferralState, isPostApprovalReferralStatus, type ReferralStatus } from "@shared/referral";
import { SUBSCRIPTION_PLANS, isPaidSubscriptionPlan } from "@shared/subscriptionPlans";
import type { CreditSummary, ReferralRequest } from "./requestsApi";

/** Kit StatusPill vocabulary (app/src/components/status-pill.tsx) plus the live Withdrawn state. */
export type RequestPillStatus = "Requested" | "Accepted" | "Referred" | "Interviewing" | "Offer" | "Declined" | "Expired" | "Withdrawn" | "Closed";

const CLOSED_STATUSES: readonly ReferralStatus[] = ["declined", "closed", "withdrawn"];

export const displayRef = (id: number) => `Ref-${1000 + id}`;
export const isClosedRequest = (request: ReferralRequest) => CLOSED_STATUSES.includes(request.status);
export const canWithdrawRequest = (request: ReferralRequest) => request.status === "pending" && !request.referrerId;

/**
 * Maps a live status onto the kit pill. An unclaimed ask that lapses is closed
 * by the server's expiry path (the only way to reach "closed" without a
 * referrer), so it reads as Expired; a post-acceptance close reads as Closed.
 */
export function requestPillStatus(request: ReferralRequest): RequestPillStatus {
  switch (request.status) {
    case "pending": return "Requested";
    case "approved": return "Accepted";
    case "intro_made": return "Referred";
    case "interview": return "Interviewing";
    case "offer": return "Offer";
    case "declined": return "Declined";
    case "withdrawn": return "Withdrawn";
    case "closed": return request.referrerId ? "Closed" : "Expired";
  }
}

function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

/** The row's second line after the company and reference: the next real step or fact. */
export function requestNote(request: ReferralRequest, nowMs: number): string {
  if (request.status === "pending") {
    if (request.referrerId) return request.queueStatus === "available_for_review" ? "Available for review" : getJobSeekerReferralState(request).label;
    const parts = [formatAskExpiry(request, nowMs), request.queueStatus === "waiting_for_coverage" ? "Waiting for coverage" : null].filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(" · ") : `Updated ${compactDate(request.updatedAt)}`;
  }
  if (isPostApprovalReferralStatus(request.status) && request.unreadMessageCount > 0) return `${request.unreadMessageCount} new`;
  if (request.status === "approved") return "Message your referrer";
  if (request.status === "declined" && request.referrerMessage) return request.referrerMessage;
  return `Updated ${compactDate(request.updatedAt)}`;
}

/** Unclaimed asks inside their last day are flagged like the kit's "Expires tomorrow". */
export function isUrgentExpiry(request: ReferralRequest, nowMs: number): boolean {
  if (!canWithdrawRequest(request)) return false;
  const days = askDaysLeft({ createdAt: request.createdAt }, nowMs);
  return days !== null && days <= 1;
}

/** A private conversation opens on acceptance and stays open until the ask closes. */
export function countInConversation(requests: readonly ReferralRequest[]): number {
  return requests.filter(request => isPostApprovalReferralStatus(request.status) && request.status !== "closed").length;
}

export function countExpiringSoon(requests: readonly ReferralRequest[], nowMs: number): number {
  return requests.filter(request => {
    if (!canWithdrawRequest(request)) return false;
    const ms = request.expiresAt ? Date.parse(request.expiresAt) : getAskExpiresAtMs(request.createdAt);
    return ms !== null && !Number.isNaN(ms) && ms > nowMs && ms - nowMs <= ASK_EXPIRING_SOON_MS;
  }).length;
}

export type SlotMeter = {
  planLabel: string;
  /** Slots still open this month: the monthly credits the server has not reserved. */
  open: number;
  allowance: number;
  packCredits: number;
  renewsOn: string | null;
  full: boolean;
  nextPlan: { label: string; monthlyAllowance: number } | null;
};

/**
 * The kit "OPEN SLOTS · x/N" meter on the live wallet. Every ask reserves one
 * credit (monthly allowance first, then the purchased balance), and only a
 * withdrawn or expired ask returns it, so the open slots this month are the
 * monthly credits remaining out of the plan's allowance. Counting pending
 * asks instead would overstate them after an answered ask (its credit stays
 * spent) and understate them for asks carried over from last month. "Full"
 * means no credit of any kind is left to send another ask.
 */
export function slotMeter(credits: CreditSummary): SlotMeter {
  const allowance = Math.max(0, credits.monthlyAllowance);
  const open = Math.min(allowance, Math.max(0, credits.monthlyCreditsRemaining));
  const plan = credits.plan;
  const paid = isPaidSubscriptionPlan(plan);
  const planLabel = paid ? SUBSCRIPTION_PLANS[plan].label : plan === "free" ? "Free" : plan;
  const next = plan === "max" ? null : plan === "pro" ? SUBSCRIPTION_PLANS.max : SUBSCRIPTION_PLANS.pro;
  const renewDate = paid && credits.subscriptionCurrentTermEnd ? new Date(credits.subscriptionCurrentTermEnd) : null;
  return {
    planLabel,
    open,
    allowance,
    packCredits: Math.max(0, credits.purchasedCreditsRemaining),
    renewsOn: renewDate && !Number.isNaN(renewDate.getTime()) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(renewDate) : null,
    full: credits.totalAvailable <= 0,
    nextPlan: next ? { label: next.label, monthlyAllowance: next.monthlyAllowance } : null,
  };
}

/** Kit "All 3 slots are in use. …" nudge; only options the server really offers are named. */
export function slotsFullCopy(meter: SlotMeter, hasWithdrawableAsk: boolean): { lead: string; next: string } {
  const lead = `All ${meter.allowance} slots are in use.`;
  const more = meter.nextPlan ? `get more slots with ${meter.nextPlan.label} (${meter.nextPlan.monthlyAllowance})` : "add one-time credits";
  if (hasWithdrawableAsk) return { lead, next: `Wait for an unclaimed ask to expire, withdraw one, or ${more}.` };
  return { lead, next: `${more.charAt(0).toUpperCase()}${more.slice(1)}.` };
}

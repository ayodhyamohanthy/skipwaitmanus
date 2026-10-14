// Pure view-model helpers for the seeker Requests screen (kit v4 /requests).
// Every value here is derived from the live server payloads parsed in
// ./requestsApi; nothing is sampled or illustrative.
import { ASK_EXPIRING_SOON_MS, askDaysLeft, formatAskExpiry, getAskExpiresAtMs, getJobSeekerReferralState, isPostApprovalReferralStatus, type ReferralStatus } from "@shared/referral";
import type { OpenAskSlots } from "@shared/openAskSlots";
import type { ReferralRequest } from "./requestsApi";

export { slotsFullCopy } from "@shared/openAskSlots";

/** Kit StatusPill vocabulary (app/src/components/status-pill.tsx) plus the live Withdrawn state. */
export type RequestPillStatus = "Requested" | "Accepted" | "Referred" | "Interviewing" | "Offer" | "Declined" | "Expired" | "Withdrawn" | "Closed";

const CLOSED_STATUSES: readonly ReferralStatus[] = ["declined", "closed", "withdrawn"];

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

/** The row's second line after the company name: the next real step or fact. */
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
  /** Kit eyebrow, e.g. "OPEN SLOTS · FREE". */
  label: string;
  /** The seeker's open asks: pending and unexpired (server-counted). */
  open: number;
  /** The plan's open-ask cap; null means unlimited. */
  cap: number | null;
  /** Segments to fill: one per slot in use, never past the cap. */
  filled: number;
  full: boolean;
};

/**
 * The kit "OPEN SLOTS · FREE 2/3" meter: open asks out of the plan's cap. An
 * ask holds a slot until it is answered, withdrawn or expires, so the bar fills
 * the slots in use and is full at the cap (an unlimited plan never is).
 */
export function slotMeter(slots: OpenAskSlots): SlotMeter {
  const open = Math.max(0, slots.open);
  return {
    label: `OPEN SLOTS · ${slots.planLabel.toUpperCase()}`,
    open,
    cap: slots.cap,
    filled: slots.cap === null ? 0 : Math.min(open, slots.cap),
    full: slots.cap !== null && open >= slots.cap,
  };
}

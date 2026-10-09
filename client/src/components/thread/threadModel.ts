import { askDaysLeft, isPostApprovalReferralStatus } from "@shared/referral";
import { companySlugForJobCompany, getLaunchCompany } from "@/lib/companies";
import type { ThreadRequest, ThreadRole } from "@/lib/threadApi";

/** Kit v4 thread stages, in order. */
export const STAGES = ["Requested", "Accepted", "Referred", "Interviewing", "Offer", "Hired"] as const;
export type Stage = (typeof STAGES)[number];
/** Kit stage label for the request, including the kit's terminal states. */
export type StageLabel = Stage | "Declined" | "Expired" | "Withdrawn";

/**
 * Map live status to the kit vocabulary. An unclaimed ask that reached its
 * shelf life is closed by the server with no referrer: that is "Expired",
 * never "Hired". A claimed request is closed only by the Hired milestone.
 */
export function stageOf(request: Pick<ThreadRequest, "status" | "referrerId">): StageLabel {
  switch (request.status) {
    case "pending": return "Requested";
    case "approved": return "Accepted";
    case "intro_made": return "Referred";
    case "interview": return "Interviewing";
    case "offer": return "Offer";
    case "closed": return request.referrerId === null ? "Expired" : "Hired";
    case "declined": return "Declined";
    case "withdrawn": return "Withdrawn";
  }
}

export function stageIndex(stage: StageLabel): number {
  return STAGES.indexOf(stage as Stage);
}

/** Accepted and later: identities, resume and messages are open. */
export function isAccepted(request: Pick<ThreadRequest, "status" | "referrerId">): boolean {
  return isPostApprovalReferralStatus(request.status) && request.referrerId !== null;
}

export function canMessage(role: ThreadRole, request: Pick<ThreadRequest, "status" | "referrerId">): boolean {
  if (role === "referrer-pending") return false;
  return isAccepted(request);
}

/** Display name for launch companies ("wipro.com" → "Wipro"); the raw domain otherwise. */
export function companyName(domain: string): string {
  const slug = companySlugForJobCompany(domain);
  return (slug ? getLaunchCompany(slug)?.name : undefined) ?? domain;
}

export function companyInitials(domain: string): string {
  const slug = companySlugForJobCompany(domain);
  return (slug ? getLaunchCompany(slug)?.initials : undefined) ?? (domain.charAt(0) || "?").toUpperCase();
}

/** Seeker waiting line for a pending ask, with the real expiry when it applies. */
export function seekerWaitingCopy(request: Pick<ThreadRequest, "companyDomain" | "referrerId" | "createdAt">, nowMs: number = Date.now()): string {
  const company = companyName(request.companyDomain);
  if (request.referrerId !== null) return `A verified ${company} employee is reviewing your request. We'll notify you the moment it's accepted.`;
  const days = askDaysLeft({ createdAt: request.createdAt }, nowMs);
  if (days === null || days < 0) return `Waiting for a verified ${company} referrer.`;
  const when = days === 0 ? "Expires today" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
  return `Waiting for a verified ${company} referrer. ${when} if nobody accepts — your slot returns automatically.`;
}

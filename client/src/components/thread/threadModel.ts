import { ASK_LEVEL_COST_CLIENT } from "@/lib/goalFlags";
import { addCreditPhrase, creditUsedPhrase, CREDIT_ENDED_CAVEAT } from "@shared/moneyCopy";
import { askDaysLeft, askDaysShown, isPostApprovalReferralStatus } from "@shared/referral";
import { companyIdentityOf, isUnknownCompany, type CompanyIdentitySource } from "@shared/companies";
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

/** The company directory's display name, resolved by the server ("wipro.com" -> "Wipro"); the raw domain otherwise. */
export function companyName(request: CompanyIdentitySource): string {
  return companyIdentityOf(request).name;
}

export function companyInitials(request: CompanyIdentitySource): string {
  return companyIdentityOf(request).mark;
}

/**
 * Seeker waiting line for a pending ask, with the real expiry when it applies. A personal-link ask its
 * employee has not acted on (D-050) is with that one employee and expires like an unclaimed ask.
 * A waiting ask (D-034) has reached no employee and waits at no cost — no expiry countdown applies;
 * a held ask (D-047) has an available employee but no credit, so the next step is adding one.
 */
export function seekerWaitingCopy(request: Pick<ThreadRequest, "companyDomain" | "companyName" | "companyInitials" | "referrerId" | "createdAt" | "heldForReferrer" | "queueStatus">, nowMs: number = Date.now()): string {
  // An ask from a shared job link can have no employer on record: say "the company", never the platform's own domain.
  const unknown = isUnknownCompany(request);
  const company = companyName(request);
  const referrer = unknown ? "referrer at the company" : `${company} referrer`;
  const employee = unknown ? "employee at the company" : `${company} employee`;
  const held = request.referrerId !== null && request.heldForReferrer === true;
  if (request.referrerId !== null && !held) return `A verified ${employee} is reviewing your request. We'll notify you the moment it's accepted.`;
  if (request.queueStatus === "held_for_credit") return `A verified ${employee} can see asks now. ${addCreditPhrase(ASK_LEVEL_COST_CLIENT)} to send yours.`;
  if (request.queueStatus === "waiting_for_coverage") return `No verified ${employee} is available yet. Your ask waits at no cost, and when one can see it, ${creditUsedPhrase(ASK_LEVEL_COST_CLIENT)} — we'll notify you.`;
  const days = askDaysShown({ createdAt: request.createdAt }, nowMs);
  const when = days === null || days < 0 ? null : days === 0 ? "Expires today" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
  if (held) {
    const lead = `Sent privately to the ${unknown ? "employee" : `${company} employee`} whose link you used.`;
    return when ? `${lead} ${when} if they don't respond. Your credit comes back, ${CREDIT_ENDED_CAVEAT}.` : lead;
  }
  if (!when) return `Waiting for a verified ${referrer}.`;
  return `Waiting for a verified ${referrer}. ${when} if nobody accepts. Your credit comes back, ${CREDIT_ENDED_CAVEAT}.`;
}

/** Referrer-side pending line: the real expiry first, then the existing "no reply needed" reassurance. */
export function referrerPendingCopy(request: Pick<ThreadRequest, "createdAt">, nowMs: number = Date.now()): string {
  const base = "No reply needed to pass — but a quick answer helps.";
  const days = askDaysShown({ createdAt: request.createdAt }, nowMs);
  if (days === null || days < 0) return base;
  const when = days === 0 ? "Expires today." : days === 1 ? "Expires tomorrow." : `Expires in ${days} days.`;
  return `${when} ${base}`;
}

// One inbox row as the referral queue draws it (D-048 phase 3). Pure: the same
// row and clock always give the same labels, so the page only chooses layout.
// Facts come from the row the server sent; nothing here invents a title, a
// number or a reason, and nothing private (name, files, plan) is carried.
import { getAskShelfLifeEndsAtMs, type ReferralStatus } from "@shared/referral";
import { roleTitleFromUrl } from "@shared/roleTitle";
import { displayJobFunction, parseJobFunction, type JobFunction } from "@shared/jobFunctions";
import type { GoalStatusValue } from "@/components/goal/GoalStatus";

/** The inbox fields this surface reads. Anything else on the wire is ignored. */
export type QueueRowInput = {
  id: number;
  companyDomain: string;
  companyName?: string | null;
  jobFunction?: JobFunction | string | null;
  targetRoleUrl: string | null;
  status: ReferralStatus;
  createdAt: string;
  attachmentCount: number;
  isClaimedByYou: boolean;
  expiresAt?: string | null;
  waitingForCoverage?: boolean | null;
  coverageVisibleAt?: string | null;
};

export type QueueRow = {
  id: number;
  roleTitle: string | null;
  rowTitle: string;
  companyLabel: string;
  functionLabel: string | null;
  status: GoalStatusValue;
  statusLabel: string;
  isPending: boolean;
  daysLeft: number | null;
  clockLabel: string | null;
  clockUrgent: boolean;
  attachmentCount: number;
};

const DAY_MS = 86_400_000;

/** A decided ask keeps its state word; the referrer queue never shows crimson (DESIGN.md rule 5). */
function decidedStatus(status: ReferralStatus): { status: GoalStatusValue; statusLabel: string } {
  switch (status) {
    case "approved": return { status: "accepted", statusLabel: "Accepted" };
    case "intro_made": return { status: "referred", statusLabel: "Referred" };
    case "interview": return { status: "accepted", statusLabel: "Interview" };
    case "offer": return { status: "accepted", statusLabel: "Offer" };
    case "declined": return { status: "withdrawn", statusLabel: "Passed on" };
    case "withdrawn": return { status: "withdrawn", statusLabel: "Withdrawn" };
    case "closed": return { status: "withdrawn", statusLabel: "Closed" };
    default: return { status: "withdrawn", statusLabel: "Withdrawn" };
  }
}

/** Day-level clock for an unclaimed ask: whole days left, never hours or minutes (DESIGN.md rule 14). */
export function askClock(input: Pick<QueueRowInput, "expiresAt" | "createdAt" | "waitingForCoverage" | "coverageVisibleAt">, nowMs: number): { daysLeft: number | null; clockLabel: string | null; clockUrgent: boolean } {
  const sent = input.expiresAt ? Date.parse(input.expiresAt) : NaN;
  const windowEnd = Number.isNaN(sent)
    ? getAskShelfLifeEndsAtMs({ createdAt: input.createdAt, waitingForCoverage: input.waitingForCoverage, coverageVisibleAt: input.coverageVisibleAt })
    : sent;
  if (windowEnd === null || Number.isNaN(windowEnd)) return { daysLeft: null, clockLabel: null, clockUrgent: false };
  const remaining = windowEnd - nowMs;
  if (remaining <= 0) return { daysLeft: 0, clockLabel: "Expired", clockUrgent: false };
  const daysLeft = Math.floor(remaining / DAY_MS);
  const clockLabel = daysLeft === 0 ? "Less than a day left" : daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
  return { daysLeft, clockLabel, clockUrgent: daysLeft <= 2 };
}

export function queueRow(input: QueueRowInput, nowMs: number): QueueRow {
  const functionLabel = displayJobFunction(parseJobFunction(input.jobFunction));
  const roleTitle = roleTitleFromUrl(input.targetRoleUrl);
  const isPending = input.status === "pending";
  const { status, statusLabel } = isPending
    ? (input.isClaimedByYou ? { status: "queue_review" as const, statusLabel: "Under review" } : { status: "queue_new" as const, statusLabel: "New" })
    : decidedStatus(input.status);
  // Only an unclaimed ask runs a clock: a claimed or decided ask is not waiting on the referrer.
  const clock = isPending && !input.isClaimedByYou
    ? askClock(input, nowMs)
    : { daysLeft: null, clockLabel: null, clockUrgent: false };
  return {
    id: input.id,
    roleTitle,
    rowTitle: roleTitle ?? (functionLabel ? `${functionLabel} role` : "Referral request"),
    companyLabel: input.companyName?.trim() || input.companyDomain,
    functionLabel,
    status,
    statusLabel,
    isPending,
    ...clock,
    attachmentCount: input.attachmentCount,
  };
}

import { referralProgressUpdateStatuses, type ReferralStatus } from "./referral";

/**
 * Reputation and reliability signals, derived from the durable
 * `referralTransitionEvents` log plus current `referralRequests` rows.
 *
 * Contract rules:
 * - Everything here is a pure function over validated row shapes. No I/O.
 * - Rates are `null` when the denominator is zero. The platform never
 *   fabricates a score for a participant with no history.
 * - Counts are cumulative and event-sourced, so terminal statuses (closed,
 *   withdrawn) never erase earlier milestones from a participant's record.
 * - All durations are computed in JS from stored timestamps (Azure MySQL
 *   clock skew must never enter correctness-critical math).
 */

export type ReputationReferralRow = {
  id: number;
  referrerId: number | null;
  jobSeekerId: number;
  status: ReferralStatus;
  createdAt: Date | string;
};

export type ReputationTransitionEvent = {
  referralRequestId: number;
  actorUserId: number;
  action: string;
  resultingStatus: string;
  createdAt: Date | string;
};

export type ReferrerReputation = {
  decisions: number;
  approvals: number;
  declines: number;
  approvalRate: number | null;
  introductions: number;
  interviews: number;
  offers: number;
  interviewHitRate: number | null;
  offerRate: number | null;
  medianResponseHours: number | null;
};

export type JobSeekerReliability = {
  totalRequests: number;
  withdrawnBeforeClaim: number;
  reviewsReceived: number;
  approvalsReceived: number;
  introductions: number;
  interviews: number;
  offers: number;
  completionRate: number | null;
};

/** Transition actions that represent a referrer's accept/decline decision. */
const DECISION_ACTIONS = new Set(["approve", "review"]);
const DECISION_STATUSES = new Set(["approved", "declined"]);

const toMillis = (value: Date | string): number => new Date(value).getTime();

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** First decision event per referral request, in chronological order. */
function firstDecisionByRequest(events: readonly ReputationTransitionEvent[]): Map<number, ReputationTransitionEvent> {
  const sorted = events
    .filter(event => DECISION_ACTIONS.has(event.action) && DECISION_STATUSES.has(event.resultingStatus))
    .slice()
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
  const byRequest = new Map<number, ReputationTransitionEvent>();
  for (const event of sorted) if (!byRequest.has(event.referralRequestId)) byRequest.set(event.referralRequestId, event);
  return byRequest;
}

/** Distinct request ids that ever reached at least the given milestone. */
function reachedMilestone(events: readonly ReputationTransitionEvent[], requestIds: ReadonlySet<number>, milestone: "intro_made" | "interview" | "offer"): Set<number> {
  const milestoneIndex = referralProgressUpdateStatuses.indexOf(milestone);
  const reached = new Set<number>();
  for (const event of events) {
    if (!requestIds.has(event.referralRequestId)) continue;
    const index = referralProgressUpdateStatuses.indexOf(event.resultingStatus as (typeof referralProgressUpdateStatuses)[number]);
    if (index >= milestoneIndex && index < referralProgressUpdateStatuses.indexOf("closed")) reached.add(event.referralRequestId);
  }
  return reached;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function computeReferrerReputation(
  userId: number,
  rows: readonly ReputationReferralRow[],
  events: readonly ReputationTransitionEvent[],
): ReferrerReputation {
  const decisions = Array.from(firstDecisionByRequest(events.filter(event => event.actorUserId === userId)).values());
  const approvedIds = new Set(decisions.filter(event => event.resultingStatus === "approved").map(event => event.referralRequestId));
  const declines = decisions.filter(event => event.resultingStatus === "declined").length;
  const rowById = new Map(rows.map(row => [row.id, row]));
  const responseHours = decisions
    .map(event => {
      const row = rowById.get(event.referralRequestId);
      if (!row) return undefined;
      const hours = (toMillis(event.createdAt) - toMillis(row.createdAt)) / 3_600_000;
      return Number.isFinite(hours) && hours >= 0 ? hours : undefined;
    })
    .filter((hours): hours is number => hours !== undefined);
  const introductions = reachedMilestone(events, approvedIds, "intro_made").size;
  const interviews = reachedMilestone(events, approvedIds, "interview").size;
  const offers = reachedMilestone(events, approvedIds, "offer").size;
  return {
    decisions: decisions.length,
    approvals: approvedIds.size,
    declines,
    approvalRate: rate(approvedIds.size, decisions.length),
    introductions,
    interviews,
    offers,
    interviewHitRate: rate(interviews, approvedIds.size),
    offerRate: rate(offers, approvedIds.size),
    medianResponseHours: median(responseHours),
  };
}

export function computeJobSeekerReliability(
  userId: number,
  rows: readonly ReputationReferralRow[],
  events: readonly ReputationTransitionEvent[],
): JobSeekerReliability {
  const ownRows = rows.filter(row => row.jobSeekerId === userId);
  const ownIds = new Set(ownRows.map(row => row.id));
  const ownEvents = events.filter(event => ownIds.has(event.referralRequestId));
  // Withdrawals are only permitted on unclaimed pending requests, so every
  // withdraw event by this seeker is a pre-claim withdrawal by construction.
  const withdrawnBeforeClaim = new Set(
    ownEvents.filter(event => event.action === "withdraw" && event.actorUserId === userId).map(event => event.referralRequestId),
  ).size;
  const decisions = firstDecisionByRequest(ownEvents);
  const approvalsReceived = Array.from(decisions.values()).filter(event => event.resultingStatus === "approved").length;
  const introductions = reachedMilestone(ownEvents, ownIds, "intro_made").size;
  const interviews = reachedMilestone(ownEvents, ownIds, "interview").size;
  const offers = reachedMilestone(ownEvents, ownIds, "offer").size;
  return {
    totalRequests: ownRows.length,
    withdrawnBeforeClaim,
    reviewsReceived: decisions.size,
    approvalsReceived,
    introductions,
    interviews,
    offers,
    completionRate: rate(introductions, approvalsReceived),
  };
}

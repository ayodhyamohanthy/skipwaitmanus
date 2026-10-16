/**
 * "Referred within N days" — the one metric that decides whether the rest works.
 *
 * The growth note ranks this 9/10 *as a prerequisite*: it moves nothing by itself, but without it
 * you cannot tell whether recruiting a corridor, the employer-bonus pitch, or the 7-day promise
 * actually caused anything. Every "becomes a 10 when" in that note is a clause about this number.
 *
 * WHAT COUNTS. `intro_made` is the moment a referral actually happens — the referrer forwarded the
 * seeker into their company's system. `interview`, `offer` and `closed` are later stages of the same
 * event, so they count too; anything before `approved` does not, because an ask nobody accepted is
 * not a referral at any speed.
 *
 * THE DENOMINATOR IS ACCEPTED ASKS, NOT ALL ASKS. A declined ask was never going to produce a 7-day
 * referral, and counting it would bake the decline rate into the referral rate — two different
 * numbers, and mixing them makes both unreadable.
 *
 * THE HONESTY RULE, which matters more than the arithmetic: with no accepted asks, `rate` is NULL,
 * not 0. `0%` and "nothing has happened yet" are the same pixels and completely different facts.
 * Every metric screen in this product has an empty state, and this is the version of that rule on
 * the inside. `ReferrerImpact` already refuses to fabricate counts; a rate that silently reads 0%
 * would undo it.
 */
import { ASK_TTL_DAYS, isPostApprovalReferralStatus, type ReferralStatus } from "./referral";

export type ReferredAskInput = {
  readonly status: ReferralStatus;
  /** When the referrer accepted. The clock starts here, not at ask creation. */
  readonly acceptedAt: Date | null;
  /** When the referral was actually made. Null until it happens. */
  readonly referredAt: Date | null;
};

export type ReferredOutcomeSummary = {
  /** Accepted asks — the denominator. */
  readonly accepted: number;
  /** How many of those were referred within the window. */
  readonly referredWithin: number;
  /** 0..1, or null when nothing has been accepted. NEVER 0 for "no data". */
  readonly rate: number | null;
  /** Median days from acceptance to referral, or null when none were referred. */
  readonly medianDays: number | null;
  /** The window used, so a caller cannot mislabel a 14-day rate as a 7-day one. */
  readonly windowDays: number;
};

/** Later stages imply `intro_made` happened, so they still count as referred. */
const REFERRED_OR_LATER = ["intro_made", "interview", "offer", "closed"] as const;

/**
 * Summarise the referral outcome for a set of asks.
 *
 * `windowDays` defaults to ASK_TTL_DAYS because that is the promise the product makes elsewhere in
 * the same file: a decision in 7 days. Measuring against the same window the seeker was promised is
 * the only version of this number that means anything to them.
 */
export function summariseReferredOutcome(
  asks: readonly ReferredAskInput[],
  windowDays: number = ASK_TTL_DAYS,
): ReferredOutcomeSummary {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  // Only accepted asks. `pending` and `declined` were never going to produce a referral, and
  // `withdrawn` was withdrawn before anyone accepted.
  // isPostApprovalReferralStatus is exactly the "-- approved only" set: pending, declined and
  // withdrawn are all outside it. The declined/withdrawn exclusion used to be written out here
  // until tsc proved it unreachable -- a guard that can never fire is worse than no guard,
  // because it reads as a decision that was already made for me.
  const accepted = asks.filter(ask => isPostApprovalReferralStatus(ask.status));

  const dayGaps: number[] = [];
  let referredWithin = 0;
  for (const ask of accepted) {
    if (!REFERRED_OR_LATER.includes(ask.status as (typeof REFERRED_OR_LATER)[number])) continue;
    if (!ask.acceptedAt || !ask.referredAt) continue;
    const gap = ask.referredAt.getTime() - ask.acceptedAt.getTime();
    if (gap < 0) continue; // clock skew or a bad write: not a fast referral, and not a slow one
    dayGaps.push(gap / (24 * 60 * 60 * 1000));
    if (gap <= windowMs) referredWithin += 1;
  }

  return {
    accepted: accepted.length,
    referredWithin,
    rate: accepted.length === 0 ? null : referredWithin / accepted.length,
    medianDays: dayGaps.length === 0 ? null : median(dayGaps),
    windowDays,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Plain copy for a metric row, or null when there is nothing to say.
 *
 * A caller rendering this must handle null by showing an empty state, not by substituting a dash
 * that reads as zero.
 */
export function referredOutcomeLabel(summary: ReferredOutcomeSummary): string | null {
  if (summary.rate === null) return null;
  const pct = Math.round(summary.rate * 100);
  return `${pct}% referred within ${summary.windowDays} days`;
}

/** One row of the append-only transition log. */
export type ReferralTransitionEvent = {
  readonly requestId: number;
  readonly resultingStatus: string;
  readonly at: Date | string;
};

const REFERRED_STAGES = new Set(["intro_made", "interview", "offer", "closed"]);

/**
 * Derive the outcome summary straight from the transition log.
 *
 * This is a pure function of the rows, not of a database, for the same reason
 * `askExpirySweep` takes `Deps`: the interesting logic is "when did each ask reach each stage",
 * and that is worth testing without a live connection. The db adapter reads the rows and calls
 * this; anything that changes the arithmetic changes it in exactly one place.
 *
 * `referralRequests` carries no acceptedAt/referredAt column and does not need one -- a second
 * copy of a fact the log already holds would eventually disagree with the first.
 */
export function summariseReferredOutcomeFromEvents(
  events: readonly ReferralTransitionEvent[],
  windowDays: number = ASK_TTL_DAYS,
): ReferredOutcomeSummary {
  const acceptedAt = new Map<number, number>();
  const referredAt = new Map<number, number>();

  for (const event of events) {
    const at = event.at instanceof Date ? event.at.getTime() : new Date(event.at).getTime();
    if (!Number.isFinite(at)) continue;

    // Earliest moment each ask reached each stage. Later stages imply the earlier one happened,
    // so taking the minimum over every qualifying transition is still correct when a row skipped
    // a stage in between.
    if (event.resultingStatus === "approved") {
      acceptedAt.set(event.requestId, Math.min(acceptedAt.get(event.requestId) ?? Infinity, at));
    }
    if (REFERRED_STAGES.has(event.resultingStatus)) {
      referredAt.set(event.requestId, Math.min(referredAt.get(event.requestId) ?? Infinity, at));
    }
  }

  // An ask with no acceptedAt was never accepted, so it is not in the denominator at all.
  const inputs: ReferredAskInput[] = Array.from(acceptedAt).map(([requestId, acceptedMs]) => {
    const referredMs = referredAt.get(requestId);
    return {
      status: referredMs === undefined ? "approved" : "intro_made",
      acceptedAt: new Date(acceptedMs),
      referredAt: referredMs === undefined ? null : new Date(referredMs),
    };
  });

  return summariseReferredOutcome(inputs, windowDays);
}

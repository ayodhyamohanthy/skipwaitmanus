// Baseline metrics contract for the admin flow-health panel (D-018).
//
// D-018 asks for a baseline, not a dashboard: asks per week by outcome and
// coverage, expiries, time to a referrer's first decision, verified referrers
// per company including paused/full, weekly active external referrers with
// operator domains excluded, waiting demand, paying subscribers and
// data-quality rows.
//
// Everything here is aggregate and derived from timestamps, so the maths is
// pure and testable without a database. No field may ever carry a name, an
// email, a user id or request text — the panel is admin-only, and the columns
// are counts.
import { z } from "zod";

/** Four weeks: long enough to see a trend, short enough to act on. */
export const BASELINE_WINDOW_DAYS = 28;

/** The company page that belongs to skipwait.me itself; its referrers are operators, not demand. */
export const OPERATOR_COMPANY_SLUG = "skipwait";

export const flowBaselineWeekSchema = z.object({
  /** UTC Monday 00:00 of the week, ISO date. */
  weekStart: z.string(),
  asks: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  /** Terminal referrer declines: only historic rows (D-021 stopped writing them). */
  declined: z.number().int().nonnegative(),
  withdrawn: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  /** Asks from that week whose company has no verified referrer today. */
  uncovered: z.number().int().nonnegative(),
  /** Asks first marked Referred within 7 days of first visibility (D-038-B north star). */
  referredWithin7Days: z.number().int().nonnegative().optional(),
});

export const flowBaselineSchema = z.object({
  windowDays: z.number().int().positive(),
  generatedAt: z.string(),
  weeks: z.array(flowBaselineWeekSchema),
  expiries: z.object({ total: z.number().int().nonnegative(), last7Days: z.number().int().nonnegative() }),
  decisionLatency: z.object({
    sampleSize: z.number().int().nonnegative(),
    medianHours: z.number().nullable(),
    p90Hours: z.number().nullable(),
  }),
  coverage: z.array(z.object({
    companyDomain: z.string(),
    verifiedReferrers: z.number().int().nonnegative(),
    availableReferrers: z.number().int().nonnegative(),
    pausedOrFull: z.number().int().nonnegative(),
    waitingAsks: z.number().int().nonnegative(),
  })),
  demand: z.array(z.object({
    companyDomain: z.string(),
    waitingAsks: z.number().int().nonnegative(),
    oldestWaitingDays: z.number().int().nonnegative(),
    verifiedReferrers: z.number().int().nonnegative(),
  })),
  externalReferrers: z.object({
    activeLast7Days: z.number().int().nonnegative(),
    activeInWindow: z.number().int().nonnegative(),
    excludedOperatorDomains: z.array(z.string()),
  }),
  subscribers: z.object({
    paid: z.number().int().nonnegative(),
    trialing: z.number().int().nonnegative(),
    byPlan: z.array(z.object({ plan: z.string(), count: z.number().int().nonnegative() })),
  }),
  /** Share of asks first marked Referred within 7 days of first visibility (D-038-B north star). Optional in the client schema so older API responses still parse. */
  referredWithin7DaysPct: z.number().int().nonnegative().optional(),
  dataQuality: z.array(z.object({
    id: z.string(),
    label: z.string(),
    count: z.number().int().nonnegative(),
    hint: z.string(),
  })),
});

export type FlowBaseline = z.infer<typeof flowBaselineSchema>;
export type FlowBaselineWeek = z.infer<typeof flowBaselineWeekSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week containing `ms`. */
export function utcWeekStartMs(ms: number): number {
  const date = new Date(ms);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekday = new Date(midnight).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (weekday + 6) % 7;
  return midnight - daysSinceMonday * DAY_MS;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The baseline's week buckets, oldest first, exactly `windowDays` wide. */
export function baselineWeekStarts(nowMs: number, windowDays: number = BASELINE_WINDOW_DAYS): string[] {
  const weeks = Math.max(1, Math.floor(windowDays / 7));
  const current = utcWeekStartMs(nowMs);
  const starts: string[] = [];
  for (let index = weeks - 1; index >= 0; index -= 1) starts.push(isoDay(current - index * 7 * DAY_MS));
  return starts;
}

/** Which bucket a timestamp belongs to, or null when it is outside the window. */
export function weekKeyFor(ms: number, weekStarts: readonly string[]): string | null {
  const key = isoDay(utcWeekStartMs(ms));
  return weekStarts.includes(key) ? key : null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Median and p90 of a sample in hours. The median averages the two middle
 * values on an even sample (what a reader expects from "median"); p90 is
 * nearest-rank. Both are null when the sample is empty: an unmeasured median is
 * unknown, never zero.
 */
export function decisionLatencyHours(samplesMs: readonly number[]): { medianHours: number | null; p90Hours: number | null } {
  const hours = samplesMs.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b).map(value => value / (60 * 60 * 1000));
  if (hours.length === 0) return { medianHours: null, p90Hours: null };
  const middle = Math.floor(hours.length / 2);
  const median = hours.length % 2 === 1 ? hours[middle]! : (hours[middle - 1]! + hours[middle]!) / 2;
  const rank = Math.min(hours.length - 1, Math.max(0, Math.ceil(hours.length * 0.9) - 1));
  return { medianHours: round1(median), p90Hours: round1(hours[rank]!) };
}

/** True when a verified referrer's domain is not one skipwait.me itself operates. */
export function isExternalReferrerDomain(domain: string | null | undefined, operatorDomains: readonly string[]): boolean {
  const normalized = (domain ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return !operatorDomains.some(operator => operator.trim().toLowerCase() === normalized);
}

/** Days since the oldest waiting ask, floored at 0. */
export function daysSince(ms: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - ms) / DAY_MS));
}

/** The zero baseline: a database-less dev server reports nothing, never invented numbers. */
export function emptyFlowBaseline(nowMs: number, operatorDomains: readonly string[] = []): FlowBaseline {
  const weeks = baselineWeekStarts(nowMs).map(weekStart => ({ weekStart, asks: 0, accepted: 0, passed: 0, expired: 0, declined: 0, withdrawn: 0, waiting: 0, uncovered: 0, referredWithin7Days: 0 }));
  return {
    windowDays: BASELINE_WINDOW_DAYS,
    generatedAt: new Date(nowMs).toISOString(),
    weeks,
    expiries: { total: 0, last7Days: 0 },
    decisionLatency: { sampleSize: 0, medianHours: null, p90Hours: null },
    coverage: [],
    demand: [],
    externalReferrers: { activeLast7Days: 0, activeInWindow: 0, excludedOperatorDomains: [...operatorDomains] },
    subscribers: { paid: 0, trialing: 0, byPlan: [] },
    referredWithin7DaysPct: 0,
    dataQuality: [],
  };
}

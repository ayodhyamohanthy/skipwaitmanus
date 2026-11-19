// D-018 baseline: the aggregate the admin flow-health panel shows, built from a
// FlowBaselineSource so the maths is testable without a database.
//
// Rules this file keeps:
//  - aggregate only: every number is a count over rows, never a name, email,
//    user id or request text;
//  - operator domains (skipwait.me's own company and the admin mailbox) are
//    excluded from "external referrers", because operator activity is not
//    marketplace supply;
//  - availability uses the company directory's own predicate
//    (isOpenReferrer), so the panel cannot disagree with /api/companies;
//  - an outcome bucket is only counted from a row that proves it. Nothing is
//    inferred from a missing value.
import { LAUNCH_COMPANY_SEED } from "../shared/companyDirectorySeed";
import { BASELINE_WINDOW_DAYS, baselineWeekStarts, decisionLatencyHours, daysSince, emptyFlowBaseline, isExternalReferrerDomain, OPERATOR_COMPANY_SLUG, weekKeyFor, type FlowBaseline, type FlowBaselineWeek } from "../shared/flowBaseline";
import { isOpenReferrer } from "./companyDirectory";
import { getDb } from "./db";
import { drizzleFlowBaselineSource, type BaselineReferrerRow, type BaselineRequestRow, type FlowBaselineSource } from "./flowBaselineSource";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MAX_COMPANY_ROWS = 12;
const DECISION_ACTIONS = new Set(["approve", "pass"]);
const ACTIVITY_ACTIONS = new Set(["claim", "approve", "pass", "review"]);

/** skipwait.me's own domains: the launch seed's own page, plus the admin mailbox domain. */
export function operatorDomains(adminEmail: string | null | undefined = process.env.SKIPWAIT_ADMIN_EMAIL): string[] {
  const own = LAUNCH_COMPANY_SEED.filter(seed => seed.slug === OPERATOR_COMPANY_SLUG).flatMap(seed => seed.domains);
  const admin = (adminEmail ?? "").split("@")[1]?.trim().toLowerCase();
  return Array.from(new Set([...own.map(domain => domain.trim().toLowerCase()), ...(admin ? [admin] : [])]));
}

const toMs = (value: Date | string | number): number => (value instanceof Date ? value.getTime() : new Date(value).getTime());

type OutcomeCounts = { accepted: number; passed: number; expired: number; declined: number; withdrawn: number; waiting: number };

function outcomeOf(request: BaselineRequestRow, wasPassed: boolean): keyof OutcomeCounts {
  if (request.status === "approved" || request.status === "intro_made" || request.status === "interview" || request.status === "offer") return "accepted";
  if (request.status === "withdrawn") return "withdrawn";
  if (request.status === "closed") return "expired";
  if (request.status === "declined") return "declined";
  return wasPassed ? "passed" : "waiting";
}

export type BuildFlowBaselineOptions = { nowMs?: number; windowDays?: number; operatorDomains?: readonly string[] };

export async function buildFlowBaseline(source: FlowBaselineSource, options: BuildFlowBaselineOptions = {}): Promise<FlowBaseline> {
  const nowMs = options.nowMs ?? Date.now();
  const operator = options.operatorDomains ?? operatorDomains();
  const weeks = baselineWeekStarts(nowMs, options.windowDays ?? BASELINE_WINDOW_DAYS);
  if (weeks.length === 0) return emptyFlowBaseline(nowMs, operator);
  const windowStartMs = nowMs - (weeks.length * WEEK_MS);

  const [requests, passedIds, transitions, referrerProfiles, domainRows, wallets, requestsWithoutTransitions] = await Promise.all([
    source.loadRequests(), source.loadPassedRequestIds(), source.loadTransitionsSince(windowStartMs),
    source.loadReferrerProfiles(), source.loadCompanyDomains(), source.loadSubscriberWallets(), source.countRequestsWithoutTransitions(),
  ]);

  const passed = new Set(passedIds);
  const companyByDomain = new Map(domainRows.map(row => [row.domain.trim().toLowerCase(), row.companyId]));

  // Coverage: verified referrers with the directory's own availability predicate.
  const verified = referrerProfiles.filter(row => isVerified(row));
  const slots = await source.loadAllocatedSlotCounts(verified.map(row => row.userId));
  const coverageByDomain = new Map<string, { verified: number; available: number; pausedOrFull: number }>();
  for (const referrer of verified) {
    const domain = (referrer.workEmailDomain ?? "").trim().toLowerCase();
    if (!domain) continue;
    const entry = coverageByDomain.get(domain) ?? { verified: 0, available: 0, pausedOrFull: 0 };
    entry.verified += 1;
    if (isOpenReferrer(referrer, domain, slots.get(referrer.userId) ?? 0)) entry.available += 1;
    else entry.pausedOrFull += 1;
    coverageByDomain.set(domain, entry);
  }

  // Waiting demand and weekly outcomes come from the request rows themselves.
  const waitingByDomain = new Map<string, { waiting: number; oldestMs: number }>();
  const buckets = new Map<string, FlowBaselineWeek>(weeks.map(weekStart => [weekStart, { weekStart, asks: 0, accepted: 0, passed: 0, expired: 0, declined: 0, withdrawn: 0, waiting: 0, uncovered: 0 }]));
  const createdById = new Map<number, number>();
  for (const request of requests) {
    createdById.set(request.id, toMs(request.createdAt));
    const domain = request.companyDomain.trim().toLowerCase();
    const bucket = buckets.get(weekKeyFor(toMs(request.createdAt), weeks) ?? "");
    if (!bucket) continue;
    bucket.asks += 1;
    const outcome = outcomeOf(request, passed.has(request.id));
    bucket[outcome] += 1;
    if ((coverageByDomain.get(domain)?.verified ?? 0) === 0) bucket.uncovered += 1;
    if (request.status === "pending" && request.referrerId === null) {
      const demand = waitingByDomain.get(domain) ?? { waiting: 0, oldestMs: toMs(request.createdAt) };
      demand.waiting += 1;
      demand.oldestMs = Math.min(demand.oldestMs, toMs(request.createdAt));
      waitingByDomain.set(domain, demand);
    }
  }

  // Expiries are the sweep's own events: when the ask actually lapsed, not when it was written.
  let expiriesTotal = 0;
  let expiriesLast7 = 0;
  // Time to a referrer's first decision: the earliest accept or pass per ask.
  const firstDecision = new Map<number, number>();
  for (const transition of transitions) {
    const at = toMs(transition.createdAt);
    if (transition.action === "expire") {
      expiriesTotal += 1;
      if (at >= nowMs - WEEK_MS) expiriesLast7 += 1;
    }
    if (!DECISION_ACTIONS.has(transition.action)) continue;
    if (!Number.isFinite(at)) continue;
    const current = firstDecision.get(transition.requestId);
    if (current === undefined || at < current) firstDecision.set(transition.requestId, at);
  }
  const latencySamples: number[] = [];
  for (const [requestId, decidedAt] of Array.from(firstDecision.entries())) {
    const createdAt = createdById.get(requestId);
    if (createdAt !== undefined && decidedAt >= createdAt) latencySamples.push(decidedAt - createdAt);
  }
  const latency = decisionLatencyHours(latencySamples);

  // D-038-B north star: asks first marked Referred within 7 days of first visibility.
  // A referral "counts" when it reaches intro_made via the referrer's mark or the
  // seeker's confirmation. The clock starts at first visibility (coverageVisibleAt;
  // pre-0095 rows: creation).
  const firstReferredAt = new Map<number, number>();
  for (const transition of transitions) {
    const at = toMs(transition.createdAt);
    if (!Number.isFinite(at)) continue;
    const isReferralMark = (transition.action === "progress" && transition.resultingStatus === "intro_made") ||
      (transition.action === "seeker_confirmed_referred" && transition.resultingStatus === "intro_made");
    if (!isReferralMark) continue;
    const current = firstReferredAt.get(transition.requestId);
    if (current === undefined || at < current) firstReferredAt.set(transition.requestId, at);
  }
  let referredWithin7DaysTotal = 0;
  let referredWithin7DaysCount = 0;
  for (const request of requests) {
    const referredAt = firstReferredAt.get(request.id);
    if (referredAt === undefined) continue;
    referredWithin7DaysCount += 1;
    const visibleAt = request.coverageVisibleAt != null ? toMs(request.coverageVisibleAt) : toMs(request.createdAt);
    if (visibleAt !== null && referredAt - visibleAt <= 7 * DAY_MS) {
      referredWithin7DaysTotal += 1;
      const bucket = buckets.get(weekKeyFor(toMs(request.createdAt), weeks) ?? "");
      if (bucket) bucket.referredWithin7Days = (bucket.referredWithin7Days ?? 0) + 1;
    }
  }
  const referredWithin7DaysPct = referredWithin7DaysCount === 0 ? 0 : Math.round((referredWithin7DaysTotal / referredWithin7DaysCount) * 100);

  // External referrer activity: distinct verified referrers who acted, operator domains excluded.
  const referrerById = new Map(referrerProfiles.map(row => [row.userId, row]));
  const activeInWindow = new Set<number>();
  const activeLast7 = new Set<number>();
  for (const transition of transitions) {
    if (!ACTIVITY_ACTIONS.has(transition.action)) continue;
    const at = toMs(transition.createdAt);
    const referrer = referrerById.get(transition.actorUserId);
    if (!referrer || !isVerified(referrer)) continue;
    if (!isExternalReferrerDomain(referrer.workEmailDomain, operator)) continue;
    activeInWindow.add(referrer.userId);
    if (at >= nowMs - WEEK_MS) activeLast7.add(referrer.userId);
  }

  const coverage = Array.from(coverageByDomain.entries()).map(([companyDomain, entry]) => ({ companyDomain, verifiedReferrers: entry.verified, availableReferrers: entry.available, pausedOrFull: entry.pausedOrFull, waitingAsks: waitingByDomain.get(companyDomain)?.waiting ?? 0 }))
    .sort((a, b) => b.waitingAsks - a.waitingAsks || b.availableReferrers - a.availableReferrers || a.companyDomain.localeCompare(b.companyDomain))
    .slice(0, MAX_COMPANY_ROWS);

  const demand = Array.from(waitingByDomain.entries()).map(([companyDomain, entry]) => ({ companyDomain, waitingAsks: entry.waiting, oldestWaitingDays: daysSince(entry.oldestMs, nowMs), verifiedReferrers: coverageByDomain.get(companyDomain)?.verified ?? 0 }))
    .sort((a, b) => b.waitingAsks - a.waitingAsks || b.oldestWaitingDays - a.oldestWaitingDays || a.companyDomain.localeCompare(b.companyDomain))
    .slice(0, MAX_COMPANY_ROWS);

  // Subscribers: a paid plan is a plan other than free; a trial is a Free wallet inside its window.
  const paidWallets = wallets.filter(wallet => wallet.plan !== "free");
  const byPlan = new Map<string, number>();
  for (const wallet of paidWallets) byPlan.set(wallet.plan, (byPlan.get(wallet.plan) ?? 0) + 1);
  let trialing = 0;
  for (const wallet of wallets) {
    if (wallet.plan !== "free" || !wallet.trialEndsAt) continue;
    if (toMs(wallet.trialEndsAt) > nowMs) trialing += 1;
  }
  const subscribers = {
    paid: paidWallets.length,
    trialing,
    byPlan: Array.from(byPlan.entries()).map(([plan, planCount]) => ({ plan, count: planCount })).sort((a, b) => b.count - a.count || a.plan.localeCompare(b.plan)),
  };

  const unmappedCompanies = new Set(requests.map(request => request.companyDomain.trim().toLowerCase()).filter(domain => domain && !companyByDomain.has(domain)));
  const dataQuality = [
    { id: "asks_without_transition", label: "Asks with no state-machine record", count: requestsWithoutTransitions, hint: "A request row with no transition event at all; the next read of that ask should be audited." },
    { id: "companies_off_directory", label: "Company domains not in the directory", count: unmappedCompanies.size, hint: "Asks carry a domain the company directory does not list, so availability cannot be derived for them." },
    { id: "paid_wallet_without_term", label: "Paid wallets with no term end", count: paidWallets.filter(wallet => wallet.subscriptionCurrentTermEnd === null).length, hint: "A paid plan whose entitlement clock is missing; plan credits would not expire." },
  ].filter(row => row.count > 0);

  return {
    windowDays: weeks.length * 7,
    generatedAt: new Date(nowMs).toISOString(),
    weeks: weeks.map(weekStart => buckets.get(weekStart)!),
    expiries: { total: expiriesTotal, last7Days: expiriesLast7 },
    decisionLatency: { sampleSize: latencySamples.length, medianHours: latency.medianHours, p90Hours: latency.p90Hours },
    coverage,
    demand,
    externalReferrers: { activeLast7Days: activeLast7.size, activeInWindow: activeInWindow.size, excludedOperatorDomains: [...operator] },
    subscribers,
    referredWithin7DaysPct,
    dataQuality,
  };
}

/**
 * The live baseline for the admin panel. A database-less dev server gets the
 * zero baseline: the panel is honest about having measured nothing.
 */
export async function getReferralFlowBaseline(nowMs: number = Date.now()): Promise<FlowBaseline> {
  const operator = operatorDomains();
  const db = await getDb();
  if (!db) return emptyFlowBaseline(nowMs, operator);
  return buildFlowBaseline(drizzleFlowBaselineSource(db), { nowMs, operatorDomains: operator });
}

/**
 * A verified referrer for coverage: a verified work email on an unsuspended
 * account. Paused or at-capacity referrers are still verified, so they stay in
 * the company's count and are reported separately as pausedOrFull.
 */
function isVerified(row: BaselineReferrerRow): boolean {
  return Boolean(row.workEmailVerifiedAt) && !row.userSuspended && row.personSuspended !== true;
}

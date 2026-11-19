// Read side of the referrer impact card (shareable moment, slice C). Returns ONLY
// the referrer's screen name (fast-track vanity alias), their company identity,
// the public link path and aggregate stats. No seeker name, title, pitch, ask id
// or company name of any seeker can leave this file: there is no field for one.
// The min-3 gate (D-104 rule) lives in shared/shareImpactCard.ts.
import { and, desc, eq, inArray } from "drizzle-orm";
import { companies, companyDomains, jobs, profiles, referralRequests, referralTransitionEvents, referrerFastTrackLinks } from "../drizzle/schema";
import { IMPACT_DECISION_ACTIONS, IMPACT_REFERRAL_ACTIONS, impactCardVisible, summarizeImpact, type ImpactCardPayload, type ImpactEvent } from "../shared/shareImpactCard";
import { getDb } from "./db";
import { isVerifiedEmployeeOfCompany } from "./referrerAvailability";

export const IMPACT_CARD_FLAG = "SHARE_IMPACT_CARD_ENABLED";
export const impactCardEnabled = () => process.env[IMPACT_CARD_FLAG] === "true";

export type { ImpactCardPayload };

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

/** Aggregate stats for one referrer. Throws when the database is unavailable. */
export async function loadImpactCard(referrerId: number, now: Date = new Date()): Promise<ImpactCardPayload> {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");

  // The referrer's fast-track link carries the screen name and the public path.
  // Every public fast-track surface also requires the referrer to still be a
  // verified employee at the link's company (F3): a job change overwrites the
  // profile's work domain (D-057) while the link keeps the old one until it is
  // recreated, and the card must not publish "Verified at {old company}".
  const [link] = await db
    .select({
      vanityAlias: referrerFastTrackLinks.vanityAlias,
      linkCode: referrerFastTrackLinks.linkCode,
      companyDomain: referrerFastTrackLinks.companyDomain,
      accountType: profiles.accountType,
      workEmailDomain: profiles.workEmailDomain,
      workEmailVerifiedAt: profiles.workEmailVerifiedAt,
    })
    .from(referrerFastTrackLinks)
    .innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId))
    .where(and(eq(referrerFastTrackLinks.referrerId, referrerId), eq(referrerFastTrackLinks.isActive, true)))
    .orderBy(desc(referrerFastTrackLinks.id))
    .limit(1);
  if (!link || !isVerifiedEmployeeOfCompany(link, link.companyDomain)) return { state: "insufficient" };

  const [domainRow] = await db.select({ companyId: companyDomains.companyId }).from(companyDomains).where(eq(companyDomains.domain, link.companyDomain.toLowerCase())).limit(1);
  if (!domainRow) return { state: "insufficient" };
  const [company] = await db.select({ name: companies.name, slug: companies.slug, status: companies.status }).from(companies).where(eq(companies.id, domainRow.companyId)).limit(1);
  if (!company || company.status !== "listed") return { state: "insufficient" };

  // F1 (D-106 review): every number below is published as "{company} impact", so it
  // must come from asks at THIS company. `jobs.company` is the employer's canonical
  // domain, and a company may hold several mapped domains (companyDomains), so the
  // scope is every domain mapped to this company plus the link's own. The link follows
  // the referrer to a new employer while their older asks keep the old company in
  // `jobs.company`, so filtering on actorUserId or referrerId alone would credit the
  // previous employer's work to the new one.
  const domainRows = await db.select({ domain: companyDomains.domain }).from(companyDomains).where(eq(companyDomains.companyId, domainRow.companyId));
  const companyScope = Array.from(new Set([link.companyDomain.trim().toLowerCase(), ...domainRows.map(row => String(row.domain).trim().toLowerCase())]));

  // Two sources, because the truth rule is status-based, not actor-based:
  // - this referrer's OWN decisions (approve/review/pass; review is the
  //   /referrer record action's accept);
  // - milestones on asks this referrer owns, whoever recorded them: the
  //   seeker's "I got the referral email" also writes intro_made.
  // A colleague's decision or milestone on their own ask never counts here.
  // The min-3 gate and the referred count work on DISTINCT asks via
  // shared/shareImpactCard.summarizeImpact (QA note: one ask can carry more
  // than one event from the same referrer).
  const decisionRows = await db
    .select({ action: referralTransitionEvents.action, resultingStatus: referralTransitionEvents.resultingStatus, createdAt: referralTransitionEvents.createdAt, requestId: referralTransitionEvents.referralRequestId })
    .from(referralTransitionEvents)
    .innerJoin(referralRequests, eq(referralRequests.id, referralTransitionEvents.referralRequestId))
    .innerJoin(jobs, eq(jobs.id, referralRequests.jobId))
    .where(and(eq(referralTransitionEvents.actorUserId, referrerId), inArray(jobs.company, companyScope), inArray(referralTransitionEvents.action, [...IMPACT_DECISION_ACTIONS])));
  const referralRows = await db
    .select({ action: referralTransitionEvents.action, resultingStatus: referralTransitionEvents.resultingStatus, createdAt: referralTransitionEvents.createdAt, requestId: referralTransitionEvents.referralRequestId })
    .from(referralTransitionEvents)
    .innerJoin(referralRequests, eq(referralRequests.id, referralTransitionEvents.referralRequestId))
    .innerJoin(jobs, eq(jobs.id, referralRequests.jobId))
    .where(and(eq(referralRequests.referrerId, referrerId), inArray(jobs.company, companyScope), inArray(referralTransitionEvents.action, [...IMPACT_REFERRAL_ACTIONS])));

  const events: ImpactEvent[] = [...decisionRows, ...referralRows].map(row => ({ requestId: row.requestId, action: row.action, resultingStatus: row.resultingStatus, createdAt: new Date(row.createdAt) }));
  const summary = summarizeImpact(events, now);
  if (!impactCardVisible(summary.answeredAsks)) return { state: "insufficient" };
  const referredThisMonth = summary.referredThisMonth;

  // Median first-reply hours: ask visible -> this referrer's first approve/pass.
  const decisions = events.filter(event => (IMPACT_DECISION_ACTIONS as readonly string[]).includes(event.action));
  const asks = await db
    .select({ requestId: referralRequests.id, visibleAt: referralRequests.coverageVisibleAt, createdAt: referralRequests.createdAt })
    .from(referralRequests)
    .innerJoin(jobs, eq(jobs.id, referralRequests.jobId))
    .where(and(inArray(referralRequests.id, decisions.map(row => row.requestId)), inArray(jobs.company, companyScope)));
  const firstDecisionByRequest = new Map<number, Date>();
  for (const row of decisions) {
    const at = row.createdAt;
    const current = firstDecisionByRequest.get(row.requestId);
    if (!current || at < current) firstDecisionByRequest.set(row.requestId, at);
  }
  const replyHours: number[] = [];
  for (const ask of asks) {
    const first = firstDecisionByRequest.get(ask.requestId);
    if (!first) continue;
    const start = ask.visibleAt ? new Date(ask.visibleAt) : new Date(ask.createdAt);
    const hours = (first.getTime() - start.getTime()) / 3_600_000;
    if (hours >= 0) replyHours.push(hours);
  }

  const screenName = link.vanityAlias ?? "your link";
  const linkPath = link.vanityAlias ? `/refer/${company.slug}/${link.vanityAlias.toLowerCase()}` : `/fast/${link.linkCode}`;
  const medianReplyHours = median(replyHours);
  return {
    state: "ready",
    screenName,
    companyName: company.name,
    companySlug: company.slug,
    linkPath,
    stats: {
      referredThisMonth,
      medianFirstReplyHours: medianReplyHours === null ? null : Math.round(medianReplyHours),
      acceptRatePct: summary.acceptRatePct,
    },
  };
}


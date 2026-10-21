// Read side of the referrer impact card (shareable moment, slice C). Returns ONLY
// the referrer's screen name (fast-track vanity alias), their company identity,
// the public link path and aggregate stats. No seeker name, title, pitch, ask id
// or company name of any seeker can leave this file: there is no field for one.
// The min-3 gate (D-104 rule) lives in shared/shareImpactCard.ts.
import { and, desc, eq, inArray } from "drizzle-orm";
import { companies, companyDomains, referralRequests, referralTransitionEvents, referrerFastTrackLinks } from "../drizzle/schema";
import { IMPACT_MIN_ANSWERED, type ImpactStats } from "../shared/shareImpactCard";
import { getDb } from "./db";

export const IMPACT_CARD_FLAG = "SHARE_IMPACT_CARD_ENABLED";
export const impactCardEnabled = () => process.env[IMPACT_CARD_FLAG] === "true";

export type ImpactCardPayload = {
  state: "ready" | "insufficient";
  screenName?: string;
  companyName?: string;
  companySlug?: string;
  linkPath?: string;
  stats?: ImpactStats;
};

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
  const [link] = await db
    .select({ vanityAlias: referrerFastTrackLinks.vanityAlias, linkCode: referrerFastTrackLinks.linkCode, companyDomain: referrerFastTrackLinks.companyDomain })
    .from(referrerFastTrackLinks)
    .where(and(eq(referrerFastTrackLinks.referrerId, referrerId), eq(referrerFastTrackLinks.isActive, true)))
    .orderBy(desc(referrerFastTrackLinks.id))
    .limit(1);
  if (!link) return { state: "insufficient" };

  const [domainRow] = await db.select({ companyId: companyDomains.companyId }).from(companyDomains).where(eq(companyDomains.domain, link.companyDomain.toLowerCase())).limit(1);
  if (!domainRow) return { state: "insufficient" };
  const [company] = await db.select({ name: companies.name, slug: companies.slug, status: companies.status }).from(companies).where(eq(companies.id, domainRow.companyId)).limit(1);
  if (!company || company.status !== "listed") return { state: "insufficient" };

  // All asks that reached this referrer's decisions.
  const decisions = await db
    .select({ action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt, requestId: referralTransitionEvents.referralRequestId })
    .from(referralTransitionEvents)
    .where(and(eq(referralTransitionEvents.actorUserId, referrerId), inArray(referralTransitionEvents.action, ["approve", "pass"])));

  const approved = decisions.filter(row => row.action === "approve").length;
  const answered = decisions.length;
  if (answered < IMPACT_MIN_ANSWERED) return { state: "insufficient" };

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const referredThisMonth = decisions.filter(row => row.action === "approve" && new Date(row.createdAt) >= monthStart).length;

  // Median first-reply hours: ask visible -> this referrer's first approve/pass.
  const asks = await db
    .select({ requestId: referralRequests.id, visibleAt: referralRequests.coverageVisibleAt, createdAt: referralRequests.createdAt })
    .from(referralRequests)
    .where(inArray(referralRequests.id, decisions.map(row => row.requestId)));
  const firstDecisionByRequest = new Map<number, Date>();
  for (const row of decisions) {
    const at = new Date(row.createdAt);
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
  return {
    state: "ready",
    screenName,
    companyName: company.name,
    companySlug: company.slug,
    linkPath,
    stats: {
      referredThisMonth,
      medianFirstReplyHours: median(replyHours) === null ? null : Math.round(median(replyHours)!),
      acceptRatePct: Math.round((approved / answered) * 100),
    },
  };
}


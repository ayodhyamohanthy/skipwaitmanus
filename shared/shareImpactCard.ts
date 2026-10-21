// Referrer impact card (shareable moment, slice C). Copy comes verbatim from
// design/goal-ui/content.json "shareImpact" (sync-pinned by the test). The card
// is built ONLY from the referrer's screen name, their company identity, the
// public link and aggregate stats: there is no field that could carry a seeker
// name, title, pitch or ask id, so no seeker can ever appear on it.
//
// TRUTH RULES (designer review, Oct 21):
// - "people referred" counts asks that reached INTRO MADE or later
//   (progress to intro_made/interview/offer). An accept alone is NOT a referral.
// - The min-3 gate counts DISTINCT ANSWERED ASKS, never events (QA note: one
//   ask can carry more than one event from the same referrer).
import copy from "../design/goal-ui/content.json" with { type: "json" };

export const IMPACT_CARD_COPY = copy.shareImpact;

export type ImpactStats = {
  referredThisMonth: number;
  medianFirstReplyHours: number | null;
  acceptRatePct: number | null;
};

export type ImpactCardInput = {
  screenName: string;
  companyName: string;
  companySlug: string;
  /** Public path of the referrer's fast-track link, e.g. /refer/kestrel-pay/quietfalcon. */
  linkPath: string;
  stats: ImpactStats;
};

/** Min-3 gate on DISTINCT answered asks (same rule as the company response signal, D-104). */
export const IMPACT_MIN_ANSWERED = 3;

/** Actions that answer an ask. Verified against server/db.ts transition writes. */
export const IMPACT_DECISION_ACTIONS = ["approve", "pass"] as const;
/** resultingStatus values that mean an intro actually happened ("referred"). */
export const IMPACT_REFERRED_STATUSES = ["intro_made", "interview", "offer"] as const;

export type ImpactEvent = {
  requestId: number;
  action: string;
  resultingStatus: string;
  createdAt: Date;
};

export type ImpactSummary = {
  /** Distinct asks the referrer answered (approve or pass). Gates the card. */
  answeredAsks: number;
  /** Distinct asks that reached intro_made or later this UTC month. */
  referredThisMonth: number;
  /** approved / answered on distinct asks, rounded; null under the gate. */
  acceptRatePct: number | null;
};

/** Aggregate one referrer's transition events. Distinct asks only, events never counted twice. */
export function summarizeImpact(events: readonly ImpactEvent[], now: Date = new Date()): ImpactSummary {
  const answered = new Set<number>();
  const approved = new Set<number>();
  const referred = new Set<number>();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  for (const event of events) {
    if (event.action === "approve") { answered.add(event.requestId); approved.add(event.requestId); }
    else if (event.action === "pass") answered.add(event.requestId);
    else if ((IMPACT_REFERRED_STATUSES as readonly string[]).includes(event.resultingStatus) && event.createdAt.getTime() >= monthStart) referred.add(event.requestId);
  }
  const answeredAsks = answered.size;
  return {
    answeredAsks,
    referredThisMonth: referred.size,
    acceptRatePct: answeredAsks === 0 ? null : Math.round((approved.size / answeredAsks) * 100),
  };
}

export const impactCardVisible = (answeredAsks: number): boolean => answeredAsks >= IMPACT_MIN_ANSWERED;

const fill = (template: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

export function impactVerifiedLine(input: Pick<ImpactCardInput, "screenName" | "companyName">): string {
  return fill(IMPACT_CARD_COPY.verifiedLine, { screenName: input.screenName, company: input.companyName });
}

export function impactReferredBig(count: number): string {
  return fill(IMPACT_CARD_COPY.referredBig, { count });
}

export function impactReferredLine(companyName: string): string {
  return fill(IMPACT_CARD_COPY.referredLine, { company: companyName });
}

/** Stat pairs for the card: mono numeral + label, dropped when unknown. */
export function impactStatPairs(stats: ImpactStats): Array<{ value: string; label: string }> {
  const pairs: Array<{ value: string; label: string }> = [];
  if (stats.medianFirstReplyHours !== null) pairs.push({ value: fill(IMPACT_CARD_COPY.medianReplyValue, { hours: stats.medianFirstReplyHours }), label: IMPACT_CARD_COPY.medianReplyLabel });
  if (stats.acceptRatePct !== null) pairs.push({ value: fill(IMPACT_CARD_COPY.acceptRateValue, { pct: stats.acceptRatePct }), label: IMPACT_CARD_COPY.acceptRateLabel });
  return pairs;
}

/** One honest sentence for clipboard contexts. */
function referredSentence(input: ImpactCardInput): string {
  return `${impactReferredBig(input.stats.referredThisMonth)} ${impactReferredLine(input.companyName)}`;
}

/** Plain-text card for the clipboard. Aggregates and screen name only. */
export function impactCardText(input: ImpactCardInput): string {
  const lines = [impactVerifiedLine(input), "", referredSentence(input), ...impactStatPairs(input.stats).map(pair => `${pair.value} ${pair.label}`), "", `https://skipwait.me${input.linkPath}`];
  return lines.join("\n");
}

/** LinkedIn-ready post. No claims about seekers, no names. */
export function impactCardLinkedIn(input: ImpactCardInput): string {
  const lines = [`I help people get referred into ${input.companyName}.`, "", referredSentence(input), ...impactStatPairs(input.stats).map(pair => `${pair.value} ${pair.label}`), "", `Ask me for a referral: https://skipwait.me${input.linkPath}`];
  return lines.join("\n");
}

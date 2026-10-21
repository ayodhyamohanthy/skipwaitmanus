// Referrer impact card (shareable moment, slice C). Copy comes verbatim from
// design/goal-ui/content.json "shareImpact" (sync-pinned by the test). The card
// is built ONLY from the referrer's screen name, their company identity, the
// public link and aggregate stats: there is no field that could carry a seeker
// name, title, pitch or ask id, so no seeker can ever appear on it. Min-3 gate
// (D-104 rule): fewer than 3 answered asks shows nothing at all.
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

/** Min-3 gate (same rule as the company response signal, D-104). */
export const IMPACT_MIN_ANSWERED = 3;
export const impactCardVisible = (answeredAsks: number): boolean => answeredAsks >= IMPACT_MIN_ANSWERED;

const fill = (template: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

export function impactVerifiedLine(input: Pick<ImpactCardInput, "screenName" | "companyName">): string {
  return fill(IMPACT_CARD_COPY.verifiedLine, { screenName: input.screenName, company: input.companyName });
}

export function impactReferredLine(input: Pick<ImpactCardInput, "companyName"> & { count: number }): string {
  return fill(IMPACT_CARD_COPY.referredLine, { count: input.count, company: input.companyName });
}

export function impactStatLines(stats: ImpactStats): string[] {
  const lines: string[] = [];
  if (stats.medianFirstReplyHours !== null) lines.push(fill(IMPACT_CARD_COPY.medianReply, { hours: stats.medianFirstReplyHours }));
  if (stats.acceptRatePct !== null) lines.push(fill(IMPACT_CARD_COPY.acceptRate, { pct: stats.acceptRatePct }));
  return lines;
}

/** Plain-text card for the clipboard. Aggregates and screen name only. */
export function impactCardText(input: ImpactCardInput): string {
  const lines = [impactVerifiedLine(input), "", impactReferredLine({ companyName: input.companyName, count: input.stats.referredThisMonth }), ...impactStatLines(input.stats), "", `https://skipwait.me${input.linkPath}`];
  return lines.join("\n");
}

/** LinkedIn-ready post. No claims about seekers, no names. */
export function impactCardLinkedIn(input: ImpactCardInput): string {
  const lines = [`I help people get referred into ${input.companyName}.`, "", impactReferredLine({ companyName: input.companyName, count: input.stats.referredThisMonth }), ...impactStatLines(input.stats), "", `Ask me for a referral: https://skipwait.me${input.linkPath}`];
  return lines.join("\n");
}

import { describe, expect, it } from "vitest";
import copy from "../design/goal-ui/content.json" with { type: "json" };
import { IMPACT_CARD_COPY, IMPACT_MIN_ANSWERED, impactCardLinkedIn, impactCardText, impactCardVisible, impactReferredBig, summarizeImpact, type ImpactCardInput, type ImpactEvent } from "./shareImpactCard";

const input: ImpactCardInput = {
  screenName: "QuietFalcon",
  companyName: "Kestrel Pay",
  companySlug: "kestrel-pay",
  linkPath: "/refer/kestrel-pay/quietfalcon",
  stats: { referredThisMonth: 3, medianFirstReplyHours: 3, acceptRatePct: 64 },
};

const ev = (requestId: number, action: string, resultingStatus: string, createdAt = "2026-10-10T10:00:00Z"): ImpactEvent => ({ requestId, action, resultingStatus, createdAt: new Date(createdAt) });
const NOW = new Date("2026-10-21T09:00:00Z");

describe("referrer impact card", () => {
  it("copy stays in sync with content.json shareImpact", () => {
    expect(IMPACT_CARD_COPY).toEqual(copy.shareImpact);
  });
  it("F5: no link attribution is claimed, and the lifetime stats say so", () => {
    // F5 (D-088): the referred count is route-agnostic (the query has no link
    // attribution), and median reply / accept rate are lifetime figures while
    // the hero is this month. The copy must not overstate either.
    expect(IMPACT_CARD_COPY.referredLine).not.toMatch(/link/i);
    expect(IMPACT_CARD_COPY.medianReplyLabel).toMatch(/all time/i);
    expect(IMPACT_CARD_COPY.acceptRateLabel).toMatch(/all time/i);
    expect(impactCardText(input)).not.toMatch(/through my link/i);
    expect(impactCardLinkedIn(input)).not.toMatch(/through my link/i);
  });
  it("min-3 gate: fewer than 3 distinct answered asks shows nothing", () => {
    expect(impactCardVisible(0)).toBe(false);
    expect(impactCardVisible(IMPACT_MIN_ANSWERED - 1)).toBe(false);
    expect(impactCardVisible(IMPACT_MIN_ANSWERED)).toBe(true);
  });
  it("QA (a): the gate counts distinct asks, never events - 2 asks with 3 events stays hidden", () => {
    const events = [ev(1, "approve", "approved"), ev(1, "progress", "intro_made"), ev(2, "pass", "declined")];
    const summary = summarizeImpact(events, NOW);
    expect(summary.answeredAsks).toBe(2);
    expect(impactCardVisible(summary.answeredAsks)).toBe(false);
  });
  it("an accept is not a referral: referred counts intro_made-or-later only", () => {
    const events = [ev(1, "approve", "approved"), ev(2, "approve", "approved"), ev(3, "approve", "approved"), ev(2, "progress", "intro_made")];
    const summary = summarizeImpact(events, NOW);
    expect(summary.answeredAsks).toBe(3);
    expect(summary.referredThisMonth).toBe(1);
    expect(summary.acceptRatePct).toBe(100);
  });
  it("referred counts only this UTC month; last month's intro does not count", () => {
    const events = [ev(1, "approve", "approved"), ev(2, "approve", "approved"), ev(3, "approve", "approved"), ev(1, "progress", "intro_made", "2026-09-28T10:00:00Z"), ev(2, "progress", "interview")];
    const summary = summarizeImpact(events, NOW);
    expect(summary.referredThisMonth).toBe(1);
  });
  it("accept rate passes honestly: pass lowers it", () => {
    const events = [ev(1, "approve", "approved"), ev(2, "pass", "declined"), ev(3, "pass", "declined")];
    expect(summarizeImpact(events, NOW).acceptRatePct).toBe(33);
  });
  it("F1: an accept recorded as review counts as answered and approved", () => {
    // /referrer records an accept with action "review" (reviewReferralRequest),
    // not "approve": the gate and the accept rate must read both.
    const events = [ev(1, "review", "approved"), ev(2, "review", "approved"), ev(3, "pass", "pending")];
    const summary = summarizeImpact(events, NOW);
    expect(summary.answeredAsks).toBe(3);
    expect(summary.acceptRatePct).toBe(67);
  });
  it("F3: the hero counts referrals, with an honest singular and zero", () => {
    // It counts distinct asks that reached intro_made or later, never people:
    // one seeker can hold two asks (D-006), so the unit is "referrals".
    expect(impactReferredBig(0)).toBe("No referrals");
    expect(impactReferredBig(1)).toBe("1 referral");
    expect(impactReferredBig(3)).toBe("3 referrals");
    expect(impactCardText({ ...input, stats: { ...input.stats, referredThisMonth: 1 } })).toContain("1 referral into Kestrel Pay this month.");
    expect(impactCardText({ ...input, stats: { ...input.stats, referredThisMonth: 0 } })).toContain("No referrals into Kestrel Pay this month.");
  });
  it("plain text card carries screen name, company, aggregates and the link", () => {
    const text = impactCardText(input);
    expect(text).toContain("QuietFalcon · Verified at Kestrel Pay");
    expect(text).toContain("3 referrals into Kestrel Pay this month.");
    expect(text).toContain("3h median first reply, all time");
    expect(text).toContain("64% asks accepted, all time");
    expect(text).toContain("https://skipwait.me/refer/kestrel-pay/quietfalcon");
  });
  it("drops stat lines that have no value", () => {
    const text = impactCardText({ ...input, stats: { referredThisMonth: 3, medianFirstReplyHours: null, acceptRatePct: null } });
    expect(text).not.toContain("median first reply");
    expect(text).not.toContain("asks accepted");
  });
  it("linkedin post never names seekers and stays honest", () => {
    const post = impactCardLinkedIn(input);
    expect(post).toContain("I help people get referred into Kestrel Pay.");
    expect(post).toContain("Ask me for a referral: https://skipwait.me/refer/kestrel-pay/quietfalcon");
    expect(post).not.toMatch(/hired|guaranteed/i);
  });
});

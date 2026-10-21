import { describe, expect, it } from "vitest";
import copy from "../design/goal-ui/content.json" with { type: "json" };
import { IMPACT_CARD_COPY, IMPACT_MIN_ANSWERED, impactCardLinkedIn, impactCardText, impactCardVisible, type ImpactCardInput } from "./shareImpactCard";

const input: ImpactCardInput = {
  screenName: "QuietFalcon",
  companyName: "Kestrel Pay",
  companySlug: "kestrel-pay",
  linkPath: "/refer/kestrel-pay/quietfalcon",
  stats: { referredThisMonth: 3, medianFirstReplyHours: 3, acceptRatePct: 64 },
};

describe("referrer impact card", () => {
  it("copy stays in sync with content.json shareImpact", () => {
    expect(IMPACT_CARD_COPY).toEqual(copy.shareImpact);
  });
  it("min-3 gate: fewer than 3 answered asks shows nothing", () => {
    expect(impactCardVisible(0)).toBe(false);
    expect(impactCardVisible(IMPACT_MIN_ANSWERED - 1)).toBe(false);
    expect(impactCardVisible(IMPACT_MIN_ANSWERED)).toBe(true);
  });
  it("plain text card carries screen name, company, aggregates and the link", () => {
    const text = impactCardText(input);
    expect(text).toContain("QuietFalcon · Verified at Kestrel Pay");
    expect(text).toContain("3 people referred into Kestrel Pay through my link this month.");
    expect(text).toContain("3h median first reply");
    expect(text).toContain("64% asks accepted");
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

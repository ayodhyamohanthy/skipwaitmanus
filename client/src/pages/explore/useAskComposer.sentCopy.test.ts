// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sentAskDetail } from "./useAskComposer";

// D-174/D-385: the composer's sent-state line. The switch-off variants stay today's 7-day and
// 90-day promises; the switch-on variants promise only what still happens.
const base = { company: "Acme", where: "acme.com ", fastTrack: false, waitingForCoverage: false, firstLook: false, levelCost: false };
const branches = [{ ...base, fastTrack: true }, { ...base, waitingForCoverage: true }, { ...base, firstLook: true }, base];

describe("D-174: the composer's sent-state line", () => {
  it("switch off keeps today's 7-day close and 90-day cap", () => {
    expect(sentAskDetail({ ...base, fastTrack: true }, false)).toContain("within 7 days");
    expect(sentAskDetail({ ...base, waitingForCoverage: true }, false)).toContain("up to 90 days");
    expect(sentAskDetail({ ...base, firstLook: true }, false)).toContain("within 7 days");
    expect(sentAskDetail(base, false)).toContain("within 7 days");
  });

  it("switch on promises no close and no wait cap, and says it stays open", () => {
    for (const input of branches) {
      const text = sentAskDetail(input, true);
      expect(text).not.toContain("7 days");
      expect(text).not.toContain("90 days");
      // The ask-expiry promise uses "expires"; CREDIT_ENDED_CAVEAT's "expired" is about the credit bucket.
      expect(text).not.toContain("expires");
      expect(text).toContain("stays open until");
    }
  });

  it("switch on still names the withdrawal refund and the spent-after-pickup rule", () => {
    expect(sentAskDetail(base, true)).toContain("withdrawing before pickup returns the credit");
    expect(sentAskDetail(base, true)).toContain("once someone picks it up, the credit stays spent");
  });
});

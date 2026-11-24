import { describe, expect, it, vi } from "vitest";

// D-174/D-385: force the switch on before shared/referral.ts is imported, then prove every expiry
// answer goes quiet. The getter keeps the binding live, so one file proves both states.
const flags = vi.hoisted(() => ({ noExpiry: true }));
vi.mock("./askNoExpiry", async importOriginal => ({
  ...await importOriginal<typeof import("./askNoExpiry")>(),
  get ASK_NO_EXPIRY_ENABLED() { return flags.noExpiry; },
}));

import { askDaysLeft, askDaysShown, formatAskExpiry, getAskExpiresAtMs, getAskShelfLifeEndsAtMs, isAskExpired } from "./referral";

const NOW = new Date("2026-11-24T12:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const longAgo = (days: number) => new Date(NOW - days * DAY);

describe("D-174: asks stop expiring behind ASK_NO_EXPIRY_ENABLED", () => {
  it("switch on: a 400-day-old waiting ask and a 30-day-old visible ask have no deadline", () => {
    flags.noExpiry = true;
    const waiting = { createdAt: longAgo(400), waitingForCoverage: true };
    const visible = { createdAt: longAgo(30), waitingForCoverage: false, coverageVisibleAt: longAgo(30) };
    for (const ask of [waiting, visible]) {
      expect(getAskShelfLifeEndsAtMs(ask)).toBeNull();
      expect(getAskExpiresAtMs(ask.createdAt)).toBeNull();
      expect(isAskExpired({ status: "pending", referrerId: null, ...ask }, NOW)).toBe(false);
      expect(askDaysLeft(ask, NOW)).toBeNull();
      expect(askDaysShown(ask, NOW)).toBeNull();
      expect(formatAskExpiry({ status: "pending", referrerId: null, ...ask }, NOW)).toBeNull();
    }
  });

  it("switch on: a personal-link ask its employee never acted on has no countdown either", () => {
    flags.noExpiry = true;
    const held = { createdAt: longAgo(30), waitingForCoverage: false, coverageVisibleAt: longAgo(30) };
    expect(formatAskExpiry({ status: "pending", referrerId: 9, heldForReferrer: true, ...held }, NOW)).toBeNull();
    expect(isAskExpired({ status: "pending", referrerId: 9, ...held }, NOW)).toBe(false);
  });

  it("switch off: today's values are unchanged (D-097)", () => {
    flags.noExpiry = false;
    const visible = { createdAt: longAgo(3), waitingForCoverage: false, coverageVisibleAt: longAgo(3) };
    expect(getAskShelfLifeEndsAtMs(visible)).toBe(longAgo(3).getTime() + 7 * DAY);
    expect(getAskExpiresAtMs(visible.createdAt)).toBe(longAgo(3).getTime() + 7 * DAY);
    expect(isAskExpired({ status: "pending", referrerId: null, ...visible }, NOW)).toBe(false);
    expect(askDaysLeft(visible, NOW)).toBe(4);
    expect(askDaysShown(visible, NOW)).toBe(4);
    expect(formatAskExpiry({ status: "pending", referrerId: null, ...visible }, NOW)).toBe("Expires in 4 days");
    const waiting = { createdAt: longAgo(10), waitingForCoverage: true };
    expect(getAskShelfLifeEndsAtMs(waiting)).toBe(longAgo(10).getTime() + 90 * DAY);
    expect(isAskExpired({ status: "pending", referrerId: null, ...waiting }, NOW)).toBe(false);
    expect(isAskExpired({ status: "pending", referrerId: null, ...waiting }, longAgo(-81).getTime())).toBe(true);
  });
});

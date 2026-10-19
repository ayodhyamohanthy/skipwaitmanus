// nav.ts pins (D-048 phase 2 packet §6b): ids, order, and the verified split.
import { describe, expect, it } from "vitest";
import { GOAL_NAV, goalNavFor } from "./nav";

describe("goal nav", () => {
  it("names exactly find, asks, queue and inbox", () => {
    expect(Object.keys(GOAL_NAV).sort()).toEqual(["asks", "find", "inbox", "queue"]);
  });

  it("points at the four existing routes", () => {
    expect(GOAL_NAV.find.href).toBe("/explore");
    expect(GOAL_NAV.asks.href).toBe("/requests");
    expect(GOAL_NAV.queue.href).toBe("/queue");
    expect(GOAL_NAV.inbox.href).toBe("/inbox");
  });

  it("keeps Impact out of the nav (comp placement, D-071)", () => {
    for (const item of Object.values(GOAL_NAV)) expect(item.href).not.toBe("/referrer/impact");
  });

  it("adds the referral queue only for a verified referrer", () => {
    expect(goalNavFor(false).map(item => item.id)).toEqual(["find", "asks", "inbox"]);
    expect(goalNavFor(true).map(item => item.id)).toEqual(["find", "asks", "queue", "inbox"]);
  });
});

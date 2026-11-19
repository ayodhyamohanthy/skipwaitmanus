import { describe, expect, it } from "vitest";
import { computeResponseSignal, MIN_SIGNAL_N } from "./companyResponseSignal";

const now = new Date("2026-10-21T10:00:00Z");
const ask = (askedDay: number, decidedDay: number | null) => ({ askedAt: new Date(Date.UTC(2026, 9, askedDay)), firstDecisionAt: decidedDay === null ? null : new Date(Date.UTC(2026, 9, decidedDay)) });

describe("computeResponseSignal", () => {
  it("min N is 3", () => { expect(MIN_SIGNAL_N).toBe(3); });
  it("hides everything at 2 answered asks, shows at 3", () => {
    expect(computeResponseSignal([ask(1, 2), ask(2, 4)], 5, now)).toEqual({ state: "insufficient" });
    expect(computeResponseSignal([ask(1, 2), ask(2, 4), ask(3, 6)], 5, now)).toEqual({ state: "shown", usualFirstReplyDays: 2, answeredThisMonth: 3, referrersInside: 5 });
  });
  it("hides everything at 2 referrers, shows at 3", () => {
    const asks = [ask(1, 2), ask(2, 4), ask(3, 6)];
    expect(computeResponseSignal(asks, 2, now)).toEqual({ state: "insufficient" });
    expect(computeResponseSignal(asks, 3, now).state).toBe("shown");
  });
  it("counts only decisions inside the current month and ignores undecided asks", () => {
    const old = { askedAt: new Date("2026-09-20T00:00:00Z"), firstDecisionAt: new Date("2026-09-25T00:00:00Z") };
    expect(computeResponseSignal([old, old, old, ask(1, null), ask(2, null)], 9, now)).toEqual({ state: "insufficient" });
  });
  it("uses the median, never the mean, and never reports under 1 day", () => {
    const out = computeResponseSignal([ask(1, 1), ask(1, 1), ask(1, 20)], 4, now);
    expect(out).toMatchObject({ state: "shown", usualFirstReplyDays: 1 });
  });
  it("exposes no per-person or per-ask field", () => {
    const out = computeResponseSignal([ask(1, 2), ask(2, 4), ask(3, 6)], 5, now);
    expect(Object.keys(out).sort()).toEqual(["answeredThisMonth", "referrersInside", "state", "usualFirstReplyDays"]);
  });
});

import { describe, expect, it } from "vitest";
import { PLAN_DISPLAY_NAME, planReachFor, REACH_LEVEL_NAMES } from "./planFamily";

const row = (p: "open_door" | "fast_track" | "insider", l: number) => { const r = planReachFor(p, l); return `${r.levelNames} · ${r.levelText}`; };
const all = (l: number) => (["open_door", "fast_track", "insider"] as const).map(p => row(p, l));

describe("planReachFor (D-148 display only)", () => {
  it("matches the designer examples", () => {
    expect(all(2)).toEqual(["Entry-level · L2", "Entry-level up to Mid-level · L2 to L4", "Entry-level up to Senior II · L2 to L6"]);
    expect(all(4)).toEqual(["Mid-level · L4", "Mid-level up to Senior II · L4 to L6", "Mid-level up to Principal · L4 to L8"]);
    expect(row("insider", 9)).toBe("Director or head up to VP or C-level · L9 to L10");
  });
  it("clamps to L1-L10", () => {
    expect(row("insider", 10)).toBe("VP or C-level · L10");
    expect(row("open_door", 0)).toBe("Intern · L1");
  });
  it("level names never reuse a plan name; plan names are Entry / Mid / Senior level Referrers (D-152)", () => {
    expect(PLAN_DISPLAY_NAME).toEqual({ open_door: "Entry level Referrers", fast_track: "Mid level Referrers", insider: "Senior level Referrers" });
    const plans = Object.values(PLAN_DISPLAY_NAME).map(n => n.toLowerCase());
    for (const n of Object.values(REACH_LEVEL_NAMES)) expect(plans).not.toContain(n.toLowerCase());
  });
});

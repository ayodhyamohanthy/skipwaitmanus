import { describe, expect, it } from "vitest";
import { planReachFor } from "./planFamily";

const row = (p: "open_door" | "fast_track" | "insider", l: number) => { const r = planReachFor(p, l); return `${r.bandText} · ${r.levelText}`; };

describe("planReachFor (D-148 display only)", () => {
  it("matches the designer examples", () => {
    expect(["open_door", "fast_track", "insider"].map(p => row(p as any, 2))).toEqual(["Junior · L2", "Junior to Mid · L2 to L4", "Junior to Senior+ · L2 to L6"]);
    expect(["open_door", "fast_track", "insider"].map(p => row(p as any, 4))).toEqual(["Mid · L4", "Mid to Senior+ · L4 to L6", "Mid to Senior+ · L4 to L8"]);
    expect(["open_door", "fast_track", "insider"].map(p => row(p as any, 5))).toEqual(["Senior+ · L5", "Senior+ · L5 to L7", "Senior+ · L5 to L9"]);
    expect(row("insider", 9)).toBe("Senior+ · L9 to L10");
  });
  it("clamps to L1-L10", () => {
    expect(row("insider", 10)).toBe("Senior+ · L10");
    expect(row("open_door", 0)).toBe("Junior · L1");
  });
});

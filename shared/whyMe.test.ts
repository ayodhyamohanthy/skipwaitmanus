import { describe, expect, it } from "vitest";
import { WHY_ME_MAX, composeWhyMe, overLimitReasons, splitWhyMe } from "./whyMe";

describe("why-me reasons", () => {
  it("stores one reason per line and drops empties", () => {
    expect(composeWhyMe(["  Cut p99 by 41%  ", "", "Ran 14 services"])).toBe("Cut p99 by 41%\nRan 14 services");
    expect(composeWhyMe(["  ", ""])).toBe("");
  });

  it("collapses whitespace inside a reason so one reason stays one line", () => {
    expect(composeWhyMe(["Built  the\npayouts   service"])).toBe("Built the payouts service");
  });

  it("round-trips three reasons", () => {
    const reasons = ["One result", "Second reason", "Third reason"] as const;
    expect(splitWhyMe(composeWhyMe(reasons))).toEqual(reasons);
  });

  it("keeps a legacy one-block note in the first field", () => {
    expect(splitWhyMe("I have shipped three payment systems.")).toEqual(["I have shipped three payment systems.", "", ""]);
  });

  it("joins extra lines into the third reason so nothing is lost", () => {
    expect(splitWhyMe("One\nTwo\nThree\nFour")).toEqual(["One", "Two", "Three Four"]);
  });

  it("reports only the reasons over the limit", () => {
    const over = "x".repeat(WHY_ME_MAX + 1);
    expect(overLimitReasons(["fits", over, "also fits"])).toEqual([1]);
    expect(overLimitReasons(["x".repeat(WHY_ME_MAX)])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { REACH_LEVEL_NAMES } from "./planFamily";

describe("job-level display names (D-148 job wall naming, kept)", () => {
  it("covers L1 through L10", () => {
    expect(Object.keys(REACH_LEVEL_NAMES).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(REACH_LEVEL_NAMES[1]).toBe("Intern");
    expect(REACH_LEVEL_NAMES[10]).toBe("VP or C-level");
  });
});

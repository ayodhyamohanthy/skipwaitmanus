import { describe, expect, it } from "vitest";
import { composeWhyMe, overLimitReasons, splitWhyMe, whyMeForReader, WHY_ME_MAX } from "../shared/whyMe";

describe("why me (D-077(4))", () => {
  it("stores three reasons as three lines and drops empty ones", () => {
    expect(composeWhyMe(["  Built X  ", "", "Led   Y"])).toBe("Built X\nLed Y");
  });
  it("round-trips through the composer fields", () => {
    expect(splitWhyMe(composeWhyMe(["a b", "c d", "e f"]))).toEqual(["a b", "c d", "e f"]);
  });
  it("keeps every word of a longer note: extra lines join the third", () => {
    expect(splitWhyMe("one\ntwo\nthree\nfour")).toEqual(["one", "two", "three four"]);
  });
  it("reads an old single-block note as one reason", () => {
    expect(whyMeForReader("A single paragraph note.")).toEqual(["A single paragraph note."]);
    expect(whyMeForReader(null)).toEqual([]);
  });
  it("flags reasons over the limit", () => {
    expect(overLimitReasons(["ok", "x".repeat(WHY_ME_MAX + 1), "x".repeat(WHY_ME_MAX)])).toEqual([1]);
  });
});

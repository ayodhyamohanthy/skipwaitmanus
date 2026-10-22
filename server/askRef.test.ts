import { describe, expect, it } from "vitest";
import { publicAskRef } from "./askRef";

describe("publicAskRef", () => {
  it("renders the comp shape: R- plus five unambiguous characters", () => {
    expect(publicAskRef(501)).toMatch(/^R-[0-9A-HJ-KM-NP-Z]{5}$/);
    expect(publicAskRef(1)).not.toBe("R-1001");
  });
  it("is stable per id and distinct across ids", () => {
    expect(publicAskRef(501)).toBe(publicAskRef(501));
    expect(publicAskRef(501)).not.toBe(publicAskRef(502));
  });
  it("does not embed the id (no sequential leak)", () => {
    expect(publicAskRef(1001)).not.toContain("1001");
  });
});

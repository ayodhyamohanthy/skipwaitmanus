import { describe, expect, it } from "vitest";
import { normalizeReferenceId } from "../shared/referenceId";

describe("portal reference ID", () => {
  it("trims, accepts portal-style ids and treats empty as none", () => {
    expect(normalizeReferenceId(" TC-4410 ")).toBe("TC-4410");
    expect(normalizeReferenceId("REQ/2026 #12")).toBe("REQ/2026 #12");
    expect(normalizeReferenceId(undefined)).toBeNull();
    expect(normalizeReferenceId("   ")).toBeNull();
  });
  it("rejects links, markup, long values and non-strings", () => {
    for (const bad of ["https://x.example", "a@b.co", "<script>", "x".repeat(41), "-lead", 7, {}]) expect(normalizeReferenceId(bad), String(bad)).toBeUndefined();
  });
});

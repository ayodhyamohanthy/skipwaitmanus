import { describe, expect, it } from "vitest";
import { PASS_REASON_OPTIONS, isPassReasonCode, passReasonSeekerLabel } from "../shared/passReasons";

describe("kit pass reasons", () => {
  it("has the five kit reasons, each mapped to an existing legacy decline reason", () => {
    expect(PASS_REASON_OPTIONS.map(o => o.label)).toEqual(["Not my team or function", "Role needs more experience", "Not enough context", "At capacity right now", "Prefer not to say"]);
    for (const o of PASS_REASON_OPTIONS) expect(["role_not_a_fit", "cannot_support", "timing"]).toContain(o.legacy);
  });
  it("validates codes and builds a name-free seeker label", () => {
    expect(isPassReasonCode("at_capacity")).toBe(true);
    expect(isPassReasonCode("Jane Doe")).toBe(false);
    expect(passReasonSeekerLabel("needs_experience")).toBe("Role needs more experience");
    expect(passReasonSeekerLabel("prefer_not_to_say")).toBeNull();
    expect(passReasonSeekerLabel(null)).toBeNull();
  });
});

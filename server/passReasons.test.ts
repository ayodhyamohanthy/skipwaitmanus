import { describe, expect, it } from "vitest";
import { PASS_REASON_OPTIONS, isPassReasonCode, passReasonSeekerLabel } from "../shared/passReasons";

describe("pass reasons (task 15, D-052)", () => {
  it("has the seven reasons, each mapped to an existing legacy decline reason", () => {
    expect(PASS_REASON_OPTIONS.map(o => o.label)).toEqual(["Not my team or function", "Role needs more experience", "Not enough context", "At capacity right now", "Role is closed", "I only refer people I know", "Prefer not to say"]);
    for (const o of PASS_REASON_OPTIONS) expect(["role_not_a_fit", "cannot_support", "timing"]).toContain(o.legacy);
    // D-052's two additions: a closed role is about the role, "only people I know" is about vouching.
    expect(PASS_REASON_OPTIONS.find(o => o.code === "role_closed")?.legacy).toBe("role_not_a_fit");
    expect(PASS_REASON_OPTIONS.find(o => o.code === "only_refer_known")?.legacy).toBe("cannot_support");
  });

  it("labels exactly the two reasons a seeker can fix as fixable (D-052)", () => {
    expect(Object.fromEntries(PASS_REASON_OPTIONS.map(o => [o.code, o.fixable]))).toEqual({
      not_my_team: false,
      needs_experience: true,
      not_enough_context: true,
      at_capacity: false,
      role_closed: false,
      only_refer_known: false,
      prefer_not_to_say: false,
    });
  });

  it("every code is unique and fits referralRequestPasses.reasonCode, VARCHAR(32) since 0083", () => {
    for (const o of PASS_REASON_OPTIONS) expect(o.code.length).toBeLessThanOrEqual(32);
    expect(new Set(PASS_REASON_OPTIONS.map(o => o.code)).size).toBe(PASS_REASON_OPTIONS.length);
  });

  it("validates codes and builds a name-free seeker label", () => {
    expect(isPassReasonCode("at_capacity")).toBe(true);
    expect(isPassReasonCode("role_closed")).toBe(true);
    expect(isPassReasonCode("only_refer_known")).toBe(true);
    expect(isPassReasonCode("Jane Doe")).toBe(false);
    expect(passReasonSeekerLabel("needs_experience")).toBe("Role needs more experience");
    expect(passReasonSeekerLabel("role_closed")).toBe("Role is closed");
    expect(passReasonSeekerLabel("only_refer_known")).toBe("I only refer people I know");
    expect(passReasonSeekerLabel("prefer_not_to_say")).toBeNull();
    expect(passReasonSeekerLabel(null)).toBeNull();
  });
});

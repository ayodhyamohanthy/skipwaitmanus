import { describe, expect, it } from "vitest";
import { locationFitMessage, parseRoleLocation, roleLocationFit, roleLocationOptions } from "../shared/roleLocationFit";

const pune = { city: "Pune, India", countries: "India", remote: true, visa: "Need sponsorship for some countries" as const };

describe("role location fit", () => {
  it("builds options only from saved answers, always with Other", () => {
    expect(roleLocationOptions(null).map(o => o.label)).toEqual(["Other location…"]);
    expect(roleLocationOptions(pune).map(o => o.label)).toEqual(["Remote · India", "Hybrid · Pune", "Other location…"]);
    expect(roleLocationOptions({ ...pune, remote: false }).map(o => o.label)).toEqual(["Hybrid · Pune", "Other location…"]);
  });
  it("parses a choice and rejects empty or unknown ones", () => {
    expect(parseRoleLocation("hybrid:Pune", "")).toEqual({ kind: "hybrid", place: "Pune" });
    expect(parseRoleLocation("other", "  Austin, USA ")).toEqual({ kind: "onsite", place: "Austin, USA" });
    expect(parseRoleLocation("other", " ")).toBeNull();
    expect(parseRoleLocation("weird:x", "")).toBeNull();
    expect(parseRoleLocation("", "")).toBeNull();
  });
  it("fits a role in the seeker's own city or country, ignoring case and accents", () => {
    expect(roleLocationFit({ kind: "onsite", place: "PUNE" }, pune)).toBe("fits");
    expect(roleLocationFit({ kind: "hybrid", place: "Mumbai, India" }, pune)).toBe("fits");
    expect(roleLocationFit({ kind: "remote", place: "India" }, pune)).toBe("fits");
  });
  it("flags a role elsewhere: sponsorship when needed, mismatch when not", () => {
    const austin = { kind: "onsite", place: "Austin, USA" } as const;
    expect(roleLocationFit(austin, pune)).toBe("needs_sponsorship");
    expect(roleLocationFit(austin, { ...pune, visa: "No sponsorship needed" })).toBe("mismatch");
    expect(locationFitMessage("needs_sponsorship", austin)).toContain("Austin, USA");
    expect(locationFitMessage("mismatch", austin)).toContain("outside the places you listed");
  });
  it("warns on a remote role only when the seeker prefers in-person, and stays quiet without data", () => {
    expect(roleLocationFit({ kind: "remote", place: "India" }, { ...pune, remote: false })).toBe("mismatch");
    expect(roleLocationFit({ kind: "onsite", place: "Austin" }, { city: "", countries: "", remote: true, visa: pune.visa })).toBe("unknown");
    expect(roleLocationFit({ kind: "onsite", place: "Austin" }, null)).toBe("unknown");
    expect(locationFitMessage("fits", { kind: "onsite", place: "Pune" })).toBeNull();
    expect(locationFitMessage("unknown", null)).toBeNull();
  });
});

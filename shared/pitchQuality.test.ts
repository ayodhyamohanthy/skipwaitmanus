import { describe, expect, it } from "vitest";
import {
  BLOCKING_CODES,
  MAX_PITCH_CHARS,
  MIN_PITCH_CHARS,
  blockingPitchFindings,
  checkPitchQuality,
  isPitchReferable,
} from "./pitchQuality";

const codes = (pitch: string) => checkPitchQuality(pitch).map(f => f.code);

/** A note that names something concrete. Used as the "good" case throughout. */
const GOOD = "I have shipped three React apps over four years and this role at Wipro matches the design-systems work I did at my last company.";

describe("checkPitchQuality", () => {
  it("rejects only the empty note with a single finding, not five", () => {
    expect(codes("")).toEqual(["empty"]);
    expect(codes("   \n  ")).toEqual(["empty"]);
  });

  it("flags a note below the minimum, and stops flagging filler on top of it", () => {
    // Short notes are short. Piling "add specifics" onto a 10-character note is noise.
    expect(codes("please refer me")).toEqual(["too_short", "filler"]);
    expect(codes("hi")).toEqual(["too_short"]);
  });

  it("passes a note at exactly the minimum, when it says something specific", () => {
    const forty = "I built the design system for two teams of six.";
    expect(forty.length).toBeGreaterThanOrEqual(MIN_PITCH_CHARS);
    expect(isPitchReferable(forty)).toBe(true);
  });

  it("names filler that is the same word with punctuation and spacing", () => {
    // Collapsed before matching, so "t-e-s-t" and "test" cannot sneak past.
    expect(codes("t e s t ".padEnd(60, " x"))).toContain("filler");
    expect(codes("asdf")).toContain("filler");
  });

  it("treats contact details as the one blocking finding", () => {
    // The product hides contact details until BOTH sides agree. Putting them in the note
    // bypasses that with no consent given.
    const withEmail = `${GOOD} You can reach me at aisha.developer@gmail.com.`;
    expect(codes(withEmail)).toContain("contact_details");
    expect(blockingPitchFindings(withEmail).map(f => f.code)).toEqual(["contact_details"]);
  });

  it("blocks a phone number and a 'reach me on' phrase too", () => {
    expect(codes(`${GOOD} Call me on +91 98765 43210 tomorrow.`)).toContain("contact_details");
    expect(codes(`${GOOD} WhatsApp me and I will share details.`)).toContain("contact_details");
  });

  it("does NOT block a 4-digit year or an id that merely looks like a number", () => {
    // A phone regex loose enough to be safe is also loose enough to be wrong; these are the
    // cases that decide whether the check is usable.
    expect(codes(GOOD)).not.toContain("contact_details");
    expect(codes("I led the 2024 migration at a 12 person team and shipped it in three months.")).not.toContain("contact_details");
    expect(codes("I cut our p95 latency by 320ms and drove incident rate down over two quarters.")).not.toContain("contact_details");
  });

  it("flags shouting, but not an acronym inside a normal note", () => {
    expect(codes("I AM AN EXCELLENT CANDIDATE FOR THIS ROLE AND I WANT THIS JOB PLEASE")).toContain("all_caps");
    expect(codes(GOOD)).not.toContain("all_caps");
  });

  it("asks for specifics only when the note is long enough that the omission is a choice", () => {
    const vagueLong = "I am applying for this role and I hope you will consider my request because I really want to work at this company.";
    expect(vagueLong.length).toBeGreaterThan(MIN_PITCH_CHARS);
    expect(codes(vagueLong)).toContain("no_specifics");
    expect(codes(GOOD)).not.toContain("no_specifics");
  });

  it("keeps the order stable so the UI shows the most important finding first", () => {
    // length, filler, contact, caps, specifics — in that order.
    expect(codes("email me at a.b@c.com")).toEqual(["too_short", "filler", "contact_details"]);
  });

  it("never blocks a legitimate longer note", () => {
    expect(isPitchReferable(GOOD)).toBe(true);
    expect(isPitchReferable(" ".repeat(60) + GOOD)).toBe(true);
  });

  it("BLOCKING_CODES contains contact_details and nothing else", () => {
    // Everything else is advice. A note that skips consent is the only thing that must stop.
    expect([...BLOCKING_CODES]).toEqual(["contact_details"]);
  });

  it("keeps the caps ceiling well above the length floor", () => {
    expect(MAX_PITCH_CHARS).toBeGreaterThan(MIN_PITCH_CHARS * 10);
  });

  it("handles a non-string defensively", () => {
    // Zod validates before this runs, but a shared function that throws on undefined turns a
    // bad request into a 500 instead of a message.
    expect(codes(undefined as unknown as string)).toEqual(["empty"]);
    expect(codes(null as unknown as string)).toEqual(["empty"]);
  });

  it("accepts very long specific notes without inventing findings", () => {
    const long = `${GOOD} ${"I have also written about it publicly. ".repeat(40)}`;
    expect(long.length).toBeGreaterThan(1000);
    expect(checkPitchQuality(long)).toEqual([]);
  });
});

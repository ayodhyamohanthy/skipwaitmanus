import { describe, expect, it } from "vitest";
import { askChecks } from "../shared/askQuality";

const proof = (note: string) => askChecks({ officialUrl: true, note, hasResume: true }).find(check => check.label === "One specific proof of fit")?.ok;

describe("ask quality: one specific proof of fit", () => {
  it("counts a percentage result, whatever follows it", () => {
    expect(proof("Completion rose from 58% to 74%.")).toBe(true);
    expect(proof("Cut costs by 30%")).toBe(true);
    expect(proof("Grew retention 12% year on year")).toBe(true);
  });
  it("still counts action verbs and scale, and still rejects generic asks", () => {
    expect(proof("I led the payments team")).toBe(true);
    expect(proof("5 years of backend work")).toBe(true);
    expect(proof("Please refer me for any role, I led teams")).toBe(false);
    expect(proof("I am hardworking and passionate")).toBe(false);
  });
});

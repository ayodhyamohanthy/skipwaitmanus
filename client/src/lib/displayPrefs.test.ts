import { describe, expect, it } from "vitest";
import { formatDay, formatDayTime, isSameDay } from "./displayPrefs";

const at = "2026-10-08T23:30:00Z";
describe("display preferences formatter", () => {
  it("shifts the calendar day with the chosen time zone", () => {
    expect(formatDay(at, {}, { timeZone: "UTC", dateFormat: "mdy" })).toBe("Oct 8");
    expect(formatDay(at, {}, { timeZone: "Asia/Kolkata", dateFormat: "mdy" })).toBe("Oct 9");
  });
  it("applies date format orders", () => {
    expect(formatDay(at, {}, { timeZone: "UTC", dateFormat: "dmy" })).toBe("8 Oct");
    expect(formatDay(at, { year: true }, { timeZone: "UTC", dateFormat: "dmy" })).toBe("8 Oct 2026");
    expect(formatDay(at, { year: true }, { timeZone: "UTC", dateFormat: "mdy" })).toBe("Oct 8, 2026");
    expect(formatDay(at, {}, { timeZone: "UTC", dateFormat: "iso" })).toBe("2026-10-08");
  });
  it("falls back to the device format when nothing is chosen, and never throws on bad input", () => {
    expect(formatDay(at, {}, { timeZone: "UTC", dateFormat: null })).toMatch(/Oct/);
    expect(formatDay("nope")).toBeNull();
    expect(formatDayTime("nope")).toBeNull();
    expect(formatDayTime(at, { timeZone: "UTC", dateFormat: "dmy" })).toMatch(/^8 Oct, /);
  });
  it("compares days in the chosen zone", () => {
    expect(isSameDay("2026-10-08T23:30:00Z", "2026-10-09T00:30:00Z", { timeZone: "UTC", dateFormat: null })).toBe(false);
    expect(isSameDay("2026-10-08T23:30:00Z", "2026-10-09T00:30:00Z", { timeZone: "Asia/Kolkata", dateFormat: null })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  isWithinQuietHours,
  minutesInZone,
  parseClock,
  quietHoursEndsAt,
  QUIET_HOURS_DEFAULT,
  type QuietHours,
} from "./quietHours";

const window = (over: Partial<QuietHours> = {}): QuietHours => ({
  enabled: true, start: "22:00", end: "07:00", timeZone: "UTC", ...over,
});

describe("quiet hours", () => {
  it("parses HH:MM and rejects anything else", () => {
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("22:30")).toBe(22 * 60 + 30);
    expect(parseClock("23:59")).toBe(1439);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("7:00")).toBeNull();
    expect(parseClock("22:60")).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock("evening")).toBeNull();
  });

  it("is quiet on BOTH sides of a window that wraps midnight", () => {
    // The case a naive `start <= now && now <= end` gets wrong in both
    // directions: 22:00-07:00 must hold at 23:00 and at 02:00.
    const config = window();
    expect(isWithinQuietHours(new Date("2026-01-15T23:00:00Z"), config)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-01-15T02:00:00Z"), config)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-01-15T06:59:00Z"), config)).toBe(true);
  });

  it("is not quiet outside a wrapping window", () => {
    const config = window();
    expect(isWithinQuietHours(new Date("2026-01-15T07:00:00Z"), config)).toBe(false);
    expect(isWithinQuietHours(new Date("2026-01-15T12:00:00Z"), config)).toBe(false);
    expect(isWithinQuietHours(new Date("2026-01-15T21:59:00Z"), config)).toBe(false);
  });

  it("handles a window that does not wrap", () => {
    const config = window({ start: "09:00", end: "17:00" });
    expect(isWithinQuietHours(new Date("2026-01-15T12:00:00Z"), config)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-01-15T08:59:00Z"), config)).toBe(false);
    expect(isWithinQuietHours(new Date("2026-01-15T17:00:00Z"), config)).toBe(false);
  });

  it("evaluates in the RECIPIENT'S zone, not the server's", () => {
    // The same instant: 02:00 UTC is inside a 22:00-07:00 window in UTC, and
    // 07:30 in Asia/Kolkata, which is outside it. A server-local implementation
    // sends a 3am push and passes every test that runs in one zone.
    const instant = new Date("2026-01-15T02:00:00Z");
    expect(isWithinQuietHours(instant, window({ timeZone: "UTC" }))).toBe(true);
    expect(isWithinQuietHours(instant, window({ timeZone: "Asia/Kolkata" }))).toBe(false);
  });

  it("reads wall-clock minutes in a zone, half-hour offsets included", () => {
    const instant = new Date("2026-01-15T02:00:00Z");
    expect(minutesInZone(instant, "UTC")).toBe(120);
    // Asia/Kolkata is UTC+5:30 -- a whole-hour assumption is wrong here.
    expect(minutesInZone(instant, "Asia/Kolkata")).toBe(450);
    expect(minutesInZone(instant, "America/New_York")).toBe(21 * 60);
  });

  it("treats start === end as NEVER quiet, not always", () => {
    // The dangerous reading is "quiet for 24 hours", which silently silences
    // every notification the account will ever receive.
    const config = window({ start: "09:00", end: "09:00" });
    for (const hour of [0, 6, 9, 12, 18, 23]) {
      expect(isWithinQuietHours(new Date(`2026-01-15T${String(hour).padStart(2, "0")}:00:00Z`), config)).toBe(false);
    }
  });

  it("fails OPEN on a malformed window", () => {
    // A window nobody can parse must not silence an account.
    for (const bad of [{ start: "25:00" }, { start: "nonsense" }, { end: "" }, { end: "7pm" }]) {
      expect(isWithinQuietHours(new Date("2026-01-15T03:00:00Z"), window(bad))).toBe(false);
    }
  });

  it("fails open on an unknown time zone rather than guessing an offset", () => {
    expect(isWithinQuietHours(new Date("2026-01-15T03:00:00Z"), window({ timeZone: "Mars/Olympus" }))).toBe(false);
  });

  it("is never quiet when disabled, whatever the clock says", () => {
    expect(isWithinQuietHours(new Date("2026-01-15T03:00:00Z"), window({ enabled: false }))).toBe(false);
    expect(isWithinQuietHours(new Date("2026-01-15T03:00:00Z"), QUIET_HOURS_DEFAULT)).toBe(false);
  });

  it("reports when a held notification may go out", () => {
    // Deferred, not dropped: a dropped notification is indistinguishable from
    // one that was never generated.
    const config = window();
    const ends = quietHoursEndsAt(new Date("2026-01-15T23:30:00Z"), config);
    expect(ends).not.toBeNull();
    expect(ends!.toISOString()).toBe("2026-01-16T07:00:00.000Z");
  });

  it("reports no end when it is not quiet now", () => {
    expect(quietHoursEndsAt(new Date("2026-01-15T12:00:00Z"), window())).toBeNull();
  });

  it("finds the end across a zone offset", () => {
    // 22:00-07:00 in Kolkata ends at 07:00 IST = 01:30 UTC.
    const ends = quietHoursEndsAt(new Date("2026-01-15T20:00:00Z"), window({ timeZone: "Asia/Kolkata" }));
    expect(ends).not.toBeNull();
    expect(minutesInZone(ends!, "Asia/Kolkata")).toBe(7 * 60);
  });

  it("crosses a daylight-saving change without losing or gaining a window", () => {
    // America/New_York springs forward on 2026-03-08. A fixed-offset
    // implementation is wrong for one hour a year and correct in every test
    // that does not pick this date.
    const config = window({ timeZone: "America/New_York" });
    const ends = quietHoursEndsAt(new Date("2026-03-08T05:00:00Z"), config);
    if (ends) expect(isWithinQuietHours(ends, config)).toBe(false);
    expect(isWithinQuietHours(new Date("2026-03-08T06:00:00Z"), config)).toBe(true);
  });
});

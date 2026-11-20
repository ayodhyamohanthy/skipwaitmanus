import { describe, expect, it } from "vitest";
import { isJobOverdue } from "./scheduledJobsRoutes";

const HOUR = 60 * 60_000;
const NOW = Date.parse("2026-11-20T12:00:00Z");

describe("scheduled-job overdue rule", () => {
  it.each([
    [15 * 60_000, 45 * 60_000],
    [HOUR, 3 * HOUR],
    [24 * HOUR, 30 * HOUR],
  ])("uses the exact span boundary for a %i ms window", (windowMs, span) => {
    const job = { windowMs };
    expect(isJobOverdue(job, new Date(NOW - span), NOW, NOW - 100 * HOUR)).toBe(false);
    expect(isJobOverdue(job, new Date(NOW - span - 1), NOW, NOW - 100 * HOUR)).toBe(true);
    expect(isJobOverdue(job, new Date(NOW - 1), NOW, NOW - 100 * HOUR)).toBe(false);
  });

  it.each([
    [HOUR, 3 * HOUR],
    [24 * HOUR, 30 * HOUR],
  ])("gives a never-run job the same grace span for a %i ms window", (windowMs, span) => {
    const job = { windowMs };
    expect(isJobOverdue(job, null, NOW, NOW)).toBe(false);
    expect(isJobOverdue(job, null, NOW, NOW - span)).toBe(false);
    expect(isJobOverdue(job, null, NOW, NOW - span - 1)).toBe(true);
  });

  it("uses a real stale success instead of resetting its age on process restart", () => {
    expect(isJobOverdue({ windowMs: HOUR }, new Date(NOW - 4 * HOUR), NOW, NOW)).toBe(true);
  });
});

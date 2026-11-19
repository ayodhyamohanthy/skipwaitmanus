import { describe, expect, it, vi } from "vitest";
import { REVERIFY_DAYS, REVERIFY_EPOCH_MS, effectiveVerifiedMs, reverifyDaysLeft, reverifyDueCutoff } from "../shared/reverify";
import { createWorkEmailReverifySweep } from "./workEmailReverifySweep";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";

const DAY = 24 * 60 * 60 * 1000;

describe("reverify policy (grandfathered)", () => {
  it("counts from the epoch for anyone verified before it", () => {
    expect(REVERIFY_DAYS).toBe(90);
    expect(effectiveVerifiedMs("2026-01-01T00:00:00Z")).toBe(REVERIFY_EPOCH_MS);
    expect(effectiveVerifiedMs(new Date(REVERIFY_EPOCH_MS + 5 * DAY))).toBe(REVERIFY_EPOCH_MS + 5 * DAY);
    expect(effectiveVerifiedMs(null)).toBeNull();
    expect(effectiveVerifiedMs("not a date")).toBeNull();
  });
  it("nobody has less than 90 days on the day the feature starts", () => {
    expect(reverifyDaysLeft("2025-01-01T00:00:00Z", REVERIFY_EPOCH_MS)).toBe(90);
    expect(reverifyDaysLeft("2026-10-20T00:00:00Z", REVERIFY_EPOCH_MS + 10 * DAY)).toBe(84);
    expect(reverifyDaysLeft("2026-10-16T00:00:00Z", REVERIFY_EPOCH_MS + 85 * DAY)).toBe(5);
    expect(reverifyDaysLeft("2026-10-16T00:00:00Z", REVERIFY_EPOCH_MS + 90 * DAY)).toBe(0);
    expect(reverifyDaysLeft(null, REVERIFY_EPOCH_MS)).toBeNull();
  });
});

describe("work-email-reverify-sweep (dry run)", () => {
  it("is registered and only logs: no rows are listed while the grandfathering window is open", async () => {
    expect(SCHEDULED_JOBS.map(job => job.name)).toContain("work-email-reverify-sweep");
    const listDue = vi.fn(async () => []); const log = vi.fn();
    const out = await createWorkEmailReverifySweep({ listDue, log })({ nowMs: REVERIFY_EPOCH_MS + 30 * DAY, windowKey: "w" });
    expect(out).toEqual({ processed: 0, failed: 0 });
    expect(listDue).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("grandfathering"), { dueCount: 0 });
  });
  it("after the window it counts due referrers but changes nothing", async () => {
    const now = REVERIFY_EPOCH_MS + 91 * DAY;
    const listDue = vi.fn(async () => [{ userId: 1 }, { userId: 2 }]); const log = vi.fn();
    const out = await createWorkEmailReverifySweep({ listDue, log })({ nowMs: now, windowKey: "w" });
    expect(out).toEqual({ processed: 0, failed: 0 });
    expect(listDue).toHaveBeenCalledWith(reverifyDueCutoff(now), 500);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("dry run"), { dueCount: 2, enforced: false });
  });
});

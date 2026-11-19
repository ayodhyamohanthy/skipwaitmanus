import { describe, expect, it } from "vitest";
import { ASK_TTL_MS, COVERAGE_WAIT_DAYS, COVERAGE_WAIT_MS, askDaysLeft, askDaysShown, formatAskExpiry, getAskExpiresAtMs, getAskShelfLifeEndsAtMs, getAskVisibleSinceMs, isAskExpired } from "../shared/referral";

// Contract for the ask shelf life in shared/referral.ts (vitest does not collect
// shared/**, so the contract test lives beside the server that enforces it). D-061:
// the 7-day clock starts when an available verified referrer could first see the
// ask (coverageVisibleAt), a never-covered ask waits 90 days at no cost, and rows
// from before migration 0095 keep their exact old lifecycle — visible since
// creation. The D-050 held-ask shelf life stays creation-based.
const NOW = new Date("2026-10-08T12:00:00.000Z").getTime();

describe("ask shelf life defaults", () => {
  it("expires unclaimed pending asks 7 days after creation, computed in JS", () => {
    expect(ASK_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    const fresh = new Date("2026-10-06T00:00:00.000Z");
    expect(getAskExpiresAtMs(fresh)).toBe(new Date("2026-10-13T00:00:00.000Z").getTime());
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: fresh }, NOW)).toBe(false);
    const stale = new Date("2026-09-30T00:00:00.000Z");
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: stale }, NOW)).toBe(true);
    // Claimed asks and decided asks never auto-expire.
    expect(isAskExpired({ status: "pending", referrerId: 9, createdAt: stale }, NOW)).toBe(false);
    expect(isAskExpired({ status: "approved", referrerId: 9, createdAt: stale }, NOW)).toBe(false);
    // Unknown timestamps fail open: never strand an ask.
    expect(getAskExpiresAtMs(undefined)).toBeNull();
    expect(getAskExpiresAtMs("not-a-date")).toBeNull();
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: undefined }, NOW)).toBe(false);
  });

  it("labels the countdown in the existing bands", () => {
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date("2026-10-03T12:00:00.000Z") }, NOW)).toBe("Expires in 2 days");
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date("2026-10-02T12:00:00.000Z") }, NOW)).toBe("Expires tomorrow");
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date("2026-10-01T13:00:00.000Z") }, NOW)).toBe("Expires today");
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date("2026-09-01T00:00:00.000Z") }, NOW)).toBe("Expired");
    // A fresh ask (just created) shows 7 days, not 6.
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date(NOW - 60_000) }, NOW)).toBe("Expires in 7 days");
    expect(askDaysShown({ createdAt: new Date(NOW - 60_000) }, NOW)).toBe(7);
  });
});

describe("D-061 visibility window", () => {
  it("starts the 7-day clock at first visibility, keeping pre-0095 rows on creation", () => {
    const created = new Date("2026-10-01T00:00:00.000Z");
    const visible = new Date("2026-10-05T00:00:00.000Z");
    // Rows from before migration 0095 have no coverageVisibleAt: visible since creation.
    expect(getAskVisibleSinceMs({ createdAt: created })).toBe(created.getTime());
    expect(getAskVisibleSinceMs({ createdAt: created, coverageVisibleAt: null })).toBe(created.getTime());
    // Delivered asks start their clock when an available referrer could first see them.
    expect(getAskVisibleSinceMs({ createdAt: created, coverageVisibleAt: visible })).toBe(visible.getTime());
    expect(getAskShelfLifeEndsAtMs({ createdAt: created, coverageVisibleAt: visible })).toBe(visible.getTime() + ASK_TTL_MS);
    // A delivered ask eight days after creation is still fresh when visible only two days ago.
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: created, coverageVisibleAt: new Date("2026-10-06T12:00:00.000Z") }, NOW)).toBe(false);
    // Unknown timestamps fail open in both windows.
    expect(getAskVisibleSinceMs({ createdAt: undefined, coverageVisibleAt: null })).toBeNull();
    expect(getAskShelfLifeEndsAtMs({ createdAt: undefined })).toBeNull();
  });

  it("gives waiting asks the 90-day coverage window at no cost, with no countdown", () => {
    const created = new Date("2026-10-01T12:00:00.000Z");
    expect(COVERAGE_WAIT_DAYS).toBe(90);
    expect(COVERAGE_WAIT_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(getAskShelfLifeEndsAtMs({ createdAt: created, waitingForCoverage: true })).toBe(created.getTime() + COVERAGE_WAIT_MS);
    // Waiting seven days after creation is not expired; 91 days is.
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: created, waitingForCoverage: true }, NOW)).toBe(false);
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: new Date("2026-06-01T00:00:00.000Z"), waitingForCoverage: true }, NOW)).toBe(true);
    // No countdown is shown while waiting.
    expect(askDaysLeft({ createdAt: created, waitingForCoverage: true }, NOW)).toBeNull();
    expect(askDaysShown({ createdAt: created, waitingForCoverage: true }, NOW)).toBeNull();
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: created, waitingForCoverage: true }, NOW)).toBeNull();
  });

  it("counts a delivered ask down from first visibility, not creation", () => {
    const created = new Date("2026-09-01T00:00:00.000Z");
    const delivered = { createdAt: created, coverageVisibleAt: new Date(NOW), waitingForCoverage: false as const };
    expect(formatAskExpiry({ status: "pending", referrerId: null, ...delivered }, NOW)).toBe("Expires in 7 days");
    expect(isAskExpired({ status: "pending", referrerId: null, ...delivered }, NOW)).toBe(false);
    expect(isAskExpired({ status: "pending", referrerId: null, ...delivered }, NOW + ASK_TTL_MS)).toBe(true);
  });
});

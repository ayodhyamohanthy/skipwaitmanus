import { describe, expect, it } from "vitest";
import { ASK_TTL_DAYS } from "./referral";
import { referredOutcomeLabel, summariseReferredOutcome, summariseReferredOutcomeFromEvents, type ReferralTransitionEvent, type ReferredAskInput } from "./referralOutcome";

const DAY = 24 * 60 * 60 * 1000;

function ask(over: Partial<ReferredAskInput> = {}): ReferredAskInput {
  return { status: "approved", acceptedAt: new Date("2026-01-01T00:00:00Z"), referredAt: null, ...over };
}

describe("summariseReferredOutcome", () => {
  it("returns null, not 0%, when nothing has been accepted", () => {
    // The honesty rule. `0%` and "nothing has happened yet" are the same pixels and completely
    // different facts; a rate that silently reads 0% would fake a failure that hasn't occurred.
    const summary = summariseReferredOutcome([]);
    expect(summary.rate).toBeNull();
    expect(summary.accepted).toBe(0);
    expect(summary.medianDays).toBeNull();
    expect(referredOutcomeLabel(summary)).toBeNull();
  });

  it("counts only accepted asks as the denominator", () => {
    const summary = summariseReferredOutcome([
      ask(),
      ask({ status: "declined" }),
      ask({ status: "withdrawn" }),
      ask({ status: "pending" }),
    ]);
    // A declined ask was never going to produce a 7-day referral. Counting it would bake the
    // decline rate into the referral rate -- two different numbers, and both become unreadable.
    expect(summary.accepted).toBe(1);
  });

  it("reports a real 0% when asks are accepted but none referred yet", () => {
    // Distinct from the case above: here there IS a denominator, and the answer really is zero.
    const summary = summariseReferredOutcome([ask(), ask(), ask()]);
    expect(summary.accepted).toBe(3);
    expect(summary.referredWithin).toBe(0);
    expect(summary.rate).toBe(0);
    expect(referredOutcomeLabel(summary)).toBe(`0% referred within ${ASK_TTL_DAYS} days`);
  });

  it("counts a referral made inside the window", () => {
    const summary = summariseReferredOutcome([
      ask({ status: "intro_made", referredAt: new Date("2026-01-03T00:00:00Z") }),   // +2d
      ask({ status: "interview", referredAt: new Date("2026-01-06T00:00:00Z") }),     // +5d
    ]);
    expect(summary.accepted).toBe(2);
    expect(summary.referredWithin).toBe(2);
    expect(summary.rate).toBe(1);
  });

  it("does not count a referral made outside the window", () => {
    const summary = summariseReferredOutcome([
      ask({ status: "intro_made", referredAt: new Date("2026-01-10T00:00:00Z") }),   // +9d, past 7
      ask({ status: "intro_made", referredAt: new Date("2026-01-03T00:00:00Z") }),    // +2d, inside
    ]);
    expect(summary.referredWithin).toBe(1);
    expect(summary.rate).toBe(0.5);
  });

  it("treats interview, offer and closed as referred too", () => {
    // They are later stages of the same event, so the referral happened -- just ask where the
    // row is read, and interview already implies intro_made.
    for (const status of ["interview", "offer", "closed"] as const) {
      const summary = summariseReferredOutcome([
        ask({ status, referredAt: new Date("2026-01-02T00:00:00Z") }),
      ]);
      expect(summary.referredWithin, `${status} should count`).toBe(1);
    }
  });

  it("ignores an accepted ask that never got a timestamp", () => {
    // A status without a clock cannot be timed; treating it as fast would invent precision.
    const summary = summariseReferredOutcome([ask({ status: "intro_made" })]);
    expect(summary.accepted).toBe(1);
    expect(summary.referredWithin).toBe(0);
  });

  it("ignores a negative gap rather than calling it a fast referral", () => {
    // Clock skew or a bad write. Not fast, and not slow either.
    const summary = summariseReferredOutcome([
      ask({ status: "intro_made", referredAt: new Date("2025-12-30T00:00:00Z") }),
    ]);
    expect(summary.referredWithin).toBe(0);
    expect(summary.medianDays).toBeNull();
  });

  it("reports the median gap so a few fast ones cannot hide a slow tail", () => {
    const summary = summariseReferredOutcome([
      ask({ status: "intro_made", referredAt: new Date("2026-01-01T00:00:00Z") }),  // 0d
      ask({ status: "intro_made", referredAt: new Date("2026-01-03T00:00:00Z") }),  // 2d
      ask({ status: "intro_made", referredAt: new Date("2026-01-08T00:00:00Z") }),  // 7d
    ]);
    expect(summary.medianDays).toBe(2);
  });

  it("honours a custom window without mislabelling it", () => {
    const summary = summariseReferredOutcome(
      [ask({ status: "intro_made", referredAt: new Date("2026-01-06T00:00:00Z") })],  // +5d
      3,
    );
    expect(summary.referredWithin).toBe(0);
    expect(summary.windowDays).toBe(3);
    expect(referredOutcomeLabel(summary)).toBe("0% referred within 3 days");
  });

  it("measures from ACCEPTANCE, not from ask creation", () => {
    // The clock the seeker feels starts when they get an answer. An ask that sat four days
    // before being accepted and was referred the next day is a 1-day referral, not a 5-day one.
    const summary = summariseReferredOutcome([
      ask({ status: "intro_made", acceptedAt: new Date("2026-01-04T00:00:00Z"), referredAt: new Date("2026-01-05T00:00:00Z") }),
    ]);
    expect(summary.referredWithin).toBe(1);
    expect(summary.medianDays).toBe(1);
  });

  it("keeps DAY arithmetic consistent", () => {
    expect(DAY).toBe(86_400_000);
    expect(ASK_TTL_DAYS).toBe(7);
  });
});

describe("summariseReferredOutcomeFromEvents", () => {
  const ev = (requestId: number, resultingStatus: string, at: string): ReferralTransitionEvent => ({ requestId, resultingStatus, at });

  it("returns null, not 0%, on an empty log", () => {
    expect(summariseReferredOutcomeFromEvents([]).rate).toBeNull();
  });

  it("excludes asks that were never accepted", () => {
    // pending -> declined is a complete history, and neither state belongs in a referral rate.
    const summary = summariseReferredOutcomeFromEvents([
      ev(1, "pending", "2026-01-01T00:00:00Z"),
      ev(1, "declined", "2026-01-02T00:00:00Z"),
    ]);
    expect(summary.accepted).toBe(0);
    expect(summary.rate).toBeNull();
  });

  it("counts an accepted ask that has not been referred as a real 0", () => {
    const summary = summariseReferredOutcomeFromEvents([
      ev(1, "pending", "2026-01-01T00:00:00Z"),
      ev(1, "approved", "2026-01-02T00:00:00Z"),
    ]);
    expect(summary.accepted).toBe(1);
    expect(summary.rate).toBe(0);
  });

  it("measures acceptance-to-referral, not creation-to-referral", () => {
    // An ask created Monday, accepted Friday, referred Saturday is a 1-day referral.
    const summary = summariseReferredOutcomeFromEvents([
      ev(1, "pending", "2026-01-05T00:00:00Z"),
      ev(1, "approved", "2026-01-09T00:00:00Z"),
      ev(1, "intro_made", "2026-01-10T00:00:00Z"),
    ]);
    expect(summary.referredWithin).toBe(1);
    expect(summary.medianDays).toBe(1);
  });

  it("counts a stage that skipped intro_made", () => {
    // interview implies the referral already happened, so the ask is referred even though no
    // intro_made row exists.
    const summary = summariseReferredOutcomeFromEvents([
      ev(1, "approved", "2026-01-01T00:00:00Z"),
      ev(1, "interview", "2026-01-02T00:00:00Z"),
    ]);
    expect(summary.referredWithin).toBe(1);
  });

  it("takes the EARLIEST transition when an ask moved more than once", () => {
    // A revision or a re-acceptance writes another row. The first referral is the one that counts.
    const summary = summariseReferredOutcomeFromEvents([
      ev(1, "approved", "2026-01-01T00:00:00Z"),
      ev(1, "intro_made", "2026-01-02T00:00:00Z"),
      ev(1, "approved", "2026-01-05T00:00:00Z"),
    ]);
    expect(summary.accepted).toBe(1);
    expect(summary.medianDays).toBe(1);
    expect(summary.referredWithin).toBe(1);
  });

  it("accepts string timestamps, because a driver may hand them back as strings", () => {
    const summary = summariseReferredOutcomeFromEvents([
      { requestId: 1, resultingStatus: "approved", at: "2026-01-01T00:00:00.000Z" },
      { requestId: 1, resultingStatus: "intro_made", at: "2026-01-03T00:00:00.000Z" },
    ]);
    expect(summary.referredWithin).toBe(1);
  });

  it("ignores a row with an unparseable timestamp", () => {
    const summary = summariseReferredOutcomeFromEvents([
      ev(1, "approved", "not-a-date"),
      ev(1, "intro_made", "2026-01-02T00:00:00Z"),
    ]);
    // No usable acceptance moment, so the ask cannot be timed at all.
    expect(summary.accepted).toBe(0);
    expect(summary.rate).toBeNull();
  });

  it("keeps the window visible so a 14-day rate cannot be labelled a 7-day one", () => {
    const summary = summariseReferredOutcomeFromEvents(
      [ev(1, "approved", "2026-01-01T00:00:00Z"), ev(1, "intro_made", "2026-01-10T00:00:00Z")],
      14,
    );
    expect(summary.windowDays).toBe(14);
    expect(summary.referredWithin).toBe(1);
    expect(referredOutcomeLabel(summary)).toBe("100% referred within 14 days");
  });

  it("gives a mixed log the rate the two platforms would each report", () => {
    const summary = summariseReferredOutcomeFromEvents([
      ev(1, "approved", "2026-01-01T00:00:00Z"), ev(1, "intro_made", "2026-01-02T00:00:00Z"), // fast
      ev(2, "approved", "2026-01-01T00:00:00Z"), ev(2, "intro_made", "2026-01-12T00:00:00Z"), // slow
      ev(3, "approved", "2026-01-01T00:00:00Z"),                                              // never
      ev(4, "pending", "2026-01-01T00:00:00Z"),  ev(4, "declined", "2026-01-03T00:00:00Z"),    // declined
    ]);
    expect(summary.accepted).toBe(3);
    expect(summary.referredWithin).toBe(1);
    expect(summary.rate).toBeCloseTo(1 / 3, 5);
    // The two referred asks took 1 and 11 days, so the median gap is 6 -- which is the point of
    // reporting a median alongside the rate: a single 1-day referral next to an 11-day one reads
    // as "mixed", not as "fast". My first draft asserted 2 here, which was just wrong.
    expect(summary.medianDays).toBe(6);
  });
});

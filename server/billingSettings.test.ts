import { describe, expect, it } from "vitest";
import { employerSponsorshipEnabled, freeCreditsRequireCardValidation, humanReviewersStaffed, indiaGstRegistered, usdRecurringConfirmed } from "./billingSettings";

describe("billing switches", () => {
  it("is off by default and on only for a literal \"true\"", () => {
    for (const read of [indiaGstRegistered, usdRecurringConfirmed, humanReviewersStaffed]) {
      expect(read({})).toBe(false);
      expect(read({ INDIA_GST_REGISTERED: "1", USD_RECURRING_CONFIRMED: "yes", HUMAN_REVIEWERS_STAFFED: "" })).toBe(false);
    }
    expect(indiaGstRegistered({ INDIA_GST_REGISTERED: "true" })).toBe(true);
    expect(indiaGstRegistered({ INDIA_GST_REGISTERED: "TRUE" })).toBe(true);
    expect(indiaGstRegistered({ INDIA_GST_REGISTERED: " true " })).toBe(true);
    expect(usdRecurringConfirmed({ USD_RECURRING_CONFIRMED: "true" })).toBe(true);
    expect(humanReviewersStaffed({ HUMAN_REVIEWERS_STAFFED: "true" })).toBe(true);
  });

  it("keeps paid placement on unless the owner pauses it", () => {
    // Deliberately the opposite default of the switches above: the sponsor route
    // already delivers a labeled featured listing, so it ships on.
    expect(employerSponsorshipEnabled({})).toBe(true);
    expect(employerSponsorshipEnabled({ EMPLOYER_SPONSORSHIP_ENABLED: "true" })).toBe(true);
    expect(employerSponsorshipEnabled({ EMPLOYER_SPONSORSHIP_ENABLED: "TRUE" })).toBe(true);
    expect(employerSponsorshipEnabled({ EMPLOYER_SPONSORSHIP_ENABLED: "yes" })).toBe(true);
    expect(employerSponsorshipEnabled({ EMPLOYER_SPONSORSHIP_ENABLED: "false" })).toBe(false);
    expect(employerSponsorshipEnabled({ EMPLOYER_SPONSORSHIP_ENABLED: " false " })).toBe(false);
  });
  it("gates free credits on card validation only for a literal \"true\" (D-079)", () => {
    // Default off: unset, empty or any other string keeps today's grants.
    expect(freeCreditsRequireCardValidation({})).toBe(false);
    expect(freeCreditsRequireCardValidation({ FREE_CREDITS_REQUIRE_CARD_VALIDATION: "" })).toBe(false);
    expect(freeCreditsRequireCardValidation({ FREE_CREDITS_REQUIRE_CARD_VALIDATION: "1" })).toBe(false);
    expect(freeCreditsRequireCardValidation({ FREE_CREDITS_REQUIRE_CARD_VALIDATION: "yes" })).toBe(false);
    expect(freeCreditsRequireCardValidation({ FREE_CREDITS_REQUIRE_CARD_VALIDATION: "true" })).toBe(true);
    expect(freeCreditsRequireCardValidation({ FREE_CREDITS_REQUIRE_CARD_VALIDATION: " TRUE " })).toBe(true);
  });
});


import { describe, expect, it } from "vitest";
import { personalReferralInviteEligibility } from "./db";

describe("personal referral invite eligibility", () => {
  const invitedAt = new Date("2026-08-19T00:00:00.000Z");
  const joinedAfterInvite = new Date("2026-08-19T00:01:00.000Z");

  it("allows a new, distinct account whose verified email matches the persisted account email", () => {
    expect(personalReferralInviteEligibility({ inviterUserId: 1, joinerUserId: 2, invitationCreatedAt: invitedAt, joinerCreatedAt: joinedAfterInvite, storedEmail: "friend@example.com", verifiedEmail: "friend@example.com" })).toBe("eligible");
  });

  it("rejects self-invites, pre-existing accounts, and verified-email mismatches before a reward can be granted", () => {
    expect(personalReferralInviteEligibility({ inviterUserId: 1, joinerUserId: 1, invitationCreatedAt: invitedAt, joinerCreatedAt: joinedAfterInvite, storedEmail: "owner@example.com", verifiedEmail: "owner@example.com" })).toBe("self_invite");
    expect(personalReferralInviteEligibility({ inviterUserId: 1, joinerUserId: 2, invitationCreatedAt: invitedAt, joinerCreatedAt: invitedAt, storedEmail: "friend@example.com", verifiedEmail: "friend@example.com" })).toBe("ineligible");
    expect(personalReferralInviteEligibility({ inviterUserId: 1, joinerUserId: 2, invitationCreatedAt: invitedAt, joinerCreatedAt: joinedAfterInvite, storedEmail: "friend@example.com", verifiedEmail: "other@example.com" })).toBe("ineligible");
  });
});

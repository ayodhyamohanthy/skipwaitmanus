import { describe, expect, it } from "vitest";
import { personalReferralInviteEligibility, personalInviteUnlockedFromEvidence } from "./db";

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

describe("personal referral link unlock evidence (D-155)", () => {
  it("unlocks only on provider-verified payment evidence", () => {
    expect(personalInviteUnlockedFromEvidence({ paidPayments: 0, subscriptionPayments: 0 })).toBe(false);
    expect(personalInviteUnlockedFromEvidence({ paidPayments: 1, subscriptionPayments: 0 })).toBe(true);
    expect(personalInviteUnlockedFromEvidence({ paidPayments: 0, subscriptionPayments: 1 })).toBe(true);
    expect(personalInviteUnlockedFromEvidence({ paidPayments: 2, subscriptionPayments: 1 })).toBe(true);
    // Subscription evidence is the payment_succeeded wallet stamp, never
    // activation alone. Refunded-first-payment stays an OPEN policy question
    // (D-155): a refunded-only fulfillment does not unlock until the owner
    // rules - production has no gate today, so nothing existing is revoked
    // by the gate itself.
  });
});

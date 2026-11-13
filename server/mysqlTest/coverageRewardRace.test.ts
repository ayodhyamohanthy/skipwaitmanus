import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fulfillCompanyCoverageInvitation } from "../db";
import { openConcurrencyHarness, raceProbeEnabled, raceOnStartLine, SKIP_NOTICE, type ConcurrencyHarness } from "./harness";
import { countCompletedInvitations, countPendingInviteRewards, countRewardsForInviter, seedCoverageInvitations, seedUser } from "./fixtures";

/**
 * Characterisation probe for audit items B1/B2: `companyCoverageRewards` has no
 * UNIQUE on `inviterUserId`, and `fulfillCompanyCoverageInvitation` checks the
 * one-reward-per-inviter limit with an unlocked read, so two employees of the
 * same company accepting two different invitations from the same inviter at the
 * same time both pass the check.
 *
 * This spec asserts the behaviour production is *supposed* to have, so it is red
 * until the fix lands. That is the point: the CI step that runs it is
 * `continue-on-error`, and it turning green is the proof the race is closed. It
 * stays behind MYSQL_RACE_PROBE so an ordinary harness run is not red.
 */
const suite = raceProbeEnabled() ? describe : describe.skip;

if (!raceProbeEnabled()) console.log(`[mysqlTest] coverage reward race probe skipped: ${SKIP_NOTICE} and MYSQL_RACE_PROBE=1`);

suite("coverage reward double-grant race probe", () => {
  let harness: ConcurrencyHarness;

  beforeAll(async () => {
    harness = await openConcurrencyHarness();
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  }, 30_000);

  it("grants the inviter one coverage reward when two employees accept at once", async () => {
    await harness.reset();
    await seedCoverageInvitations(harness.pool, {
      inviterUserId: 7401,
      companyDomain: "acme.test",
      invitations: [
        { inviteCode: "cov-race-a", requestId: 8401, seekerUserId: 7410 },
        { inviteCode: "cov-race-b", requestId: 8402, seekerUserId: 7411 },
      ],
    });
    await seedUser(harness.pool, 7501, "joiner");
    await seedUser(harness.pool, 7502, "joiner");

    await raceOnStartLine(2, index =>
      fulfillCompanyCoverageInvitation(index === 0 ? 7501 : 7502, {
        inviteCode: index === 0 ? "cov-race-a" : "cov-race-b",
        workEmailDomain: "acme.test",
      }),
    );

    expect(await countRewardsForInviter(harness.pool, 7401)).toBe(1);
    expect(await countCompletedInvitations(harness.pool, 7401)).toBeLessThanOrEqual(1);
    expect(await countPendingInviteRewards(harness.pool, 7401)).toBe(1);
  }, 60_000);
});

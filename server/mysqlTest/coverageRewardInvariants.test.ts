import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fulfillCompanyCoverageInvitation } from "../db";
import { concurrencyTestsEnabled, fulfilledValues, openConcurrencyHarness, raceOnStartLine, SKIP_NOTICE, type ConcurrencyHarness } from "./harness";
import { countCompletedInvitations, countRewardsForInviter, seedCoverageInvitations, seedUser } from "./fixtures";

/**
 * The coverage-reward invariant InnoDB can already guarantee: one reward per
 * invitation, because `coverage_reward_invitation_unique` exists. Paired with
 * coverageRewardRace.test.ts, which shows what happens where no such index
 * backs the rule.
 */
const suite = concurrencyTestsEnabled() ? describe : describe.skip;

if (!concurrencyTestsEnabled()) console.log(`[mysqlTest] coverage reward invariants skipped: ${SKIP_NOTICE}`);

suite("coverage reward invariants on real InnoDB", () => {
  let harness: ConcurrencyHarness;

  beforeAll(async () => {
    harness = await openConcurrencyHarness();
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  }, 30_000);

  it("rewards one invitation once when two joiners accept it together", async () => {
    await harness.reset();
    await seedCoverageInvitations(harness.pool, {
      inviterUserId: 7201,
      companyDomain: "acme.test",
      invitations: [{ inviteCode: "cov-same-invitation", requestId: 8201, seekerUserId: 7210 }],
    });
    await seedUser(harness.pool, 7301, "joiner");
    await seedUser(harness.pool, 7302, "joiner");

    const outcomes = await raceOnStartLine(2, index =>
      fulfillCompanyCoverageInvitation(index === 0 ? 7301 : 7302, { inviteCode: "cov-same-invitation", workEmailDomain: "acme.test" }),
    );

    const rewarded = fulfilledValues(outcomes).filter(outcome => outcome.rewarded).length;

    expect(rewarded).toBeLessThanOrEqual(1);
    expect(await countRewardsForInviter(harness.pool, 7201)).toBe(1);
    expect(await countCompletedInvitations(harness.pool, 7201)).toBe(1);
  }, 60_000);
});

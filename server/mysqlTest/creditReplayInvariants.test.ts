import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withdrawCompanyReferralRequest } from "../db";
import { concurrencyTestsEnabled, fulfilledValues, openConcurrencyHarness, raceOnStartLine, rejectionReasons, SKIP_NOTICE, type ConcurrencyHarness } from "./harness";
import { countRefunds, countTransitionEvents, readRequestState, readWallet, seedRequestWithDebit, seedSeeker } from "./fixtures";

/**
 * Credit-restoration invariants that production is supposed to already hold,
 * measured on real InnoDB. These specs are the harness's own proof: if locking
 * is not observable here, no race spec in this directory can be trusted.
 */
const suite = concurrencyTestsEnabled() ? describe : describe.skip;
const CYCLE_KEY = "2026-09";

if (!concurrencyTestsEnabled()) console.log(`[mysqlTest] credit replay invariants skipped: ${SKIP_NOTICE}`);

async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

suite("credit replay invariants on real InnoDB", () => {
  let harness: ConcurrencyHarness;

  beforeAll(async () => {
    harness = await openConcurrencyHarness();
    expect(["REPEATABLE READ", "READ COMMITTED"]).toContain(harness.isolationLevel);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  }, 30_000);

  it("serialises a second FOR UPDATE reader until the first commits", async () => {
    await harness.reset();
    await seedSeeker(harness.pool, { userId: 7101, monthlyCreditsRemaining: 2, monthlyCycleKey: CYCLE_KEY });
    const holder = await harness.pool.getConnection();
    const waiter = await harness.pool.getConnection();
    const lockedSelect = "SELECT id FROM tokenBalances WHERE userId = 7101 AND role = 'job_seeker' FOR UPDATE";
    try {
      await holder.beginTransaction();
      await holder.query(lockedSelect);
      let waiterReturned = false;
      const pending = waiter.query(lockedSelect).then(() => { waiterReturned = true; });
      await delay(500);
      expect(waiterReturned).toBe(false);
      await holder.commit();
      await pending;
      expect(waiterReturned).toBe(true);
    } finally {
      await holder.release();
      await waiter.release();
    }
  }, 30_000);

  it("restores exactly one credit when eight withdrawals of one request race", async () => {
    await harness.reset();
    await seedSeeker(harness.pool, { userId: 7111, monthlyCreditsRemaining: 0, monthlyAllowance: 3, monthlyCycleKey: CYCLE_KEY });
    await seedRequestWithDebit(harness.pool, { userId: 7111, requestId: 8111, source: "monthly_allowance", sourceCycleKey: CYCLE_KEY });

    const outcomes = await raceOnStartLine(8, () => withdrawCompanyReferralRequest(7111, 8111));

    expect(rejectionReasons(outcomes)).toEqual([]);
    expect(fulfilledValues(outcomes)).toHaveLength(8);
    expect(await countRefunds(harness.pool, 8111)).toBe(1);
    expect(await countTransitionEvents(harness.pool, 8111, "withdraw")).toBe(1);
    expect(await readWallet(harness.pool, 7111)).toMatchObject({ monthlyCreditsRemaining: 1, balance: 0 });
    expect(await readRequestState(harness.pool, 8111)).toMatchObject({ status: "withdrawn", revision: 1 });
  }, 60_000);

  it("credits both refunds without losing an update when two requests race", async () => {
    await harness.reset();
    await seedSeeker(harness.pool, { userId: 7121, monthlyCreditsRemaining: 0, monthlyAllowance: 3, monthlyCycleKey: CYCLE_KEY });
    await seedRequestWithDebit(harness.pool, { userId: 7121, requestId: 8121, source: "monthly_allowance", sourceCycleKey: CYCLE_KEY });
    await seedRequestWithDebit(harness.pool, { userId: 7121, requestId: 8122, source: "monthly_allowance", sourceCycleKey: CYCLE_KEY });

    const outcomes = await raceOnStartLine(6, index => withdrawCompanyReferralRequest(7121, index % 2 === 0 ? 8121 : 8122));

    expect(rejectionReasons(outcomes)).toEqual([]);
    expect(await countRefunds(harness.pool, 8121)).toBe(1);
    expect(await countRefunds(harness.pool, 8122)).toBe(1);
    expect(await readWallet(harness.pool, 7121)).toMatchObject({ monthlyCreditsRemaining: 2 });
  }, 60_000);

  it("replays a withdrawn request without restoring a second credit", async () => {
    await harness.reset();
    await seedSeeker(harness.pool, { userId: 7131, monthlyCreditsRemaining: 0, monthlyAllowance: 3, monthlyCycleKey: CYCLE_KEY });
    await seedRequestWithDebit(harness.pool, { userId: 7131, requestId: 8131, source: "monthly_allowance", sourceCycleKey: CYCLE_KEY });

    const first = await withdrawCompanyReferralRequest(7131, 8131);
    const second = await withdrawCompanyReferralRequest(7131, 8131);

    expect(first).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect(second).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect(await countRefunds(harness.pool, 8131)).toBe(1);
    expect(await readWallet(harness.pool, 7131)).toMatchObject({ monthlyCreditsRemaining: 1 });
  }, 30_000);

  it("returns a purchased credit to the purchased balance, not the monthly allowance", async () => {
    await harness.reset();
    await seedSeeker(harness.pool, { userId: 7141, balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: CYCLE_KEY });
    await seedRequestWithDebit(harness.pool, { userId: 7141, requestId: 8141, source: "purchased_balance", sourceCycleKey: CYCLE_KEY });

    const outcomes = await raceOnStartLine(4, () => withdrawCompanyReferralRequest(7141, 8141));

    expect(rejectionReasons(outcomes)).toEqual([]);
    expect(await countRefunds(harness.pool, 8141)).toBe(1);
    expect(await readWallet(harness.pool, 7141)).toMatchObject({ balance: 1, monthlyCreditsRemaining: 3 });
  }, 60_000);
});

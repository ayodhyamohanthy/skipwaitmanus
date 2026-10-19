// D-065 daily money check: the job reconciles, reports, and never writes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralAvailabilitySlots, referralRequests, tokenTransactions } from "../drizzle/schema";
import { ASK_TTL_MS, COVERAGE_WAIT_MS } from "../shared/referral";
import { createDailyMoneyCheck, FINDINGS_EMAIL_LINE_LIMIT, MONEY_CHECK_BATCH, listAllocatedPendingAsks, type AllocatedAskRow, type DailyMoneyCheckDeps } from "./dailyMoneyCheck";
import { DAY_MS, NOW as KIT_NOW, allocatedSlot, askRow, claimEvent, daysAgo, seedHeldAsks, store } from "./heldAsk.testkit";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const NOW = new Date("2026-10-19T02:00:00Z");
const DAY = 24 * 60 * 60_000;

type Sent = { subject: string; text: string };

function makeDeps(overrides: Partial<DailyMoneyCheckDeps> = {}) {
  const sent: Sent[] = [];
  const activity: Array<{ action: string; outcome: string }> = [];
  const deps: DailyMoneyCheckDeps = {
    auditWallets: vi.fn(async () => ({ checkedWallets: 3, mismatches: [], integrity: [] })),
    listCreditedPayments: vi.fn(async () => []),
    countPaymentCreditRows: vi.fn(async () => []),
    listParkedPayments: vi.fn(async () => []),
    listUnmatchedRefunds: vi.fn(async () => []),
    listStaleCheckouts: vi.fn(async () => []),
    listAllocatedAsks: vi.fn(async () => []),
    listLegacyPlanWallets: vi.fn(async () => []),
    sendEmail: vi.fn(async (input: Sent) => { sent.push(input); return true; }),
    recordActivity: vi.fn(async (row: { action: string }) => { activity.push(row as { action: string; outcome: string }); }),
    ...overrides,
  };
  return { deps, sent, activity };
}

const runJob = (deps: DailyMoneyCheckDeps) => createDailyMoneyCheck(deps)({ nowMs: NOW.getTime(), windowKey: "2026-10-19T02:00Z" });

describe("daily-money-check (D-065)", () => {
  it("a clean ledger sends no email and writes no activity row", async () => {
    const { deps, sent, activity } = makeDeps();
    const output = await runJob(deps);
    expect(output).toEqual({ processed: 3, failed: 0 });
    expect(sent).toEqual([]);
    expect(activity).toEqual([]);
  });

  it("wallet mismatches and integrity faults reach the owner email with their detail", async () => {
    const { deps, sent } = makeDeps({
      auditWallets: vi.fn(async () => ({
        checkedWallets: 2,
        mismatches: [{ userId: 7, role: "job_seeker", bucket: "purchased_balance", expected: 3, actual: 2, delta: -1 }],
        integrity: [{ type: "negative_bucket", userId: 9, role: "job_seeker" }],
      })),
    });
    const output = await runJob(deps);
    expect(output.failed).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 2 findings");
    expect(sent[0]!.text).toContain('"bucket":"purchased_balance"');
    expect(sent[0]!.text).toContain('"type":"negative_bucket"');
    expect(sent[0]!.text).toContain("Wallets checked: 2.");
    expect(sent[0]!.text).not.toContain("@"); // no personal data, ids and amounts only
  });

  it("flags a credited payment with no purchase row, a duplicate row, and a short credit", async () => {
    const { deps, sent } = makeDeps({
      listCreditedPayments: vi.fn(async (afterId: number) =>
        afterId === 0 ? [
          { id: 11, userId: 1, role: "job_seeker", tokenCount: 4 },
          { id: 12, userId: 2, role: "job_seeker", tokenCount: 4 },
          { id: 13, userId: 3, role: "job_seeker", tokenCount: 4 },
          { id: 14, userId: 4, role: "job_seeker", tokenCount: 4 },
        ] : []),
      countPaymentCreditRows: vi.fn(async () => [
        { paymentId: 12, creditRows: 2, creditedTokens: 8 },
        { paymentId: 13, creditRows: 1, creditedTokens: 2 },
        { paymentId: 14, creditRows: 1, creditedTokens: 4 },
      ]),
    });
    const output = await runJob(deps);
    expect(output.processed).toBe(3 + 4);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 3 findings");
    expect(sent[0]!.text).toContain("payment #11 expects one purchase row for 4 credits, found 0 row(s)");
    expect(sent[0]!.text).toContain("payment #12 expects one purchase row for 4 credits, found 2 row(s)");
    expect(sent[0]!.text).toContain("payment #13 expects one purchase row for 4 credits, found 1 row(s) totaling 2");
    expect(sent[0]!.text).not.toContain("payment #14");
  });

  it("pages credited payments until a short batch", async () => {
    const first = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, userId: 1, role: "job_seeker", tokenCount: 1 }));
    const calls: number[] = [];
    const { deps, sent } = makeDeps({
      listCreditedPayments: vi.fn(async (afterId: number) => { calls.push(afterId); return afterId === 0 ? first : afterId === 200 ? [{ id: 201, userId: 1, role: "job_seeker", tokenCount: 1 }] : []; }),
      countPaymentCreditRows: vi.fn(async (ids: number[]) => ids.map(id => ({ paymentId: id, creditRows: 1, creditedTokens: 1 }))),
    });
    const output = await runJob(deps);
    expect(calls).toEqual([0, 200]); // the short second batch is the last page
    expect(output.processed).toBe(3 + 201);
    expect(sent).toEqual([]);
  });

  it("lists parked payments, unmatched refunds and day-old checkouts, but not fresh pending ones", async () => {
    const staleSeen: Date[] = [];
    const { deps, sent } = makeDeps({
      listParkedPayments: vi.fn(async () => [{ id: 21, amount: 9900, currency: "INR", reconciliationReason: "checkout_amount_mismatch", createdAt: new Date("2026-10-17T10:00:00Z") }]),
      listUnmatchedRefunds: vi.fn(async () => [{ logId: 31, resourceId: "inv_123", createdAt: new Date("2026-10-18T11:00:00Z") }]),
      listStaleCheckouts: vi.fn(async (olderThan: Date) => { staleSeen.push(olderThan); return [{ id: 41, amount: 9900, currency: "INR", createdAt: new Date("2026-10-17T01:00:00Z") }]; }),
    });
    await runJob(deps);
    expect(staleSeen[0]!.getTime()).toBe(NOW.getTime() - DAY);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("parked payment: #21 9900 INR (checkout_amount_mismatch");
    expect(sent[0]!.text).toContain("unmatched refund: log #31 (inv_123");
    expect(sent[0]!.text).toContain("stale checkout: payment #41 9900 INR pending since 2026-10-17T01:00:00.000Z");
  });

  it("caps the email lines while the subject keeps the full count", async () => {
    const many = Array.from({ length: FINDINGS_EMAIL_LINE_LIMIT + 5 }, (_, i) => ({ userId: i + 1, role: "job_seeker", bucket: "purchased_balance", expected: 1, actual: 0, delta: -1 }));
    const { deps, sent } = makeDeps({
      auditWallets: vi.fn(async () => ({ checkedWallets: many.length, mismatches: many, integrity: [] })),
    });
    await runJob(deps);
    expect(sent[0]!.subject).toBe(`skipwait.me daily money check · ${FINDINGS_EMAIL_LINE_LIMIT + 5} findings`);
    expect(sent[0]!.text).toContain("...and 5 more finding(s) not shown here.");
  });

  it("flags a wallet still marked pro or max with an active term: a missed D-067 normalization", async () => {
    const listLegacyPlanWallets = vi.fn(async () => [{ id: 5, role: "job_seeker", plan: "max", termEnd: new Date(NOW.getTime() + 10 * DAY) }]);
    const { deps, sent } = makeDeps({ listLegacyPlanWallets });
    const output = await runJob(deps);
    expect(listLegacyPlanWallets).toHaveBeenCalledWith(NOW, expect.any(Number));
    expect(output.failed).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("legacy plan wallet: wallet #5 (job_seeker, max) still holds an active term until 2026-10-29T02:00:00.000Z");
  });

  it("fails the window when findings exist but the owner email cannot be sent", async () => {
    const { deps, sent, activity } = makeDeps({
      auditWallets: vi.fn(async () => ({ checkedWallets: 1, mismatches: [{ userId: 7, bucket: "purchased_balance" }], integrity: [] })),
      sendEmail: vi.fn(async (input: Sent) => { sent.push(input); return false; }),
    });
    const output = await runJob(deps);
    expect(output.failed).toBe(1);
    expect(String(output.firstError)).toContain("1 finding(s)");
    expect(activity).toEqual([expect.objectContaining({ action: "billing.daily_money_check_alert", outcome: "failure" })]);
  });
});

/*
 * P0-allocated-ask-stuck (D-065: one check per money-rule slice): a pending ask that still holds an allocated
 * availability slot, with no claim since its latest release, more than 24 hours past its shelf life
 * (getAskShelfLifeEndsAtMs, on the app clock) is one the hourly ask-expiry sweep should have closed with its
 * credit back. The email names the ask id only.
 */
describe("allocated_ask_past_window", () => {
  const unclaimed = (id: number, over: Partial<AllocatedAskRow> = {}): AllocatedAskRow => ({ id, createdAt: new Date(NOW.getTime() - 20 * DAY), coverageVisibleAt: new Date(NOW.getTime() - 9 * DAY), waitingForCoverage: false, latestClaimAt: null, latestReleaseAt: null, ...over });

  it("pages allocated asks until a short batch, so claimed asks never hide a stuck one, with cutoffs a day past each window", async () => {
    const calls: Array<{ afterId: number; visibleBefore: number; waitingBefore: number }> = [];
    const claimed = Array.from({ length: MONEY_CHECK_BATCH }, (_, i) => unclaimed(i + 1, { latestClaimAt: new Date(NOW.getTime() - 8 * DAY) }));
    const { deps, sent } = makeDeps({
      listAllocatedAsks: vi.fn(async (windows: { visibleBefore: Date; waitingBefore: Date }, afterId: number) => {
        calls.push({ afterId, visibleBefore: windows.visibleBefore.getTime(), waitingBefore: windows.waitingBefore.getTime() });
        return afterId === 0 ? claimed : afterId === MONEY_CHECK_BATCH ? [unclaimed(MONEY_CHECK_BATCH + 7)] : [];
      }),
    });
    await runJob(deps);
    expect(calls.map(call => call.afterId)).toEqual([0, MONEY_CHECK_BATCH]);
    expect(calls[0]).toMatchObject({ visibleBefore: NOW.getTime() - ASK_TTL_MS - DAY, waitingBefore: NOW.getTime() - COVERAGE_WAIT_MS - DAY });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 1 finding");
    expect(sent[0]!.text).toContain(`allocated_ask_past_window: ask #${MONEY_CHECK_BATCH + 7}`);
    expect(sent[0]!.text).not.toContain("ask #1 ");
  });

  it("flags only an unclaimed allocation a day past its window; within the grace, claimed, waiting and pre-cut-off asks stay quiet", async () => {
    const { deps, sent } = makeDeps({
      listAllocatedAsks: vi.fn(async (_windows: unknown, afterId: number) => afterId === 0 ? [
        unclaimed(11),
        unclaimed(12, { coverageVisibleAt: new Date(NOW.getTime() - ASK_TTL_MS - 12 * 60 * 60_000) }),
        unclaimed(13, { latestClaimAt: new Date(NOW.getTime() - 8 * DAY) }),
        unclaimed(14, { waitingForCoverage: true, coverageVisibleAt: null, createdAt: new Date(NOW.getTime() - 30 * DAY) }),
        unclaimed(15, { coverageVisibleAt: null, createdAt: new Date(NOW.getTime() - 9 * DAY) }),
        // Created before the 2026-09-21 cut-off: an assigned ask then keeps today's rules (never expires), so
        // the sweep never closes it by design and the daily email must not repeat it forever.
        unclaimed(16, { coverageVisibleAt: null, createdAt: new Date("2026-09-10T00:00:00Z") }),
      ] : []),
    });
    await runJob(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 2 findings");
    expect(sent[0]!.text).toContain("allocated_ask_past_window: ask #11 ");
    expect(sent[0]!.text).toContain("allocated_ask_past_window: ask #15 ");
    for (const id of [12, 13, 14, 16]) expect(sent[0]!.text).not.toContain(`ask #${id} `);
  });
});

describe("allocated_ask_past_window over the in-memory database", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
    mocks.createPool.mockResolvedValue({});
    mocks.drizzle.mockReturnValue(store.db);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("flags a stuck delivered ask and a stuck older allocation, never a claimed, released, waiting, fresh or accepted one, and writes nothing", async () => {
    const released = (requestId: number, id: number, releasedDaysAgo: number) => ({ ...allocatedSlot(requestId, id), status: "released", activeRequestKey: null, releasedAt: daysAgo(releasedDaysAgo) });
    const claimAt = (requestId: number, id: number, atDaysAgo: number) => ({ ...claimEvent(requestId, id), createdAt: daysAgo(atDaysAgo) });
    seedHeldAsks({
      asks: [
        // A D-034 delivery nobody claimed: visible 9 days ago, so its window ended 2 days ago.
        askRow({ id: 601, createdAt: daysAgo(20), coverageVisibleAt: daysAgo(9) }),
        // An older "Open referral capacity" allocation (no coverageVisibleAt): the creation clock.
        askRow({ id: 602, createdAt: daysAgo(9) }),
        // Its window ended 12 hours ago: the sweep still has time.
        askRow({ id: 603, createdAt: daysAgo(20), coverageVisibleAt: new Date(KIT_NOW - ASK_TTL_MS - DAY_MS / 2) }),
        // Claimed after delivery: a pickup keeps the credit spent and the ask never expires (D-021).
        askRow({ id: 604, revision: 1, createdAt: daysAgo(20), coverageVisibleAt: daysAgo(10) }),
        // Its slot was released (a pass reopened it): the sweep's unassigned path owns it.
        askRow({ id: 605, referrerId: null, createdAt: daysAgo(20), coverageVisibleAt: daysAgo(10) }),
        // Waiting for coverage: the 90-day window, even with a stray allocated slot row.
        askRow({ id: 606, referrerId: null, waitingForCoverage: true, createdAt: daysAgo(30) }),
        // Claimed once, released, then allocated again: today's release rule is "no claim ever" (packet 4.1), so the
        // sweep and withdraw never act on it and the check must not flag it daily. D-038 slice A moves both to
        // "no claim since the latest release" together (D-076 (1)).
        askRow({ id: 607, revision: 1, createdAt: daysAgo(20), coverageVisibleAt: daysAgo(12) }),
        // Released, allocated again and claimed after that release.
        askRow({ id: 608, revision: 1, createdAt: daysAgo(20), coverageVisibleAt: daysAgo(12) }),
        // Accepted: no longer pending.
        askRow({ id: 609, status: "approved", createdAt: daysAgo(20), coverageVisibleAt: daysAgo(10) }),
      ],
      events: [claimAt(604, 41, 9), claimAt(607, 42, 11), claimAt(608, 43, 9)],
      slots: [
        allocatedSlot(601, 91), allocatedSlot(602, 92), allocatedSlot(603, 93), allocatedSlot(604, 94),
        released(605, 95, 9), allocatedSlot(606, 96),
        released(607, 97, 10), allocatedSlot(607, 98),
        released(608, 99, 10), allocatedSlot(608, 100),
        allocatedSlot(609, 101),
      ],
    });
    const before = { requests: structuredClone(store.rows(referralRequests)), slots: structuredClone(store.rows(referralAvailabilitySlots)), ledger: structuredClone(store.rows(tokenTransactions)) };
    const { deps, sent } = makeDeps({ listAllocatedAsks: listAllocatedPendingAsks });
    await createDailyMoneyCheck(deps)({ nowMs: KIT_NOW, windowKey: "2026-10-18T12:00Z" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 2 findings");
    for (const id of [601, 602]) expect(sent[0]!.text).toContain(`allocated_ask_past_window: ask #${id} `);
    expect(sent[0]!.text).not.toContain("ask #607 ");
    for (const id of [603, 604, 605, 606, 608, 609]) expect(sent[0]!.text).not.toContain(`#${id} `);
    expect(sent[0]!.text).not.toContain("@");
    // Read-only: no ask, slot or ledger row moved.
    expect(store.rows(referralRequests)).toEqual(before.requests);
    expect(store.rows(referralAvailabilitySlots)).toEqual(before.slots);
    expect(store.rows(tokenTransactions)).toEqual(before.ledger);
  });
});

// D-065 daily money check: the job reconciles, reports, and never writes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paymentFulfillments, referralAvailabilitySlots, referralRequests, tokenTransactions } from "../drizzle/schema";
import { ASK_TTL_MS, COVERAGE_WAIT_MS, REFERRAL_TIMERS_SINCE } from "../shared/referral";
import { runMoneyCheckNow, createDailyMoneyCheck, FINDINGS_EMAIL_LINE_LIMIT, MONEY_CHECK_BATCH, listAllocatedPendingAsks, listAskDeliverySpendsWhileWaiting, listDoublyReversedSpends, listRefundsAfterPickup, listReferredPastDeadline, listStaleCheckouts, type AllocatedAskRow, type DailyMoneyCheckDeps } from "./dailyMoneyCheck";
import { DAY_MS, LINK_OWNER, NOW as KIT_NOW, allocatedSlot, askRow, claimEvent, daysAgo, seedHeldAsks, spendRow, store } from "./heldAsk.testkit";

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
    summarizeStaleCheckouts: vi.fn(async () => ({ total: 0, users: 0, oldest: null, newest: null })),
    listAllocatedAsks: vi.fn(async () => []),
    listLegacyPlanWallets: vi.fn(async () => []),
    listAskDeliverySpendsWhileWaiting: vi.fn(async () => []),
    listDoublyReversedSpends: vi.fn(async () => []),
    listAskCostMismatches: vi.fn(async () => []),
    listRefundsAfterPickup: vi.fn(async () => []),
    listReferredPastDeadline: vi.fn(async () => []),
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
      listStaleCheckouts: vi.fn(async () => [{ id: 41, amount: 9900, currency: "INR", createdAt: new Date("2026-10-17T01:00:00Z") }]),
      summarizeStaleCheckouts: vi.fn(async (olderThan: Date) => { staleSeen.push(olderThan); return { total: 1221, users: 3, oldest: new Date("2026-09-23T03:02:28Z"), newest: new Date("2026-10-17T01:00:00Z") }; }),
    });
    await runJob(deps);
    expect(staleSeen[0]!.getTime()).toBe(NOW.getTime() - DAY);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("parked payment: #21 9900 INR (checkout_amount_mismatch");
    expect(sent[0]!.text).toContain("unmatched refund: log #31 (inv_123");
    expect(sent[0]!.text).toContain("stale checkouts: 1221 unpaid checkout page(s) from 3 account(s) still pending after a day, oldest 2026-09-23T03:02:28.000Z");
    expect(sent[0]!.text).toContain("none credited, no money moved (oldest ids: #41)");
    expect(sent[0]!.text).not.toContain("stale checkout: payment");
  });

  it("names only in-window checkouts in the sample, never an aged-out one", async () => {
    // The mock answers like the query: it keeps rows inside the window it is given. A missing
    // lower bound therefore leaks the aged-out row into the sample, which is the finding.
    const seen: Array<{ older: number; newer: number | null }> = [];
    const { deps, sent } = makeDeps({
      summarizeStaleCheckouts: vi.fn(async () => ({ total: 1, users: 1, oldest: new Date(NOW.getTime() - 2 * DAY), newest: new Date(NOW.getTime() - 2 * DAY) })),
      listStaleCheckouts: vi.fn(async (older: Date, limit: number, newer?: Date) => {
        seen.push({ older: older.getTime(), newer: newer ? newer.getTime() : null });
        const all = [
          { id: 41, amount: 9900, currency: "INR", createdAt: new Date(NOW.getTime() - 2 * DAY) },
          { id: 42, amount: 9900, currency: "INR", createdAt: new Date(NOW.getTime() - 9 * DAY) },
        ];
        return all.filter(row => row.createdAt < older && (!newer || row.createdAt >= newer)).slice(0, limit);
      }),
    });
    await runJob(deps);
    expect(seen[0]).toEqual({ older: NOW.getTime() - DAY, newer: NOW.getTime() - 7 * DAY });
    expect(sent[0]!.text).toContain("oldest ids: #41");
    expect(sent[0]!.text).not.toContain("#42");
  });

  it("lists checkouts older than the reconcile window as their own unverified finding, never as never paid", async () => {
    const calls: Array<{ older: number; newer: number | null }> = [];
    const { deps, sent } = makeDeps({
      summarizeStaleCheckouts: vi.fn(async (older: Date, newer?: Date) => { calls.push({ older: older.getTime(), newer: newer ? newer.getTime() : null }); return newer ? { total: 0, users: 0, oldest: null, newest: null } : { total: 1246, users: 5, oldest: new Date("2026-09-23T03:02:28Z"), newest: new Date("2026-10-14T01:00:00Z") }; }),
    });
    await runJob(deps);
    expect(calls[0]).toEqual({ older: NOW.getTime() - DAY, newer: NOW.getTime() - 7 * DAY });
    expect(calls[1]).toEqual({ older: NOW.getTime() - 7 * DAY, newer: null });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("aged-out checkouts: 1246 checkout page(s) from 5 account(s) are older than 7 days, aged out of reconciliation");
    expect(sent[0]!.text).toContain("payment status at the provider is unverified");
    expect(sent[0]!.text).not.toMatch(/never paid|abandoned/i);
    expect(sent[0]!.text).not.toContain("stale checkouts:");
  });

  it("stays quiet about aged-out checkouts when there are none", async () => {
    const { deps, sent } = makeDeps({});
    await runJob(deps);
    expect(sent.join(" ")).not.toContain("aged-out checkouts");
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
 * D-065-B (D-065: one check per money-rule slice): the D-034/D-047 delivery spend must flip its ask to visible in
 * the same transaction, so a credit_spend keyed ask-delivery:<id> whose ask still waits for coverage is a fault;
 * the unique index on reversesTransactionId should keep one reversal per spend, so two rows reversing one
 * transaction is a fault too. Each line carries ids and counts only.
 */
describe("D-065-B slice checks", () => {
  it("flags a delivery spend whose ask still waits for coverage, and stays quiet on a clean ledger", async () => {
    const clean = makeDeps();
    await runJob(clean.deps);
    expect(clean.sent).toEqual([]);

    const { deps, sent } = makeDeps({
      listAskDeliverySpendsWhileWaiting: vi.fn(async () => [{ transactionId: 901, requestId: 601 }]),
    });
    await runJob(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 1 finding");
    expect(sent[0]!.text).toContain("ask_spent_while_waiting: ask #601 still waits for coverage, but ledger row #901 spent a credit for it");
    expect(sent[0]!.text).not.toContain("@");
  });

  it("flags a spend reversed by two rows, never a single reversal", async () => {
    const single = makeDeps();
    await runJob(single.deps);
    expect(single.sent).toEqual([]);

    const { deps, sent } = makeDeps({
      listDoublyReversedSpends: vi.fn(async () => [{ reversesTransactionId: 700, reversalRows: 2, ledgerRowIds: [701, 702] }]),
    });
    await runJob(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("spend_reversed_twice: transaction #700 is reversed by 2 rows (ledger rows #701, #702)");
    expect(sent[0]!.text).not.toContain("@");
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

describe("D-065-B slice checks over the in-memory database", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
    mocks.createPool.mockResolvedValue({});
    mocks.drizzle.mockReturnValue(store.db);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("finds a delivery spend on an ask still waiting and a spend reversed twice, never a legacy create charge or a single reversal, and writes nothing", async () => {
    // The real shape: spendCreditsTx writes `${referenceId}#${n}` and keys the row
    // `${idempotencyKey}#${n}`, so a delivery spend is "601#1" / "ask-delivery:601#1".
    // The old fixture wrote the bare id, a shape production never writes (D-065-C).
    const deliverySpend = (id: number, requestId: number) => spendRow({ id, referenceId: `${requestId}#1`, idempotencyKey: `ask-delivery:${requestId}#1`, tokenCount: -1 });
    const reversal = (id: number, spendId: number, kind: string) => spendRow({ id, tokenCount: 1, kind, reversesTransactionId: spendId, idempotencyKey: `reversal-${id}` });
    seedHeldAsks({
      asks: [
        // A D-034 delivery spend exists while the ask still waits: the flip did not reach the row (the fault).
        askRow({ id: 601, referrerId: null, waitingForCoverage: true, debitTransactionId: null }),
        // A pre-0095 waiting ask charged at create: its spend is not an ask-delivery key, so it is no fault.
        askRow({ id: 602, referrerId: null, waitingForCoverage: true, debitTransactionId: 61 }),
        // Delivered: waitingForCoverage=false is exactly what the delivery spend requires.
        askRow({ id: 603, debitTransactionId: 63 }),
      ],
      spends: [
        spendRow({ id: 61, referenceId: "602#1", idempotencyKey: "k602#1", tokenCount: -1 }),
        deliverySpend(62, 601),
        deliverySpend(63, 603),
        reversal(64, 63, "expiry_refund"),
        reversal(65, 63, "withdrawal_refund"),
        reversal(66, 61, "withdrawal_refund"),
      ],
    });
    const before = { requests: structuredClone(store.rows(referralRequests)), ledger: structuredClone(store.rows(tokenTransactions)) };
    const { deps, sent } = makeDeps({ listAllocatedAsks: listAllocatedPendingAsks, listAskDeliverySpendsWhileWaiting, listDoublyReversedSpends });
    const output = await createDailyMoneyCheck(deps)({ nowMs: KIT_NOW, windowKey: "2026-10-18T12:00Z" });

    expect(output.failed).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 2 findings");
    expect(sent[0]!.text).toContain("ask_spent_while_waiting: ask #601 still waits for coverage, but ledger row #62 spent a credit for it");
    expect(sent[0]!.text).toContain("spend_reversed_twice: transaction #63 is reversed by 2 rows (ledger rows #64, #65)");
    for (const id of [602, 603]) expect(sent[0]!.text).not.toContain(`ask #${id}`);
    expect(sent[0]!.text).not.toContain("transaction #61 ");
    expect(sent[0]!.text).not.toContain("@");
    // Read-only: no ask or ledger row moved.
    expect(store.rows(referralRequests)).toEqual(before.requests);
    expect(store.rows(tokenTransactions)).toEqual(before.ledger);
  });

  it("finds a promo-bucket delivery spend too, and reports one finding per ask across bucket rows", async () => {
    seedHeldAsks({
      asks: [
        // Delivery drawn from the promo bucket: kind promo_spend (spendCreditsTx).
        askRow({ id: 604, referrerId: null, waitingForCoverage: true, debitTransactionId: null }),
        // A level-priced ask drew from two buckets: two rows, one ask, one finding.
        askRow({ id: 605, referrerId: null, waitingForCoverage: true, debitTransactionId: null }),
      ],
      spends: [
        spendRow({ id: 71, kind: "promo_spend", source: "promo_grant", referenceId: "604#1", idempotencyKey: "ask-delivery:604#1", tokenCount: -1 }),
        spendRow({ id: 72, referenceId: "605#1", idempotencyKey: "ask-delivery:605#1", tokenCount: -2 }),
        spendRow({ id: 73, kind: "promo_spend", source: "promo_grant", referenceId: "605#2", idempotencyKey: "ask-delivery:605#2", tokenCount: -1 }),
      ],
    });
    const before = { requests: structuredClone(store.rows(referralRequests)), ledger: structuredClone(store.rows(tokenTransactions)) };
    const { deps, sent } = makeDeps({ listAllocatedAsks: listAllocatedPendingAsks, listAskDeliverySpendsWhileWaiting });
    const output = await createDailyMoneyCheck(deps)({ nowMs: KIT_NOW, windowKey: "2026-10-18T12:00Z" });
    expect(output.failed).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 2 findings");
    expect(sent[0]!.text).toContain("ask_spent_while_waiting: ask #604 still waits for coverage, but ledger row #71 spent a credit for it");
    expect(sent[0]!.text).toContain("ask_spent_while_waiting: ask #605 still waits for coverage");
    expect(sent[0]!.text.match(/ask_spent_while_waiting/g)).toHaveLength(2);
    expect(sent[0]!.text).not.toContain("#73 ");
    expect(store.rows(referralRequests)).toEqual(before.requests);
    expect(store.rows(tokenTransactions)).toEqual(before.ledger);
  });
});

describe("referred_deadline_stuck over the in-memory database", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
    mocks.createPool.mockResolvedValue({});
    mocks.drizzle.mockReturnValue(store.db);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  // D-038-B: an accepted ask the referral-timers job should have reopened a day ago. The clock is
  // measured from the acceptance, clamped to REFERRAL_TIMERS_SINCE, so the job runs nine days later.
  it("flags an approved ask more than a day past its referred deadline, and only that one", async () => {
    const later = REFERRAL_TIMERS_SINCE + 9 * DAY_MS;
    const acceptance = (id: number, requestId: number, atMs: number) => ({ ...claimEvent(requestId, id), action: "approve", operationKey: `one-click:2:approved`, resultingStatus: "approved", createdAt: new Date(atMs) });
    seedHeldAsks({
      asks: [
        // Accepted a day after the cut-off: due on day 6, so nine days in it is three days overdue.
        askRow({ id: 701, status: "approved", referrerId: LINK_OWNER }),
        // Accepted seven days after the cut-off: due on day 12, so it is not due yet.
        askRow({ id: 702, status: "approved", referrerId: LINK_OWNER }),
      ],
      events: [acceptance(80, 701, REFERRAL_TIMERS_SINCE + DAY_MS), acceptance(81, 702, REFERRAL_TIMERS_SINCE + 7 * DAY_MS)],
    });

    const { deps, sent } = makeDeps({ listReferredPastDeadline });
    const output = await createDailyMoneyCheck(deps)({ nowMs: later, windowKey: "2026-10-29T02:00Z" });

    expect(output.failed).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("referred_deadline_stuck: ask #701");
    expect(sent[0]!.text).not.toContain("ask #702");
  });

  // D-038-reconcile B-1: the first acceptance's extension must not excuse the second acceptance.
  // Accepted seven days before the check: its own 5-day deadline is two days overdue, while reading
  // any extension on the ask would put it at day 8 — a day in the future — and hide the stuck ask.
  it("does not let a first acceptance's extension hide a second acceptance's missed deadline", async () => {
    const later = REFERRAL_TIMERS_SINCE + 10 * DAY_MS;
    const event = (id: number, action: string, operationKey: string, atMs: number, resultingStatus: string) => ({ ...claimEvent(703, id), action, operationKey, resultingStatus, createdAt: new Date(atMs) });
    seedHeldAsks({
      asks: [askRow({ id: 703, status: "approved", referrerId: LINK_OWNER })],
      events: [
        event(90, "approve", "one-click:2:approved", REFERRAL_TIMERS_SINCE + DAY_MS, "approved"),
        event(91, "referred_extension", "referred-extension:90", REFERRAL_TIMERS_SINCE + 2 * DAY_MS, "approved"),
        event(92, "referred_lapse", "referred-lapse:90", REFERRAL_TIMERS_SINCE + 2 * DAY_MS + 60 * 60_000, "pending"),
        event(93, "approve", "one-click:4:approved", later - 7 * DAY_MS, "approved"),
      ],
    });

    const rows = await listReferredPastDeadline(later, 50);
    expect(rows.map(row => row.id)).toContain(703);
  });
});

/*
 * D-038-A (F4): `refund_after_pickup`. Once a referrer claimed the ask the credit stays spent
 * (D-034, D-076 (1)), so a withdrawal or expiry refund whose latest pickup-or-release event before
 * it was a claim is a money leak. The refund window is bounded (limit * 4 newest rows); the event
 * read is not, so an old claim cannot hide behind newer rows.
 */
describe("refund_after_pickup over the in-memory database", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
    mocks.createPool.mockResolvedValue({});
    mocks.drizzle.mockReturnValue(store.db);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);
  const HOUR = 60 * 60_000;
  const event = (id: number, action: string, createdAt: Date, requestId = 501) => ({ ...claimEvent(requestId, id), action, operationKey: `${action}:${id}`, createdAt });
  const refund = (id: number, kind: string, createdAt: Date, requestId = 501): Record<string, unknown> =>
    spendRow({ id, kind, tokenCount: 1, createdAt, referenceId: `${requestId}#refund#1`, reversesTransactionId: 600 + id });

  it("flags a withdrawal refund and an expiry refund after a claim", async () => {
    seedHeldAsks({
      asks: [askRow()],
      events: [event(39, "claim", at(3 * DAY))],
      spends: [refund(61, "withdrawal_refund", at(DAY)), refund(62, "expiry_refund", at(12 * HOUR))],
    });

    const rows = await listRefundsAfterPickup(10);
    expect(rows.map(row => row.transactionId).sort((a, b) => a - b)).toEqual([61, 62]);
    expect(rows.map(row => row.requestId)).toEqual([501, 501]);
  });

  it("does not flag a refund after a lapse or a step-back released the ask", async () => {
    seedHeldAsks({
      asks: [askRow(), askRow({ id: 502 })],
      events: [
        event(39, "claim", at(4 * DAY)),
        event(40, "claim_lapse", at(3 * DAY)),
        event(41, "claim", at(3 * DAY), 502),
        event(42, "step_back", at(2 * DAY), 502),
      ],
      spends: [refund(63, "expiry_refund", at(DAY)), refund(64, "withdrawal_refund", at(HOUR), 502)],
    });

    expect(await listRefundsAfterPickup(10)).toEqual([]);
  });

  it("finds an old claim behind more than limit x 4 newer rows for other asks", async () => {
    // The refund window covers the newest limit * 4 refund rows, and the event read has no window,
    // so a ten-day-old claim still convicts a recent refund among 30 newer rows for other asks.
    // (The kit ignores ORDER BY, so this pins the unbounded event lookup, not the ordering.)
    const newerRefunds = Array.from({ length: 30 }, (_, i) => refund(700 + i, "withdrawal_refund", at(2 * DAY), 900 + i));
    seedHeldAsks({
      asks: [askRow()],
      events: [event(39, "claim", at(10 * DAY))],
      // The leak's id is the highest (newest under ORDER BY id DESC), so the bounded window holds it.
      spends: [refund(800, "withdrawal_refund", at(HOUR)), ...newerRefunds],
    });

    expect((await listRefundsAfterPickup(5)).map(row => row.transactionId)).toEqual([800]);
  });

  it("returns at most limit findings, so the owner email stays bounded", async () => {
    seedHeldAsks({
      asks: [askRow()],
      events: [event(39, "claim", at(3 * DAY))],
      spends: [refund(61, "withdrawal_refund", at(2 * DAY)), refund(62, "expiry_refund", at(DAY))],
    });

    // Two leaks, one slot: the query's LIMIT bounds what the email can carry. Which row survives is
    // the SQL's ORDER BY id DESC, which the in-memory kit ignores by design.
    expect(await listRefundsAfterPickup(1)).toHaveLength(1);
  });

  it("reaches the owner email as one finding line per leak", async () => {
    seedHeldAsks({
      asks: [askRow()],
      events: [event(39, "claim", at(3 * DAY))],
      spends: [refund(61, "withdrawal_refund", at(DAY))],
    });

    const { deps, sent } = makeDeps({ listRefundsAfterPickup });
    await createDailyMoneyCheck(deps)({ nowMs: NOW.getTime(), windowKey: "2026-10-19T02:00Z" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("refund_after_pickup: ledger row #61 returned a credit for ask #501 (withdrawal_refund) although the ask's latest pickup was a claim");
    expect(sent[0]!.text).not.toContain("@");
  });
});

/*
 * P2 (#506): `listStaleCheckouts` query lower bound.
 * Proves the real query's WHERE clause enforces the 7-day lower bound (`gte(paymentFulfillments.createdAt, newerThan)`)
 * against drizzle so an aged-out row (>7 days old) is never included in the sample.
 */
describe("listStaleCheckouts over the in-memory database", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
    mocks.createPool.mockResolvedValue({});
    mocks.drizzle.mockReturnValue(store.db);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  const staleCheckout = (id: number, createdAt: Date, over: Record<string, unknown> = {}) => ({
    id,
    provider: "chargebee",
    providerEventId: `evt_${id}`,
    providerInvoiceId: null,
    providerHostedPageId: null,
    checkoutIntentId: null,
    userId: 1,
    role: "job_seeker",
    tokenCount: 1,
    amount: 9900,
    currency: "INR",
    status: "pending",
    reconciliationReason: null,
    lastCheckedAt: null,
    creditedAt: null,
    createdAt,
    ...over,
  });

  it("names only in-window checkouts in the sample, filtering out aged-out ones via the real query lower bound", async () => {
    const staleCutoff = new Date(NOW.getTime() - DAY);
    const agedOutCutoff = new Date(NOW.getTime() - 7 * DAY);

    store.reset([
      [paymentFulfillments, [
        staleCheckout(41, new Date(NOW.getTime() - 2 * DAY)),
        staleCheckout(42, new Date(NOW.getTime() - 9 * DAY)),
      ]],
    ]);

    // The real query with lower bound filters out #42 (9 days old fails gte lower bound)
    const sampled = await listStaleCheckouts(staleCutoff, 3, agedOutCutoff);
    expect(sampled.map(row => row.id)).toEqual([41]);

    // Without lower bound, #42 leaks into the sample
    const allOlder = await listStaleCheckouts(staleCutoff, 3);
    expect(allOlder.map(row => row.id)).toEqual([41, 42]);
  });

  it("integrates with createDailyMoneyCheck to include only in-window ids in the alert", async () => {
    store.reset([
      [paymentFulfillments, [
        staleCheckout(41, new Date(NOW.getTime() - 2 * DAY)),
        staleCheckout(42, new Date(NOW.getTime() - 9 * DAY)),
      ]],
    ]);

    const { deps, sent } = makeDeps({
      summarizeStaleCheckouts: vi.fn(async (_older: Date, newer?: Date) => {
        return newer
          ? { total: 1, users: 1, oldest: new Date(NOW.getTime() - 2 * DAY), newest: new Date(NOW.getTime() - 2 * DAY) }
          : { total: 1, users: 1, oldest: new Date(NOW.getTime() - 9 * DAY), newest: new Date(NOW.getTime() - 9 * DAY) };
      }),
      listStaleCheckouts, // Real query function against in-memory drizzle!
    });

    await createDailyMoneyCheck(deps)({ nowMs: NOW.getTime(), windowKey: "2026-10-19T02:00Z" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("oldest ids: #41");
    expect(sent[0]!.text).not.toContain("#42");
  });
});

describe("runMoneyCheckNow (on-demand admin run)", () => {
  it("returns the exact owner-email text and reports delivery", async () => {
    const { deps, sent } = makeDeps({ listParkedPayments: vi.fn(async () => [{ id: 7, amount: 99, currency: "INR", reconciliationReason: "unmatched", createdAt: NOW } as never]) });
    const result = await runMoneyCheckNow(NOW.getTime(), deps);
    expect(result.findingsEmailed).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(result.text).toContain("parked payment: #7");
    expect(result.text).toBe(sent[0].text);
  });

  it("still returns the findings when email delivery fails, so they are never silent", async () => {
    const { deps } = makeDeps({ listParkedPayments: vi.fn(async () => [{ id: 8, amount: 1, currency: "USD", reconciliationReason: null, createdAt: NOW } as never]), sendEmail: vi.fn(async () => false) });
    const result = await runMoneyCheckNow(NOW.getTime(), deps);
    expect(result.emailSent).toBe(false);
    expect(result.findingsEmailed).toBe(true);
    expect(result.text).toContain("parked payment: #8");
  });

  it("a clean ledger sends nothing and returns no findings", async () => {
    const { deps, sent } = makeDeps();
    const result = await runMoneyCheckNow(NOW.getTime(), deps);
    expect(result).toEqual({ emailSent: false, findingsEmailed: false, subject: null, text: null });
    expect(sent).toEqual([]);
  });
});

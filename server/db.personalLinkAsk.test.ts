import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { operationalActivityLogs, referralAvailabilitySlots, referralRequests, tokenTransactions } from "../drizzle/schema";
import type { Row } from "./inMemoryDrizzle.testkit";
import { ReferralTransitionConflict, claimCompanyReferralRequest, expireStalePendingReferralRequest, oneClickReviewReferralRequest, reviewReferralRequest, withdrawCompanyReferralRequest } from "./db";
import { BEFORE_CLAIM_HISTORY, CLAIMED_REFUSAL, COLLEAGUE, DAY_MS, LINK_OWNER, NOW, PERSONAL_LINK_LEAD, REQUEST_ID, SEEKER, allocatedSlot, askById, askRow, claimEvent, daysAgo, eventActions, legacyDebitRow, noticesFor, releaseLogs, reversalsOf, seedHeldAsks, spendRow, store, walletOf, type HeldSeed } from "./heldAsk.testkit";

/*
 * D-050: a personal-link ask (D-017) is created already assigned to the
 * employee whose link the seeker used. Until that employee claims, accepts or
 * passes, it counts as unclaimed: the seeker can withdraw it with the credit
 * back, and the 7-day expiry returns the credit, through the same idempotent
 * refund paths every unclaimed ask uses. Once the employee acts, today's rules
 * stay: a pickup keeps the credit spent. Real server/db.ts calls over the
 * in-memory database.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

// Claims read the clock (a held ask's 7-day shelf life binds them too), so every call runs on the fixtures' clock.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  seedHeldAsks();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const withdraw = () => withdrawCompanyReferralRequest(SEEKER, REQUEST_ID);
const expire = (nowMs = NOW) => expireStalePendingReferralRequest(SEEKER, REQUEST_ID, nowMs);
const exactly = (message: string) => new RegExp(`^${message}$`);
const metadataOf = (row: Row | undefined): unknown => JSON.parse(String(row?.metadata ?? "null"));
const claim = async () => { await claimCompanyReferralRequest(LINK_OWNER, REQUEST_ID); };
const approve = async () => { await oneClickReviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "approved" }); };
const pass = async () => { await oneClickReviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "declined", declineReason: "timing" }); };
const rejectionOf = (work: Promise<void>) => work.then(() => undefined, (reason: unknown) => reason);

describe("withdrawing a personal-link ask its employee has not acted on", () => {
  it("withdraws with exactly one refund; a replay adds nothing", async () => {
    expect(await withdraw()).toMatchObject({ withdrawn: true, status: "withdrawn", creditRefunded: true });
    expect(askById()).toMatchObject({ status: "withdrawn", referrerId: null, revision: 1 });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "withdrawal_refund", tokenCount: 1, referenceId: "501#refund#1", source: "monthly_allowance", sourceCycleKey: "2026-10" })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
    expect(eventActions()).toEqual(["withdraw"]);
    expect(releaseLogs().map(row => [row.resourceType, row.resourceId, row.outcome])).toEqual([["referral_request", "501", "success"]]);
    expect(metadataOf(releaseLogs()[0])).toEqual({ reason: "withdrawn", creditReturned: true, referrerId: LINK_OWNER });

    expect(await withdraw()).toMatchObject({ withdrawn: true, status: "withdrawn", creditRefunded: false });
    expect(reversalsOf()).toHaveLength(1);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
    expect(eventActions()).toEqual(["withdraw"]);
    expect(releaseLogs()).toHaveLength(1);
  });

  it("refunds a legacy reserved credit (direct_request) once, through the legacy path", async () => {
    seedHeldAsks({ spends: [legacyDebitRow()] });
    expect(await withdraw()).toMatchObject({ withdrawn: true, status: "withdrawn", creditRefunded: true });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "withdrawal_refund", tokenCount: 1, referenceId: "501" })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
    expect(await withdraw()).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(reversalsOf()).toHaveLength(1);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
  });

  it("withdraws a free held ask (no debit) with no ledger row and no wallet change", async () => {
    seedHeldAsks({ asks: [askRow({ debitTransactionId: null })], spends: [] });
    expect(await withdraw()).toMatchObject({ withdrawn: true, status: "withdrawn", creditRefunded: false });
    expect(store.rows(tokenTransactions)).toEqual([]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
    expect(askById()).toMatchObject({ status: "withdrawn", referrerId: null });
    expect(metadataOf(releaseLogs()[0])).toEqual({ reason: "withdrawn", creditReturned: false, referrerId: LINK_OWNER });
  });

  // The held row and its claimed control share one fixture, so the control proves the fixture reaches the held path.
  it.each([
    { acted: "nothing", act: async () => undefined, held: true },
    { acted: "a claim by the link owner", act: claim, held: false },
  ])("after $acted, the withdrawal follows whether the link owner acted", async ({ act, held }) => {
    await act();
    if (held) {
      expect(await withdraw()).toMatchObject({ withdrawn: true, creditRefunded: true });
      expect(reversalsOf()).toHaveLength(1);
      expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
      return;
    }
    await expect(withdraw()).rejects.toThrow(exactly(CLAIMED_REFUSAL));
    expect(askById()).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
    expect(reversalsOf()).toEqual([]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
    expect(eventActions()).toEqual(["claim"]);
    expect(releaseLogs()).toEqual([]);
  });

  it.each([
    ["a one-click approve", approve],
    ["a review approve", async () => { await reviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "approved" }); }],
  ])("after %s, refuses as today and the credit stays spent", async (_label, accept) => {
    await accept();
    expect(askById()?.status).toBe("approved");
    await expect(withdraw()).rejects.toThrow(/can no longer be withdrawn/);
    expect(reversalsOf()).toEqual([]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
  });

  it("after a pass the ask is an ordinary open ask: an unclaimed pass refunds once, a claim then pass refunds nothing", async () => {
    await reviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "declined" });
    expect(askById()).toMatchObject({ status: "pending", referrerId: null });
    expect(await withdraw()).toMatchObject({ withdrawn: true, creditRefunded: true });
    expect(reversalsOf()).toHaveLength(1);

    seedHeldAsks();
    await claim();
    await reviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "declined" });
    expect(await withdraw()).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(reversalsOf()).toEqual([]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
    expect(releaseLogs()).toEqual([]);
  });

  // P0-allocated-ask-stuck: an allocation is not a pickup, so a queue-allocated ask nobody claimed is unclaimed too.
  it("a queue-allocated assigned ask nobody claimed withdraws with one refund and expires at its 7 days with one refund", async () => {
    const queueReleases = () => store.rows(operationalActivityLogs).filter(row => row.action === "queue_allocation.released");
    seedHeldAsks({ slots: [allocatedSlot()] });
    expect(await withdraw()).toMatchObject({ withdrawn: true, status: "withdrawn", creditRefunded: true });
    expect(askById()).toMatchObject({ status: "withdrawn", referrerId: null });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "withdrawal_refund", tokenCount: 1 })]);
    expect(store.rows(referralAvailabilitySlots).map(row => row.status)).toEqual(["released"]);
    expect(queueReleases().map(metadataOf)).toEqual([{ reason: "withdrawn", creditReturned: true, referrerId: LINK_OWNER }]);
    expect(releaseLogs()).toEqual([]);

    seedHeldAsks({ slots: [allocatedSlot()] });
    expect(await expire(daysAgo(2).getTime() + 7 * DAY_MS - 1)).toMatchObject({ expired: false });
    expect(await expire(daysAgo(2).getTime() + 7 * DAY_MS)).toMatchObject({ expired: true, status: "closed" });
    expect(askById()).toMatchObject({ status: "closed", referrerId: null });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 1 })]);
    expect(store.rows(referralAvailabilitySlots).map(row => row.status)).toEqual(["released"]);
    expect(queueReleases().map(metadataOf)).toEqual([{ reason: "expired", creditReturned: true, referrerId: LINK_OWNER }]);
  });

  it.each<[string, HeldSeed]>([
    ["an assigned ask created before claims were recorded", { asks: [askRow({ createdAt: BEFORE_CLAIM_HISTORY, updatedAt: BEFORE_CLAIM_HISTORY })] }],
  ])("%s keeps today's refusal on withdraw and expiry", async (_label, seed) => {
    seedHeldAsks(seed);
    await expect(withdraw()).rejects.toThrow(/can no longer be withdrawn/);
    expect(await expire(NOW + 30 * DAY_MS)).toMatchObject({ expired: false });
    expect(askById()).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
    expect(reversalsOf()).toEqual([]);
    expect(store.rows(referralAvailabilitySlots).map(row => row.status)).toEqual(seed.slots ? ["allocated"] : []);
  });

  // The in-memory store has no isolation, so true parallelism is not meaningful here: both serial orders are.
  describe.each([
    { action: "claim", act: claim, keepsCredit: true },
    { action: "approve", act: approve, keepsCredit: true },
    { action: "pass", act: pass, keepsCredit: false },
  ])("a withdraw racing the link owner's $action resolves to exactly one outcome", ({ action, act, keepsCredit }) => {
    it(`withdraw first: the ${action} is refused and the ask stays withdrawn with one refund`, async () => {
      expect(await withdraw()).toMatchObject({ withdrawn: true, creditRefunded: true });
      const refusal = await rejectionOf(act());
      expect(refusal).toBeInstanceOf(ReferralTransitionConflict);
      expect(refusal instanceof Error ? refusal.message : "").toMatch(/no longer available/);
      expect(eventActions()).toEqual(["withdraw"]);
      expect(reversalsOf()).toHaveLength(1);
      expect(askById()).toMatchObject({ status: "withdrawn", referrerId: null });
    });

    it(`${action} first: the withdrawal follows the employee's action`, async () => {
      await act();
      if (keepsCredit) {
        await expect(withdraw()).rejects.toThrow(/can no longer be withdrawn/);
        expect(reversalsOf()).toEqual([]);
        expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
        return;
      }
      // A pass reopens the ask to the company (D-021): never claimed, so its credit comes back.
      expect(await withdraw()).toMatchObject({ withdrawn: true, creditRefunded: true });
      expect(eventActions()).toEqual(["pass", "withdraw"]);
      expect(reversalsOf()).toHaveLength(1);
    });
  });

  it("writes the refund and the withdrawal in one transaction", async () => {
    // Simulates the row no longer matching when the transition re-reads it, after the refund row was written.
    const original = store.db.transaction;
    type Run = Parameters<typeof original>[0];
    let injected = false;
    store.db.transaction = async <T,>(run: (tx: Parameters<Run>[0]) => Promise<T>): Promise<T> => original(tx => run({
      ...tx,
      insert: table => {
        if (table === tokenTransactions && !injected) {
          injected = true;
          void tx.update(referralRequests).set({ referrerId: COLLEAGUE }).where(eq(referralRequests.id, REQUEST_ID));
        }
        return tx.insert(table);
      },
    }));
    try {
      await expect(withdraw()).rejects.toThrow(exactly(CLAIMED_REFUSAL));
    } finally {
      store.db.transaction = original;
    }
    expect(injected).toBe(true);
    expect(reversalsOf()).toEqual([]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
    expect(askById()).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
    expect(releaseLogs()).toEqual([]);
  });
});

describe("the 7-day expiry of a personal-link ask its employee has not acted on", () => {
  const stale = (over: Row = {}): HeldSeed => ({ asks: [askRow({ createdAt: daysAgo(8), updatedAt: daysAgo(8), ...over })] });

  it("expires it with one refund and a truthful notice; repeats add nothing; a later withdraw is refused", async () => {
    seedHeldAsks(stale());
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(askById()).toMatchObject({ status: "closed", referrerId: null });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 1, referenceId: "501#refund#1" })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
    expect(noticesFor()).toEqual([expect.objectContaining({ title: "Your ask expired — credit returned" })]);
    expect(String(noticesFor()[0]?.body)).toContain(PERSONAL_LINK_LEAD);
    expect(String(noticesFor()[0]?.body)).not.toContain("No verified employee claimed");
    expect(metadataOf(releaseLogs()[0])).toEqual({ reason: "expired", creditReturned: true, referrerId: LINK_OWNER });

    expect(await expire()).toMatchObject({ expired: false });
    expect(reversalsOf()).toHaveLength(1);
    expect(noticesFor()).toHaveLength(1);
    expect(releaseLogs()).toHaveLength(1);
    // A stale page that still offers Withdraw is told the truth: the ask closed, nobody claimed it.
    await expect(withdraw()).rejects.toThrow(exactly("This ask has already closed, so it can no longer be withdrawn"));
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
  });

  it("keeps the copy truthful when the credit cannot come back, for a free ask and for a legacy reserved credit", async () => {
    seedHeldAsks({ ...stale(), spends: [spendRow({ sourceCycleKey: "2026-09" })] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 0 })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
    expect(noticesFor()).toEqual([expect.objectContaining({ title: "Your ask expired" })]);
    expect(String(noticesFor()[0]?.body)).toContain(PERSONAL_LINK_LEAD);
    expect(String(noticesFor()[0]?.body)).toContain("could not be returned");
    expect(metadataOf(releaseLogs()[0])).toEqual({ reason: "expired", creditReturned: false, referrerId: LINK_OWNER });

    seedHeldAsks({ ...stale({ debitTransactionId: null }), spends: [] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(store.rows(tokenTransactions)).toEqual([]);
    expect(noticesFor()).toEqual([expect.objectContaining({ title: "Your ask expired — slot freed" })]);
    expect(String(noticesFor()[0]?.body)).toContain(PERSONAL_LINK_LEAD);

    seedHeldAsks({ ...stale(), spends: [legacyDebitRow()] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 1, referenceId: "501" })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
    expect(noticesFor()).toEqual([expect.objectContaining({ title: "Your ask expired — credit returned" })]);
    expect(String(noticesFor()[0]?.body)).toContain(PERSONAL_LINK_LEAD);
  });

  it("expires an 8-day-old queue-allocated ask nobody claimed with one refund and the unclaimed lead (P0-allocated-ask-stuck)", async () => {
    seedHeldAsks({ ...stale(), slots: [allocatedSlot()] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(askById()).toMatchObject({ status: "closed", referrerId: null });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 1 })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
    expect(noticesFor()).toEqual([expect.objectContaining({ title: "Your ask expired — credit returned" })]);
    expect(String(noticesFor()[0]?.body)).toMatch(/^No verified employee claimed it within 7 days\./);
    expect(String(noticesFor()[0]?.body)).not.toContain(PERSONAL_LINK_LEAD);
    expect(store.rows(referralAvailabilitySlots).map(row => row.status)).toEqual(["released"]);
    expect(releaseLogs()).toEqual([]);
    expect(await expire()).toMatchObject({ expired: false });
    expect(reversalsOf()).toHaveLength(1);
  });

  it.each<[string, HeldSeed]>([
    ["6 days old", { asks: [askRow({ createdAt: daysAgo(6) })] }],
    ["8 days old and claimed", { ...stale(), events: [claimEvent()] }],
    ["from before claims were recorded", { asks: [askRow({ createdAt: BEFORE_CLAIM_HISTORY })] }],
  ])("leaves the assigned ask untouched when it is %s", async (_label, seed) => {
    seedHeldAsks(seed);
    const before = eventActions();
    expect(await expire()).toMatchObject({ expired: false, status: "pending" });
    expect(askById()).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
    expect(eventActions()).toEqual(before);
    expect(reversalsOf()).toEqual([]);
    expect(noticesFor()).toEqual([]);
    expect(releaseLogs()).toEqual([]);
  });
});

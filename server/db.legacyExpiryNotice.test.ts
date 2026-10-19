import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "./inMemoryDrizzle.testkit";
import { expireStalePendingReferralRequest, withdrawCompanyReferralRequest } from "./db";
import { LINK_OWNER, NOW, PERSONAL_LINK_LEAD, REQUEST_ID, SEEKER, SPEND_ID, askById, askRow, daysAgo, legacyDebitRow, noticesFor, releaseLogs, reversalsOf, seedHeldAsks, spendRow, store, walletOf, walletRow } from "./heldAsk.testkit";

/*
 * An ask that reserved a credit before asks became free (a legacy
 * direct_request debit) gets it back on expiry only when its bucket can take
 * it: a monthly credit from a cycle that has since ended converts to nothing,
 * and a monthly allowance that is already full cannot grow. The seeker's
 * notice, the reversal row and the D-050 audit row must all say what actually
 * moved. D-050 sends held personal-link asks down this path (those sent Sept
 * 21-30 on September monthly credits all close on the first sweep), so they are
 * pinned here, with an unassigned ask on the same path as a control.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); });

const UNCLAIMED_LEAD = "No verified employee claimed it within 7 days.";
const ENDED = "The credit came from a bucket that has since ended, so it could not be returned; send a fresh ask anytime.";
const FULL = "Your monthly credits are already full, so this one could not be added back; send a fresh ask anytime.";
const stale = (over: Row = {}): Row => askRow({ createdAt: daysAgo(8), updatedAt: daysAgo(8), ...over });
const expire = () => expireStalePendingReferralRequest(SEEKER, REQUEST_ID, NOW);
const audit = () => releaseLogs().map(row => JSON.parse(String(row.metadata)));
/** The one notice the expiry sent the seeker. */
const notice = () => noticesFor().map(row => ({ title: row.title, body: row.body }));

describe("expiring an ask whose legacy reserved credit cannot come back", () => {
  it("a held ask on a monthly credit from an ended cycle closes with a 0-credit row and never says the credit returned", async () => {
    seedHeldAsks({ asks: [stale()], spends: [legacyDebitRow({ sourceCycleKey: "2026-09" })] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(askById()).toMatchObject({ status: "closed", referrerId: null });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 0, referenceId: "501" })]);
    expect(walletOf()).toMatchObject({ balance: 0, monthlyCreditsRemaining: 2 });
    expect(notice()).toEqual([{ title: "Your ask expired", body: `${PERSONAL_LINK_LEAD} ${ENDED}` }]);
    expect(audit()).toEqual([{ reason: "expired", creditReturned: false, referrerId: LINK_OWNER }]);
  });

  it("a held ask whose monthly allowance is already full records the 0 credits it returned and says so", async () => {
    seedHeldAsks({ asks: [stale()], spends: [legacyDebitRow()], wallets: [walletRow({ monthlyCreditsRemaining: 3 })] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 0, referenceId: "501" })]);
    expect(walletOf()).toMatchObject({ balance: 0, monthlyCreditsRemaining: 3 });
    expect(notice()).toEqual([{ title: "Your ask expired", body: `${PERSONAL_LINK_LEAD} ${FULL}` }]);
    expect(audit()).toEqual([{ reason: "expired", creditReturned: false, referrerId: LINK_OWNER }]);
  });

  it("an unassigned ask on an ended cycle gets the same truthful notice with its own lead", async () => {
    seedHeldAsks({ asks: [stale({ referrerId: null })], spends: [legacyDebitRow({ sourceCycleKey: "2026-09" })] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 0 })]);
    expect(notice()).toEqual([{ title: "Your ask expired", body: `${UNCLAIMED_LEAD} ${ENDED}` }]);
    expect(audit()).toEqual([]);
  });

  it("a debit already reversed earlier moves nothing now, so the notice claims no refund", async () => {
    const earlier = spendRow({ id: 62, kind: "withdrawal_refund", tokenCount: 1, referenceId: "501", idempotencyKey: null, reversesTransactionId: SPEND_ID });
    seedHeldAsks({ asks: [stale()], spends: [legacyDebitRow(), earlier] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf()).toEqual([expect.objectContaining({ id: 62 })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
    expect(notice()).toEqual([{ title: "Your ask expired — slot freed", body: `${PERSONAL_LINK_LEAD} Its open slot is free again; send a fresh ask anytime.` }]);
    expect(audit()).toEqual([{ reason: "expired", creditReturned: false, referrerId: LINK_OWNER }]);
  });

  it.each([
    ["a purchased credit", legacyDebitRow({ source: "purchased_balance" }), { balance: 1, monthlyCreditsRemaining: 2 }],
    ["a same-cycle monthly credit with room", legacyDebitRow(), { balance: 0, monthlyCreditsRemaining: 3 }],
  ])("controls: %s comes back once and the notice says so", async (_label, debit, wallet) => {
    seedHeldAsks({ asks: [stale()], spends: [debit] });
    expect(await expire()).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 1 })]);
    expect(walletOf()).toMatchObject(wallet);
    expect(notice()).toEqual([{ title: "Your ask expired — credit returned", body: `${PERSONAL_LINK_LEAD} Your reserved credit is back on your balance; send a fresh ask anytime.` }]);
    expect(audit()).toEqual([{ reason: "expired", creditReturned: true, referrerId: LINK_OWNER }]);
  });

  it("a withdrawal the full allowance cannot take back records 0 credits too (the same legacy refund)", async () => {
    seedHeldAsks({ spends: [legacyDebitRow()], wallets: [walletRow({ monthlyCreditsRemaining: 3 })] });
    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "withdrawal_refund", tokenCount: 0, referenceId: "501" })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
  });
});

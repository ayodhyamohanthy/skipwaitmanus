import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_TTL_MS, COVERAGE_WAIT_MS } from "../shared/referral";
import { createAskExpirySweep, listStalePendingAsks } from "./askExpirySweep";
import { reconcileExpiredPendingReferrals } from "./db";
import { BEFORE_CLAIM_HISTORY, LINK_OWNER, NOW, OTHER_SEEKER, SEEKER, allocatedSlot, askById, askRow, claimEvent, daysAgo, legacyDebitRow, noticesFor, reversalsOf, seedHeldAsks, spendRow, store, walletOf, walletRow } from "./heldAsk.testkit";
import { notifications } from "../drizzle/schema";

/*
 * D-050 in the scheduled ask-expiry sweep and the seeker's reconcile-on-read:
 * a stale personal-link ask its employee never acted on is listed and expired
 * like any other unclaimed ask; claimed, accepted, queue-allocated and
 * pre-history assigned asks are filtered out in SQL, so they never fill a
 * batch, are never locked and are never retried. Real server/askExpirySweep.ts
 * and server/db.ts over the in-memory database.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  seedHeldAsks();
});
afterEach(() => { vi.unstubAllEnvs(); });

const cutoff = new Date(NOW - ASK_TTL_MS);
/** D-061: harmless-while-waiting is 90 days; the held personal-link ask keeps its creation-based 7 (D-050). */
const windows = { visibleBefore: cutoff, waitingBefore: new Date(NOW - COVERAGE_WAIT_MS), heldBefore: cutoff };
const context = { nowMs: NOW, windowKey: "2026-10-18T12:00Z" };

describe("the ask-expiry sweep lists personal-link asks its employee never acted on (D-050)", () => {
  it("returns stale held and unassigned asks oldest first, bounded, and never an acted-on one", async () => {
    seedHeldAsks({
      asks: [
        askRow({ id: 501, createdAt: daysAgo(8) }),
        askRow({ id: 502, referrerId: null, createdAt: daysAgo(9) }),
        askRow({ id: 503, createdAt: daysAgo(10) }),
        askRow({ id: 504, createdAt: daysAgo(11) }),
        askRow({ id: 505, createdAt: daysAgo(2) }),
        askRow({ id: 506, createdAt: BEFORE_CLAIM_HISTORY }),
        askRow({ id: 507, status: "approved", createdAt: daysAgo(12) }),
      ],
      events: [claimEvent(503)],
      slots: [allocatedSlot(504)],
    });
    expect(await listStalePendingAsks(windows, 10)).toEqual([{ id: 502, jobSeekerId: SEEKER }, { id: 501, jobSeekerId: SEEKER }]);
    expect(await listStalePendingAsks(windows, 1)).toEqual([{ id: 502, jobSeekerId: SEEKER }]);
  });

  it("never lets claimed assigned asks fill a batch ahead of a held one", async () => {
    seedHeldAsks({
      asks: [askRow({ id: 511, createdAt: daysAgo(20) }), askRow({ id: 512, createdAt: daysAgo(19) }), askRow({ id: 501, createdAt: daysAgo(8) })],
      events: [claimEvent(511, 40), claimEvent(512, 41)],
    });
    expect(await listStalePendingAsks(windows, 2)).toEqual([{ id: 501, jobSeekerId: SEEKER }]);
  });

  it("expires each held ask once through the real job; a second run processes nothing", async () => {
    seedHeldAsks({
      asks: [askRow({ id: 501, createdAt: daysAgo(8) }), askRow({ id: 502, referrerId: null, createdAt: daysAgo(9), debitTransactionId: 62 })],
      spends: [spendRow(), spendRow({ id: 62, referenceId: "502#1", idempotencyKey: "k502#1" })],
      wallets: [walletRow({ monthlyCreditsRemaining: 1 })],
    });
    const sweep = createAskExpirySweep();
    expect(await sweep(context)).toEqual({ processed: 2, failed: 0 });
    expect(await sweep(context)).toEqual({ processed: 0, failed: 0 });
    expect(reversalsOf(61)).toHaveLength(1);
    expect(reversalsOf(62)).toHaveLength(1);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
    expect(noticesFor().map(row => row.refId)).toEqual(expect.arrayContaining([501, 502]));
    expect(noticesFor()).toHaveLength(2);
    expect(askById(501)).toMatchObject({ status: "closed", referrerId: null });
  });

  it("closes only the reading seeker's stale held ask on reconcile", async () => {
    seedHeldAsks({ asks: [askRow({ id: 501, createdAt: daysAgo(8) }), askRow({ id: 508, jobSeekerId: OTHER_SEEKER, createdAt: daysAgo(8), debitTransactionId: null })] });
    expect(await reconcileExpiredPendingReferrals(SEEKER, NOW)).toEqual({ expiredRequestIds: [501] });
    expect(askById(501)).toMatchObject({ status: "closed", referrerId: null });
    expect(askById(508)).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
    expect(store.rows(notifications).filter(row => row.userId === OTHER_SEEKER)).toEqual([]);
  });
});

// Moved from server/db.askExpiry.test.ts with the same assertions: reconcile now also reads held asks with a join, which that fixture cannot evaluate.
describe("seeker reconcile-on-read", () => {
  it("reconciles only stale asks and reports their ids", async () => {
    seedHeldAsks({ asks: [askRow({ id: 501, referrerId: null, createdAt: daysAgo(2) }), askRow({ id: 502, referrerId: null, createdAt: daysAgo(10) })], spends: [legacyDebitRow()] });
    const result = await reconcileExpiredPendingReferrals(SEEKER, NOW);
    expect(result.expiredRequestIds).toEqual([502]);
    expect(askById(501)?.status).toBe("pending");
    expect(askById(502)?.status).toBe("closed");
  });

  it("fails open per request: one bad row never blocks the rest", async () => {
    seedHeldAsks({ asks: [askRow({ id: 503, referrerId: null, createdAt: daysAgo(10), debitTransactionId: 99 })], spends: [] });
    const result = await reconcileExpiredPendingReferrals(SEEKER, NOW);
    // No debit row and no wallet change possible is fine (nothing reserved),
    // but a missing wallet with a real debit must throw like a withdraw.
    expect(result.expiredRequestIds).toEqual([503]);
  });
});

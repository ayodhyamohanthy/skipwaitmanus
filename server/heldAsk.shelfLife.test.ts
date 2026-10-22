import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { referralRequestSaves, referralTransitionEvents } from "../drizzle/schema";
import type { Row } from "./inMemoryDrizzle.testkit";
import { ReferralTransitionConflict, claimCompanyReferralRequest, expireStalePendingReferralRequest, listCompanyReferralInboxByState, withdrawCompanyReferralRequest } from "./db";
import { BEFORE_CLAIM_HISTORY, COLLEAGUE, LINK_OWNER, NOW, REQUEST_ID, SEEKER, allocatedSlot, askById, askRow, claimEvent, daysAgo, eventActions, noticesFor, reversalsOf, seedHeldAsks, store, walletOf, type HeldSeed } from "./heldAsk.testkit";

/*
 * D-050 on the referrer side. A personal-link ask its employee never acted on
 * is unclaimed, so its 7-day shelf life binds the link owner too: past day 7,
 * and before the hourly sweep closes it, the owner can no longer claim it (a
 * late claim would end the hold for good and keep the seeker's credit spent)
 * and it leaves their inbox, exactly like a stale unclaimed ask. A
 * queue-allocated ask nobody claimed is unclaimed too (P0-allocated-ask-stuck).
 * Claimed and pre-history assigned asks keep today's rules. Real server/db.ts
 * calls over the in-memory database, on a fixed clock.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), capture: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  mocks.capture.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const EXPIRED = /^This referral request expired before it could be claimed$/;
const stale = (over: Row = {}): Row => askRow({ createdAt: daysAgo(8), updatedAt: daysAgo(8), ...over });
const refusalOf = (work: Promise<unknown>) => work.then(() => undefined, (reason: unknown) => reason);
const inboxIds = async (state: "new" | "saved") => (await listCompanyReferralInboxByState(LINK_OWNER, state)).map(row => row.id).sort((a, b) => a - b);

describe("a held personal-link ask past its 7 days", () => {
  it("refuses the link owner's late claim, changes nothing, and still expires with the credit back once", async () => {
    seedHeldAsks({ asks: [stale()] });
    const refusal = await refusalOf(claimCompanyReferralRequest(LINK_OWNER, REQUEST_ID));
    expect(refusal).toBeInstanceOf(ReferralTransitionConflict);
    expect(refusal instanceof Error ? refusal.message : "").toMatch(EXPIRED);
    expect(askById()).toMatchObject({ status: "pending", referrerId: LINK_OWNER, revision: 0 });
    expect(eventActions()).toEqual([]);
    expect(noticesFor()).toEqual([]);

    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, NOW)).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf()).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 1 })]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
  });

  it("keeps the seeker's withdrawal, with its refund, after a refused late claim", async () => {
    seedHeldAsks({ asks: [stale()] });
    await expect(claimCompanyReferralRequest(LINK_OWNER, REQUEST_ID)).rejects.toThrow(EXPIRED);
    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: true });
    expect(reversalsOf()).toHaveLength(1);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
  });

  it("still takes the link owner's claim on day 6, and that claim ends the hold for good", async () => {
    seedHeldAsks({ asks: [stale()] });
    vi.setSystemTime(daysAgo(2));
    expect(await claimCompanyReferralRequest(LINK_OWNER, REQUEST_ID)).toMatchObject({ claimed: true, replayed: false });
    vi.setSystemTime(NOW);
    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, NOW)).toMatchObject({ expired: false });
    await expect(withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).rejects.toThrow(/can no longer be withdrawn/);
    expect(reversalsOf()).toEqual([]);
  });

  it.each<[string, HeldSeed, { claimed: true; replayed: boolean }]>([
    ["already claimed (the claim replays)", { asks: [stale()], events: [claimEvent()] }, { claimed: true, replayed: true }],
    ["from before claims were recorded", { asks: [stale({ createdAt: BEFORE_CLAIM_HISTORY })] }, { claimed: true, replayed: false }],
  ])("keeps today's claim for an assigned ask that is %s", async (_label, seed, result) => {
    seedHeldAsks(seed);
    expect(await claimCompanyReferralRequest(LINK_OWNER, REQUEST_ID)).toMatchObject(result);
    expect(askById()).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
    expect(reversalsOf()).toEqual([]);
  });

  it("refuses the allocated referrer's late claim on a queue-allocated ask nobody claimed (P0-allocated-ask-stuck)", async () => {
    seedHeldAsks({ asks: [stale()], slots: [allocatedSlot()] });
    await expect(claimCompanyReferralRequest(LINK_OWNER, REQUEST_ID)).rejects.toThrow(EXPIRED);
    expect(askById()).toMatchObject({ status: "pending", referrerId: LINK_OWNER, revision: 0 });
    expect(eventActions()).toEqual([]);
    expect(reversalsOf()).toEqual([]);
  });

  it("refuses a late claim on an unassigned stale ask, as today", async () => {
    seedHeldAsks({ asks: [stale({ referrerId: null })] });
    await expect(claimCompanyReferralRequest(COLLEAGUE, REQUEST_ID)).rejects.toThrow(EXPIRED);
    expect(askById()).toMatchObject({ status: "pending", referrerId: null });
  });
});

describe("the link owner's inbox", () => {
  it("drops a held ask past its 7 days like a stale unclaimed one, and keeps every assigned ask the held rule does not cover", async () => {
    seedHeldAsks({
      asks: [
        askRow({ id: 501 }),
        stale({ id: 502 }),
        stale({ id: 503 }),
        stale({ id: 504 }),
        stale({ id: 505, createdAt: BEFORE_CLAIM_HISTORY }),
        stale({ id: 506, referrerId: null }),
        askRow({ id: 507, referrerId: null }),
      ],
      events: [claimEvent(503)],
      slots: [allocatedSlot(504)],
    });
    // 501 held on day 2, 503 claimed, 505 pre-history and 507 unassigned on day 2 stay; 502 (held, day 8),
    // 504 (queue-allocated with no claim, day 8: P0-allocated-ask-stuck) and 506 (unassigned, day 8) are past their shelf life.
    expect(await inboxIds("new")).toEqual([501, 503, 505, 507]);
  });

  it("drops a saved held ask from the saved tab once it is past its 7 days", async () => {
    seedHeldAsks({ asks: [askRow({ id: 501 }), stale({ id: 502 })] });
    for (const id of [501, 502]) await store.db.insert(referralRequestSaves).values({ referralRequestId: id, referrerId: LINK_OWNER, createdAt: daysAgo(1) });
    expect(await inboxIds("saved")).toEqual([501]);
  });

  it("keeps listing, and reports, when the held check cannot be read; the claim still refuses the stale held ask", async () => {
    seedHeldAsks({ asks: [stale({ id: 502 })] });
    const select = store.db.select;
    store.db.select = (projection: Parameters<typeof select>[0]) => {
      const query = select(projection);
      const from = query.from;
      return Object.assign(query, { from: (table: MySqlTable) => { if (table === referralTransitionEvents) throw new Error("claim history unavailable"); return from(table); } });
    };
    try {
      expect(await inboxIds("new")).toEqual([502]);
    } finally {
      store.db.select = select;
    }
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ message: "claim history unavailable" }), { area: "referrer_inbox_stale_held" });
    await expect(claimCompanyReferralRequest(LINK_OWNER, 502)).rejects.toThrow(EXPIRED);
  });
});

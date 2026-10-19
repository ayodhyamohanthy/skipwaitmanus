import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_TTL_MS } from "../shared/referral";
import type { Row } from "./inMemoryDrizzle.testkit";
import { claimCompanyReferralRequest, expireStalePendingReferralRequest, getDb, listCompanyReferralInboxByState, oneClickReviewReferralRequest, reviewReferralRequest, withdrawCompanyReferralRequest } from "./db";
import { HELD_ASK_HISTORY_SINCE, listHeldForReferrerIds, selectStaleHeldAsks } from "./heldAsk";
import { DAY_MS, LINK_OWNER, NOW, REQUEST_ID, SEEKER, allocatedSlot, askById, askRow, daysAgo, reversalsOf, seedHeldAsks, store, type HeldSeed } from "./heldAsk.testkit";

/*
 * One D-050 rule, four readers: the seeker list's held flag, the sweep's held
 * selection, the link owner's inbox and the locked withdraw/expiry guard must
 * agree on every way an employee can act on a personal-link ask. Every ask here
 * is 8 days old. While it is still assigned to the link owner, held <=>
 * selected by the sweep <=> gone from the owner's inbox <=> withdraw succeeds
 * <=> the expiry closes it. A pass unassigns the ask, which then follows the
 * ordinary open-ask rule (refund unless it was ever claimed).
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const claim = async () => { await claimCompanyReferralRequest(LINK_OWNER, REQUEST_ID); };
const pass = async () => { await reviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "declined" }); };
const stale = (over: Row = {}): HeldSeed => ({ asks: [askRow({ createdAt: daysAgo(8), updatedAt: daysAgo(8), ...over })] });
/** Runs an employee's action on day 2 of the 8-day-old ask, as a real claim inside the shelf life happens. */
const onDay2 = (work: () => Promise<void>) => async () => {
  vi.setSystemTime(daysAgo(6));
  try { await work(); } finally { vi.setSystemTime(NOW); }
};
const lateClaim = async () => { await expect(claim()).rejects.toThrow(/expired before it could be claimed/); };

type Withdrawal = "refund" | "no refund" | "refused";
type Case = { acted: string; seed: HeldSeed; act: () => Promise<void>; held: boolean; inbox: boolean; withdrawal: Withdrawal; expires: boolean };
const CASES: readonly Case[] = [
  { acted: "nothing", seed: stale(), act: async () => undefined, held: true, inbox: false, withdrawal: "refund", expires: true },
  { acted: "a claim on day 2", seed: stale(), act: onDay2(claim), held: false, inbox: true, withdrawal: "refused", expires: false },
  { acted: "a late claim, refused", seed: stale(), act: lateClaim, held: true, inbox: false, withdrawal: "refund", expires: true },
  { acted: "a one-click approve", seed: stale(), act: async () => { await oneClickReviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "approved" }); }, held: false, inbox: false, withdrawal: "refused", expires: false },
  { acted: "a review approve", seed: stale(), act: async () => { await reviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "approved" }); }, held: false, inbox: false, withdrawal: "refused", expires: false },
  { acted: "a pass", seed: stale(), act: pass, held: false, inbox: false, withdrawal: "refund", expires: true },
  { acted: "a claim on day 2 then a pass", seed: stale(), act: onDay2(async () => { await claim(); await pass(); }), held: false, inbox: false, withdrawal: "no refund", expires: true },
  { acted: "a queue allocation", seed: { ...stale(), slots: [allocatedSlot()] }, act: async () => undefined, held: false, inbox: true, withdrawal: "refused", expires: false },
  { acted: "nothing, before the history cut-off", seed: stale({ createdAt: new Date(HELD_ASK_HISTORY_SINCE.getTime() - DAY_MS) }), act: async () => undefined, held: false, inbox: true, withdrawal: "refused", expires: false },
];

/** The ask as the seeker list reads it. */
function listedAsk(row: Row | undefined) {
  if (!row || typeof row.id !== "number" || typeof row.status !== "string" || !(row.createdAt instanceof Date)) throw new Error("fixture ask is incomplete");
  return { id: row.id, status: row.status, referrerId: typeof row.referrerId === "number" ? row.referrerId : null, createdAt: row.createdAt };
}

async function withdrawalOf(): Promise<Withdrawal> {
  try {
    const result = await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID);
    return result.creditRefunded ? "refund" : "no refund";
  } catch (error) {
    if (error instanceof Error && /can no longer be withdrawn/.test(error.message)) return "refused";
    throw error;
  }
}

describe("the held flag, the sweep selection, the owner's inbox and the locked guard agree (D-050)", () => {
  it.each(CASES)("after $acted", async ({ seed, act, held, inbox, withdrawal, expires }) => {
    const db = await getDb();
    if (!db) throw new Error("the in-memory database is not installed");

    seedHeldAsks(seed);
    await act();
    const stillAssigned = askById()?.referrerId === LINK_OWNER;
    const flagged = (await listHeldForReferrerIds(db, [listedAsk(askById())])).has(REQUEST_ID);
    const selected = (await selectStaleHeldAsks(db, { cutoff: new Date(NOW - ASK_TTL_MS), limit: 10 })).some(row => row.id === REQUEST_ID);
    const listed = (await listCompanyReferralInboxByState(LINK_OWNER, "new")).some(row => row.id === REQUEST_ID);
    expect({ flagged, selected, listed }).toEqual({ flagged: held, selected: held, listed: inbox });
    if (stillAssigned && askById()?.status === "pending") expect(listed).toBe(!held);
    expect(await withdrawalOf()).toBe(withdrawal);

    seedHeldAsks(seed);
    await act();
    const before = reversalsOf().length;
    const expiry = await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, NOW);
    expect(expiry.expired).toBe(expires);
    expect(reversalsOf().length - before).toBe(expires && withdrawal === "refund" ? 1 : 0);
    if (stillAssigned) expect([withdrawal !== "refused", expires]).toEqual([held, held]);
  });

  it("selects held asks of one seeker only when asked to", async () => {
    const db = await getDb();
    if (!db) throw new Error("the in-memory database is not installed");
    seedHeldAsks({ asks: [askRow({ createdAt: daysAgo(8) }), askRow({ id: 508, jobSeekerId: 8, createdAt: daysAgo(9) })] });
    const cutoff = new Date(NOW - ASK_TTL_MS);
    expect((await selectStaleHeldAsks(db, { cutoff, limit: 10 })).map(row => row.id).sort()).toEqual([501, 508]);
    expect((await selectStaleHeldAsks(db, { cutoff, limit: 10, jobSeekerId: SEEKER })).map(row => row.id)).toEqual([501]);
  });
});

describe("lock order (source pins)", () => {
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const heldSource = readFileSync(new URL("./heldAsk.ts", import.meta.url), "utf8");
  const slice = (source: string, start: string, end: string) => {
    const from = source.indexOf(start);
    expect(from).toBeGreaterThan(-1);
    return source.slice(from, source.indexOf(end, from));
  };

  it("reads claim and allocation history only after the ask row is locked, and locks what it reads", () => {
    for (const [start, end] of [["export async function withdrawCompanyReferralRequest", "async function refundReferralDebitTx"], ["export async function expireStalePendingReferralRequest", "export async function releaseFirstLookForRequest"], ["export async function claimCompanyReferralRequest", "export async function getClaimedCompanyReferralDetail"]] as const) {
      const fn = slice(db, start, end);
      const rowLock = fn.indexOf('.for("update")');
      expect(fn.slice(0, rowLock)).toContain(".from(referralRequests)");
      expect(fn.indexOf("heldForReferrerTx(tx")).toBeGreaterThan(rowLock);
    }
    const guard = slice(db, "async function heldForReferrerTx", "export async function withdrawCompanyReferralRequest");
    expect(guard.indexOf("referralWasClaimedTx(tx")).toBeGreaterThan(-1);
    expect(guard.indexOf("readQueueAllocationTx(tx")).toBeGreaterThan(guard.indexOf("referralWasClaimedTx(tx"));
    expect(slice(db, "async function referralWasClaimedTx", "async function heldForReferrerTx")).toContain('.for("update")');
    expect(slice(heldSource, "export async function readQueueAllocationTx", "export async function selectStaleHeldAsks")).toContain('.for("update")');
  });
});

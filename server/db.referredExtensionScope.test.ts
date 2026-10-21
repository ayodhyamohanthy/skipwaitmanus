import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { claimCompanyReferralRequest, extendReferredDeadlineTx, getClaimedCompanyReferralDetail, lapseReferredTx, listReferralTimerCandidates, reviewReferralRequest } from "./db";
import { COLLEAGUE, DAY_MS, LINK_OWNER, REQUEST_ID, askRow, seedHeldAsks, store } from "./heldAsk.testkit";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
// Part B's payload only carries the deadline fields while the switch is on (R-2); this file turns it
// on to observe the per-acceptance scoping that payload will serve on the day it flips.
vi.mock("../shared/referral", async () => {
  const actual = await vi.importActual<typeof import("../shared/referral")>("../shared/referral");
  return { ...actual, REFERRED_DEADLINE_ENABLED: true };
});

const HOUR = 60 * 60 * 1000;
/** The first acceptance, a day after the cut-off (REFERRAL_TIMERS_SINCE is 2026-10-20T00:00Z). */
const T0 = Date.parse("2026-10-21T12:00:00.000Z");
const FIRST_EXTENSION = T0 + DAY_MS;
const FIRST_LAPSE = T0 + 8 * DAY_MS + 1;
/** The reopened ask reaches a second employee, who accepts it. */
const T2 = T0 + 8 * DAY_MS + 2 * HOUR;
const SECOND_DUE = T2 + 5 * DAY_MS;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** claim → accept → extend to day 8 → lapse at day 8 → a colleague accepts the reopened ask.
 * The first acceptance's extension must never carry into the second acceptance (D-038-reconcile B-1). */
async function secondAcceptance(): Promise<void> {
  seedHeldAsks({ asks: [askRow({ referrerId: null, revision: 0, createdAt: new Date(T0 - HOUR), updatedAt: new Date(T0 - HOUR) })] });
  vi.setSystemTime(T0);
  await expect(claimCompanyReferralRequest(LINK_OWNER, REQUEST_ID)).resolves.toMatchObject({ claimed: true });
  await reviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "approved" });
  vi.setSystemTime(FIRST_EXTENSION);
  await expect(extendReferredDeadlineTx(store.db as never, REQUEST_ID, FIRST_EXTENSION)).resolves.toEqual({ extended: true });
  await expect(lapseReferredTx(store.db as never, REQUEST_ID, FIRST_LAPSE)).resolves.toEqual({ lapsed: true, reason: "lapsed_referred" });
  // The reopen hands the ask to a colleague (an allocation), who accepts it.
  vi.setSystemTime(T2);
  await store.db.update(referralRequests).set({ referrerId: COLLEAGUE, updatedAt: new Date(T2) }).where(eq(referralRequests.id, REQUEST_ID));
  await reviewReferralRequest(COLLEAGUE, { requestId: REQUEST_ID, decision: "approved" });
}

describe("D-038-reconcile B-1: the extension belongs to one acceptance", () => {
  it("a second acceptance starts at 5 days and has its own extension", async () => {
    await secondAcceptance();

    const detail = await getClaimedCompanyReferralDetail(COLLEAGUE, REQUEST_ID);
    expect(detail).toMatchObject({ status: "approved", extensionUsed: false, referredDueAt: new Date(SECOND_DUE).toISOString() });

    await expect(extendReferredDeadlineTx(store.db as never, REQUEST_ID, T2 + DAY_MS)).resolves.toEqual({ extended: true });
    await expect(extendReferredDeadlineTx(store.db as never, REQUEST_ID, T2 + DAY_MS + 1)).resolves.toEqual({ extended: false, replayed: true });
  });

  it("the lapse timer treats the second acceptance as due from day 5, not day 8", async () => {
    await secondAcceptance();
    await expect(lapseReferredTx(store.db as never, REQUEST_ID, SECOND_DUE + 1)).resolves.toEqual({ lapsed: true, reason: "lapsed_referred" });
  });

  it("the candidate list treats the second acceptance as due from day 5, not day 8", async () => {
    await secondAcceptance();
    const candidates = await listReferralTimerCandidates(50, SECOND_DUE + 1);
    expect(candidates.referredToLapse.map(candidate => candidate.id)).toContain(REQUEST_ID);
  });
});

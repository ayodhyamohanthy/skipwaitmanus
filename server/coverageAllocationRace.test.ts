import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { referralAvailabilitySlots, referralRequests } from "../drizzle/schema";
import { COLLEAGUE, REFERRER, REQUEST_ID, RESUME_ID, SEEKER, resetStore, store } from "./documentAccess.testkit";
import { getAccessibleReferralAttachment, getClaimedCompanyReferralDetail, openCompanyReferralAvailability, resolveAdminApproval } from "./db";

/*
 * D-019(e) / D-012(3): an accepted ask never gains a referrer who did not
 * accept it. The coverage allocator picks a pending, unclaimed ask that waits
 * for coverage, then assigns it. An administrator may approve that ask between
 * the allocator's SELECT and its UPDATE; the UPDATE must then match nothing,
 * or the new referrer would read the seeker's name on an accepted ask.
 * The race is staged on the real store over the in-memory database: the first
 * write to referralRequests inside the allocator's transaction runs the real
 * admin approval first.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

type Tx = Parameters<Parameters<typeof store.db.transaction>[0]>[0];
const race = { armed: false };

/** Runs the real admin approval just before the allocator's first write to referralRequests, once. */
function racingTx(tx: Tx): Tx {
  const update = (table: MySqlTable) => {
    if (!race.armed || table !== referralRequests) return tx.update(table);
    race.armed = false;
    const set: ReturnType<Tx["update"]>["set"] = values => ({
      where: async where => {
        await resolveAdminApproval(1, "referral_request", REQUEST_ID, "approved");
        return tx.update(table).set(values).where(where);
      },
    });
    return { set };
  };
  return { ...tx, update };
}
const racingDb = { ...store.db, transaction: <T>(run: (tx: Tx) => Promise<T>) => store.db.transaction(tx => run(racingTx(tx))) };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(racingDb);
  resetStore({ ask: { waitingForCoverage: true } });
  race.armed = false;
});
afterEach(() => { vi.unstubAllEnvs(); });

const ask = () => store.rows(referralRequests)[0];

describe("coverage allocation racing an admin approval", () => {
  it("without a race, allocates the waiting ask to the referrer who opened capacity (baseline)", async () => {
    const result = await openCompanyReferralAvailability(REFERRER, { slotCount: 1 });
    expect(result.allocatedRequestIds).toEqual([REQUEST_ID]);
    expect(ask()).toMatchObject({ status: "pending", referrerId: REFERRER, waitingForCoverage: false });
  });

  it("never assigns an ask an administrator approved between the allocator's read and its write", async () => {
    race.armed = true;
    const result = await openCompanyReferralAvailability(REFERRER, { slotCount: 1 });
    expect(race.armed).toBe(false);
    expect(result.allocatedRequestIds).toEqual([]);
    expect(ask()).toMatchObject({ status: "approved", referrerId: null });
    expect(store.rows(referralAvailabilitySlots)).toEqual([]);
    expect(await getClaimedCompanyReferralDetail(REFERRER, REQUEST_ID)).toBeUndefined();
    expect(await getAccessibleReferralAttachment(REFERRER, RESUME_ID)).toBeUndefined();
    expect(await getAccessibleReferralAttachment(COLLEAGUE, RESUME_ID)).toBeUndefined();
    expect(await getAccessibleReferralAttachment(SEEKER, RESUME_ID)).toMatchObject({ id: RESUME_ID });
  });
});

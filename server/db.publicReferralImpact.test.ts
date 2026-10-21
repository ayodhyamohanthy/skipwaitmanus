import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralRequests, referralTransitionEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { getPublicReferralImpact } from "./db";

/*
 * TRUTH-1 (D-066 (3), D-076 (8)): /api/referral-impact counts asks a referrer
 * accepted and that were not undone — the open accepted statuses, or closed
 * only when an acceptance transition exists for the ask. An expired ask is
 * closed with no acceptance and never counts, whether it was claimed or not.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const ask = (id: number, over: Row = {}): Row => full(referralRequests, { id, jobId: 11, jobSeekerId: 7, referrerId: null, status: "closed", createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z"), ...over });
const acceptance = (id: number, requestId: number): Row => full(referralTransitionEvents, { id, referralRequestId: requestId, operationKey: `approve:${id}`, actorUserId: 9, action: "approve", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 2, createdAt: new Date("2026-10-02T00:00:00Z") });

function seed(asks: readonly Row[], events: readonly Row[] = []) {
  store.reset([[referralRequests, asks], [referralTransitionEvents, events]]);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("getPublicReferralImpact (TRUTH-1)", () => {
  it("does not count an expired unclaimed ask (closed, no referrer, no acceptance)", async () => {
    seed([ask(1)]);
    expect(await getPublicReferralImpact()).toEqual({ acceptedReferrals: 0 });
  });

  it("does not count a claimed ask that expired without acceptance (closed, referrer set)", async () => {
    seed([ask(2, { referrerId: 9 })]);
    expect(await getPublicReferralImpact()).toEqual({ acceptedReferrals: 0 });
  });

  it("counts a hired ask (closed after acceptance)", async () => {
    seed([ask(3, { referrerId: 9 })], [acceptance(1, 3)]);
    expect(await getPublicReferralImpact()).toEqual({ acceptedReferrals: 1 });
  });

  it("counts approved, intro_made, interview and offer, not pending, withdrawn or declined", async () => {
    seed([
      ask(4, { status: "approved", referrerId: 9 }),
      ask(5, { status: "intro_made", referrerId: 9 }),
      ask(6, { status: "interview", referrerId: 9 }),
      ask(7, { status: "offer", referrerId: 9 }),
      ask(8, { status: "pending" }),
      ask(9, { status: "withdrawn" }),
      ask(10, { status: "declined" }),
    ]);
    expect(await getPublicReferralImpact()).toEqual({ acceptedReferrals: 4 });
  });

  it("does not count a closed ask whose only transition is the expiry itself", async () => {
    seed([ask(11)], [full(referralTransitionEvents, { id: 2, referralRequestId: 11, operationKey: "expire:11", actorUserId: 9, action: "expire", fromStatus: "pending", resultingStatus: "closed", resultingRevision: 3, createdAt: new Date("2026-10-09T00:00:00Z") })]);
    expect(await getPublicReferralImpact()).toEqual({ acceptedReferrals: 0 });
  });

  it("counts one accepted ask once across mixed rows", async () => {
    seed([ask(1), ask(3, { referrerId: 9 }), ask(4, { status: "approved", referrerId: 9 })], [acceptance(1, 3)]);
    expect(await getPublicReferralImpact()).toEqual({ acceptedReferrals: 2 });
  });
});

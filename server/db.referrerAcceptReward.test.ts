import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { companyCoverageInvitations, companyCoverageRewards, notifications, referralRequests, tokenBalances, tokenTransactions, workEmailOtpReceipts } from "../drizzle/schema";
import { REFERRER, REQUEST_ID, SEEKER, resetStore, store } from "./documentAccess.testkit";
import { REFERRER_ACCEPT_REWARDS_ENABLED, completeWorkEmailOtpEnrollment, fulfillCompanyCoverageInvitation, oneClickReviewReferralRequest } from "./db";

/*
 * D-055: SkipWait never pays referrers. Accepting an ask grants the referrer
 * nothing, a referrer-side pending reward written before D-055 stays exactly as
 * it was (no data change), and a completed coverage invite still records the
 * inviting seeker's reward while promising the joining referrer nothing. Runs
 * the real store (server/db.ts) over the in-memory drizzle client.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

/** A new acme.com employee who verifies a work email from a seeker's coverage invite. */
const JOINER = 12;
const INVITE_CODE = "cov-acme-1";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  resetStore();
});
afterEach(() => { vi.unstubAllEnvs(); });

const inviteFromSeeker = () => store.db.insert(companyCoverageInvitations).values({ id: 5, inviteCode: INVITE_CODE, inviterUserId: SEEKER, companyDomain: "acme.com", status: "active" });

/** The seeker side stays, the referrer side is gone: one pending row and one notice, both the inviter's. */
function expectInviterRewardOnly() {
  expect(store.rows(tokenTransactions).filter(row => row.kind === "invite_reward_pending")).toEqual([
    expect.objectContaining({ userId: SEEKER, role: "job_seeker", tokenCount: 1, rewardStatus: "pending" }),
  ]);
  expect(store.rows(notifications).map(row => [row.userId, row.title])).toEqual([[SEEKER, "Company coverage pending reward"]]);
  expect(store.rows(companyCoverageRewards)).toEqual([expect.objectContaining({ invitationId: 5, inviterUserId: SEEKER, joinerUserId: JOINER })]);
  expect(store.rows(companyCoverageInvitations)[0]).toMatchObject({ status: "completed", joinerUserId: JOINER });
}

describe("D-055: SkipWait never pays referrers", () => {
  it("ships with the referrer accept reward switched off", () => {
    expect(REFERRER_ACCEPT_REWARDS_ENABLED).toBe(false);
  });

  it("accepting an ask grants the referrer nothing, and their pending reward stays exactly as it was", async () => {
    // A coverage-invite joiner's pending credit written before D-055, waiting for a first accept.
    await store.db.insert(tokenBalances).values({ id: 82, userId: REFERRER, role: "referrer", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free" });
    await store.db.insert(tokenTransactions).values({ id: 90, userId: REFERRER, role: "referrer", tokenCount: 1, kind: "invite_reward_pending", rewardStatus: "pending" });
    const ledgerBefore = store.rows(tokenTransactions);
    const walletsBefore = store.rows(tokenBalances);

    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });

    expect(store.rows(referralRequests)[0]).toMatchObject({ status: "approved", referrerId: REFERRER });
    expect(store.rows(tokenTransactions)).toEqual(ledgerBefore);
    expect(store.rows(tokenBalances)).toEqual(walletsBefore);
    expect(store.rows(notifications).filter(row => row.userId === REFERRER)).toEqual([]);
  });

  it("a coverage invite still records the inviting seeker's reward and promises the joining referrer nothing", async () => {
    await inviteFromSeeker();
    const result = await fulfillCompanyCoverageInvitation(JOINER, { inviteCode: INVITE_CODE, workEmailDomain: "acme.com" });
    expect(result).toEqual({ rewarded: true, tokenCount: 1 });
    expectInviterRewardOnly();
  });

  it("the work-email code enrollment does the same for an invited joiner", async () => {
    await inviteFromSeeker();
    await store.db.insert(workEmailOtpReceipts).values({ id: 3, receiptHash: createHash("sha256").update("receipt-12").digest("hex"), email: "joiner@acme.com", userId: JOINER, purpose: "work_email_enrollment", expiresAt: new Date(Date.now() + 10 * 60_000), usedAt: null });
    const result = await completeWorkEmailOtpEnrollment({ receipt: "receipt-12", email: "joiner@acme.com", userId: JOINER, inviteCode: INVITE_CODE });
    expect(result).toEqual({ workEmailDomain: "acme.com", reward: { rewarded: true, tokenCount: 1 }, replayed: false });
    expectInviterRewardOnly();
  });
});

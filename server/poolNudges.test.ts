import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalPeople, jobs, messages, notifications, profiles, referralAttachments, referralAvailabilitySlots, referralRequestPasses, referralRequestSaves, referralRequests, referralTransitionEvents, userBlocks, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import * as db from "./db";
import { notifyColleaguesOfReleasedRequest } from "./poolNudges";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), enabled: true }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
// D-384 (4): the switch lives in shared/poolNudges.ts; server/db.ts, the routes and the job read it there.
vi.mock("../shared/poolNudges", () => ({
  get POOL_NUDGES_ENABLED() { return mocks.enabled; },
}));

const NOW = new Date("2026-11-24T12:00:00.000Z");
const HOUR = 3_600_000;
const ID = 601;
const SEEKER = 7;
const SEEKER_NAME = "Priya Sharma";
const RELEASER = 2;
const COLLEAGUE = 3;
const BLOCKED = 4;
const PASSED = 5;
const PAUSED = 6;
const OTHER_COMPANY_EMPLOYEE = 9;
const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });

function seed() {
  const visibleAt = new Date(NOW.getTime() - 49 * HOUR);
  store.reset([
    [canonicalPeople, []],
    [users, [
      full(users, { id: SEEKER, openId: "seeker", name: SEEKER_NAME, suspended: false }),
      full(users, { id: RELEASER, openId: "releaser", name: "Ravi", suspended: false }),
      full(users, { id: COLLEAGUE, openId: "colleague", name: "Chen", suspended: false }),
      full(users, { id: BLOCKED, openId: "blocked", name: "Bela", suspended: false }),
      full(users, { id: PASSED, openId: "passed", name: "Pia", suspended: false }),
      full(users, { id: PAUSED, openId: "paused", name: "Paul", suspended: false }),
      full(users, { id: OTHER_COMPANY_EMPLOYEE, openId: "other", name: "Omar", suspended: false }),
    ]],
    [profiles, [
      full(profiles, { id: 21, userId: RELEASER, accountType: "referrer", workEmailDomain: "example.com", workEmailVerifiedAt: NOW, paused: false, referralCapacity: 3 }),
      full(profiles, { id: 22, userId: COLLEAGUE, accountType: "referrer", workEmailDomain: "example.com", workEmailVerifiedAt: NOW, paused: false, referralCapacity: 3 }),
      full(profiles, { id: 23, userId: BLOCKED, accountType: "referrer", workEmailDomain: "example.com", workEmailVerifiedAt: NOW, paused: false, referralCapacity: 3 }),
      full(profiles, { id: 24, userId: PASSED, accountType: "referrer", workEmailDomain: "example.com", workEmailVerifiedAt: NOW, paused: false, referralCapacity: 3 }),
      full(profiles, { id: 25, userId: PAUSED, accountType: "referrer", workEmailDomain: "example.com", workEmailVerifiedAt: NOW, paused: true, referralCapacity: 3 }),
      full(profiles, { id: 26, userId: OTHER_COMPANY_EMPLOYEE, accountType: "referrer", workEmailDomain: "other.com", workEmailVerifiedAt: NOW, paused: false, referralCapacity: 3 }),
    ]],
    [jobs, [
      full(jobs, { id: 11, company: "example.com", title: "Engineer", targetRoleUrl: "https://careers.example.com/job/1" }),
      full(jobs, { id: 12, company: "other.com", title: "Designer", targetRoleUrl: "https://careers.other.com/job/2" }),
    ]],
    [referralRequests, [
      full(referralRequests, { id: ID, jobId: 11, jobSeekerId: SEEKER, referrerId: RELEASER, status: "pending", revision: 0, waitingForCoverage: false, coverageVisibleAt: visibleAt, createdAt: visibleAt, updatedAt: visibleAt }),
      full(referralRequests, { id: 602, jobId: 12, jobSeekerId: SEEKER, referrerId: null, status: "pending", revision: 0, waitingForCoverage: true, coverageVisibleAt: null, createdAt: visibleAt, updatedAt: visibleAt }),
      full(referralRequests, { id: 603, jobId: 11, jobSeekerId: SEEKER, referrerId: null, status: "pending", revision: 0, waitingForCoverage: true, coverageVisibleAt: null, createdAt: visibleAt, updatedAt: visibleAt }),
      full(referralRequests, { id: 604, jobId: 11, jobSeekerId: SEEKER, referrerId: COLLEAGUE, status: "pending", revision: 0, waitingForCoverage: false, coverageVisibleAt: visibleAt, createdAt: visibleAt, updatedAt: visibleAt }),
    ]],
    [referralAvailabilitySlots, [full(referralAvailabilitySlots, { id: 71, referrerId: RELEASER, companyDomain: "example.com", referralRequestId: ID, status: "allocated", activeRequestKey: `request:${ID}` })]],
    [referralRequestPasses, [full(referralRequestPasses, { id: 81, referralRequestId: ID, referrerId: PASSED, reason: "timing", reasonCode: "cannot_support" })]],
    [userBlocks, [full(userBlocks, { id: 91, blockerUserId: SEEKER, blockedUserId: BLOCKED })]],
    ...[referralTransitionEvents, notifications, messages, referralAttachments, referralRequestSaves].map(table => [table, []] as const),
  ]);
}
const releaseNotices = () => store.rows(notifications).filter(row => row.kind === "ask_released");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.enabled = true;
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  seed();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("D-193 pool nudges: waiting count", () => {
  it("counts only the referrer's own company's waiting pool", async () => {
    expect(await db.countWaitingPoolRequestsForReferrer(RELEASER)).toBe(1);
    expect(await db.countWaitingPoolRequestsForReferrer(OTHER_COMPANY_EMPLOYEE)).toBe(1);
    expect(await db.countWaitingPoolRequestsForReferrer(SEEKER)).toBe(0);
  });

  it("adds waitingCount to the inbox only while the switch is on", async () => {
    const app = appForInbox();
    const on = await request(app).get("/api/company-referrals/inbox").set("x-test-user", String(RELEASER));
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ waitingCount: 1 });
    mocks.enabled = false;
    const off = await request(app).get("/api/company-referrals/inbox").set("x-test-user", String(RELEASER));
    expect(off.status).toBe(200);
    expect(off.body).not.toHaveProperty("waitingCount");
  });
});

describe("D-193 pool nudges: released to colleagues", () => {
  it("notifies the company's other verified colleagues on a 48 h allocation lapse, never by the seeker's name", async () => {
    const result = await store.db.transaction(tx => db.lapseAllocationTx(tx, ID, NOW.getTime()));
    expect(result).toEqual({ lapsed: true, reason: "lapsed_allocation" });
    const notices = releaseNotices();
    expect(notices.map(row => row.userId)).toEqual([COLLEAGUE]);
    expect(notices[0]).toMatchObject({ refId: ID, category: "referral" });
    expect(JSON.stringify(notices)).not.toContain(SEEKER_NAME);
  });

  it("notifies colleagues when a pass releases a claimed request", async () => {
    const result = await db.oneClickReviewReferralRequest(RELEASER, { requestId: ID, decision: "declined", declineReason: "cannot_support" });
    expect(result.reopened).toBe(true);
    expect(releaseNotices().map(row => row.userId)).toEqual([COLLEAGUE]);
  });

  it("writes one notice per colleague per release event, even when the notifier runs twice", async () => {
    const input = { requestId: ID, companyDomain: "example.com", seekerUserId: SEEKER, releasingReferrerId: RELEASER, revision: 1 };
    await store.db.transaction(tx => notifyColleaguesOfReleasedRequest(tx, input));
    await store.db.transaction(tx => notifyColleaguesOfReleasedRequest(tx, input));
    expect(releaseNotices()).toHaveLength(1);
  });

  it("does nothing while the switch is off", async () => {
    mocks.enabled = false;
    const result = await store.db.transaction(tx => db.lapseAllocationTx(tx, ID, NOW.getTime()));
    expect(result.lapsed).toBe(true);
    expect(releaseNotices()).toEqual([]);
  });
});

function appForInbox() {
  const unused = async () => { throw new Error("Unexpected unrelated dependency"); };
  const deps: PrivateReferralRouteDeps = {
    resolveIdentity: async req => {
      const id = Number(req.header("x-test-user"));
      return id ? { account: { id, openId: `test-${id}` } } : undefined;
    },
    dataUrlToBuffer: () => Buffer.alloc(0), sanitizeDocumentName: value => value,
    storagePut: unused, storageGetSignedUrl: unused, createReferralAttachment: unused, getAccessibleReferralAttachment: unused,
    saveVerifiedWorkEmail: unused, createCompanyReferralRequest: unused, listCompanyReferralInbox: async () => [],
    claimCompanyReferralRequest: unused, getClaimedCompanyReferralDetail: unused,
    extendReferredDeadlineTx: unused, stepBackFromReferral: unused, confirmReferredBySeeker: unused, lapseReferredTx: unused,
    listPublicCompanyOpportunities: unused, publishCompanyOpportunity: unused,
    countWaitingPoolRequestsForReferrer: db.countWaitingPoolRequestsForReferrer,
  };
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, deps);
  return app;
}

import { eq, getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalPeople, jobs, notifications, operationalActivityLogs, planCreditGrants, profiles, promoCreditGrants, referralAttachments, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, userBlocks, users } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { askReconfirmResponseSchema } from "../shared/askReconfirm";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import * as db from "./db";
import { createCoverageDeliverySweep } from "./coverageDeliverySweep";
import express from "express";
import request from "supertest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), enabled: true }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("../shared/askReconfirm", async importOriginal => ({
  ...await importOriginal<typeof import("../shared/askReconfirm")>(),
  get ASK_RECONFIRM_ENABLED() { return mocks.enabled; },
}));

const NOW = new Date("2026-11-21T12:00:00.000Z");
const DAY = 86_400_000;
const ID = 501;
const SEEKER = 7;
const REFERRER = 2;
const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });

function seed(age = 31, held = true) {
  const createdAt = new Date(NOW.getTime() - age * DAY);
  store.reset([
    [canonicalPeople, []],
    [users, [full(users, { id: SEEKER, openId: "seeker", suspended: false }), full(users, { id: REFERRER, openId: "employee", suspended: false })]],
    [profiles, [full(profiles, { id: 31, userId: REFERRER, accountType: "referrer", workEmailDomain: "example.com", workEmailVerifiedAt: NOW, paused: false, referralCapacity: 3 })]],
    [jobs, [full(jobs, { id: 11, company: "example.com", title: "Engineer", targetRoleUrl: "https://careers.example.com/job/1" })]],
    [referralRequests, [full(referralRequests, { id: ID, jobId: 11, jobSeekerId: SEEKER, referrerId: null, status: "pending", revision: 0, waitingForCoverage: true, coverageQueuedAt: createdAt, coverageHeldAt: held ? createdAt : null, debitTransactionId: null, createdAt, updatedAt: createdAt })]],
    [tokenBalances, [full(tokenBalances, { id: 81, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(NOW), plan: "free" })]],
    ...[tokenTransactions, planCreditGrants, promoCreditGrants, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralTransitionEvents, notifications, operationalActivityLogs, userBlocks, referralAttachments].map(table => [table, []] as const),
  ]);
}
const actions = (action: string) => store.rows(referralTransitionEvents).filter(row => row.action === action);
const spends = () => store.rows(tokenTransactions).filter(row => row.kind === "credit_spend");
const deliver = () => db.tryDeliverWaitingAsk(ID, NOW.getTime());

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("BANDED_SALES_ENABLED", "false");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.enabled = true;
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  seed();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("D-193 old waiting request reconfirmation", () => {
  it("ships off and validates only the confirmation response contract", async () => {
    const actual = await vi.importActual<typeof import("../shared/askReconfirm")>("../shared/askReconfirm");
    expect(actual.ASK_RECONFIRM_ENABLED).toBe(false);
    expect(actual.RECONFIRM_AFTER_DAYS).toBe(30);
    expect(askReconfirmResponseSchema.parse({ requestId: ID, confirmed: true })).toEqual({ requestId: ID, confirmed: true });
    for (const value of [{ requestId: 0, confirmed: true }, { requestId: ID, confirmed: false }, { requestId: ID, confirmed: true, extra: 1 }]) {
      expect(askReconfirmResponseSchema.safeParse(value).success).toBe(false);
    }
  });

  it.each([true, false])("the sweep preserves an old request (held=%s), writes one event/notice and spends nothing", async held => {
    seed(31, held);
    const sweep = createCoverageDeliverySweep({ listWaiting: async () => held ? [] : [{ id: ID }], listHeld: async () => held ? [{ id: ID }] : [], deliver: db.tryDeliverWaitingAsk });
    await sweep({ nowMs: NOW.getTime(), windowKey: "one" });
    await sweep({ nowMs: NOW.getTime(), windowKey: "two" });
    expect(await deliver()).toEqual({ outcome: "awaiting_reconfirm", requestId: ID });
    expect(actions("reconfirm_requested")).toHaveLength(1);
    expect(store.rows(notifications)).toEqual([expect.objectContaining({ userId: SEEKER, eventKey: `ask-reconfirm:${ID}` })]);
    expect(store.rows(referralRequests)[0]).toMatchObject({ status: "pending", waitingForCoverage: true, referrerId: null, coverageHeldAt: held ? new Date(NOW.getTime() - 31 * DAY) : null });
    expect(store.rows(referralAvailabilitySlots)).toEqual([]);
    expect(store.rows(tokenBalances)[0]).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(spends()).toEqual([]);
  });

  it("also gates the enrollment and availability-opening handoff", async () => {
    expect(await db.deliverWaitingAsksToReferrer(REFERRER, "example.com", NOW.getTime())).toEqual({ delivered: 0, held: 0, skipped: 1 });
    expect(actions("reconfirm_requested")).toHaveLength(1);
    expect(spends()).toEqual([]);
  });

  it("confirms once, retries after delivery and spends only under the existing key", async () => {
    await deliver();
    expect(await db.reconfirmWaitingAsk(SEEKER, ID, NOW.getTime())).toEqual({ requestId: ID, confirmed: true });
    expect(await db.reconfirmWaitingAsk(SEEKER, ID, NOW.getTime())).toEqual({ requestId: ID, confirmed: true });
    expect(actions("reconfirmed")).toHaveLength(1);
    expect(spends()).toEqual([expect.objectContaining({ idempotencyKey: `ask-delivery:${ID}#1`, tokenCount: -1 })]);
    expect(store.rows(referralAvailabilitySlots)).toHaveLength(1);
    expect(actions("reconfirmed")[0]).toMatchObject({ resultingRevision: 2 });
  });

  it("keeps consent durable while capacity is gone, and delivers on a later retry", async () => {
    await deliver();
    await store.db.update(profiles).set({ paused: true }).where(eq(profiles.userId, REFERRER));
    await db.reconfirmWaitingAsk(SEEKER, ID, NOW.getTime());
    expect(spends()).toEqual([]);
    await store.db.update(profiles).set({ paused: false }).where(eq(profiles.userId, REFERRER));
    expect(await db.tryDeliverWaitingAsk(ID, NOW.getTime() + 60 * DAY)).toMatchObject({ outcome: "delivered" });
    expect(actions("reconfirm_requested")).toHaveLength(1);
    expect(actions("reconfirmed")).toHaveLength(1);
    expect(spends()).toHaveLength(1);
  });

  it("allows withdrawal while awaiting, then refuses confirmation without spending", async () => {
    await deliver();
    await db.withdrawCompanyReferralRequest(SEEKER, ID);
    await expect(db.reconfirmWaitingAsk(SEEKER, ID, NOW.getTime())).rejects.toMatchObject({ reason: "not_awaiting" });
    expect(actions("reconfirmed")).toEqual([]);
    expect(spends()).toEqual([]);
  });

  it("uses the same missing result for another seeker, referrer or nonexistent request", async () => {
    await deliver();
    for (const [userId, requestId] of [[8, ID], [REFERRER, ID], [SEEKER, 999]]) {
      await expect(db.reconfirmWaitingAsk(userId, requestId, NOW.getTime())).rejects.toMatchObject({ reason: "missing" });
    }
    expect(actions("reconfirmed")).toEqual([]);
    expect(spends()).toEqual([]);
  });

  it("does not allow confirmation before a request is awaiting it", async () => {
    await expect(db.reconfirmWaitingAsk(SEEKER, ID, NOW.getTime())).rejects.toMatchObject({ reason: "not_awaiting" });
    expect(actions("reconfirmed")).toEqual([]);
  });

  it("projects awaiting consent only on this seeker's own still-waiting requests", async () => {
    await deliver();
    expect(await db.listJobSeekerCompanyReferrals(SEEKER)).toEqual([expect.objectContaining({ id: ID, awaitingReconfirm: true })]);
    expect(await db.listJobSeekerCompanyReferrals(8)).toEqual([]);
    await db.reconfirmWaitingAsk(SEEKER, ID, NOW.getTime());
    expect(await db.listJobSeekerCompanyReferrals(SEEKER)).toEqual([expect.objectContaining({ id: ID, awaitingReconfirm: false })]);
  });

  it("fails closed before spending if the durable consent history is unreadable", async () => {
    store.failReads(referralTransitionEvents);
    await expect(deliver()).rejects.toThrow();
    expect(spends()).toEqual([]);
    expect(store.rows(notifications)).toEqual([]);
    expect(store.rows(referralRequests)[0]).toMatchObject({ waitingForCoverage: true, revision: 0 });
  });

  it("retains committed consent when delivery fails so a later retry can recover", async () => {
    await deliver();
    store.failReads(tokenBalances);
    await expect(db.reconfirmWaitingAsk(SEEKER, ID, NOW.getTime())).rejects.toThrow();
    expect(actions("reconfirmed")).toHaveLength(1);
    expect(store.rows(referralRequests)[0]).toMatchObject({ waitingForCoverage: true, referrerId: null });
    expect(spends()).toEqual([]);
  });

  it.each([29, 30])("delivers a %s-day-old request without a reconfirmation", async age => {
    seed(age);
    expect(await deliver()).toMatchObject({ outcome: "delivered" });
    expect(actions("reconfirm_requested")).toEqual([]);
    expect(spends()).toHaveLength(1);
  });

  it("keeps delivery unchanged and refuses confirmation with the switch off", async () => {
    mocks.enabled = false;
    await expect(db.reconfirmWaitingAsk(SEEKER, ID, NOW.getTime())).rejects.toMatchObject({ reason: "disabled" });
    expect(await deliver()).toMatchObject({ outcome: "delivered" });
    expect(actions("reconfirm_requested")).toEqual([]);
    expect(spends()).toHaveLength(1);
  });
});

function appForConfirmation() {
  const unused = async () => { throw new Error("Unexpected unrelated dependency"); };
  const deps: PrivateReferralRouteDeps = {
    resolveIdentity: async req => {
      const id = Number(req.header("x-test-user"));
      return id ? { account: { id, openId: `test-${id}` } } : undefined;
    },
    dataUrlToBuffer: () => Buffer.alloc(0), sanitizeDocumentName: value => value,
    storagePut: unused, storageGetSignedUrl: unused, createReferralAttachment: unused, getAccessibleReferralAttachment: unused,
    saveVerifiedWorkEmail: unused, createCompanyReferralRequest: unused, listCompanyReferralInbox: unused,
    claimCompanyReferralRequest: unused, getClaimedCompanyReferralDetail: unused,
    extendReferredDeadlineTx: unused, stepBackFromReferral: unused, confirmReferredBySeeker: unused, lapseReferredTx: unused,
    listPublicCompanyOpportunities: unused, publishCompanyOpportunity: unused,
    reconfirmWaitingAsk: db.reconfirmWaitingAsk,
  };
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, deps);
  return app;
}

describe("reconfirmation HTTP boundary", () => {
  it("requires sign-in and denies another seeker exactly like a missing request", async () => {
    await deliver();
    const app = appForConfirmation();
    expect((await request(app).post(`/api/company-referrals/${ID}/reconfirm`).send({})).status).toBe(401);
    const other = await request(app).post(`/api/company-referrals/${ID}/reconfirm`).set("x-test-user", "8").send({});
    const missing = await request(app).post("/api/company-referrals/999/reconfirm").set("x-test-user", "7").send({});
    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(other.body).toEqual(missing.body);
    expect(other.headers["cache-control"]).toBe("private, no-store");
    expect(spends()).toEqual([]);
  });

  it("refuses malformed ids and body overrides before mutation, then confirms the authenticated owner", async () => {
    await deliver();
    const app = appForConfirmation();
    for (const id of ["0", "501garbage", "9007199254740993"]) {
      expect((await request(app).post(`/api/company-referrals/${id}/reconfirm`).set("x-test-user", "7").send({})).status).toBe(400);
    }
    expect((await request(app).post(`/api/company-referrals/${ID}/reconfirm`).set("x-test-user", "7").send({ userId: 8 })).status).toBe(400);
    const ok = await request(app).post(`/api/company-referrals/${ID}/reconfirm`).set("x-test-user", "7").send({});
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ requestId: ID, confirmed: true });
    expect(spends()).toHaveLength(1);
  });

  it("refuses the dormant action without touching identity or the database", async () => {
    mocks.enabled = false;
    const response = await request(appForConfirmation()).post(`/api/company-referrals/${ID}/reconfirm`).send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("not_available_yet");
    expect(store.rows(referralTransitionEvents)).toEqual([]);
    expect(spends()).toEqual([]);
  });
});

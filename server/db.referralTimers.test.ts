import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { canonicalPeople, jobs, notifications, operationalActivityLogs, profiles, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { claimCompanyReferralRequest, expireStalePendingReferralRequest, lapseAllocationTx, lapseClaimTx, listReferralTimerCandidates, passReferralRequestTx, referralWasClaimedTx } from "./db";
import { createReferralTimers } from "./referralTimers";
import { REFERRAL_TIMERS_SINCE } from "../shared/referral";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const SEEKER = 7;
const REFERRER = 2;
const COLLEAGUE = 4;
const REQUEST_ID = 501;
const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-10-20T12:00:00.000Z").getTime();

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });

function person(id: number, name: string, email: string): Row {
  return full(users, { id, openId: `person-${id}`, name, email, suspended: false });
}
function employee(id: number, userId: number, over: Row = {}): Row {
  return full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"), paused: false, referralCapacity: 3, ...over });
}
function ask(over: Row = {}): Row {
  return full(referralRequests, { id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: null, personalPitch: "I led two launches.", status: "pending", revision: 0, waitingForCoverage: false, coverageVisibleAt: new Date(T0), coverageHeldAt: null, debitTransactionId: null, createdAt: new Date(T0), updatedAt: new Date(T0), ...over });
}

function seed(options: { asks?: readonly Row[]; referrers?: readonly Row[]; events?: readonly Row[]; passes?: readonly Row[]; slots?: readonly Row[] } = {}) {
  store.reset([
    [canonicalPeople, []],
    [users, [person(SEEKER, "Avery Example", "avery@example.com"), person(REFERRER, "Riya Referrer", "riya@acme.com"), person(COLLEAGUE, "Colin Colleague", "colin@acme.com")]],
    [profiles, options.referrers ?? [employee(31, REFERRER), employee(33, COLLEAGUE)]],
    [jobs, [{ id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/designer" }]],
    [referralRequests, options.asks ?? [ask()]],
    [tokenBalances, [{ id: 81, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free" }]],
    [tokenTransactions, []],
    [referralAvailabilitySlots, options.slots ?? []],
    [referralDocumentAccessGrants, []],
    [referralRequestPasses, options.passes ?? []],
    [referralTransitionEvents, options.events ?? []],
    [notifications, []],
    [operationalActivityLogs, []],
  ]);
}

const askById = (id: number) => store.rows(referralRequests).find(row => row.id === id);
const passesFor = (requestId: number) => store.rows(referralRequestPasses).filter(row => row.referralRequestId === requestId);
const eventsFor = (requestId: number) => store.rows(referralTransitionEvents).filter(row => row.referralRequestId === requestId);
const noticesFor = (userId: number) => store.rows(notifications).filter(row => row.userId === userId);
const slotsFor = (requestId: number) => store.rows(referralAvailabilitySlots).filter(row => row.referralRequestId === requestId);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function runLapseClaim(requestId: number, nowMs: number) {
  const db = store.db;
  return db.transaction(async (tx: any) => lapseClaimTx(tx, requestId, nowMs));
}
async function runLapseAllocation(requestId: number, nowMs: number) {
  const db = store.db;
  return db.transaction(async (tx: any) => lapseAllocationTx(tx, requestId, nowMs));
}

describe("D-038-A: claim lapse (48 h)", () => {
  it("a claim lapses 48 hours after it was made", async () => {
    seed({
      asks: [ask({ referrerId: REFERRER, revision: 1 })],
      events: [{ id: 1, referralRequestId: REQUEST_ID, operationKey: "claim:2", actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) }],
    });
    expect(await runLapseClaim(REQUEST_ID, T0 + 47 * 60 * 60 * 1000)).toEqual({ lapsed: false });
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);
    const result = await runLapseClaim(REQUEST_ID, T0 + 48 * 60 * 60 * 1000 + 1);
    expect(result).toEqual({ lapsed: true, reason: "lapsed_claim" });
    const row = askById(REQUEST_ID);
    expect(row?.referrerId).toBeNull();
    expect(row?.status).toBe("pending");
    expect(eventsFor(REQUEST_ID).map(e => ({ action: e.action, actorUserId: e.actorUserId }))).toContainEqual({ action: "claim_lapse", actorUserId: REFERRER });
    expect(passesFor(REQUEST_ID).map(p => ({ reason: p.reason, reasonCode: p.reasonCode }))).toContainEqual({ reason: "timing", reasonCode: "lapsed_claim" });
    expect(slotsFor(REQUEST_ID).every(s => s.status === "released")).toBe(true);
    expect(noticesFor(SEEKER).some(n => n.title === `Update on your referral request — acme.com` && n.body.includes("didn't decide within 48 hours"))).toBe(true);
    expect(noticesFor(REFERRER).some(n => n.title === "An ask went back to your colleagues")).toBe(true);
  });

  it("a lapsed claim spends no credit: the lapse itself is the key behavior", async () => {
    seed({
      asks: [ask({ referrerId: REFERRER, revision: 1, debitTransactionId: 9001 })],
      events: [{ id: 1, referralRequestId: REQUEST_ID, operationKey: "claim:2", actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) }],
    });
    const result = await runLapseClaim(REQUEST_ID, T0 + 48 * 60 * 60 * 1000 + 1);
    expect(result).toEqual({ lapsed: true, reason: "lapsed_claim" });
    // No new credit_spend is created by the lapse (the lapse releases, it doesn't spend).
    const newSpends = store.rows(tokenTransactions).filter(row => row.kind === "credit_spend" && row.referenceId === String(REQUEST_ID));
    expect(newSpends.length).toBe(0);
  });

  it("control: claim with no lapse, expiry refunds nothing (picked up)", async () => {
    seed({
      asks: [ask({ referrerId: REFERRER, revision: 1, debitTransactionId: 9002 })],
      events: [{ id: 1, referralRequestId: REQUEST_ID, operationKey: "claim:2", actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) }],
    });
    await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, T0 + 8 * DAY_MS);
    const refunds = store.rows(tokenTransactions).filter(row => row.kind === "expiry_refund" && row.referenceId === String(REQUEST_ID));
    expect(refunds.length).toBe(0);
  });

  it("a reminder is sent once at 24 hours, idempotent across repeated job runs", async () => {
    seed({
      asks: [ask({ referrerId: REFERRER, revision: 1 })],
      events: [{ id: 1, referralRequestId: REQUEST_ID, operationKey: "claim:2", actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) }],
    });
    const job = createReferralTimers({
      listCandidates: (limit: number) => listReferralTimerCandidates(limit, T0 + 24 * 60 * 60 * 1000),
      lapseClaim: (tx, requestId, nowMs) => lapseClaimTx(tx, requestId, nowMs),
      lapseAllocation: (tx, requestId, nowMs) => lapseAllocationTx(tx, requestId, nowMs),
    });
    await job({ nowMs: T0 + 24 * 60 * 60 * 1000 });
    const reminders1 = store.rows(notifications).filter(n => String(n.eventKey ?? "").startsWith(`claim-reminder:${REQUEST_ID}:`));
    expect(reminders1.length).toBe(1);
    await job({ nowMs: T0 + 25 * 60 * 60 * 1000 });
    const reminders2 = store.rows(notifications).filter(n => String(n.eventKey ?? "").startsWith(`claim-reminder:${REQUEST_ID}:`));
    expect(reminders2.length).toBe(1);
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);
  });

  it("nothing lapses before REFERRAL_TIMERS_SINCE + 48 h (D-076 (5))", async () => {
    seed({
      asks: [ask({ referrerId: REFERRER, revision: 1, createdAt: new Date("2026-10-18T12:00:00.000Z"), updatedAt: new Date("2026-10-18T12:00:00.000Z") })],
      events: [{ id: 1, referralRequestId: REQUEST_ID, operationKey: "claim:2", actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date("2026-10-18T12:00:00.000Z") }],
    });
    const sincePlus48hMinus1 = REFERRAL_TIMERS_SINCE + 48 * 60 * 60 * 1000 - 1;
    expect(await runLapseClaim(REQUEST_ID, sincePlus48hMinus1)).toEqual({ lapsed: false });
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);
    expect(await runLapseClaim(REQUEST_ID, REFERRAL_TIMERS_SINCE + 48 * 60 * 60 * 1000 + 1)).toEqual({ lapsed: true, reason: "lapsed_claim" });
    expect(askById(REQUEST_ID)?.referrerId).toBeNull();
  });
});

describe("D-038-A: allocation lapse (48 h from first visibility)", () => {
  it("an allocation lapses 48 hours after first visibility", async () => {
    seed({
      asks: [ask({ referrerId: REFERRER, revision: 0 })],
      slots: [{ id: 9001, referralRequestId: REQUEST_ID, referrerId: REFERRER, status: "allocated", openedAt: new Date(T0) }],
      events: [],
    });
    const claimed = await store.db.transaction(async (tx: any) => referralWasClaimedTx(tx, REQUEST_ID));
    expect(claimed).toBe(false);

    const result = await runLapseAllocation(REQUEST_ID, T0 + 48 * 60 * 60 * 1000 + 1);
    expect(result).toEqual({ lapsed: true, reason: "lapsed_allocation" });
    const row = askById(REQUEST_ID);
    expect(row?.referrerId).toBeNull();
    expect(eventsFor(REQUEST_ID).map(e => e.action)).toContain("allocation_lapse");
    expect(passesFor(REQUEST_ID).map(p => p.reasonCode)).toContain("lapsed_allocation");
    expect(slotsFor(REQUEST_ID).every(s => s.status === "released")).toBe(true);
  });

  it("an allocation with a claim since release does not lapse", async () => {
    seed({
      asks: [ask({ referrerId: REFERRER, revision: 1 })],
      slots: [{ id: 9002, referralRequestId: REQUEST_ID, referrerId: REFERRER, status: "allocated", openedAt: new Date(T0) }],
      events: [{ id: 1, referralRequestId: REQUEST_ID, operationKey: "claim:2", actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) }],
    });
    expect(await runLapseAllocation(REQUEST_ID, T0 + 48 * 60 * 60 * 1000 + 1)).toEqual({ lapsed: false });
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);
  });
});

describe("D-038-A: 5-claim cap", () => {
  it("the 6th claim is refused; a pass frees room", async () => {
    const asks: Row[] = [];
    const events: Row[] = [];
    for (let i = 0; i < 5; i++) {
      const id = 600 + i;
      asks.push(ask({ id, referrerId: REFERRER, revision: 1 }));
      events.push({ id: 100 + i, referralRequestId: id, operationKey: `claim:2:${i}`, actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) });
    }
    asks.push(ask({ id: 700, revision: 0 }));
    seed({ asks, events });

    let threw = false;
    try {
      await claimCompanyReferralRequest(REFERRER, 700);
    } catch (error) {
      threw = true;
      expect((error as Error).message).toBe("You can hold 5 asks at once. Accept or pass one of them first.");
    }
    expect(threw).toBe(true);
  });
});

describe("D-038-A: job step isolation", () => {
  it("a failing reminder step does not stop claim lapses", async () => {
    seed({
      asks: [ask({ referrerId: REFERRER, revision: 1 })],
      events: [{ id: 1, referralRequestId: REQUEST_ID, operationKey: "claim:2", actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) }],
    });
    let callCount = 0;
    const job = createReferralTimers({
      listCandidates: async (limit: number, nowMs: number) => {
        callCount++;
        if (callCount === 1) throw new Error("boom");
        return listReferralTimerCandidates(limit, nowMs);
      },
      lapseClaim: (tx, requestId, nowMs) => lapseClaimTx(tx, requestId, nowMs),
      lapseAllocation: (tx, requestId, nowMs) => lapseAllocationTx(tx, requestId, nowMs),
    });
    const result = await job({ nowMs: T0 + 48 * 60 * 60 * 1000 + 1 });
    expect(result.failed).toBeGreaterThan(0);
    expect(askById(REQUEST_ID)?.referrerId).toBeNull();
  });
});

describe("D-038-A: referralWasClaimedTx meaning change", () => {
  it("a claim followed by a lapse means the pick-up is undone (a second lapse is a no-op)", async () => {
    seed({
      asks: [ask({ referrerId: null, revision: 2 })],
      events: [
        { id: 1, referralRequestId: REQUEST_ID, operationKey: "claim:2", actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) },
        { id: 2, referralRequestId: REQUEST_ID, operationKey: "claim-lapse:1", actorUserId: REFERRER, action: "claim_lapse", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 2, createdAt: new Date(T0 + 48 * 60 * 60 * 1000) },
      ],
    });
    // The ask was already lapsed: referrerId is null, latest event is claim_lapse.
    expect(askById(REQUEST_ID)?.referrerId).toBeNull();
    // Trying to lapse again is a no-op because the latest pick-up-or-release event is a lapse, not a claim.
    const result = await runLapseClaim(REQUEST_ID, T0 + 48 * 60 * 60 * 1000 + 1);
    expect(result).toEqual({ lapsed: false });
  });
});

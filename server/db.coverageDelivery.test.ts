import { getTableColumns } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askInviteLinks, canonicalPeople, jobs, notifications, operationalActivityLogs, planCreditGrants, profiles, promoCreditGrants, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, userBlocks, users } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { claimCompanyReferralRequest, deliverWaitingAsksToReferrer, expireStalePendingReferralRequest, oneClickReviewReferralRequest, tryDeliverWaitingAsk, withdrawCompanyReferralRequest } from "./db";
import { COVERAGE_WITHDRAWN_NOTICE, askDeliveryKey, coverageDeliveredNotice, coverageHeldNotice, coverageReferrerNotice } from "./coverageDelivery";

/*
 * D-034/D-047/D-061/D-062: the coverage-delivery money contract. An ask created
 * while its company had no available referrer waits for free; the moment an
 * employee can take it, one credit is spent under the ask's own idempotent key
 * and the ask becomes visible for 7 days. A seeker with no credit at that
 * moment has the ask held instead — never delivered free, never billed later.
 * A pre-0095 waiting ask already paid at create and flips without a second
 * charge. Real server/db.ts calls over the in-memory database.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const SEEKER = 7;
const OTHER_SEEKER = 8;
const REFERRER = 2;
const COLLEAGUE = 4;
const REQUEST_ID = 501;
const NOW = new Date("2026-10-18T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const person = (id: number, name: string, email: string): Row => full(users, { id, openId: `person-${id}`, name, email, suspended: false });
const employee = (id: number, userId: number, over: Row = {}): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"), paused: false, referralCapacity: 3, ...over });
const wallet = (id: number, userId: number, over: Row = {}): Row => full(tokenBalances, { id, userId, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(NOW), plan: "free", ...over });
const ask = (over: Row = {}): Row => full(referralRequests, { id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: null, personalPitch: "I led two launches.", status: "pending", revision: 0, waitingForCoverage: true, coverageQueuedAt: new Date(NOW.getTime() - DAY_MS), coverageVisibleAt: null, coverageHeldAt: null, debitTransactionId: null, createdAt: new Date(NOW.getTime() - DAY_MS), updatedAt: new Date(NOW.getTime() - DAY_MS), ...over });
const heldAsk = (over: Row = {}): Row => ask({ coverageHeldAt: NOW, ...over });

function seed(options: { asks?: readonly Row[]; referrers?: readonly Row[]; seekerWallet?: Row; otherWallet?: Row } = {}) {
  store.reset([
    [canonicalPeople, []],
    [users, [person(SEEKER, "Avery Example", "avery@example.com"), person(OTHER_SEEKER, "Blake Example", "blake@example.com"), person(REFERRER, "Riya Referrer", "riya@acme.com"), person(COLLEAGUE, "Colin Colleague", "colin@acme.com")]],
    [profiles, options.referrers ?? [employee(31, REFERRER), employee(33, COLLEAGUE)]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/designer" })]],
    [referralRequests, options.asks ?? [ask()]],
    [tokenBalances, [options.seekerWallet ?? wallet(81, SEEKER), options.otherWallet ?? wallet(82, OTHER_SEEKER)]],
    [tokenTransactions, []],
    [planCreditGrants, []],
    [promoCreditGrants, []],
    [referralAvailabilitySlots, []],
    [referralDocumentAccessGrants, []],
    [referralRequestPasses, []],
    [referralTransitionEvents, []],
    [notifications, []],
    [operationalActivityLogs, []],
    [userBlocks, []],
  ]);
}

const askById = (id: number) => store.rows(referralRequests).find(row => row.id === id);
const walletOf = (userId: number) => store.rows(tokenBalances).find(row => row.userId === userId);
const noticesFor = (userId: number) => store.rows(notifications).filter(row => row.userId === userId);
const spends = () => store.rows(tokenTransactions).filter(row => row.kind === "credit_spend");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("D-034: the credit is spent at first visibility", () => {
  it("hands a waiting ask to the employee, spends one credit under the ask's key and starts its 7-day clock", async () => {
    seed();
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 1, held: 0, skipped: 0 });

    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false, coverageHeldAt: null, coverageVisibleAt: NOW });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
    expect(spends()).toEqual([expect.objectContaining({ userId: SEEKER, tokenCount: -1, referenceType: "referral_request", referenceId: `${REQUEST_ID}#1`, idempotencyKey: `${askDeliveryKey(REQUEST_ID)}#1` })]);
    expect(store.rows(referralAvailabilitySlots)).toEqual([expect.objectContaining({ referrerId: REFERRER, referralRequestId: REQUEST_ID, status: "allocated" })]);
    expect(noticesFor(SEEKER)).toEqual([expect.objectContaining({ ...coverageDeliveredNotice("acme.com"), eventKey: `coverage-delivered:${REQUEST_ID}` })]);
    expect(noticesFor(REFERRER)).toEqual([expect.objectContaining({ ...coverageReferrerNotice("acme.com"), eventKey: `coverage-delivery:${REQUEST_ID}:${REFERRER}` })]);
    const activity = store.rows(operationalActivityLogs).filter(row => row.action === "coverage.delivered");
    expect(activity).toHaveLength(1);
    expect(JSON.parse(String(activity[0].metadata))).toEqual({ referrerId: REFERRER, creditSpent: true });
  });

  it("delivers only as many asks as the employee's remaining capacity, oldest first", async () => {
    seed({ asks: [ask(), ask({ id: 502, jobSeekerId: OTHER_SEEKER, createdAt: new Date(NOW.getTime() - 2 * DAY_MS) })], referrers: [employee(31, REFERRER, { referralCapacity: 1 })] });

    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 1, held: 0, skipped: 0 });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false });
    expect(askById(502)).toMatchObject({ referrerId: null, waitingForCoverage: true });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
    expect(walletOf(OTHER_SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
  });

  it("flips a pre-0095 waiting ask whose credit was already spent, without charging a second time", async () => {
    seed({ asks: [ask({ debitTransactionId: 11 })] });
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 1, held: 0, skipped: 0 });

    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false, debitTransactionId: 11 });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(spends()).toEqual([]);
    expect(JSON.parse(String(store.rows(operationalActivityLogs)[0].metadata))).toEqual({ referrerId: REFERRER, creditSpent: false });
  });
});

describe("D-047: no credit at first visibility holds the ask", () => {
  it("holds the ask: nothing allocated, no referrer told, one plain notice to the seeker", async () => {
    seed({ seekerWallet: wallet(81, SEEKER, { monthlyCreditsRemaining: 0 }) });
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 0, held: 1, skipped: 0 });

    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: null, waitingForCoverage: true, coverageHeldAt: NOW });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 0 });
    expect(spends()).toEqual([]);
    expect(store.rows(referralAvailabilitySlots)).toEqual([]);
    expect(noticesFor(REFERRER)).toEqual([]);
    expect(noticesFor(SEEKER)).toEqual([expect.objectContaining({ ...coverageHeldNotice("acme.com"), eventKey: `coverage-held:${REQUEST_ID}` })]);
  });

  it("keeps the ask held on the next hand-off and never repeats the notice", async () => {
    seed({ seekerWallet: wallet(81, SEEKER, { monthlyCreditsRemaining: 0 }) });
    await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime());
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime() + 60_000)).toEqual({ delivered: 0, held: 1, skipped: 0 });

    expect(askById(REQUEST_ID)).toMatchObject({ coverageHeldAt: NOW });
    expect(noticesFor(SEEKER)).toHaveLength(1);
    expect(spends()).toEqual([]);
  });

  it("delivers the held ask on the retry sweep the moment the seeker has a credit", async () => {
    seed({ seekerWallet: wallet(81, SEEKER, { monthlyCreditsRemaining: 0 }) });
    await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime());
    await store.db.update(tokenBalances).set({ monthlyCreditsRemaining: 1 }).where(eq(tokenBalances.id, 81));

    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime() + 60_000)).toMatchObject({ outcome: "delivered", referrerId: REFERRER, creditSpent: true });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false, coverageHeldAt: null });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 0 });
    // The hold notice stays as the seeker's record; the delivery adds its own, without a second hold notice.
    expect(noticesFor(SEEKER).map(row => row.eventKey).sort()).toEqual([`coverage-delivered:${REQUEST_ID}`, `coverage-held:${REQUEST_ID}`]);
    expect(spends()).toHaveLength(1);
  });
});

describe("D-062: the retry sweep's unit of work", () => {
  it("offers the ask to the referrer with the most remaining capacity", async () => {
    seed({ referrers: [employee(31, REFERRER, { referralCapacity: 1 }), employee(33, COLLEAGUE, { referralCapacity: 3 })] });

    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime())).toMatchObject({ outcome: "delivered", referrerId: COLLEAGUE });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: COLLEAGUE, waitingForCoverage: false });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
  });

  it("returns a held ask to plain waiting when no employee can take it, so the credit notice is no longer live", async () => {
    seed({ asks: [heldAsk()], referrers: [employee(31, REFERRER, { paused: true })] });

    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime())).toEqual({ outcome: "waiting", requestId: REQUEST_ID, returnedToWaiting: true });
    expect(askById(REQUEST_ID)).toMatchObject({ waitingForCoverage: true, coverageHeldAt: null, referrerId: null });
    expect(noticesFor(SEEKER)).toEqual([]);
    expect(spends()).toEqual([]);
  });

  it("leaves a never-held waiting ask waiting and settles an ask that already left the queue", async () => {
    seed({ referrers: [employee(31, REFERRER, { paused: true })] });
    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime())).toEqual({ outcome: "waiting", requestId: REQUEST_ID, returnedToWaiting: false });
    expect(askById(REQUEST_ID)).toMatchObject({ waitingForCoverage: true, coverageHeldAt: null });

    await store.db.update(referralRequests).set({ waitingForCoverage: false, referrerId: REFERRER, coverageVisibleAt: NOW }).where(eq(referralRequests.id, REQUEST_ID));
    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime())).toEqual({ outcome: "settled", requestId: REQUEST_ID });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(spends()).toEqual([]);
  });
});

describe("D-061: no referrer-facing action and no credit on an ask that never reached anyone", () => {
  it("refuses a claim on a waiting ask", async () => {
    seed();
    await expect(claimCompanyReferralRequest(REFERRER, REQUEST_ID)).rejects.toThrow(/no longer available/);
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: null, waitingForCoverage: true });
  });

  it("withdraws a waiting ask without refund machinery and says no credit was used", async () => {
    seed();
    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: false, status: "withdrawn" });

    expect(askById(REQUEST_ID)).toMatchObject({ status: "withdrawn", waitingForCoverage: false, coverageQueuedAt: null, coverageHeldAt: null });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(store.rows(tokenTransactions)).toEqual([]);
    expect(noticesFor(SEEKER)).toEqual([expect.objectContaining({ ...COVERAGE_WITHDRAWN_NOTICE })]);
  });
});

/*
 * P0-allocated-ask-stuck (D-034, D-050, D-061, D-062): a delivered ask is assigned to one referrer with an
 * allocated slot, but an allocation is not a pickup. Until that referrer claims, accepts or passes, the seeker
 * can withdraw it with the credit back, and it expires 7 days after first visibility with the credit back.
 */
describe("an ask delivered to a referrer who never picked it up", () => {
  const VISIBLE = NOW.getTime();
  const CREATED = VISIBLE - 10 * DAY_MS;
  const deliver = async () => {
    seed({ asks: [ask({ createdAt: new Date(CREATED), updatedAt: new Date(CREATED), coverageQueuedAt: new Date(CREATED) })] });
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", VISIBLE)).toEqual({ delivered: 1, held: 0, skipped: 0 });
    const [spend] = spends();
    expect(spend).toMatchObject({ idempotencyKey: `${askDeliveryKey(REQUEST_ID)}#1` });
    return Number(spend.id);
  };
  const reversalsOf = (spendId: number) => store.rows(tokenTransactions).filter(row => row.reversesTransactionId === spendId);
  const slotStatuses = () => store.rows(referralAvailabilitySlots).map(row => row.status);
  const releaseRows = () => store.rows(operationalActivityLogs).filter(row => row.action === "queue_allocation.released").map(row => JSON.parse(String(row.metadata)));
  const expire = (nowMs: number) => expireStalePendingReferralRequest(SEEKER, REQUEST_ID, nowMs);
  const WITHDRAW_REFUSED = /^This request was already claimed by a verified employee and can no longer be withdrawn$/;

  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(VISIBLE); });
  afterEach(() => { vi.useRealTimers(); });

  it("a delivered ask nobody claimed can be withdrawn with its credit back", async () => {
    const spendId = await deliver();
    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, status: "withdrawn", creditRefunded: true });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "withdrawn", referrerId: null });
    expect(reversalsOf(spendId)).toEqual([expect.objectContaining({ kind: "withdrawal_refund", tokenCount: 1 })]);
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(slotStatuses()).toEqual(["released"]);
    expect(releaseRows()).toEqual([{ reason: "withdrawn", creditReturned: true, referrerId: REFERRER }]);

    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(reversalsOf(spendId)).toHaveLength(1);
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(releaseRows()).toHaveLength(1);
  });

  it("a delivered ask expires 7 days after first visibility, not after creation", async () => {
    const spendId = await deliver();
    expect(await expire(CREATED + 16 * DAY_MS)).toMatchObject({ expired: false, status: "pending" });
    expect(reversalsOf(spendId)).toEqual([]);

    expect(await expire(CREATED + 17 * DAY_MS + 1)).toMatchObject({ expired: true, status: "closed" });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "closed", referrerId: null });
    expect(reversalsOf(spendId)).toEqual([expect.objectContaining({ kind: "expiry_refund", tokenCount: 1 })]);
    const notice = noticesFor(SEEKER).find(row => row.title === "Your ask expired — credit returned");
    expect(String(notice?.body)).toMatch(/^No verified employee claimed it within 7 days\./);
    expect(slotStatuses()).toEqual(["released"]);
    expect(releaseRows()).toEqual([{ reason: "expired", creditReturned: true, referrerId: REFERRER }]);
  });

  it("the allocated referrer cannot claim a delivered ask past its 7 days", async () => {
    await deliver();
    vi.setSystemTime(VISIBLE + 7 * DAY_MS + 1);
    await expect(claimCompanyReferralRequest(REFERRER, REQUEST_ID)).rejects.toThrow(/^This referral request expired before it could be claimed$/);
    expect(askById(REQUEST_ID)).toMatchObject({ status: "pending", referrerId: REFERRER, revision: 0 });
    expect(store.rows(referralTransitionEvents)).toEqual([]);

    // Control: on day 6 of its visibility (day 16 since creation) the claim still lands.
    await deliver();
    vi.setSystemTime(VISIBLE + 6 * DAY_MS);
    expect(await claimCompanyReferralRequest(REFERRER, REQUEST_ID)).toMatchObject({ claimed: true, replayed: false });
  });

  it("a claimed delivered ask keeps today's rules", async () => {
    const spendId = await deliver();
    vi.setSystemTime(VISIBLE + DAY_MS);
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    await expect(withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).rejects.toThrow(WITHDRAW_REFUSED);
    expect(await expire(VISIBLE + 8 * DAY_MS)).toMatchObject({ expired: false, status: "pending" });
    expect(reversalsOf(spendId)).toEqual([]);
    expect(askById(REQUEST_ID)).toMatchObject({ status: "pending", referrerId: REFERRER });
    expect(slotStatuses()).toEqual(["allocated"]);
  });

  it("an accepted delivered ask never expires", async () => {
    const spendId = await deliver();
    vi.setSystemTime(VISIBLE + DAY_MS);
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    expect(askById(REQUEST_ID)?.status).toBe("approved");
    expect(await expire(VISIBLE + 8 * DAY_MS)).toMatchObject({ expired: false, status: "approved" });
    expect(reversalsOf(spendId)).toEqual([]);
  });
});

describe("ordinary delivery with BYOR disabled", () => {
  it("hands off a waiting request without reading or locking invite rows", async () => {
    seed();
    vi.stubEnv("BYOR_LINK_ENABLED", "false");
    store.failReads(askInviteLinks);

    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 1, held: 0, skipped: 0 });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false });
  });

  it("retries a waiting request without reading or locking invite rows", async () => {
    seed();
    vi.stubEnv("BYOR_LINK_ENABLED", "false");
    store.failReads(askInviteLinks);

    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime())).toMatchObject({ outcome: "delivered", referrerId: REFERRER });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false });
  });
});

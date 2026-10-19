import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalPeople, jobs, notifications, operationalActivityLogs, planCreditGrants, profiles, promoCreditGrants, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, userBlocks, users } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import {
  claimCompanyReferralRequest,
  confirmReferralEmail,
  extendReferralDeadline,
  getApprovedReferralProgressStatus,
  getPublicReferralImpact,
  lapseStaleClaim,
  markReferralReferred,
  oneClickReviewReferralRequest,
  releaseUnreferredReferralRequest,
  stepBackFromReferral,
  updateReferralProgress,
} from "./db";
import { createReferralTimerSweep, listClaimsToRemind, listReferralsToRemind } from "./referralTimerSweep";

/*
 * D-038/D-066: the referral clocks and the credit they release. Real server/db.ts
 * calls over the in-memory database:
 *   - a claim's 48-hour window (sets claimedAt, 5 live claims, lapse, no re-claim);
 *   - acceptance sets acceptedAt, progress needs "Referred" first;
 *   - one 3-day extension, the seeker's own confirmation;
 *   - a step back or a missed 5-day deadline reopens the ask to colleagues and
 *     returns the credit exactly once (reversal-unique ledger row), never more.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const SEEKER = 7;
const REFERRER = 2;
const COLLEAGUE = 4;
const REQUEST_ID = 501;
const NOW = new Date("2026-10-18T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const person = (id: number, email: string): Row => full(users, { id, openId: `person-${id}`, name: `Person ${id}`, email, suspended: false });
const employee = (id: number, userId: number): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"), paused: false, referralCapacity: 3 });
const wallet = (id: number, userId: number, over: Row = {}): Row => full(tokenBalances, { id, userId, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(NOW), plan: "free", ...over });
const cycleSpend = (over: Row = {}): Row => full(tokenTransactions, { id: 900, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "credit_spend", source: "monthly_allowance", sourceCycleKey: currentMonthlyCycleKey(NOW), referenceType: "referral_request", referenceId: `${REQUEST_ID}#1`, idempotencyKey: `ask-delivery:${REQUEST_ID}#1`, createdAt: new Date(NOW.getTime() - 2 * DAY_MS), ...over });
const ask = (over: Row = {}): Row => full(referralRequests, {
  id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: null,
  personalPitch: "I led two launches.", status: "pending", revision: 1,
  waitingForCoverage: false, coverageQueuedAt: null,
  coverageVisibleAt: new Date(NOW.getTime() - 2 * DAY_MS), coverageHeldAt: null,
  claimedAt: null, acceptedAt: null, referredAt: null, referralExtendedAt: null, referralConfirmedAt: null,
  debitTransactionId: 900, createdAt: new Date(NOW.getTime() - 3 * DAY_MS), updatedAt: new Date(NOW.getTime() - 3 * DAY_MS),
  ...over,
});

function seed(options: { asks?: readonly Row[]; transactions?: readonly Row[]; wallet?: Row; notices?: readonly Row[] } = {}) {
  store.reset([
    [canonicalPeople, []],
    [users, [person(SEEKER, "avery@example.com"), person(REFERRER, "riya@acme.com"), person(COLLEAGUE, "colin@acme.com")]],
    [profiles, [employee(31, REFERRER), employee(33, COLLEAGUE)]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/designer" })]],
    [referralRequests, options.asks ?? [ask()]],
    [tokenBalances, [options.wallet ?? wallet(81, SEEKER, { monthlyCreditsRemaining: 1 })]],
    [tokenTransactions, options.transactions ?? [cycleSpend()]],
    [planCreditGrants, []],
    [promoCreditGrants, []],
    [referralAvailabilitySlots, []],
    [referralDocumentAccessGrants, []],
    [referralRequestPasses, []],
    [referralTransitionEvents, []],
    [notifications, options.notices ?? []],
    [operationalActivityLogs, []],
    [userBlocks, []],
  ]);
}

const askById = (id: number) => store.rows(referralRequests).find(row => row.id === id);
const walletOf = (userId: number) => store.rows(tokenBalances).find(row => row.userId === userId);
const noticesFor = (userId: number) => store.rows(notifications).filter(row => row.userId === userId);
const reversals = () => store.rows(tokenTransactions).filter(row => row.kind === "referral_release_refund");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("D-038: the claim's 48-hour window", () => {
  it("records claimedAt on claim and sets acceptedAt on acceptance", async () => {
    seed();
    expect(await claimCompanyReferralRequest(REFERRER, REQUEST_ID)).toMatchObject({ claimed: true });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, status: "pending" });
    expect(askById(REQUEST_ID)?.claimedAt).toBeInstanceOf(Date);

    const accepted = await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    expect(accepted.status).toBe("approved");
    expect(askById(REQUEST_ID)).toMatchObject({ status: "approved", referrerId: REFERRER });
    expect(askById(REQUEST_ID)?.acceptedAt).toBeInstanceOf(Date);
  });

  it("holds at most five live claims, then accepts one after a decision frees the slot", async () => {
    const asks = Array.from({ length: 6 }, (_, index) => ask({ id: REQUEST_ID + index }));
    seed({ asks });
    for (let index = 0; index < 5; index += 1) await claimCompanyReferralRequest(REFERRER, REQUEST_ID + index);
    await expect(claimCompanyReferralRequest(REFERRER, REQUEST_ID + 5)).rejects.toThrow(/already on 5 referrals/i);

    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
    expect(await claimCompanyReferralRequest(REFERRER, REQUEST_ID + 5)).toMatchObject({ claimed: true });
  });

  it("lapses a 48-hour claim with no credit movement, ends that employee's turn and reopens to colleagues", async () => {
    seed({ asks: [ask({ referrerId: REFERRER, claimedAt: new Date(NOW.getTime() - 49 * HOUR_MS) })] });
    const before = walletOf(SEEKER)?.monthlyCreditsRemaining;

    expect(await lapseStaleClaim(REQUEST_ID, NOW.getTime())).toMatchObject({ lapsed: true });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "pending", referrerId: null, claimedAt: null });
    expect(walletOf(SEEKER)?.monthlyCreditsRemaining).toBe(before);
    expect(reversals()).toEqual([]);
    expect(store.rows(referralRequestPasses)).toEqual([expect.objectContaining({ referralRequestId: REQUEST_ID, referrerId: REFERRER, reasonCode: "claim_lapsed" })]);
    expect(noticesFor(SEEKER)).toEqual([expect.objectContaining({ title: "Your ask is open again" })]);
    expect(noticesFor(REFERRER)).toEqual([expect.objectContaining({ eventKey: `claim-lapsed:${REQUEST_ID}:${REFERRER}` })]);

    // A repeat sweep cannot lapse again; the lapsed employee cannot re-claim; a colleague can.
    expect(await lapseStaleClaim(REQUEST_ID, NOW.getTime())).toMatchObject({ lapsed: false });
    await expect(claimCompanyReferralRequest(REFERRER, REQUEST_ID)).rejects.toThrow(/other employees/i);
    expect(await claimCompanyReferralRequest(COLLEAGUE, REQUEST_ID)).toMatchObject({ claimed: true });
  });

  it("leaves a live claim alone before 48 hours", async () => {
    seed({ asks: [ask({ referrerId: REFERRER, claimedAt: new Date(NOW.getTime() - 47 * HOUR_MS) })] });
    expect(await lapseStaleClaim(REQUEST_ID, NOW.getTime())).toMatchObject({ lapsed: false });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER });
  });
});

describe("D-038/D-066(3): only a submitted referral counts", () => {
  async function accepted() {
    seed();
    await claimCompanyReferralRequest(REFERRER, REQUEST_ID);
    await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" });
  }

  it("blocks progress before Referred, then records the reference and lets progress continue", async () => {
    await accepted();
    await expect(updateReferralProgress(REFERRER, { requestId: REQUEST_ID, status: "intro_made" })).rejects.toThrow(/mark the referral as referred first/i);

    const marked = await markReferralReferred(REFERRER, { requestId: REQUEST_ID, referenceId: "ACME-123" });
    expect(marked).toMatchObject({ status: "referred", changed: true, referenceId: "ACME-123" });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "referred" });
    expect(askById(REQUEST_ID)?.referredAt).toBeInstanceOf(Date);
    expect(await getApprovedReferralProgressStatus(REFERRER, REQUEST_ID)).toMatchObject({ status: "referred", referenceId: "ACME-123" });

    expect(await updateReferralProgress(REFERRER, { requestId: REQUEST_ID, status: "intro_made" })).toMatchObject({ status: "intro_made", changed: true });
  });

  it("is idempotent for the same tap", async () => {
    await accepted();
    await markReferralReferred(REFERRER, { requestId: REQUEST_ID, referenceId: "ACME-123" });
    expect(await markReferralReferred(REFERRER, { requestId: REQUEST_ID, referenceId: "ACME-123" })).toMatchObject({ changed: false, status: "referred" });
    expect(store.rows(notifications).filter(row => row.userId === SEEKER && /Referral submitted/.test(String(row.title)))).toHaveLength(1);
  });

  it("lets the seeker's own confirmation mark the referral and notify the referrer", async () => {
    await accepted();
    const confirmed = await confirmReferralEmail(SEEKER, REQUEST_ID);
    expect(confirmed).toMatchObject({ status: "referred", confirmed: true, changed: true });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "referred" });
    expect(askById(REQUEST_ID)?.referralConfirmedAt).toBeInstanceOf(Date);
    expect(noticesFor(REFERRER)).toEqual([expect.objectContaining({ title: "The seeker confirmed your referral" })]);
    expect(await confirmReferralEmail(SEEKER, REQUEST_ID)).toMatchObject({ changed: false });
  });

  it("allows exactly one 3-day extension", async () => {
    await accepted();
    const first = await extendReferralDeadline(REFERRER, REQUEST_ID);
    expect(first.extended).toBe(true);
    expect(first.deadlineAt?.getTime()).toBe((askById(REQUEST_ID)?.acceptedAt as Date).getTime() + 8 * DAY_MS);
    expect(askById(REQUEST_ID)?.referralExtendedAt).toBeInstanceOf(Date);
    expect(await extendReferralDeadline(REFERRER, REQUEST_ID)).toMatchObject({ extended: false, alreadyExtended: true });
  });

  it("counts only a referred ask in the public number", async () => {
    seed({ asks: [ask({ id: 501, referredAt: new Date(NOW.getTime() - DAY_MS) }), ask({ id: 502, status: "approved", referrerId: REFERRER }), ask({ id: 503, status: "pending" })] });
    expect(await getPublicReferralImpact()).toEqual({ acceptedReferrals: 1 });
  });
});

describe("D-038/D-066(2): step back and the missed deadline release the credit once", () => {
  async function accepted(over: Row = {}) {
    seed({ asks: [ask({ status: "approved", referrerId: REFERRER, claimedAt: null, acceptedAt: new Date(NOW.getTime() - DAY_MS), ...over })] });
  }

  it("reopens on a step back: refund once, clear the debit pointer, end that employee's turn", async () => {
    await accepted();
    const result = await stepBackFromReferral(REFERRER, REQUEST_ID, NOW.getTime());
    expect(result).toMatchObject({ status: "pending", changed: true, creditRefunded: true, returned: 1 });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "pending", referrerId: null, acceptedAt: null, debitTransactionId: null });
    expect(walletOf(SEEKER)?.monthlyCreditsRemaining).toBe(2);
    expect(reversals()).toEqual([expect.objectContaining({ userId: SEEKER, tokenCount: 1, referenceId: `${REQUEST_ID}#refund`, reversesTransactionId: 900, kind: "referral_release_refund" })]);
    expect(store.rows(referralRequestPasses)).toEqual([expect.objectContaining({ referrerId: REFERRER, reasonCode: "stepped_back" })]);
    expect(noticesFor(SEEKER)).toEqual([expect.objectContaining({ title: expect.stringMatching(/credit returned/i) })]);

    // A replay moves nothing; the same employee cannot re-claim; a colleague can.
    expect(await stepBackFromReferral(REFERRER, REQUEST_ID, NOW.getTime())).toMatchObject({ changed: false, creditRefunded: false });
    expect(reversals()).toHaveLength(1);
    await expect(claimCompanyReferralRequest(REFERRER, REQUEST_ID)).rejects.toThrow(/other employees/i);
    expect(await claimCompanyReferralRequest(COLLEAGUE, REQUEST_ID)).toMatchObject({ claimed: true });
  });

  it("releases only after 5 days, and honors the one extension", async () => {
    await accepted({ acceptedAt: new Date(NOW.getTime() - 4 * DAY_MS) });
    expect(await releaseUnreferredReferralRequest(REQUEST_ID, NOW.getTime())).toMatchObject({ released: false });

    seed({ asks: [ask({ id: REQUEST_ID, status: "approved", referrerId: REFERRER, acceptedAt: new Date(NOW.getTime() - 6 * DAY_MS), referralExtendedAt: new Date(NOW.getTime() - 2 * DAY_MS) })] });
    expect(await releaseUnreferredReferralRequest(REQUEST_ID, NOW.getTime())).toMatchObject({ released: false });
    expect(await releaseUnreferredReferralRequest(REQUEST_ID, NOW.getTime() + 3 * DAY_MS)).toMatchObject({ released: true, creditReturned: true });
  });

  it("reopens a missed 5-day deadline: refund once, notify both sides, and never again", async () => {
    await accepted({ acceptedAt: new Date(NOW.getTime() - 5 * DAY_MS - HOUR_MS) });
    const result = await releaseUnreferredReferralRequest(REQUEST_ID, NOW.getTime());
    expect(result).toMatchObject({ released: true, creditReturned: true, returned: 1 });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "pending", referrerId: null, acceptedAt: null, referredAt: null, debitTransactionId: null });
    expect(walletOf(SEEKER)?.monthlyCreditsRemaining).toBe(2);
    expect(reversals()).toHaveLength(1);
    expect(store.rows(referralRequestPasses)).toEqual([expect.objectContaining({ referrerId: REFERRER, reasonCode: "referral_deadline" })]);
    expect(noticesFor(SEEKER)).toEqual([expect.objectContaining({ title: expect.stringMatching(/credit returned/i) })]);
    expect(noticesFor(REFERRER)).toEqual([expect.objectContaining({ eventKey: `referral-deadline-missed:${REQUEST_ID}:${REFERRER}` })]);

    expect(await releaseUnreferredReferralRequest(REQUEST_ID, NOW.getTime())).toMatchObject({ released: false });
    expect(reversals()).toHaveLength(1);
  });

  it("never times out an acceptance from before 0096 (no acceptedAt) and never times out an already referred ask", async () => {
    seed({ asks: [ask({ id: 501, status: "approved", referrerId: REFERRER, acceptedAt: null, updatedAt: new Date(NOW.getTime() - 40 * DAY_MS) })] });
    expect(await releaseUnreferredReferralRequest(501, NOW.getTime())).toMatchObject({ released: false });

    seed({ asks: [ask({ id: 502, status: "referred", referrerId: REFERRER, acceptedAt: new Date(NOW.getTime() - 10 * DAY_MS), referredAt: new Date(NOW.getTime() - 8 * DAY_MS) })] });
    expect(await releaseUnreferredReferralRequest(502, NOW.getTime())).toMatchObject({ released: false });
    expect(reversals()).toEqual([]);
  });
});

describe("D-038: the hourly sweep's unit of work", () => {
  it("lists a 24-hour claim once and skips it after the reminder row exists", async () => {
    const claimedAt = new Date(NOW.getTime() - 25 * HOUR_MS);
    seed({ asks: [ask({ referrerId: REFERRER, claimedAt })], notices: [] });
    const from = new Date(NOW.getTime() - 48 * HOUR_MS);
    const to = new Date(NOW.getTime() - 24 * HOUR_MS);
    expect(await listClaimsToRemind(from, to, 100)).toEqual([expect.objectContaining({ id: REQUEST_ID, referrerId: REFERRER })]);

    seed({
      asks: [ask({ referrerId: REFERRER, claimedAt })],
      notices: [full(notifications, { id: 1, userId: REFERRER, category: "status", kind: "ask_update", refId: REQUEST_ID, title: "Your claim lapses in 24 hours", body: "…", eventKey: `claim-reminder:${REQUEST_ID}:${claimedAt.toISOString()}`, createdAt: NOW })],
    });
    expect(await listClaimsToRemind(from, to, 100)).toEqual([]);
  });

  it("lists a day-2 referral once and skips it after the reminder row exists", async () => {
    const acceptedAt = new Date(NOW.getTime() - 2.5 * DAY_MS);
    const from = new Date(NOW.getTime() - 3 * DAY_MS);
    const to = new Date(NOW.getTime() - 2 * DAY_MS);
    seed({ asks: [ask({ status: "approved", referrerId: REFERRER, claimedAt: null, acceptedAt })], notices: [] });
    expect(await listReferralsToRemind(2, from, to, 100)).toEqual([expect.objectContaining({ id: REQUEST_ID, referrerId: REFERRER })]);

    seed({
      asks: [ask({ status: "approved", referrerId: REFERRER, claimedAt: null, acceptedAt })],
      notices: [full(notifications, { id: 2, userId: REFERRER, category: "status", kind: "ask_update", refId: REQUEST_ID, title: "3 days left to mark the referral", body: "…", eventKey: `referral-reminder:${REQUEST_ID}:d2`, createdAt: NOW })],
    });
    expect(await listReferralsToRemind(2, from, to, 100)).toEqual([]);
  });

  it("lapses, releases, then reminds, in bounded batches, and survives one failing item", async () => {
    const calls: string[] = [];
    const sweep = createReferralTimerSweep({
      listClaimsToLapse: async () => [{ id: 1, referrerId: 2, claimedAt: new Date(NOW.getTime() - 49 * HOUR_MS) }],
      lapseClaim: async id => { calls.push(`lapse:${id}`); return { lapsed: true }; },
      listReferralsToRelease: async () => [{ id: 2, referrerId: 2, acceptedAt: new Date(NOW.getTime() - 6 * DAY_MS) }, { id: 3, referrerId: 2, acceptedAt: new Date(NOW.getTime() - 6 * DAY_MS) }],
      releaseUnreferred: async id => { calls.push(`release:${id}`); if (id === 3) throw new Error("boom"); return { released: true }; },
      listClaimsToRemind: async () => [{ id: 4, referrerId: 2, claimedAt: new Date(NOW.getTime() - 25 * HOUR_MS) }],
      remindClaim: async row => { calls.push(`claim-remind:${row.id}`); return true; },
      listReferralsToRemind: async day => day === 2 ? [{ id: 5, referrerId: 2, acceptedAt: new Date(NOW.getTime() - 2.5 * DAY_MS) }] : [],
      remindReferral: async (row, day) => { calls.push(`referral-remind:${row.id}:${day}`); return true; },
    });
    const output = await sweep({ nowMs: NOW.getTime(), windowKey: "2026-10-18T12:00" });
    expect(calls).toEqual(["lapse:1", "release:2", "release:3", "claim-remind:4", "referral-remind:5:2"]);
    expect(output).toMatchObject({ processed: 4, failed: 1 });
  });
});

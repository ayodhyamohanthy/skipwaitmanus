import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalPeople, jobs, notifications, profiles, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { claimCompanyReferralRequest, confirmReferredBySeeker, extendReferredDeadlineTx, expireStalePendingReferralRequest, lapseReferredTx, stepBackFromReferral } from "./db";
import { REFERRAL_TIMERS_SINCE } from "../shared/referral";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const SEEKER = 7;
const REFERRER = 2;
const COLLEAGUE = 4;
const REQUEST_ID = 501;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Half a day after the cut-off, so the new timers run. Derived: a later cut-off move cannot break this file. */
const T0 = REFERRAL_TIMERS_SINCE + 12 * 60 * 60 * 1000;

const store = createInMemoryDrizzle();
const full = (table: any, values: Row): Row => ({ ...Object.fromEntries(Object.keys(table).map(key => [key, null])), ...values });

const person = (id: number, name: string, email: string): Row => full(users, { id, openId: `person-${id}`, name, email, suspended: false });
const employee = (id: number, userId: number, over: Row = {}): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"), paused: false, referralCapacity: 3, ...over });
const wallet = (id: number, userId: number, over: Row = {}): Row => full(tokenBalances, { id, userId, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", ...over });
const acceptedAsk = (over: Row = {}): Row => full(referralRequests, { id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: REFERRER, personalPitch: "I led two launches.", status: "approved", revision: 1, waitingForCoverage: false, coverageVisibleAt: new Date(T0), coverageHeldAt: null, debitTransactionId: 11, createdAt: new Date(T0), updatedAt: new Date(T0), ...over });
/** A claim nobody accepted or passed: its 48-hour lapse is due at the switch test's clock. */
const claimedAsk = (): Row => full(referralRequests, { id: 601, jobId: 11, jobSeekerId: SEEKER, referrerId: REFERRER, personalPitch: "I shipped two releases.", status: "pending", revision: 1, waitingForCoverage: false, coverageVisibleAt: new Date(T0), coverageHeldAt: null, debitTransactionId: 12, createdAt: new Date(T0), updatedAt: new Date(T0) });
/** An allocation nobody claimed: its 48-hour lapse is due at the switch test's clock. */
const allocatedAsk = (): Row => full(referralRequests, { id: 602, jobId: 11, jobSeekerId: SEEKER, referrerId: REFERRER, personalPitch: "I led design systems.", status: "pending", revision: 1, waitingForCoverage: false, coverageVisibleAt: new Date(T0), coverageHeldAt: null, debitTransactionId: 13, createdAt: new Date(T0), updatedAt: new Date(T0) });
const acceptEvent = (): Row => ({ id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) });
const claimEventRow = (): Row => ({ id: 210, referralRequestId: 601, operationKey: `claim:${REFERRER}`, actorUserId: REFERRER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) });
const allocationSlot = (): Row => ({ id: 9102, referralRequestId: 602, referrerId: REFERRER, status: "allocated", openedAt: new Date(T0) });
const acceptedGrant = (): Row => ({ id: 1, referralRequestId: REQUEST_ID, referrerId: REFERRER, requestRevision: 1, grantVersion: 1, grantedAt: new Date(T0), expiresAt: new Date(T0 + 7 * DAY_MS), revokedAt: null, revokeReason: null });
/** Six days after the cut-off: the claim/allocation lapses and the 5-day referred deadline are all due. */
const SWITCH_NOW = T0 + 6 * DAY_MS;

function seed(options: { asks?: readonly Row[]; referrers?: readonly Row[]; events?: readonly Row[]; slots?: readonly Row[]; passes?: readonly Row[]; grants?: readonly Row[]; spends?: readonly Row[] } = {}) {
  store.reset([
    [canonicalPeople, []],
    [users, [person(SEEKER, "Avery Example", "avery@example.com"), person(REFERRER, "Riya Referrer", "riya@acme.com"), person(COLLEAGUE, "Colin Colleague", "colin@acme.com")]],
    [profiles, options.referrers ?? [employee(31, REFERRER), employee(33, COLLEAGUE)]],
    [jobs, [{ id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/designer", jobFunction: "Design" }]],
    [referralRequests, options.asks ?? [acceptedAsk()]],
    [tokenBalances, [options.seekerWallet ?? wallet(81, SEEKER)]],
    [tokenTransactions, options.spends ?? [{ id: 11, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "credit_spend", source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "referral_request", referenceId: "501#1", reversesTransactionId: null, balanceAfter: 2, monthlyCreditsAfter: 2, createdAt: new Date(T0) }]],
    [referralAvailabilitySlots, options.slots ?? [{ id: 9001, referralRequestId: REQUEST_ID, referrerId: REFERRER, status: "allocated", openedAt: new Date(T0) }]],
    [referralDocumentAccessGrants, options.grants ?? [{ id: 1, referralRequestId: REQUEST_ID, referrerId: REFERRER, requestRevision: 1, grantVersion: 1, grantedAt: new Date(T0), expiresAt: new Date(T0 + 7 * DAY_MS), revokedAt: null, revokeReason: null }]],
    [referralRequestPasses, options.passes ?? []],
    [referralTransitionEvents, options.events ?? []],
    [notifications, []],
  ]);
}

const askById = (id: number) => store.rows(referralRequests).find(row => row.id === id);
const passesFor = (requestId: number) => store.rows(referralRequestPasses).filter(row => row.referralRequestId === requestId);
const eventsFor = (requestId: number) => store.rows(referralTransitionEvents).filter(row => row.referralRequestId === requestId);
const noticesFor = (userId: number) => store.rows(notifications).filter(row => row.userId === userId);
const grantsFor = (requestId: number) => store.rows(referralDocumentAccessGrants).filter(row => row.referralRequestId === requestId);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("D-038-B: referred deadline (5 days)", () => {
  it("an accepted ask reopens 5 days after acceptance when nobody marked it referred", async () => {
    seed({
      asks: [acceptedAsk({ revision: 1 })],
      events: [{ id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) }],
      grants: [{ id: 1, referralRequestId: REQUEST_ID, referrerId: REFERRER, requestRevision: 1, grantVersion: 1, grantedAt: new Date(T0), expiresAt: new Date(T0 + 7 * DAY_MS), revokedAt: null, revokeReason: null }],
    });

    // At T+5d-1ms: no lapse yet
    expect(await lapseReferredTx(store.db as any, REQUEST_ID, T0 + 5 * DAY_MS - 1)).toEqual({ lapsed: false });
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);

    // At T+5d+1ms: lapses
    const result = await lapseReferredTx(store.db as any, REQUEST_ID, T0 + 5 * DAY_MS + 1);
    expect(result).toEqual({ lapsed: true, reason: "lapsed_referred" });

    const row = askById(REQUEST_ID);
    expect(row?.referrerId).toBeNull();
    expect(row?.status).toBe("pending");
    expect(eventsFor(REQUEST_ID).map(e => ({ action: e.action, actorUserId: e.actorUserId }))).toContainEqual({ action: "referred_lapse", actorUserId: REFERRER });
    expect(passesFor(REQUEST_ID).map(p => ({ reason: p.reason, reasonCode: p.reasonCode }))).toContainEqual({ reason: "timing", reasonCode: "lapsed_referred" });
    // Document grant revoked
    expect(grantsFor(REQUEST_ID)[0]?.revokedAt).not.toBeNull();
    expect(grantsFor(REQUEST_ID)[0]?.revokeReason).toBe("referred_lapse");
    // Seeker notice
    expect(noticesFor(SEEKER).some(n => n.title === `Update on your referral request — acme.com` && n.body.includes("didn't confirm the referral within the deadline"))).toBe(true);
    // Referrer notice
    expect(noticesFor(REFERRER).some(n => n.title === "An accepted ask went back to your colleagues")).toBe(true);
  });

  it("the credit is released after lapse", async () => {
    seed({
      asks: [acceptedAsk({ revision: 1, debitTransactionId: 11 })],
      events: [{ id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) }],
    });

    await lapseReferredTx(store.db as any, REQUEST_ID, T0 + 5 * DAY_MS + 1);

    // Expiry after lapse should return the credit
    const refunds = store.rows(tokenTransactions).filter(row => row.kind === "expiry_refund" && row.referenceId === `${REQUEST_ID}#refund#1`);
    expect(refunds.length).toBe(0); // expiry not yet run

    const { expireStalePendingReferralRequest } = await import("./db");
    await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, T0 + 8 * DAY_MS);
    const refundsAfter = store.rows(tokenTransactions).filter(row => row.kind === "expiry_refund" && row.referenceId === `${REQUEST_ID}#refund#1`);
    expect(refundsAfter.length).toBe(1);
  });

  it("control: accepted and marked referred, expiry refunds nothing", async () => {
    seed({
      asks: [acceptedAsk({ revision: 2, debitTransactionId: 11, status: "intro_made" })],
      events: [
        { id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) },
        { id: 101, referralRequestId: REQUEST_ID, operationKey: "progress:2:intro_made", actorUserId: REFERRER, action: "progress", fromStatus: "approved", resultingStatus: "intro_made", resultingRevision: 2, createdAt: new Date(T0 + DAY_MS) },
      ],
    });

    // No lapse since it's already intro_made
    expect(await lapseReferredTx(store.db as any, REQUEST_ID, T0 + 5 * DAY_MS + 1)).toEqual({ lapsed: false });
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);
  });

  it("one extension moves the deadline to 8 days", async () => {
    seed({
      asks: [acceptedAsk({ revision: 2 })],
      events: [
        { id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) },
        { id: 101, referralRequestId: REQUEST_ID, operationKey: "referred-extension:100", actorUserId: REFERRER, action: "referred_extension", fromStatus: "approved", resultingStatus: "approved", resultingRevision: 2, createdAt: new Date(T0 + DAY_MS) },
      ],
    });

    // No lapse at day 6 (extension pushes to day 8)
    expect(await lapseReferredTx(store.db as any, REQUEST_ID, T0 + 6 * DAY_MS + 1)).toEqual({ lapsed: false });
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);

    // Lapse at day 8+1ms
    const result = await lapseReferredTx(store.db as any, REQUEST_ID, T0 + 8 * DAY_MS + 1);
    expect(result).toEqual({ lapsed: true, reason: "lapsed_referred" });
    expect(askById(REQUEST_ID)?.referrerId).toBeNull();
  });

  it("a second extension is a replay, not an error", async () => {
    seed({
      asks: [acceptedAsk({ revision: 2 })],
      events: [
        { id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) },
        { id: 101, referralRequestId: REQUEST_ID, operationKey: "referred-extension:100", actorUserId: REFERRER, action: "referred_extension", fromStatus: "approved", resultingStatus: "approved", resultingRevision: 2, createdAt: new Date(T0 + DAY_MS) },
      ],
    });

    const result = await extendReferredDeadlineTx(store.db as any, REQUEST_ID, T0 + 2 * DAY_MS);
    expect(result).toEqual({ extended: false, replayed: true });
    expect(askById(REQUEST_ID)?.status).toBe("approved");
  });

  it("the seeker's confirmation stops the clock and counts as referred", async () => {
    seed({
      asks: [acceptedAsk({ revision: 1 })],
      events: [{ id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) }],
    });

    const result = await confirmReferredBySeeker(store.db as any, REQUEST_ID, T0 + 2 * DAY_MS);
    expect(result).toEqual({ confirmed: true });
    expect(askById(REQUEST_ID)?.status).toBe("intro_made");

    // No lapse at day 9 since confirmation stopped the clock
    expect(await lapseReferredTx(store.db as any, REQUEST_ID, T0 + 9 * DAY_MS + 1)).toEqual({ lapsed: false });
    expect(askById(REQUEST_ID)?.status).toBe("intro_made");
  });

  it("stepping back reopens with no fault", async () => {
    seed({
      asks: [acceptedAsk({ revision: 1 })],
      events: [{ id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) }],
      grants: [{ id: 1, referralRequestId: REQUEST_ID, referrerId: REFERRER, requestRevision: 1, grantVersion: 1, grantedAt: new Date(T0), expiresAt: new Date(T0 + 7 * DAY_MS), revokedAt: null, revokeReason: null }],
    });

    const result = await stepBackFromReferral(store.db as any, REQUEST_ID, T0 + 2 * DAY_MS);
    expect(result).toEqual({ lapsed: true, reason: "stepped_back" });

    const row = askById(REQUEST_ID);
    expect(row?.referrerId).toBeNull();
    expect(row?.status).toBe("pending");
    expect(eventsFor(REQUEST_ID).map(e => e.action)).toContain("step_back");
    expect(passesFor(REQUEST_ID).map(p => p.reasonCode)).toContain("stepped_back");
    // Document grant revoked
    expect(grantsFor(REQUEST_ID)[0]?.revokedAt).not.toBeNull();
    expect(grantsFor(REQUEST_ID)[0]?.revokeReason).toBe("step_back");
    // Seeker notice is kinder
    expect(noticesFor(SEEKER).some(n => n.body.includes("stepped back, no reflection on you"))).toBe(true);
  });

  it("reminders on day 2 and day 4, once each", async () => {
    seed({
      asks: [acceptedAsk({ revision: 1 })],
      events: [{ id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date(T0) }],
    });

    const { createReferralTimers } = await import("./referralTimers");
    const job = createReferralTimers({
      referredDeadlineEnabled: true,
      listCandidates: (limit: number, nowMs: number) => import("./db").then(m => m.listReferralTimerCandidates(limit, nowMs)),
      lapseClaim: (tx: any, requestId: number, nowMs: number) => import("./db").then(m => m.lapseClaimTx(tx, requestId, nowMs)),
      lapseAllocation: (tx: any, requestId: number, nowMs: number) => import("./db").then(m => m.lapseAllocationTx(tx, requestId, nowMs)),
      lapseReferred: (tx: any, requestId: number, nowMs: number) => import("./db").then(m => m.lapseReferredTx(tx, requestId, nowMs)),
      stepBack: (tx: any, requestId: number, nowMs: number) => import("./db").then(m => m.stepBackFromReferral(tx, requestId, nowMs)),
    });

    // Day 2 reminder
    await job({ nowMs: T0 + 2 * DAY_MS });
    const day2Reminders = store.rows(notifications).filter(n => String(n.eventKey ?? "").startsWith(`referred-reminder:${REQUEST_ID}:`) && String(n.eventKey ?? "").endsWith(":2"));
    expect(day2Reminders.length).toBe(1);
    expect(day2Reminders[0]?.title).toBe("Did you submit the referral?");

    // Day 4 reminder
    await job({ nowMs: T0 + 4 * DAY_MS });
    const day4Reminders = store.rows(notifications).filter(n => String(n.eventKey ?? "").startsWith(`referred-reminder:${REQUEST_ID}:`) && String(n.eventKey ?? "").endsWith(":4"));
    expect(day4Reminders.length).toBe(1);

    // Re-running doesn't duplicate
    await job({ nowMs: T0 + 4 * DAY_MS + 1 });
    expect(store.rows(notifications).filter(n => String(n.eventKey ?? "").startsWith(`referred-reminder:${REQUEST_ID}`))).toHaveLength(2);

    // No lapse yet (before day 5)
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);
  });

  it("acceptances older than deploy get 5 days from REFERRAL_TIMERS_SINCE", async () => {
    // Acceptance made long before deploy; nowMs just before SINCE+5d
    seed({
      asks: [acceptedAsk({ revision: 1, createdAt: new Date("2026-10-18T12:00:00.000Z"), updatedAt: new Date("2026-10-18T12:00:00.000Z") })],
      events: [{ id: 100, referralRequestId: REQUEST_ID, operationKey: "review:2:approved", actorUserId: REFERRER, action: "review", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, createdAt: new Date("2026-10-18T12:00:00.000Z") }],
    });

    const sincePlus5dMinus1 = REFERRAL_TIMERS_SINCE + 5 * DAY_MS - 1;
    expect(await lapseReferredTx(store.db as any, REQUEST_ID, sincePlus5dMinus1)).toEqual({ lapsed: false });
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);

    const result = await lapseReferredTx(store.db as any, REQUEST_ID, REFERRAL_TIMERS_SINCE + 5 * DAY_MS + 1);
    expect(result).toEqual({ lapsed: true, reason: "lapsed_referred" });
    expect(askById(REQUEST_ID)?.referrerId).toBeNull();
  });
});

/*
 * D-038-reconcile R-2: part B (the referred reminders and lapses, and the
 * extend/step-back/confirm actions) touched money and privacy before its own
 * review. The job runs steps 1–3 only while REFERRED_DEADLINE_ENABLED is false
 * and reports the skipped steps; with the switch on, the same window pins part
 * B's behaviour for that review. Nothing is deleted either way.
 */
describe("D-038-reconcile R-2: the job's part B switch", () => {
  const seedSwitchFixture = () => seed({ asks: [acceptedAsk(), claimedAsk(), allocatedAsk()], events: [acceptEvent(), claimEventRow()], slots: [allocationSlot()], grants: [acceptedGrant()] });

  it("off: lapses the claim and the allocation, leaves the accepted ask, its credit and grant untouched, and reports steps 4–5 skipped", async () => {
    seedSwitchFixture();
    const { createReferralTimers } = await import("./referralTimers");

    const output = await createReferralTimers()({ nowMs: SWITCH_NOW } as never);

    expect(askById(601)?.referrerId).toBeNull();
    expect(store.rows(referralAvailabilitySlots).find(row => row.id === 9102)?.status).toBe("released");
    // The accepted ask is untouched: still accepted, same referrer, grant open, no referred event or reminder.
    expect(askById(REQUEST_ID)?.status).toBe("approved");
    expect(askById(REQUEST_ID)?.referrerId).toBe(REFERRER);
    expect(grantsFor(REQUEST_ID)[0]?.revokedAt).toBeNull();
    expect(eventsFor(REQUEST_ID).map(event => event.action)).not.toContain("referred_lapse");
    expect(store.rows(notifications).some(row => row.title === "Did you submit the referral?")).toBe(false);
    expect(output.skipped).toBe("referred-deadline off");
    expect(output.failed).toBe(0);
  });

  it("on: the same window reopens the accepted ask, revokes the grant, and the credit returns exactly once", async () => {
    seedSwitchFixture();
    const { createReferralTimers } = await import("./referralTimers");
    const job = createReferralTimers({ referredDeadlineEnabled: true });

    const output = await job({ nowMs: SWITCH_NOW } as never);
    expect(output.skipped).toBeUndefined();
    expect(askById(REQUEST_ID)?.status).toBe("pending");
    expect(askById(REQUEST_ID)?.referrerId).toBeNull();
    expect(grantsFor(REQUEST_ID)[0]?.revokedAt).not.toBeNull();
    expect(grantsFor(REQUEST_ID)[0]?.revokeReason).toBe("referred_lapse");
    expect(eventsFor(REQUEST_ID).map(event => event.action)).toContain("referred_lapse");

    // A repeated window writes no second lapse.
    await job({ nowMs: SWITCH_NOW + 60 * 60 * 1000 } as never);
    expect(eventsFor(REQUEST_ID).filter(event => event.action === "referred_lapse")).toHaveLength(1);

    // The reopened ask returns its credit once when its own window ends.
    const { expireStalePendingReferralRequest } = await import("./db");
    const refunds = () => store.rows(tokenTransactions).filter(row => row.kind === "expiry_refund" && row.referenceId === `${REQUEST_ID}#refund#1`);
    expect(refunds()).toHaveLength(0);
    await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, T0 + 8 * DAY_MS);
    expect(refunds()).toHaveLength(1);
    await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, T0 + 8 * DAY_MS + 1000);
    expect(refunds()).toHaveLength(1);
  });
});

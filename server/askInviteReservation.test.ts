import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askCosts, askInviteLinks, canonicalPeople, jobs, notifications, operationalActivityLogs, planCreditGrants, profiles, promoCreditGrants, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequestSaves, referralRequests, referralTransitionEvents, referrerReviewEmailLinks, tokenBalances, tokenTransactions, userBlocks, users } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { deliverWaitingAsksToReferrer, expireStalePendingReferralRequest, oneClickReviewReferralRequest, openCompanyReferralAvailability, tryDeliverWaitingAsk, withdrawCompanyReferralRequest } from "./db";
import { ASK_INVITE_RESERVATION_MS } from "../shared/askInvites";
import { claimAskInvite, hashAskInviteToken } from "./askInvites";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const SEEKER = 7;
const OTHER_SEEKER = 8;
const REFERRER = 2;
const COLLEAGUE = 4;
const REQUEST_ID = 501;
const OTHER_REQUEST_ID = 502;
const TOKEN = "c".repeat(43);
const NOW = new Date("2026-10-23T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const person = (id: number, name: string, email: string): Row => full(users, { id, openId: `person-${id}`, name, email, suspended: false });
const employee = (id: number, userId: number, over: Row = {}): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00.000Z"), paused: false, referralCapacity: 3, ...over });
const wallet = (id: number, userId: number, over: Row = {}): Row => full(tokenBalances, { id, userId, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(NOW), plan: "free", ...over });
const ask = (id: number, jobSeekerId: number, over: Row = {}): Row => full(referralRequests, { id, jobId: 11, jobSeekerId, referrerId: null, personalPitch: "I led two launches.", status: "pending", revision: 0, waitingForCoverage: true, coverageQueuedAt: new Date(NOW.getTime() - DAY_MS), coverageVisibleAt: null, coverageHeldAt: null, debitTransactionId: null, createdAt: new Date(NOW.getTime() - DAY_MS), updatedAt: new Date(NOW.getTime() - DAY_MS), ...over });
const invitation = (id: number, requestId: number, over: Row = {}): Row => full(askInviteLinks, { id, referralRequestId: requestId, createdByUserId: requestId === REQUEST_ID ? SEEKER : OTHER_SEEKER, linkTokenHash: `${id}`.padStart(64, "0"), status: "claimed", claimedByUserId: REFERRER, claimedAt: NOW, reservationExpiresAt: new Date(NOW.getTime() + ASK_INVITE_RESERVATION_MS), activeRequestKey: null, expiresAt: new Date(NOW.getTime() + ASK_INVITE_RESERVATION_MS), closedAt: null, createdAt: NOW, ...over });

function seed(options: { asks?: readonly Row[]; referrers?: readonly Row[]; seekerWallet?: Row; otherWallet?: Row; invites?: readonly Row[] } = {}) {
  store.reset([
    [askCosts, []],
    [canonicalPeople, []],
    [askInviteLinks, options.invites ?? []],
    [users, [person(SEEKER, "Avery Example", "avery@example.com"), person(OTHER_SEEKER, "Blake Example", "blake@example.com"), person(REFERRER, "Riya Referrer", "riya@acme.com"), person(COLLEAGUE, "Colin Colleague", "colin@acme.com")]],
    [profiles, options.referrers ?? [employee(31, REFERRER), employee(33, COLLEAGUE)]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Product Designer", location: "Remote", workMode: "remote", seniority: "mid", employmentType: "full-time", description: "Design systems" })]],
    [referralRequests, options.asks ?? [ask(REQUEST_ID, SEEKER)]],
    [tokenBalances, [options.seekerWallet ?? wallet(81, SEEKER), options.otherWallet ?? wallet(82, OTHER_SEEKER)]],
    [tokenTransactions, []],
    [planCreditGrants, []],
    [promoCreditGrants, []],
    [referralAvailabilitySlots, []],
    [referralDocumentAccessGrants, []],
    [referralRequestPasses, []],
    [referralRequestSaves, []],
    [referrerReviewEmailLinks, []],
    [referralTransitionEvents, []],
    [notifications, []],
    [operationalActivityLogs, []],
    [userBlocks, []],
  ]);
}

const askById = (id: number) => store.rows(referralRequests).find(row => row.id === id);
const inviteById = (id: number) => store.rows(askInviteLinks).find(row => row.id === id);
const spends = () => store.rows(tokenTransactions).filter(row => row.kind === "credit_spend");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("BYOR_LINK_ENABLED", "true");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("D-090 C3 reservation guard", () => {
  it("does not hand a live reserved ask to another employee", async () => {
    seed({ invites: [invitation(1, REQUEST_ID)] });

    expect(await deliverWaitingAsksToReferrer(COLLEAGUE, "acme.com", NOW.getTime())).toEqual({ delivered: 0, held: 0, skipped: 0 });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: null, waitingForCoverage: true });
    expect(store.rows(referralAvailabilitySlots)).toEqual([]);
    expect(spends()).toEqual([]);
  });

  it("tries the reservation claimer before higher-capacity candidates on the retry path", async () => {
    seed({
      invites: [invitation(1, REQUEST_ID)],
      referrers: [employee(31, REFERRER, { referralCapacity: 1 }), employee(33, COLLEAGUE, { referralCapacity: 3 })],
    });

    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime())).toMatchObject({ outcome: "delivered", referrerId: REFERRER, creditSpent: true });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false });
    expect(inviteById(1)).toMatchObject({ status: "delivered", reservationExpiresAt: null });
    expect(spends()).toHaveLength(1);
    expect(store.rows(referralAvailabilitySlots)).toEqual([expect.objectContaining({ referrerId: REFERRER, referralRequestId: REQUEST_ID, status: "allocated" })]);
  });

  it("gives the claimer's reserved ask priority when they open capacity", async () => {
    seed({
      asks: [
        ask(REQUEST_ID, SEEKER, { coverageQueuedAt: new Date(NOW.getTime() - 60_000) }),
        ask(OTHER_REQUEST_ID, OTHER_SEEKER, { coverageQueuedAt: new Date(NOW.getTime() - DAY_MS) }),
      ],
      invites: [invitation(1, REQUEST_ID)],
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    const result = await openCompanyReferralAvailability(REFERRER, { slotCount: 1 });
    expect(result.allocatedRequestIds).toEqual([REQUEST_ID]);
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false });
    expect(askById(OTHER_REQUEST_ID)).toMatchObject({ referrerId: null, waitingForCoverage: true });
    expect(inviteById(1)).toMatchObject({ status: "delivered", reservationExpiresAt: null });
  });

  it("keeps a no-credit reserved ask held for its claimer without spending or releasing the reservation", async () => {
    seed({ invites: [invitation(1, REQUEST_ID)], seekerWallet: wallet(81, SEEKER, { monthlyCreditsRemaining: 0 }) });

    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime())).toMatchObject({ outcome: "held", requestId: REQUEST_ID });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: null, waitingForCoverage: true, coverageHeldAt: NOW });
    expect(inviteById(1)).toMatchObject({ status: "claimed", claimedByUserId: REFERRER, reservationExpiresAt: new Date(NOW.getTime() + ASK_INVITE_RESERVATION_MS) });
    expect(spends()).toEqual([]);
    expect(store.rows(referralAvailabilitySlots)).toEqual([]);
  });

  it("does not fall through to another employee when the claimer is at capacity", async () => {
    seed({
      invites: [invitation(1, REQUEST_ID)],
      referrers: [employee(31, REFERRER, { referralCapacity: 0 }), employee(33, COLLEAGUE, { referralCapacity: 3 })],
    });

    expect(await tryDeliverWaitingAsk(REQUEST_ID, NOW.getTime())).toMatchObject({ outcome: "waiting", requestId: REQUEST_ID, returnedToWaiting: false });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: null, waitingForCoverage: true });
    expect(inviteById(1)).toMatchObject({ status: "claimed", claimedByUserId: REFERRER });
    expect(spends()).toEqual([]);
  });

  it("closes an active link atomically with seeker withdrawal and logs only once", async () => {
    seed({ invites: [invitation(1, REQUEST_ID, { linkTokenHash: hashAskInviteToken(TOKEN), status: "active", claimedByUserId: null, claimedAt: null, reservationExpiresAt: null, activeRequestKey: `link:${REQUEST_ID}` })] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "withdrawn" });
    expect(inviteById(1)).toMatchObject({ status: "expired", activeRequestKey: null, closedAt: NOW });
    const closure = store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired");
    expect(closure).toHaveLength(1);
    expect(JSON.parse(String(closure[0].metadata))).toEqual({ requestId: REQUEST_ID, linkId: 1, outcome: "ask_withdrawn" });

    await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID);
    expect(store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired")).toHaveLength(1);
  });

  it("closes a stale claimed row and a fresh active link together on withdrawal", async () => {
    seed({
      invites: [
        invitation(1, REQUEST_ID),
        invitation(2, REQUEST_ID, { linkTokenHash: hashAskInviteToken(TOKEN), status: "active", claimedByUserId: null, claimedAt: null, reservationExpiresAt: null, activeRequestKey: `link:${REQUEST_ID}` }),
      ],
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID);
    expect(inviteById(1)).toMatchObject({ status: "expired", activeRequestKey: null, reservationExpiresAt: null, closedAt: NOW });
    expect(inviteById(2)).toMatchObject({ status: "expired", activeRequestKey: null, closedAt: NOW });
    expect(store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired")).toHaveLength(2);
    expect(store.rows(notifications).filter(row => row.eventKey === "ask-invite:1:ask-withdrawn:claimer")).toHaveLength(1);

    await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID);
    expect(store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired")).toHaveLength(2);
  });

  it("closes an active link atomically with stale ask expiry without changing refund semantics", async () => {
    seed({
      asks: [ask(REQUEST_ID, SEEKER, { createdAt: new Date(NOW.getTime() - 100 * DAY_MS), updatedAt: new Date(NOW.getTime() - 100 * DAY_MS) })],
      invites: [invitation(1, REQUEST_ID, { linkTokenHash: hashAskInviteToken(TOKEN), status: "active", claimedByUserId: null, claimedAt: null, reservationExpiresAt: null, activeRequestKey: `link:${REQUEST_ID}` })],
    });

    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, NOW.getTime())).toMatchObject({ expired: true, status: "closed" });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "closed", waitingForCoverage: false });
    expect(inviteById(1)).toMatchObject({ status: "expired", activeRequestKey: null, closedAt: NOW });
    expect(spends()).toEqual([]);
    expect(store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired")).toHaveLength(1);

    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, NOW.getTime())).toMatchObject({ expired: false, status: "closed" });
    expect(store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired")).toHaveLength(1);
  });

  it("releases a live claimed reservation on withdrawal and notifies its claimer once", async () => {
    seed({ invites: [invitation(1, REQUEST_ID, { linkTokenHash: hashAskInviteToken(TOKEN), status: "claimed", activeRequestKey: null, claimedByUserId: REFERRER, reservationExpiresAt: new Date(NOW.getTime() + DAY_MS) })] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID);
    expect(inviteById(1)).toMatchObject({ status: "expired", activeRequestKey: null, reservationExpiresAt: null, closedAt: NOW });
    expect(store.rows(notifications).filter(row => row.eventKey === "ask-invite:1:ask-withdrawn:claimer")).toHaveLength(1);
    expect(store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired")).toHaveLength(1);
    await expect(claimAskInvite(TOKEN, REFERRER, NOW.getTime())).rejects.toMatchObject({ code: "ask_unavailable" });

    await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID);
    expect(store.rows(notifications).filter(row => row.eventKey === "ask-invite:1:ask-withdrawn:claimer")).toHaveLength(1);
    expect(store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired")).toHaveLength(1);
  });

  it("keeps a claimed one-time link unusable after its employee passes", async () => {
    seed({
      asks: [ask(REQUEST_ID, SEEKER, { referrerId: REFERRER, waitingForCoverage: false })],
      invites: [invitation(1, REQUEST_ID, { linkTokenHash: hashAskInviteToken(TOKEN), status: "claimed", activeRequestKey: null, claimedByUserId: REFERRER, reservationExpiresAt: new Date(NOW.getTime() + DAY_MS) })],
    });

    expect(await oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "declined", declineReason: "timing", passReason: "at_capacity" })).toMatchObject({ status: "passed", reopened: true });
    expect(askById(REQUEST_ID)).toMatchObject({ status: "pending", referrerId: null, waitingForCoverage: false });
    expect(inviteById(1)).toMatchObject({ status: "claimed", claimedByUserId: REFERRER, reservationExpiresAt: new Date(NOW.getTime() + DAY_MS) });
    await expect(claimAskInvite(TOKEN, REFERRER, NOW.getTime())).rejects.toMatchObject({ code: "ask_unavailable" });
  });

  it("closes an unclaimed active link atomically when ordinary coverage delivers the ask", async () => {
    seed({ invites: [invitation(1, REQUEST_ID, { linkTokenHash: hashAskInviteToken(TOKEN), status: "active", claimedByUserId: null, claimedAt: null, reservationExpiresAt: null, activeRequestKey: `link:${REQUEST_ID}` })] });

    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toMatchObject({ delivered: 1 });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false });
    expect(inviteById(1)).toMatchObject({ status: "expired", activeRequestKey: null, closedAt: NOW });
    await expect(claimAskInvite(TOKEN, COLLEAGUE, NOW.getTime())).rejects.toMatchObject({ code: "ask_unavailable" });
    expect(spends()).toHaveLength(1);
  });
});

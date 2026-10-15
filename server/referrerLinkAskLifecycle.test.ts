import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { claimCompanyReferralRequest, createCompanyReferralRequest, expireStalePendingReferralRequest, listCompanyReferralInboxByState, listJobSeekerCompanyReferrals, oneClickReviewReferralRequest, reconcileExpiredPendingReferrals, withdrawCompanyReferralRequest } from "./db";
import { referralFixtureDb, type FixtureRow, type FixtureStore } from "./referralFixtureDb";

// D-017: an ask sent through a referrer's personal link is assigned to that
// referrer at creation, but until they claim it, it must expire, refund,
// withdraw and be passed on like any unclaimed ask. The seeker's credit is
// never held by an ask nobody looked at.
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const DAY = 24 * 60 * 60 * 1000;
const SEEKER = 7;
const LINK_OWNER = 9;
const COLLEAGUE = 10;
const CODE = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const ROLE_URL = "https://careers.acme.com/jobs/design-1";
const PITCH = "I led the redesign of an approvals product used by 3,000 people and would value an honest fit check.";
const cycle = currentMonthlyCycleKey();

let store: FixtureStore;
const table = (name: string): FixtureRow[] => store.get(name) ?? [];
const ask = () => table("referralRequests").find(row => row.id === 501);

const wallet = (): FixtureRow => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 2, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: cycle, plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: new Date() });
const debit = (): FixtureRow => ({ id: 11, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "direct_request", source: "monthly_allowance", sourceCycleKey: cycle, referenceType: "referral_request", referenceId: "501", reversesTransactionId: null, balanceAfter: 2, monthlyCreditsAfter: 2 });
const referrer = (userId: number): FixtureRow => ({ id: userId, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z") });
// The job's columns ride on the request row (the fixture reads inner-joined tables from the same row).
const linkAsk = (ageMs: number, over: FixtureRow = {}): FixtureRow => ({ id: 501, jobId: 3, jobSeekerId: SEEKER, referrerId: LINK_OWNER, personalPitch: PITCH, status: "pending", revision: 0, waitingForCoverage: false, coverageQueuedAt: null, referrerMessage: null, savedAt: null, idempotencyKey: "ask-0000000000000001", requestFingerprint: null, debitTransactionId: 11, createdAt: new Date(Date.now() - ageMs), updatedAt: new Date(Date.now() - ageMs), company: "acme.com", title: "Product Designer", jobFunction: null, compensation: null, targetRoleUrl: ROLE_URL, attachmentCount: 1, ...over });
const event = (id: number, action: string, actorUserId: number, revision: number): FixtureRow => ({ id, referralRequestId: 501, operationKey: action === "claim" ? `claim:${actorUserId}` : "link-assign", actorUserId, action, fromStatus: "pending", resultingStatus: "pending", resultingRevision: revision, referenceId: null, createdAt: new Date() });
const linkAssigned = () => event(1, "link_assign", SEEKER, 0);
const claimedByOwner = () => event(2, "claim", LINK_OWNER, 1);

function seed(request: FixtureRow, events: FixtureRow[]) {
  store.set("referralRequests", [request]);
  store.set("referralTransitionEvents", events);
  store.set("tokenTransactions", [debit()]);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  store = new Map([["tokenBalances", [wallet()]], ["profiles", [referrer(LINK_OWNER), referrer(COLLEAGUE)]]]);
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(referralFixtureDb(() => store));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("an ask sent through a personal link, before its owner claims it", () => {
  it("expires after 7 days with the credit refunded, and is released from the link owner", async () => {
    seed(linkAsk(8 * DAY), [linkAssigned()]);
    const result = await expireStalePendingReferralRequest(SEEKER, 501, Date.now());
    expect(result).toMatchObject({ expired: true, status: "closed" });
    expect(ask()).toMatchObject({ status: "closed", referrerId: null });
    expect(table("tokenBalances")[0].monthlyCreditsRemaining).toBe(3);
    expect(table("tokenTransactions").filter(row => row.kind === "expiry_refund")).toEqual([expect.objectContaining({ tokenCount: 1, reversesTransactionId: 11 })]);
    expect(table("notifications").some(row => row.userId === SEEKER && String(row.title).includes("credit returned"))).toBe(true);
    // A second run changes nothing.
    expect((await expireStalePendingReferralRequest(SEEKER, 501, Date.now())).expired).toBe(false);
    expect(table("tokenTransactions").filter(row => row.kind === "expiry_refund")).toHaveLength(1);
  });

  it("is not expired early", async () => {
    seed(linkAsk(2 * DAY), [linkAssigned()]);
    expect((await expireStalePendingReferralRequest(SEEKER, 501, Date.now())).expired).toBe(false);
    expect(ask()).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
  });

  it("is expired by the seeker's reconcile-on-read", async () => {
    seed(linkAsk(9 * DAY), [linkAssigned()]);
    expect(await reconcileExpiredPendingReferrals(SEEKER, Date.now())).toEqual({ expiredRequestIds: [501] });
    expect(ask()?.status).toBe("closed");
  });

  it("can be withdrawn by the seeker with the credit returned, once", async () => {
    seed(linkAsk(DAY), [linkAssigned()]);
    const result = await withdrawCompanyReferralRequest(SEEKER, 501);
    expect(result).toMatchObject({ withdrawn: true, status: "withdrawn" });
    expect(ask()).toMatchObject({ status: "withdrawn", referrerId: null });
    expect(table("tokenBalances")[0].monthlyCreditsRemaining).toBe(3);
    await withdrawCompanyReferralRequest(SEEKER, 501);
    expect(table("tokenTransactions").filter(row => row.kind === "withdrawal_refund")).toHaveLength(1);
  });

  it("is never withdrawn or expired for another seeker", async () => {
    seed(linkAsk(9 * DAY), [linkAssigned()]);
    await expect(withdrawCompanyReferralRequest(8, 501)).rejects.toThrow(/not in your account/);
    await expect(expireStalePendingReferralRequest(8, 501, Date.now())).rejects.toThrow(/not in your account/);
    expect(ask()?.status).toBe("pending");
    expect(table("tokenBalances")[0].monthlyCreditsRemaining).toBe(2);
  });

  it("a pass by the link owner releases it to colleagues instead of failing; the credit stays spent", async () => {
    seed(linkAsk(DAY), [linkAssigned()]);
    const result = await oneClickReviewReferralRequest(LINK_OWNER, { requestId: 501, decision: "declined", declineReason: "cannot_support" });
    expect(result).toMatchObject({ status: "passed", jobSeekerId: SEEKER });
    expect(ask()).toMatchObject({ status: "pending", referrerId: null });
    expect(table("referralRequestPasses")).toEqual([expect.objectContaining({ referralRequestId: 501, referrerId: LINK_OWNER })]);
    expect(table("notifications").some(row => row.userId === SEEKER && String(row.body).includes("stays active for other employees"))).toBe(true);
    expect(table("tokenTransactions").some(row => row.kind !== "direct_request")).toBe(false);
    // Repeating the same pass replays it.
    await expect(oneClickReviewReferralRequest(LINK_OWNER, { requestId: 501, decision: "declined", declineReason: "cannot_support" })).resolves.toMatchObject({ status: "passed" });
    // A colleague can now take it on.
    await expect(claimCompanyReferralRequest(COLLEAGUE, 501)).resolves.toMatchObject({ claimed: true });
    expect(ask()?.referrerId).toBe(COLLEAGUE);
  });

  it("stays the link owner's alone: a colleague can neither pass nor claim it", async () => {
    seed(linkAsk(DAY), [linkAssigned()]);
    await expect(oneClickReviewReferralRequest(COLLEAGUE, { requestId: 501, decision: "declined", declineReason: "cannot_support" })).rejects.toThrow(/no longer available/);
    await expect(claimCompanyReferralRequest(COLLEAGUE, 501)).rejects.toThrow(/no longer available/);
    expect(ask()).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
  });

  it("can be claimed by its link owner while fresh, but not after it expired unclaimed", async () => {
    seed(linkAsk(9 * DAY), [linkAssigned()]);
    await expect(claimCompanyReferralRequest(LINK_OWNER, 501)).rejects.toThrow(/expired before it could be claimed/);
    seed(linkAsk(DAY), [linkAssigned()]);
    await expect(claimCompanyReferralRequest(LINK_OWNER, 501)).resolves.toMatchObject({ claimed: true });
    expect(table("referralTransitionEvents").some(row => row.action === "claim" && row.actorUserId === LINK_OWNER)).toBe(true);
  });

  it("shows the seeker no referrer (so expiry and withdraw apply) and the link owner an unclaimed ask with its expiry", async () => {
    seed(linkAsk(DAY), [linkAssigned()]);
    const [mine] = await listJobSeekerCompanyReferrals(SEEKER);
    expect(mine).toMatchObject({ id: 501, referrerId: null, queueStatus: null });
    const [queued] = await listCompanyReferralInboxByState(LINK_OWNER, "new");
    expect(queued).toMatchObject({ id: 501, isClaimedByYou: false });
    expect(queued?.expiresAt).toEqual(expect.any(String));
    expect(await listCompanyReferralInboxByState(COLLEAGUE, "new")).toEqual([]);
  });
});

describe("an ask sent through a personal link, once its owner claimed it", () => {
  it("neither expires nor can be withdrawn, and the link owner's pass still needs the queue workflow", async () => {
    seed(linkAsk(9 * DAY), [linkAssigned(), claimedByOwner()]);
    expect((await expireStalePendingReferralRequest(SEEKER, 501, Date.now())).expired).toBe(false);
    expect(await reconcileExpiredPendingReferrals(SEEKER, Date.now())).toEqual({ expiredRequestIds: [] });
    await expect(withdrawCompanyReferralRequest(SEEKER, 501)).rejects.toThrow(/already claimed/);
    await expect(oneClickReviewReferralRequest(LINK_OWNER, { requestId: 501, decision: "declined", declineReason: "cannot_support" })).rejects.toThrow(/released through the queue workflow/);
    expect(ask()).toMatchObject({ status: "pending", referrerId: LINK_OWNER });
    expect(table("tokenTransactions").some(row => row.kind !== "direct_request")).toBe(false);
    const [mine] = await listJobSeekerCompanyReferrals(SEEKER);
    expect(mine).toMatchObject({ referrerId: LINK_OWNER, queueStatus: "available_for_review" });
  });

  it("an ask claimed from the company queue (no link marker) is untouched by these rules", async () => {
    seed(linkAsk(9 * DAY), [event(2, "claim", LINK_OWNER, 1)]);
    expect((await expireStalePendingReferralRequest(SEEKER, 501, Date.now())).expired).toBe(false);
    await expect(withdrawCompanyReferralRequest(SEEKER, 501)).rejects.toThrow(/already claimed/);
  });
});

describe("sending an ask through a personal link", () => {
  const input = { targetRoleUrl: ROLE_URL, personalPitch: PITCH, attachmentIds: [77], idempotencyKey: "ask-0000000000000002", fastTrackCode: CODE };
  const activeLink = (): FixtureRow => ({ id: 1, referrerId: LINK_OWNER, companyDomain: "acme.com", linkCode: CODE, isActive: true, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z") });

  it("assigns it to the link owner and writes the link marker in the same transaction", async () => {
    store.set("referrerFastTrackLinks", [activeLink()]);
    store.set("referralAttachments", [{ id: 77, ownerId: SEEKER, referralRequestId: null }]);
    store.set("profiles", [{ ...referrer(LINK_OWNER), email: "owner@acme.com" }]);
    const created = await createCompanyReferralRequest(SEEKER, input);
    expect(created).toMatchObject({ replayed: false, fastTrack: true, notifiedEmployees: 1 });
    const request = table("referralRequests").find(row => row.id === created.requestId);
    expect(request).toMatchObject({ referrerId: LINK_OWNER, status: "pending" });
    expect(table("referralTransitionEvents")).toEqual([expect.objectContaining({ referralRequestId: created.requestId, action: "link_assign", actorUserId: SEEKER, resultingRevision: 0 })]);
  });

});

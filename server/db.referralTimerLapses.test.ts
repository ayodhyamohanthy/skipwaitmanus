import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { notifications, referralAvailabilitySlots, referralRequestPasses, referralRequests } from "../drizzle/schema";
import { REFERRAL_TIMERS_SINCE } from "../shared/referral";
import { claimCompanyReferralRequest, getClaimedCompanyReferralDetail, lapseAllocationTx, lapseClaimTx, listCompanyReferralInboxByState, reviewReferralRequest, withdrawCompanyReferralRequest } from "./db";
import { drizzleFlowBaselineSource } from "./flowBaselineSource";
import { createReferralTimers } from "./referralTimers";
import { COLLEAGUE, DAY_MS, LINK_OWNER, REQUEST_ID, SEEKER, allocatedSlot, askById, askRow, claimEvent, eventActions, noticesFor, reversalsOf, seedHeldAsks, store, walletOf } from "./heldAsk.testkit";

/*
 * D-038-A: a claim or an allocation nobody accepts or passes within 48 hours
 * goes back to the company's open queue, the referrer who let it lapse is
 * excluded, the seeker's credit is never spent twice, and a referrer holds at
 * most 5 open claims. Real server/db.ts calls over the in-memory database.
 *
 * Every clock here runs at or after REFERRAL_TIMERS_SINCE (D-076 (5)); a claim
 * made before it keeps the old lifecycle, which is its own case below.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const HOUR = 60 * 60 * 1000;
/** A claim made 12 h after the cut-off. */
const T = REFERRAL_TIMERS_SINCE + 12 * HOUR;
/** Its 48-hour lapse. */
const LAPSE = T + 48 * HOUR;
/** The ask fixture is created two days before the testkit clock; its 7-day shelf life ends here. */
const SHELF_END = Date.parse("2026-10-23T12:00:00.000Z");

/** The claim event at a chosen instant, so the lapse clock is deterministic. */
const claimAt = (requestId = REQUEST_ID, id = 39, atMs = T) => ({ ...claimEvent(requestId, id), createdAt: new Date(atMs) });

const passRows = () => store.rows(referralRequestPasses);
const slotStatuses = () => store.rows(referralAvailabilitySlots).map(row => row.status);
const decisionNotices = (userId: number) => noticesFor(userId).filter(row => row.title === "An ask is waiting for your decision");
const claimedByOwner = (over: Record<string, unknown> = {}) => askRow({ revision: 1, updatedAt: new Date(T), ...over });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  seedHeldAsks();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("D-038-A: a claim lapses after 48 hours", () => {
  it("a claim lapses 48 hours after it was made, and the ask goes back to colleagues", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()], slots: [allocatedSlot()] });

    expect(await lapseClaimTx(store.db as never, REQUEST_ID, LAPSE - 1)).toEqual({ lapsed: false });
    expect(askById()?.referrerId).toBe(LINK_OWNER);

    expect(await lapseClaimTx(store.db as never, REQUEST_ID, LAPSE)).toEqual({ lapsed: true, reason: "lapsed_claim" });

    expect(askById()).toMatchObject({ status: "pending", referrerId: null });
    expect(eventActions()).toEqual(["claim", "claim_lapse"]);
    // The exclusion row is a pass row with an exclusion code: every existing exclusion applies to it.
    expect(passRows().map(row => [row.reason, row.reasonCode])).toEqual([["timing", "lapsed_claim"]]);
    expect(slotStatuses()).toEqual(["released"]);

    const seekerNotice = noticesFor(SEEKER).find(row => String(row.body ?? "").startsWith("The verified employee who picked up your ask"));
    expect(seekerNotice?.body).toContain("didn't decide within 48 hours");
    expect(seekerNotice?.body).toContain("It's open again to other verified employees at acme.com");
    expect(noticesFor(LINK_OWNER).some(row => row.title === "An ask went back to your colleagues")).toBe(true);

    // A replay of the same lapse writes nothing at all.
    expect(await lapseClaimTx(store.db as never, REQUEST_ID, LAPSE + HOUR)).toEqual({ lapsed: false });
    expect(eventActions()).toEqual(["claim", "claim_lapse"]);
    expect(passRows()).toHaveLength(1);
  });

  it("a lapsed claim spends no credit: the ask expires later with exactly one refund", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    await lapseClaimTx(store.db as never, REQUEST_ID, LAPSE);
    expect(reversalsOf()).toEqual([]);

    const { expireStalePendingReferralRequest } = await import("./db");
    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, SHELF_END)).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf().map(row => row.kind)).toEqual(["expiry_refund"]);
  });

  it("control: a claim nobody lapsed keeps the credit spent", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    const { expireStalePendingReferralRequest } = await import("./db");
    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, SHELF_END)).toMatchObject({ expired: false });
    expect(reversalsOf()).toEqual([]);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(2);
  });

  it("withdraw after a lapse returns the credit once, and a replay adds nothing", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    await lapseClaimTx(store.db as never, REQUEST_ID, LAPSE);

    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: true });
    expect(reversalsOf()).toHaveLength(1);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);

    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(reversalsOf()).toHaveLength(1);
    expect(walletOf()?.monthlyCreditsRemaining).toBe(3);
  });

  it("nothing lapses before REFERRAL_TIMERS_SINCE + 48 hours", async () => {
    const longBefore = REFERRAL_TIMERS_SINCE - 30 * DAY_MS;
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt(REQUEST_ID, 39, longBefore)] });

    expect(await lapseClaimTx(store.db as never, REQUEST_ID, REFERRAL_TIMERS_SINCE + 48 * HOUR - 1)).toEqual({ lapsed: false });
    expect(askById()?.referrerId).toBe(LINK_OWNER);
    expect(await lapseClaimTx(store.db as never, REQUEST_ID, REFERRAL_TIMERS_SINCE + 48 * HOUR)).toEqual({ lapsed: true, reason: "lapsed_claim" });
  });
});

describe("D-038-A: an allocation lapses after 48 hours of visibility", () => {
  it("an allocation lapses 48 hours after first visibility and a colleague can claim it", async () => {
    seedHeldAsks({ asks: [askRow({ coverageVisibleAt: new Date(T), updatedAt: new Date(T) })], slots: [allocatedSlot()] });

    expect(await lapseAllocationTx(store.db as never, REQUEST_ID, LAPSE - 1)).toEqual({ lapsed: false });
    expect(await lapseAllocationTx(store.db as never, REQUEST_ID, LAPSE)).toEqual({ lapsed: true, reason: "lapsed_allocation" });

    expect(askById()).toMatchObject({ status: "pending", referrerId: null });
    expect(passRows().map(row => row.reasonCode)).toEqual(["lapsed_allocation"]);
    expect(slotStatuses()).toEqual(["released"]);
    expect(noticesFor(SEEKER).some(row => String(row.body ?? "").startsWith("The verified employee it reached didn't respond within 48 hours"))).toBe(true);

    // The lapsed referrer can never see or claim it again; a colleague can.
    expect(await claimCompanyReferralRequest(COLLEAGUE, REQUEST_ID)).toMatchObject({ claimed: true });
    expect(askById()?.referrerId).toBe(COLLEAGUE);
  });
});

describe("D-038-A: the reminder and the cap", () => {
  it("a reminder is sent once, at 24 hours, and never before", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    const job = createReferralTimers();

    await job({ nowMs: T + 23 * HOUR } as never);
    expect(decisionNotices(LINK_OWNER)).toHaveLength(0);

    await job({ nowMs: T + 24 * HOUR } as never);
    expect(decisionNotices(LINK_OWNER)).toHaveLength(1);
    expect(decisionNotices(LINK_OWNER)[0]?.body).toContain("After 48 hours it goes back to your colleagues");

    await job({ nowMs: T + 30 * HOUR } as never);
    expect(decisionNotices(LINK_OWNER)).toHaveLength(1);
  });

  it("the 6th open claim is refused, and a decline frees room", async () => {
    const held = [501, 502, 503, 504, 505];
    seedHeldAsks({
      asks: [...held.map(id => askRow({ id, revision: 1, updatedAt: new Date(T), createdAt: new Date(T) })), askRow({ id: 506, referrerId: null, revision: 0, updatedAt: new Date(T), createdAt: new Date(T) })],
      events: held.map((id, index) => claimAt(id, 100 + index)),
    });

    await expect(claimCompanyReferralRequest(LINK_OWNER, 506)).rejects.toThrow(/^You can hold 5 asks at once\. Accept or pass one of them first\.$/);

    // A decline reopens the ask and ends that claim, so the next claim fits.
    await reviewReferralRequest(LINK_OWNER, { requestId: 501, decision: "declined" });
    expect(askById(501)?.referrerId).toBeNull();
    expect(await claimCompanyReferralRequest(LINK_OWNER, 506)).toMatchObject({ claimed: true });
    expect(askById(506)?.referrerId).toBe(LINK_OWNER);
  });

  it("the job isolates its steps: a failing lapse step does not stop the others", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    const job = createReferralTimers({
      listCandidates: async () => ({ claimsToLapse: [{ id: REQUEST_ID, referrerId: LINK_OWNER, companyDomain: "acme.com" }], claimsToRemind: [], allocationsToLapse: [{ id: 999, referrerId: LINK_OWNER, companyDomain: "acme.com" }], allocationsToRemind: [], referredToLapse: [], referredToRemind: [] }),
      lapseClaim: async (tx, requestId, nowMs) => lapseClaimTx(tx, requestId, nowMs),
      lapseAllocation: async () => { throw new Error("allocation step exploded"); },
      lapseReferred: async () => ({ lapsed: false }),
      stepBack: async () => ({ lapsed: false }),
    });

    const output = await job({ nowMs: LAPSE } as never);
    expect(askById()?.referrerId).toBeNull();
    expect(output.processed).toBeGreaterThanOrEqual(1);
    expect(output.failed).toBeGreaterThanOrEqual(1);
  });

  it("R-5: a re-allocated ask reminds its new holder, not only the one who lapsed", async () => {
    seedHeldAsks({ asks: [askRow({ coverageVisibleAt: new Date(T), updatedAt: new Date(T) })], slots: [allocatedSlot()] });
    const job = createReferralTimers();

    await job({ nowMs: T + 24 * HOUR } as never);
    expect(decisionNotices(LINK_OWNER)).toHaveLength(1);

    // The lapsed owner is excluded; the same ask is handed to a colleague (a new slot).
    await lapseAllocationTx(store.db as never, REQUEST_ID, LAPSE);
    await store.db.update(referralRequests).set({ referrerId: COLLEAGUE, coverageVisibleAt: new Date(LAPSE), updatedAt: new Date(LAPSE) }).where(eq(referralRequests.id, REQUEST_ID));
    await store.db.insert(referralAvailabilitySlots).values({ ...allocatedSlot(REQUEST_ID, 92), referrerId: COLLEAGUE, activeRequestKey: "request:501:b" });

    await job({ nowMs: LAPSE + 24 * HOUR } as never);
    expect(decisionNotices(COLLEAGUE)).toHaveLength(1);
    expect(String(decisionNotices(COLLEAGUE)[0]?.eventKey)).toBe("allocation-reminder:92");
  });

  it("R-6: repeating a claim on an ask the claimant already holds answers as before, never the cap", async () => {
    const held = [501, 502, 503, 504, 505];
    seedHeldAsks({
      asks: held.map(id => askRow({ id, revision: 1, updatedAt: new Date(T), createdAt: new Date(T) })),
      events: held.map((id, index) => claimAt(id, 100 + index)),
    });

    await expect(claimCompanyReferralRequest(LINK_OWNER, 501)).resolves.toMatchObject({ claimed: true, replayed: true });
    expect(askById(501)?.referrerId).toBe(LINK_OWNER);
  });
});

describe("D-038-A: what the surfaces show", () => {
  it("the admin baseline counts real passes and never a lapse", async () => {
    seedHeldAsks({
      asks: [claimedByOwner(), askRow({ id: 502, revision: 1, updatedAt: new Date(T), createdAt: new Date(T) })],
      events: [claimAt(), claimAt(502, 40)],
    });
    await lapseClaimTx(store.db as never, REQUEST_ID, LAPSE);
    await reviewReferralRequest(LINK_OWNER, { requestId: 502, decision: "declined" });

    expect(await drizzleFlowBaselineSource(store.db as never).loadPassedRequestIds()).toEqual([502]);
  });

  it("the referrer inbox and the thread carry the decision deadline for their own claim", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });

    const inbox = await listCompanyReferralInboxByState(LINK_OWNER, "new");
    expect(inbox.map(row => row.decisionDueAt)).toEqual([new Date(LAPSE).toISOString()]);

    const detail = await getClaimedCompanyReferralDetail(LINK_OWNER, REQUEST_ID);
    expect(detail?.decisionDueAt).toBe(new Date(LAPSE).toISOString());
  });

  it("another employee's inbox carries no decision deadline", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    const inbox = await listCompanyReferralInboxByState(COLLEAGUE, "new");
    expect(inbox.every(row => row.decisionDueAt === null)).toBe(true);
  });

  it("R-2: the thread detail omits the referred deadline and extension while part B is off", async () => {
    seedHeldAsks({
      asks: [askRow({ status: "approved", revision: 1, updatedAt: new Date(T) })],
      events: [{ ...claimEvent(), action: "review", operationKey: `review:${LINK_OWNER}:approved`, resultingStatus: "approved", createdAt: new Date(T) }],
    });

    const detail = await getClaimedCompanyReferralDetail(LINK_OWNER, REQUEST_ID);
    expect(detail).toBeDefined();
    expect(detail).not.toHaveProperty("referredDueAt");
    expect(detail).not.toHaveProperty("extensionUsed");
    expect(detail?.decisionDueAt).toBeNull();
  });
});

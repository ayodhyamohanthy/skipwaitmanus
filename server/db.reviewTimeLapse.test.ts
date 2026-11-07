import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralRequestPasses } from "../drizzle/schema";
import { REFERRAL_TIMERS_SINCE } from "../shared/referral";
import { ReferralTransitionConflict, reviewReferralRequest } from "./db";
import { LINK_OWNER, REQUEST_ID, askById, askRow, claimEvent, eventActions, seedHeldAsks, store } from "./heldAsk.testkit";

/*
 * D-038-A review-time enforcement: a claim past its 48-hour lapse is returned to
 * colleagues BEFORE any review decision is recorded, so a down or lagging timers
 * job can never let a lapsed claim approve or decline. The lapse commits in its
 * own transaction; the review then conflicts with the post-lapse state.
 * Preventive boundary correctness under the existing D-038(a) decision - every
 * clock runs against the unchanged production REFERRAL_TIMERS_SINCE floor.
 * Real server/db.ts calls over the in-memory database.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("../shared/referral", async () => {
  const actual = await vi.importActual<typeof import("../shared/referral")>("../shared/referral");
  return { ...actual, REFERRED_DEADLINE_ENABLED: false };
});

const HOUR = 60 * 60 * 1000;
/** A claim made 12 h after the cut-off. */
const T = REFERRAL_TIMERS_SINCE + 12 * HOUR;
/** Its 48-hour lapse. */
const LAPSE = T + 48 * HOUR;

const claimAt = (atMs = T) => ({ ...claimEvent(REQUEST_ID, 39), createdAt: new Date(atMs) });
const claimedByOwner = () => askRow({ revision: 1, updatedAt: new Date(T) });
const passRows = () => store.rows(referralRequestPasses);
const review = (decision: "approved" | "declined") => reviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision, message: "qa" }, Date.now());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  seedHeldAsks();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("D-038-A: review-time claim lapse enforcement", () => {
  it("a review before the lapse instant approves normally", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    vi.setSystemTime(T + 2 * HOUR);

    await expect(review("approved")).resolves.toMatchObject({ status: "approved" });
    expect(askById()).toMatchObject({ status: "approved", referrerId: LINK_OWNER });
    expect(eventActions()).toEqual(["claim", "review"]);
  });

  it("a review at the lapse instant lapses the claim and conflicts instead of approving", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    vi.setSystemTime(LAPSE);

    const err = await review("approved").catch(reason => reason);
    expect(err).toBeInstanceOf(ReferralTransitionConflict);
    expect(err.currentState).toMatchObject({ status: "pending" });
    expect(err.currentState.revision).toBe(askById()?.revision);

    // The lapse persisted: the ask is back with colleagues, the exclusion row and
    // transition event exist, and no approval was recorded.
    expect(askById()).toMatchObject({ status: "pending", referrerId: null });
    expect(eventActions()).toEqual(["claim", "claim_lapse"]);
    expect(passRows().map(row => [row.reason, row.reasonCode])).toEqual([["timing", "lapsed_claim"]]);
  });

  it("a decline at the lapse instant lapses instead of recording the pass", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    vi.setSystemTime(LAPSE);

    const err = await review("declined").catch(reason => reason);
    expect(err).toBeInstanceOf(ReferralTransitionConflict);
    expect(eventActions()).toEqual(["claim", "claim_lapse"]);
    expect(passRows().map(row => [row.reason, row.reasonCode])).toEqual([["timing", "lapsed_claim"]]);
    expect(askById()).toMatchObject({ status: "pending", referrerId: null });
  });

  it("a claim made before the cut-off stays reviewable until REFERRAL_TIMERS_SINCE + 48 h", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt(REFERRAL_TIMERS_SINCE - 12 * HOUR)] });
    vi.setSystemTime(REFERRAL_TIMERS_SINCE + 47 * HOUR);

    await expect(review("approved")).resolves.toMatchObject({ status: "approved" });
    expect(askById()).toMatchObject({ status: "approved", referrerId: LINK_OWNER });
  });

  it("a claim made before the cut-off lapses at REFERRAL_TIMERS_SINCE + 48 h", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt(REFERRAL_TIMERS_SINCE - 12 * HOUR)] });
    vi.setSystemTime(REFERRAL_TIMERS_SINCE + 49 * HOUR);

    const err = await review("approved").catch(reason => reason);
    expect(err).toBeInstanceOf(ReferralTransitionConflict);
    expect(eventActions()).toEqual(["claim", "claim_lapse"]);
    expect(askById()).toMatchObject({ status: "pending", referrerId: null });
  });

  it("a replayed decision after approval is untouched by the lapse pre-check", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    vi.setSystemTime(T + 2 * HOUR);
    await review("approved");

    await expect(review("approved")).resolves.toMatchObject({ status: "approved" });
    expect(askById()).toMatchObject({ status: "approved", referrerId: LINK_OWNER });
    expect(eventActions()).toEqual(["claim", "review"]);
  });

  it("a review one millisecond before the lapse instant still approves (boundary)", async () => {
    seedHeldAsks({ asks: [claimedByOwner()], events: [claimAt()] });
    vi.setSystemTime(LAPSE - 1);

    await expect(review("approved")).resolves.toMatchObject({ status: "approved" });
    expect(askById()).toMatchObject({ status: "approved", referrerId: LINK_OWNER });
    expect(eventActions()).toEqual(["claim", "review"]);
  });

  it("a tenure that began after a referred lapse, without a claim event, is never claim-lapsed at review time", async () => {
    // The stale claim below ended in a referred lapse; the current tenure holds the
    // ask with no claim event of its own (a coverage delivery sets referrerId with
    // no event). The review-time lapse must not let the dead tenure's clock govern
    // this one, past the dead claim's lapse instant or not.
    const referredLapse = { ...claimEvent(REQUEST_ID, 40), action: "referred_lapse", operationKey: "referred-lapse:39", createdAt: new Date(T + 8 * 24 * HOUR) };
    seedHeldAsks({ asks: [askRow({ revision: 3, updatedAt: new Date(T + 8 * 24 * HOUR) })], events: [claimAt(), referredLapse] });
    vi.setSystemTime(T + 8 * 24 * HOUR + 2 * HOUR);

    await expect(review("approved")).resolves.toMatchObject({ status: "approved" });
    expect(askById()).toMatchObject({ status: "approved", referrerId: LINK_OWNER });
    expect(eventActions()).toEqual(["claim", "referred_lapse", "review"]);
    expect(passRows()).toEqual([]);
  });
});

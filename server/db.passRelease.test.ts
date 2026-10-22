import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralTransitionEvents } from "../drizzle/schema";
import { CREDIT_ENDED_CAVEAT } from "../shared/moneyCopy";
import { expireStalePendingReferralRequest, oneClickReviewReferralRequest, withdrawCompanyReferralRequest } from "./db";
import { LINK_OWNER, REQUEST_ID, SEEKER, askRow, claimEvent, eventActions, noticesFor, reversalsOf, seedHeldAsks, store } from "./heldAsk.testkit";

/*
 * D-035: the pass reason decides the credit.
 *
 * A not-fixable reason (or no reason at all, D-076 (7)) releases the pickup, so
 * the credit comes back when the ask later ends. A fixable reason keeps it spent
 * as payment for the review. Either way the seeker sees what was said, never who
 * said it, and the ask stays open to colleagues (D-021).
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const DAY_MS = 24 * 60 * 60 * 1000;
/** The ask fixture is created two days before the testkit clock; its 7-day shelf life ends here. */
const SHELF_END = Date.parse("2026-10-23T12:00:00.000Z");

/** A claimed ask: the pickup is what makes the pass's credit effect matter. */
const seedClaimed = () => seedHeldAsks({ asks: [askRow({ revision: 1 })], events: [claimEvent()] });

const pass = (over: { declineReason: "role_not_a_fit" | "cannot_support" | "timing"; passReason?: string }) =>
  oneClickReviewReferralRequest(LINK_OWNER, { requestId: REQUEST_ID, decision: "declined", ...over });

const passEvents = () => store.rows(referralTransitionEvents).filter(event => String(event.action ?? "").startsWith("pass"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  seedClaimed();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("D-035: a not-fixable pass releases the pickup", () => {
  it("a not-fixable pass after a claim releases the credit, which comes back on expiry", async () => {
    await pass({ declineReason: "role_not_a_fit", passReason: "role_closed" });

    expect(passEvents().map(event => event.action)).toEqual(["pass_release"]);
    // The pass itself moves no ledger row (D-076 (1)).
    expect(reversalsOf()).toEqual([]);

    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, SHELF_END)).toMatchObject({ expired: true, status: "closed" });
    expect(reversalsOf().map(row => row.kind)).toEqual(["expiry_refund"]);
  });

  it("a not-fixable pass releases the pickup for a withdrawal too, once", async () => {
    await pass({ declineReason: "cannot_support", passReason: "not_my_team" });

    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: true });
    expect(reversalsOf().map(row => row.kind)).toEqual(["withdrawal_refund"]);
    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(reversalsOf()).toHaveLength(1);
  });

  it("a legacy pass with no reason code counts as not fixable and releases", async () => {
    await pass({ declineReason: "timing" });

    expect(passEvents().map(event => event.action)).toEqual(["pass_release"]);
    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, SHELF_END)).toMatchObject({ expired: true });
    expect(reversalsOf().map(row => row.kind)).toEqual(["expiry_refund"]);
  });

  it("control: a fixable pass keeps the credit spent", async () => {
    await pass({ declineReason: "role_not_a_fit", passReason: "needs_experience" });

    expect(passEvents().map(event => event.action)).toEqual(["pass"]);
    expect(await expireStalePendingReferralRequest(SEEKER, REQUEST_ID, SHELF_END)).toMatchObject({ expired: true });
    expect(reversalsOf()).toEqual([]);
  });
});

describe("D-035: the seeker is told what was said, never who said it", () => {
  const body = () => String(noticesFor(SEEKER).find(row => String(row.title ?? "").startsWith("Update on your referral request"))?.body ?? "");

  it("a not-fixable reason promises the credit back when the ask ends", async () => {
    await pass({ declineReason: "role_not_a_fit", passReason: "role_closed" });
    expect(body()).toBe(`A verified employee at acme.com said: Role is closed. Your ask is open again to other verified employees there. If nobody picks it up, your credit comes back, ${CREDIT_ENDED_CAVEAT}.`);
    expect(body()).not.toMatch(/Riya|link you used/);
  });

  it("a fixable reason points at the profile, with no credit promise", async () => {
    await pass({ declineReason: "cannot_support", passReason: "not_enough_context" });
    expect(body()).toBe("A verified employee at acme.com said: Not enough context. Your ask is open again to other verified employees there. Updating your profile or note can help the next employee decide.");
    expect(body()).not.toMatch(/credit|refund/i);
  });

  it("a legacy pass with no code omits the opening line", async () => {
    await pass({ declineReason: "timing" });
    expect(body()).toBe(`Your ask is open again to other verified employees there. If nobody picks it up, your credit comes back, ${CREDIT_ENDED_CAVEAT}.`);
  });

  it("control: an unclaimed pass moves no money and keeps today's notice", async () => {
    seedHeldAsks({ asks: [askRow({ referrerId: null, revision: 0 })] });
    await pass({ declineReason: "role_not_a_fit", passReason: "role_closed" });
    expect(reversalsOf()).toEqual([]);
    expect(body()).toBe("The employee can't help right now (Role is closed). Your request stays active for other employees.");
  });
});

describe("D-035: the release set stays exact", () => {
  it("a fixable pass leaves the earlier claim as the latest pickup", async () => {
    await pass({ declineReason: "role_not_a_fit", passReason: "needs_experience" });
    expect(eventActions()).toEqual(["claim", "pass"]);

    // The ask reopened for colleagues, but the claim is still its latest pickup-or-release event,
    // so the pickup was never released: a withdrawal withdraws, keeps the credit spent and moves no
    // ledger row. (After a not-fixable pass the same withdrawal refunds — see the release describe.)
    expect(await withdrawCompanyReferralRequest(SEEKER, REQUEST_ID)).toMatchObject({ withdrawn: true, creditRefunded: false });
    expect(reversalsOf()).toEqual([]);
  });
});

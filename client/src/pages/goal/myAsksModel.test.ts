import { describe, expect, it } from "vitest";
import type { CreditLedgerEntry } from "@shared/creditLedger";
import type { MyAsk } from "./myAsksApi";
import { groupAskViews, indexLedger, slotsLine, toAskView } from "./myAsksModel";

const fmt = (iso: string) => iso.slice(0, 10);
const ask = (over: Partial<MyAsk>): MyAsk => ({
  id: 7, displayRef: "R-AAAAA", title: "Role from shared job link", targetRoleUrl: "https://example.com/careers/data-analyst", companyDomain: "example.com",
  companyName: "Example Co", companyInitials: "EC", jobFunction: "Data", status: "pending", referrerId: null, queueStatus: null, waitingForCoverage: false,
  coverageVisibleAt: "2026-10-01T00:00:00.000Z", coverageHeldAt: null, heldForReferrer: false, unclaimedAssignment: false, unreadMessageCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", expiresAt: "2026-10-08T00:00:00.000Z", ...over,
});
const entry = (id: number, credits: number, refId: string): CreditLedgerEntry => ({ id, kind: credits < 0 ? "credit_spend" : "withdrawal_refund", credits, bucket: "cycle", reference: { type: "referral_request", id: refId }, createdAt: "2026-10-01T00:00:00.000Z" });

describe("indexLedger", () => {
  it("joins spends and refunds per ask across every reference form", () => {
    const index = indexLedger([entry(1, -1, "7"), entry(2, 1, "7#refund"), entry(3, -1, "8#1"), { ...entry(4, -5, "9"), reference: { type: "payment_fulfillment", id: "9" } }]);
    expect(index.get(7)).toEqual({ spent: 1, returned: 1 });
    expect(index.get(8)).toEqual({ spent: 1, returned: 0 });
    expect(index.has(9)).toBe(false);
  });
});

describe("toAskView: statuses, steps and honest money lines", () => {
  it("a covered, unclaimed ask is Waiting, withdrawable, and names the close date with the ended-credit caveat", () => {
    const view = toAskView(ask({}), { spent: 1, returned: 0 }, fmt);
    expect([view.status, view.label, view.stage, view.section, view.canWithdraw]).toEqual(["waiting", "Waiting", 0, "active", true]);
    expect(view.role).toBe("Data Analyst");
    expect(view.next).toBe("Nothing to do yet. If nobody picks it up by 2026-10-08, it closes and your credit comes back.");
    expect(view.credit).toEqual({ label: "1 credit spent", detail: "Comes back if nobody picks it up by 2026-10-08, unless its month or plan has ended by then" });
  });

  it("a waiting-for-coverage ask spends nothing and says so (D-034)", () => {
    const view = toAskView(ask({ waitingForCoverage: true, coverageVisibleAt: null, queueStatus: "waiting_for_coverage" }), undefined, fmt);
    expect(view.credit?.label).toBe("No credit used yet");
    expect(view.next).toContain("costs nothing until one can");
  });

  it("a held ask asks for a credit (D-047)", () => {
    const view = toAskView(ask({ queueStatus: "held_for_credit", coverageHeldAt: "2026-10-03T00:00:00.000Z" }), undefined, fmt);
    expect(view.needsCredit).toBe(true);
    expect(view.next).toBe("A verified employee at Example Co can now see asks. Add a credit to send yours.");
  });

  it("an ask with a referrer is Under review and cannot be withdrawn; no refund promise is made", () => {
    const view = toAskView(ask({ referrerId: 9 }), { spent: 1, returned: 0 }, fmt);
    expect([view.status, view.stage, view.canWithdraw]).toEqual(["under_review", 1, false]);
    expect(view.credit).toEqual({ label: "1 credit spent", detail: null });
  });

  it("a personal-link ask its employee has not acted on stays withdrawable (D-050)", () => {
    expect(toAskView(ask({ referrerId: 9, heldForReferrer: true }), undefined, fmt).canWithdraw).toBe(true);
  });

  it("an ask handed to one referrer who has not claimed it stays withdrawable (P0-allocated-ask-stuck)", () => {
    expect(toAskView(ask({ referrerId: 9, unclaimedAssignment: true }), undefined, fmt)).toMatchObject({ status: "waiting", canWithdraw: true });
  });

  it("accepted is neutral and referred is the only emerald status", () => {
    expect(toAskView(ask({ status: "approved", referrerId: 9 }), undefined, fmt)).toMatchObject({ status: "accepted", stage: 2, hasConversation: true });
    expect(toAskView(ask({ status: "intro_made", referrerId: 9 }), undefined, fmt)).toMatchObject({ status: "referred", label: "Referred", stage: 3 });
  });

  it("says a credit came back only when a refund row exists", () => {
    expect(toAskView(ask({ status: "withdrawn" }), { spent: 1, returned: 1 }, fmt).credit?.label).toBe("1 credit returned");
    expect(toAskView(ask({ status: "withdrawn" }), { spent: 1, returned: 0 }, fmt).credit?.label).toBe("1 credit spent");
    expect(toAskView(ask({ status: "closed" }), { spent: 1, returned: 1 }, fmt)).toMatchObject({ status: "expired", terminal: "expired", label: "Expired", credit: { label: "1 credit returned", detail: null } });
  });

  it("a closed ask with a referrer ended after acceptance, never as Expired", () => {
    expect(toAskView(ask({ status: "closed", referrerId: 9 }), undefined, fmt)).toMatchObject({ label: "Closed", terminal: "withdrawn", stage: 2 });
  });
});

describe("grouping and slots", () => {
  it("puts active asks first (newest first) and closed asks after (latest change first)", () => {
    const asks = [ask({ id: 1, createdAt: "2026-10-01T00:00:00.000Z" }), ask({ id: 2, createdAt: "2026-10-03T00:00:00.000Z" }), ask({ id: 3, status: "withdrawn", updatedAt: "2026-10-04T00:00:00.000Z" }), ask({ id: 4, status: "withdrawn", updatedAt: "2026-10-05T00:00:00.000Z" })];
    const groups = groupAskViews(asks.map(item => toAskView(item, undefined, fmt)), asks);
    expect(groups.active.map(view => view.id)).toEqual([2, 1]);
    expect(groups.closed.map(view => view.id)).toEqual([4, 3]);
  });
  it("writes the open-asks line with or without a cap", () => {
    expect(slotsLine({ open: 2, cap: 3, planLabel: "Free" })).toBe("Open asks 2 of 3 · Free plan");
    expect(slotsLine({ open: 4, cap: null, planLabel: "Momentum" })).toBe("Open asks 4 · Momentum plan");
    expect(slotsLine(null)).toBeNull();
  });
});

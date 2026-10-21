import { describe, expect, it } from "vitest";
import { queueRow, type QueueRowInput } from "./queueRow";

const NOW = Date.parse("2026-10-21T09:00:00Z");

const base: QueueRowInput = {
  id: 41,
  companyDomain: "kestrelpay.com",
  companyName: "Kestrel Pay",
  companyInitials: "KP",
  jobFunction: "Design",
  targetRoleUrl: "https://kestrelpay.com/careers/product-designer-merchant-onboarding",
  status: "pending",
  createdAt: "2026-10-13T10:00:00Z",
  updatedAt: "2026-10-13T10:00:00Z",
  attachmentCount: 2,
  isClaimedByYou: false,
  expiresAt: "2026-10-23T10:00:00Z",
};

describe("queueRow", () => {
  it("names the ask by the role in its job link, which the referrer can already see", () => {
    expect(queueRow(base, NOW).roleTitle).toBe("Product Designer Merchant Onboarding");
  });

  it("falls back to the job function when the link has no readable words, never a made-up title", () => {
    const row = queueRow({ ...base, targetRoleUrl: "https://kestrelpay.com/jobs/8f3a91c2" }, NOW);
    expect(row.roleTitle).toBeNull();
    expect(row.rowTitle).toBe("Design role");
    const unlabelled = queueRow({ ...base, targetRoleUrl: null, jobFunction: null }, NOW);
    expect(unlabelled.rowTitle).toBe("Referral request");
    expect(unlabelled.functionLabel).toBeNull();
  });

  it("reads an unclaimed ask as New and a claimed one as Under review, both in ink", () => {
    expect(queueRow(base, NOW)).toMatchObject({ status: "queue_new", statusLabel: "New" });
    expect(queueRow({ ...base, isClaimedByYou: true }, NOW)).toMatchObject({ status: "queue_review", statusLabel: "Under review" });
  });

  it("keeps a day-level clock and marks two days or fewer as urgent", () => {
    expect(queueRow(base, NOW)).toMatchObject({ daysLeft: 2, clockLabel: "2 days left", clockUrgent: true });
    const later = queueRow({ ...base, expiresAt: "2026-10-27T10:00:00Z" }, NOW);
    expect(later).toMatchObject({ daysLeft: 6, clockLabel: "6 days left", clockUrgent: false });
    expect(queueRow({ ...base, expiresAt: "2026-10-21T23:00:00Z" }, NOW).clockLabel).toBe("Less than a day left");
  });

  it("says Expired once the window is gone, with no negative count", () => {
    const expired = queueRow({ ...base, expiresAt: "2026-10-20T10:00:00Z" }, NOW);
    expect(expired).toMatchObject({ daysLeft: 0, clockLabel: "Expired", clockUrgent: false });
  });

  it("has no clock for an ask that is no longer waiting", () => {
    expect(queueRow({ ...base, isClaimedByYou: true }, NOW).clockLabel).toBeNull();
    expect(queueRow({ ...base, status: "approved" }, NOW).clockLabel).toBeNull();
  });

  it("uses the server clock window when the payload omits expiresAt", () => {
    const row = queueRow({ ...base, expiresAt: null, createdAt: "2026-10-16T10:00:00Z" }, NOW);
    // Seven days from first visibility (the shared shelf life), not a client guess.
    expect(row.daysLeft).toBe(2);
  });

  it("names every decided ask without crimson and without claiming a credit moved", () => {
    expect(queueRow({ ...base, status: "approved" }, NOW)).toMatchObject({ status: "accepted", statusLabel: "Accepted" });
    expect(queueRow({ ...base, status: "intro_made" }, NOW)).toMatchObject({ status: "referred", statusLabel: "Referred" });
    expect(queueRow({ ...base, status: "declined" }, NOW)).toMatchObject({ status: "withdrawn", statusLabel: "Passed on" });
    expect(queueRow({ ...base, status: "withdrawn" }, NOW)).toMatchObject({ status: "withdrawn", statusLabel: "Withdrawn" });
    expect(queueRow({ ...base, status: "closed" }, NOW)).toMatchObject({ status: "withdrawn", statusLabel: "Closed" });
  });

  it("carries only the facts the surface renders, so nothing private or invented can leak", () => {
    const row = queueRow({ ...base, compensation: "₹40L" } as QueueRowInput, NOW);
    expect(Object.keys(row).sort()).toEqual([
      "attachmentCount", "clockLabel", "clockUrgent", "companyLabel", "daysLeft", "functionLabel",
      "id", "isPending", "roleTitle", "rowTitle", "status", "statusLabel",
    ]);
    expect(JSON.stringify(row)).not.toContain("40L");
  });
});

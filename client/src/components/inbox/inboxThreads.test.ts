import { describe, expect, it } from "vitest";
import { referralStatuses } from "@shared/referral";
import { askingListSchema, askingThread, buildInboxThreads, companyIdentity, filterInboxThreads, kitStatusFor, referringListSchema, referringThread, timeAgo, type AskingRow, type ReferringRow } from "./inboxThreads";

const NOW = Date.parse("2026-10-08T04:30:00.000Z");
const asking = (patch: Partial<AskingRow> = {}): AskingRow => ({ id: 1, title: "Data Analyst", companyDomain: "merkle.com", status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, updatedAt: "2026-10-06T04:30:00.000Z", ...patch });
const referring = (patch: Partial<ReferringRow> = {}): ReferringRow => ({ id: 2, companyDomain: "wipro.com", status: "pending", unreadMessageCount: 0, updatedAt: "2026-10-08T03:30:00.000Z", ...patch });

describe("inbox thread derivation", () => {
  it("maps every live referral status onto the kit status vocabulary", () => {
    expect(referralStatuses.map(kitStatusFor)).toEqual(["Requested", "Accepted", "Declined", "Referred", "Interviewing", "Offer", "Closed", "Withdrawn"]);
  });

  it("names launch companies and falls back to the raw domain", () => {
    expect(companyIdentity("wipro.com")).toEqual({ name: "Wipro", mark: "W" });
    expect(companyIdentity("goneutrinos.com")).toEqual({ name: "Go Neutrinos", mark: "GN" });
    expect(companyIdentity("acme.io")).toEqual({ name: "acme.io", mark: "A" });
  });

  it("keeps the referrer anonymous before accept and never invents a referrer name after", () => {
    const pending = askingThread(asking());
    expect(pending).toMatchObject({ who: "Someone at Merkle", note: "Waiting for a referrer to accept", pill: "Requested", highlight: false, href: "/conversation/1" });
    expect(askingThread(asking({ queueStatus: "waiting_for_coverage" })).note).toBe("Waiting for coverage");
    const accepted = askingThread(asking({ status: "approved", referrerId: 9, referrerMessage: "Happy to help" }));
    expect(accepted).toMatchObject({ who: "Your referrer · Merkle", note: "Happy to help", pill: "Accepted" });
    expect(askingThread(asking({ status: "intro_made", referrerId: 9 })).note).toBe("Introduction made");
  });

  it("reads an unclaimed closed ask as Expired and a post-accept close as Closed", () => {
    expect(askingThread(asking({ status: "closed", referrerId: null }))).toMatchObject({ who: "Someone at Merkle", pill: "Expired", note: "This request expired." });
    expect(askingThread(asking({ status: "closed", referrerId: 9, referrerMessage: "All done" }))).toMatchObject({ who: "Your referrer · Merkle", pill: "Closed", note: "All done" });
  });

  it("prefers unread counts and marks them for attention", () => {
    expect(askingThread(asking({ status: "approved", referrerId: 9, referrerMessage: "Hi", unreadMessageCount: 1 }))).toMatchObject({ note: "1 new message", unread: 1, highlight: true });
    expect(referringThread(referring({ status: "approved", unreadMessageCount: 3 }))).toMatchObject({ note: "3 new messages", highlight: true });
  });

  it("hides the seeker until accept and highlights asks awaiting a decision", () => {
    expect(referringThread(referring())).toMatchObject({ who: "Seeker · identity hidden", identity: "hidden", role: "Wipro", note: "New ask for you to review", pill: "Requested", highlight: true, href: "/conversation/2?from=inbox" });
    expect(referringThread(referring({ status: "declined" }))).toMatchObject({ who: "Seeker · identity hidden", identity: "hidden", pill: "Declined", highlight: false });
    expect(referringThread(referring({ status: "interview" }))).toMatchObject({ who: "Seeker · identity shared", identity: "shared", pill: "Interviewing" });
  });

  it("merges, de-duplicates referring rows and sorts newest first", () => {
    const threads = buildInboxThreads([asking({ id: 1, updatedAt: "2026-10-01T00:00:00.000Z" })], [referring({ id: 2 }), referring({ id: 2 }), referring({ id: 3, updatedAt: "2026-10-05T00:00:00.000Z" })]);
    expect(threads.map(thread => thread.key)).toEqual(["referring-2", "referring-3", "asking-1"]);
  });

  it("filters by side and free-text query across visible fields only", () => {
    const threads = buildInboxThreads([asking()], [referring()]);
    expect(filterInboxThreads(threads, "asking", "").map(t => t.key)).toEqual(["asking-1"]);
    expect(filterInboxThreads(threads, "all", "merkle").map(t => t.key)).toEqual(["asking-1"]);
    expect(filterInboxThreads(threads, "all", "tcs")).toEqual([]);
  });

  it("formats compact relative times", () => {
    expect(timeAgo("2026-10-08T04:20:00.000Z", NOW)).toBe("10m");
    expect(timeAgo("2026-10-08T03:30:00.000Z", NOW)).toBe("1h");
    expect(timeAgo("2026-10-03T04:30:00.000Z", NOW)).toBe("5d");
    expect(timeAgo("not a date", NOW)).toBe("");
  });

  it("validates list payloads at the boundary", () => {
    expect(askingListSchema.safeParse({ requests: [{ ...asking(), referrerId: undefined, unreadMessageCount: undefined }] }).success).toBe(true);
    expect(askingListSchema.safeParse({ requests: [{ ...asking(), status: "hired" }] }).success).toBe(false);
    expect(referringListSchema.safeParse({ requests: [{ id: 0, companyDomain: "wipro.com", status: "pending", updatedAt: "x" }] }).success).toBe(false);
    expect(referringListSchema.safeParse({}).success).toBe(false);
  });
});

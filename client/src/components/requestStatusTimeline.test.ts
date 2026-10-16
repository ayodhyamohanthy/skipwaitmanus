import { describe, expect, it } from "vitest";
import { buildRequestTimeline } from "./RequestStatusTimeline";

const base = { createdAt: "2026-09-01T09:41:00.000Z", updatedAt: "2026-09-02T14:05:00.000Z" };

describe("buildRequestTimeline (seeker-visible status history)", () => {
  it("shows sent → waiting → decision-waiting for an unclaimed pending request", () => {
    const entries = buildRequestTimeline({ ...base, status: "pending", referrerId: null });
    expect(entries.map(entry => [entry.label, entry.state])).toEqual([
      ["Request sent", "done"],
      ["Waiting for a verified employee", "waiting"],
      ["Decision", "waiting"],
    ]);
    expect(entries[0].date).toBe(base.createdAt);
  });

  it("names company coverage as the blocker when routing reports no eligible employee", () => {
    const entries = buildRequestTimeline({ ...base, status: "pending", referrerId: null, queueStatus: "waiting_for_coverage" });
    expect(entries[1].label).toBe("Waiting for company coverage");
  });

  it("marks the claim step as done once a verified employee holds the request, without exposing who", () => {
    const entries = buildRequestTimeline({ ...base, status: "pending", referrerId: 77 });
    expect(entries[1]).toMatchObject({ label: "Claimed by a verified employee", state: "done", tone: "blue", date: base.updatedAt });
    expect(JSON.stringify(entries)).not.toContain("77");
  });

  it("records approvals and declines with the semantic tone and decision timestamp", () => {
    expect(buildRequestTimeline({ ...base, status: "approved", referrerId: 77 }).at(-1)).toMatchObject({ label: "Referral accepted", tone: "green", date: base.updatedAt });
    expect(buildRequestTimeline({ ...base, status: "declined", referrerId: 77 }).at(-1)).toMatchObject({ label: "Declined", tone: "red", date: base.updatedAt });
  });

  it("appends the later milestone after acceptance and collapses withdrawals to two steps", () => {
    const interview = buildRequestTimeline({ ...base, status: "interview", referrerId: 77 });
    expect(interview.map(entry => entry.label)).toEqual(["Request sent", "Claimed by a verified employee", "Referral accepted", "Interview recorded"]);
    const withdrawn = buildRequestTimeline({ ...base, status: "withdrawn", referrerId: null });
    expect(withdrawn.map(entry => entry.label)).toEqual(["Request sent", "Withdrawn — credit returned"]);
  });
});

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

  it("shows an accepted request without implying employer submission", () => {
    const accepted = buildRequestTimeline({ ...base, status: "approved", referrerId: 77 });
    expect(accepted.at(-1)).toMatchObject({ label: "Request accepted", tone: "green", date: base.updatedAt });
    expect(accepted.map(entry => entry.label).join(" ")).not.toMatch(/submitted|referred/i);
    expect(buildRequestTimeline({ ...base, status: "declined", referrerId: 77 }).at(-1)).toMatchObject({ label: "Declined", tone: "red", date: base.updatedAt });
  });

  it("labels later milestones as participant reports and collapses withdrawals", () => {
    for (const [status, label] of [["intro_made", "Introduction reported"], ["interview", "Interview reported"], ["offer", "Offer reported"]] as const) {
      const entries = buildRequestTimeline({ ...base, status, referrerId: 77 });
      expect(entries.map(entry => entry.label)).toEqual(["Request sent", "Claimed by a verified employee", "Request accepted", label]);
      expect(entries.at(-1)?.date).toBe(base.updatedAt);
    }
    const withdrawn = buildRequestTimeline({ ...base, status: "withdrawn", referrerId: null });
    expect(withdrawn.map(entry => entry.label)).toEqual(["Request sent", "Withdrawn — credit returned"]);
  });
});

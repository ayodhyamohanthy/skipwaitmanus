import { describe, expect, it } from "vitest";
import { cleanNote, groupEvents, reportSeverity, reviewDueAt } from "./moderationCase";
import { reportCase } from "../client/src/components/admin/reviewCases";

describe("moderation case file helpers", () => {
  it("derives severity and the due time from the urgent flag (4h urgent, 48h normal)", () => {
    expect(reportSeverity(true)).toBe("urgent");
    expect(reportSeverity(false)).toBe("normal");
    const t = Date.parse("2026-10-15T00:00:00Z");
    expect(reviewDueAt(t, true).toISOString()).toBe("2026-10-15T04:00:00.000Z");
    expect(reviewDueAt(t, false).toISOString()).toBe("2026-10-17T00:00:00.000Z");
  });
  it("trims reviewer notes, caps them and treats blanks as no note", () => {
    expect(cleanNote("  hi  ")).toBe("hi");
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote(5)).toBeNull();
    expect(cleanNote("x".repeat(900))).toHaveLength(500);
  });
  it("groups events per report oldest first", () => {
    const grouped = groupEvents([
      { reportId: 1, actorKind: "reviewer", kind: "resolved", note: "n", createdAt: new Date("2026-10-15T02:00:00Z") },
      { reportId: 1, actorKind: "reporter", kind: "opened", note: null, createdAt: new Date("2026-10-15T01:00:00Z") },
      { reportId: 2, actorKind: "reporter", kind: "opened", note: null, createdAt: new Date("2026-10-15T01:30:00Z") },
    ]);
    expect(grouped.get(1)?.map(e => e.kind)).toEqual(["opened", "resolved"]);
    expect(grouped.get(2)).toHaveLength(1);
  });
});

describe("report audit trail", () => {
  const base = { id: 7, reason: "Spam", details: null, referralRequestId: null, reportedUserId: null, urgent: false, status: "resolved", createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), updatedAt: null };
  it("renders stored events with actor and the reviewer note", () => {
    const audit = reportCase({ ...base, events: [{ actor: "reporter", kind: "opened", note: null, createdAt: base.createdAt }, { actor: "reviewer", kind: "resolved", note: "Confirmed spam pattern.", createdAt: new Date().toISOString() }] }).audit;
    expect(audit[0]).toContain("case opened by user report (reporter)");
    expect(audit[1]).toContain("marked resolved (reviewer)");
    expect(audit[1]).toContain('"Confirmed spam pattern."');
  });
  it("falls back to the derived lines for reports filed before events existed", () => {
    expect(reportCase({ ...base, events: [] }).audit[0]).toContain("case opened by user report");
    expect(reportCase(base).audit[0]).toContain("case opened by user report");
  });
});

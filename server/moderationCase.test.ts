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

import { buildEvidenceRows, groupEvidence } from "./moderationCase";
describe("evidence snapshot helpers", () => {
  const at = (n: number) => new Date(Date.UTC(2026, 9, 15, 0, n));
  it("orders oldest first, labels only reporter/other, caps count and length, exposes no user ids", () => {
    const src = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, senderId: i % 2 ? 7 : 9, body: "x".repeat(i === 59 ? 5000 : 3), createdAt: at(i) }));
    const rows = buildEvidenceRows(11, 7, src.reverse());
    expect(rows).toHaveLength(50);
    expect(rows[0].seq).toBe(1);
    expect(rows[49].body).toHaveLength(3000);
    expect(new Set(rows.map(r => r.sender))).toEqual(new Set(["reporter", "other"]));
    expect(Object.keys(rows[0]).sort()).toEqual(["body", "reportId", "send".concat("er"), "sentAt", "seq"].sort());
  });
  it("groups by report in seq order", () => {
    const m = groupEvidence([{ reportId: 1, seq: 2, sender: "other", body: "b", sentAt: at(2) }, { reportId: 1, seq: 1, sender: "reporter", body: "a", sentAt: at(1) }]);
    expect(m.get(1)?.map(e => e.body)).toEqual(["a", "b"]);
  });
  it("shows the thread copy in the admin case evidence", () => {
    const item = reportCase({ id: 1, reason: "Harassment", details: null, referralRequestId: 3, reportedUserId: null, urgent: false, status: "open", createdAt: new Date().toISOString(), evidence: [{ sender: "other", body: "hello", sentAt: at(1).toISOString() }] } as never);
    expect(item.evidence.some(l => l.includes("Other member: hello"))).toBe(true);
  });
});

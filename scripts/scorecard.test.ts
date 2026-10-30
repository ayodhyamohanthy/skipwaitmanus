import { describe, expect, it } from "vitest";
import {
  classifyPath, isRevert, kindOf, liveLine, median, mergedInWindow, reportCounts, sampleSpan, scorecardLines,
} from "./scorecard.mjs";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-30T00:00:00Z");

describe("PROCESS-scorecard: path rules (§0)", () => {
  it.each([
    ["docs/DECISIONS.md", "docs"],
    ["docs/plans/assignments.json", "docs"],
    ["app/docs/guide.md", "docs"],
    ["README.md", "docs"],
    [".github/copilot-instructions.md", "docs"],
    ["server/routes.test.ts", "test"],
    ["client/src/pages/Home.test.tsx", "test"],
    ["server/foo.spec.ts", "test"],
    ["scripts/nextTask.test.ts", "test"],
    ["scripts/scorecard.mjs", "script"],
    [".github/workflows/ci.yml", "script"],
    ["server/db.ts", "product"],
    ["client/src/App.tsx", "product"],
    ["shared/moneyCopy.ts", "product"],
    ["drizzle/deploy/0120_jobs.sql", "product"],
    ["package.json", "product"],
    ["server/docs.ts", "product"],
  ])("%s is %s", (path, kind) => {
    expect(classifyPath(path)).toBe(kind);
  });

  it("a merge with any product file is product code, even with tests and docs beside it", () => {
    expect(kindOf(["docs/BRIEF.md", "server/db.test.ts", "server/db.ts"])).toBe("product");
  });

  it("tests with docs or scripts beside them count as tests only when no product file changed", () => {
    expect(kindOf(["server/db.test.ts", "docs/BRIEF.md"])).toBe("tests");
    expect(kindOf(["scripts/next-task.mjs", "scripts/nextTask.test.ts"])).toBe("scripts");
  });

  it("documents alone are docs only; an unreadable diff is unknown, never docs", () => {
    expect(kindOf(["docs/BRIEF.md", "AGENTS.md"])).toBe("docs");
    expect(kindOf([])).toBe("unknown");
    expect(kindOf(null)).toBe("unknown");
  });
});

describe("PROCESS-scorecard: numbers", () => {
  it("median of odd and even samples, null for none", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("a revert is a pull request whose title starts with Revert", () => {
    expect(isRevert({ title: 'Revert "Per-credit range on /premium"' })).toBe(true);
    expect(isRevert({ title: "revert: drop pack copy" })).toBe(true);
    expect(isRevert({ title: "Add reverting guide" })).toBe(false);
  });

  it("keeps only merged pull requests from the window", () => {
    const prs = [
      { number: 1, merged_at: new Date(NOW - 1 * DAY).toISOString() },
      { number: 2, merged_at: null },
      { number: 3, merged_at: new Date(NOW - 8 * DAY).toISOString() },
    ];
    expect(mergedInWindow(prs, NOW, 7).map(p => p.number)).toEqual([1]);
  });

  it("states how many days the 100-item sample covers, and whether it is cut short", () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ updated_at: new Date(NOW - i * 0.03 * DAY).toISOString() }));
    expect(sampleSpan(full, NOW)).toEqual({ days: 3, truncated: true });
    expect(sampleSpan([{ updated_at: new Date(NOW - 9 * DAY).toISOString() }], NOW)).toEqual({ days: 9, truncated: false });
    expect(sampleSpan([], NOW)).toEqual({ days: 0, truncated: false });
  });

  it("counts board reports in the window by status, and blocked reports per task", () => {
    const reports = [
      { id: "A", status: "blocked", at: NOW - DAY },
      { id: "A", status: "blocked", at: NOW - 2 * DAY },
      { id: "B", status: "blocked", at: NOW - DAY },
      { id: "B", status: "landed", at: NOW - DAY },
      { id: "C", status: "green", at: NOW - 10 * DAY },
    ];
    expect(reportCounts(reports, NOW, 7)).toEqual({
      total: 4,
      byStatus: { blocked: 3, landed: 1 },
      blockedByTask: [["A", 2], ["B", 1]],
    });
  });

  it("the live line says whether each surface serves main's head", () => {
    expect(liveLine("API", "abc1234567", "abc1234567", 0)).toBe("Live API: abc12345 = main");
    expect(liveLine("web", "def0000000", "abc1234567", 3)).toBe("Live web: def00000, main is abc12345 (3 commits ahead)");
    expect(liveLine("web", null, "abc1234567", null)).toBe("Live web: unknown (probe failed)");
  });
});

describe("PROCESS-scorecard: output", () => {
  const card = scorecardLines({
    days: 7,
    sample: { days: 12, truncated: false },
    merged: [
      { number: 10, kind: "product", hours: 0.3, untracked: true, unreviewedTier1: false, revert: false },
      { number: 11, kind: "product", hours: 5, untracked: false, unreviewedTier1: true, revert: false },
      { number: 12, kind: "docs", hours: 1, untracked: false, unreviewedTier1: false, revert: true },
      { number: 13, kind: "tests", hours: 2, untracked: false, unreviewedTier1: null, revert: false },
    ],
    reports: { total: 2, byStatus: { blocked: 1, landed: 1 }, blockedByTask: [["X", 1]] },
    live: ["Live API: abc12345 = main"],
  });

  it("prints one number per line, in plain text", () => {
    expect(card).toContain("Merged PRs: 4 (product code 2, tests only 1, scripts 0, docs only 1, unknown 0)");
    expect(card).toContain("Product-code merges with no queue row: 1 (#10)");
    expect(card).toContain("Tier 1 merges without an independent pass on their head: 1 (#11)");
    expect(card).toContain("Merges whose review could not be read: 1 (#13)");
    expect(card).toContain("Open-to-merge: median 1.5 h, longest 5.0 h (#11)");
    expect(card).toContain("Reverts: 1 (#12)");
    expect(card).toContain("Board reports: 2 (blocked 1, landed 1)");
    expect(card).toContain("Blocked reports per task: X 1");
    expect(card).toContain("Live API: abc12345 = main");
    expect(card[0]).toMatch(/^Scorecard: last 7 days; the PR sample covers 12 days$/);
  });

  it("says plainly when the sample is shorter than the window", () => {
    const short = scorecardLines({ days: 7, sample: { days: 3, truncated: true }, merged: [], reports: { total: 0, byStatus: {}, blockedByTask: [] }, live: [] });
    expect(short[0]).toBe("Scorecard: last 7 days; the PR sample covers only 3 days (100-item page), so the counts below are a floor");
    expect(short).toContain("Open-to-merge: none merged");
    expect(short).toContain("Blocked reports per task: none");
  });
});

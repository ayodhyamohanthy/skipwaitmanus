// D-358 (owner, Nov 18 2026): "let no agent be blocked for taking a task". A claim or preview printed the whole board
// (526 lines, 103 KB, the assignment at line 515) and an agent with an output cap never read its assignment. The claim
// path now prints a short board; `--status` keeps the full one.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderBoard, renderBoardSummary } from "./nextTaskText.mjs";

const rows = Array.from({ length: 400 }, (_, i) => ({
  id: `T-${i}`,
  title: `A long task title for row ${i} that describes the work in plenty of words`,
  role: "CTO",
  tier: 2,
  state: i % 3 === 0 ? "done" : "todo",
  health: i % 50 === 1 ? "red" : "green",
  epic: i < 380 ? `E-${i % 12}` : undefined,
  pr: i % 7 === 2 ? `https://github.com/o/r/pull/${i}` : null,
  report: { status: "review", who: "Qwen · s1", note: "a long report note ".repeat(10), newer: [] },
}));

describe("renderBoardSummary (D-358)", () => {
  it("prints one line per priority, counts and the --status pointer, never a task line", () => {
    const text = renderBoardSummary(rows);
    expect(text).toContain("STATUS BOARD");
    expect(text).toContain("E-0: ");
    expect(text).toContain("node scripts/next-task.mjs --status");
    expect(text).toMatch(/400 tasks/);
    expect(text).not.toContain("T-5 — ");
    expect(text).not.toContain("T-0,");
    expect(text).not.toContain("a long report note");
  });

  it("stays short however many rows the board has", () => {
    const text = renderBoardSummary(rows);
    expect(text.split("\n").length).toBeLessThan(40);
    expect(text.length).toBeLessThan(4000);
    expect(renderBoard(rows).length).toBeGreaterThan(40_000);
  });

  it("counts each epic's done, open pull requests, red and released", () => {
    const text = renderBoardSummary([
      { id: "A", title: "a", tier: 2, state: "done", health: "green", epic: "X" },
      { id: "B", title: "b", tier: 2, state: "todo", health: "red", epic: "X", pr: "https://github.com/o/r/pull/1" },
      { id: "C", title: "c", tier: 2, state: "todo", health: "green" },
    ]);
    expect(text).toContain("X: 1/2 done, 1 PR, 1 red, 1 released");
    expect(text).toMatch(/3 tasks, 1 done/);
  });
});

describe("next-task claim and preview path (D-358)", () => {
  it("prints the summary where it printed the full board; --status keeps the full board", () => {
    const source = readFileSync(new URL("./next-task.mjs", import.meta.url), "utf8");
    const claimPath = source.slice(source.indexOf("for (let attempt = 1; attempt <= 6; attempt++)"));
    expect(claimPath).toContain("console.log(renderBoardSummary(board))");
    expect(claimPath).not.toContain("console.log(renderBoard(board))");
    expect(source).toContain("console.log(renderBoard(statusBoard(");
  });
});

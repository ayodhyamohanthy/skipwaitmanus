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

// D-360 (owner, Nov 18 2026): "zcode is stopping again after few mins". After D-358 the newest-decisions block still
// listed every entry newer than a stale syncedTo in full (75 lines, 13 KB). It now summarises the 10 newest and names
// every other entry by ID, so nothing D-202 requires is dropped and the assignment stays within output limits.
describe("the newest-decisions block (D-360)", () => {
  it("names every entry newer than syncedTo, summarises only the 10 newest and stays short", async () => {
    const { parseDecisionRegister } = await import("./nextTaskCore.mjs");
    const { renderPick } = await import("./nextTaskText.mjs");
    const long = "x".repeat(1800);
    const register = parseDecisionRegister(Array.from({ length: 90 }, (_, i) => {
      const n = String(i + 1).padStart(3, "0");
      return `| D-${n} | 2026-10-01 | **Summary ${n} ${long}** | e | — | adopted |`;
    }).join("\n"));
    const task = { id: "A", title: "a", tier: 2, branch: "agent/queue/a", syncedTo: "D-010", status: "todo" };
    const text = renderPick({ kind: "build", task } as never, { who: "Kimi · s1", date: "2026-11-18", claimed: true, register });
    const block = text.slice(0, text.indexOf("NEXT:"));
    expect(block.startsWith("Newest decisions (read before you work):")).toBe(true);
    for (let i = 10; i <= 90; i++) expect(block).toContain(`D-${String(i).padStart(3, "0")}`);
    expect(block).not.toContain("D-009");
    expect(block.match(/^- D-\d{3} · /gm)?.length).toBe(10);
    expect(block).toContain("- D-090 · 2026-10-01 · Summary 090 ");
    expect(block).not.toContain("x".repeat(200));
    expect(block).toContain("docs/DECISIONS.md");
    expect(block).toContain('--report blocked "A: conflicts with D-nnn"');
    expect(block.length).toBeLessThan(3000);
  });
});

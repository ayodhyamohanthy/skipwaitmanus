// PICKER-session-worktree (D-388): two sessions on one machine never share a working folder.
// Every printed `git worktree add ../skipwaitmanus-wt/<dir>` carries the claiming session's tag,
// and every hand-out says to stop rather than reuse a folder holding uncommitted changes.
import { describe, expect, it } from "vitest";
import { renderPick, worktreeDirFor } from "./nextTaskText.mjs";

const task = {
  id: "T", title: "Task", tier: 2, lane: "l", packet: "docs/plans/T.md", branch: "agent/queue/t",
  row: "D-212", status: "todo", dependsOn: [], sharedRow: true,
};
const tier1 = { ...task, tier: 1 };

/** One pick of every kind whose hand-out creates a worktree. */
const picks = {
  build: { kind: "build", task },
  takeover: { kind: "takeover", task, work: "agent/queue/t", since: 0, from: "Old · 0000" },
  green: { kind: "green", task, work: "agent/queue/t", pr: "#1", since: 0, from: "Old · 0000" },
  land: { kind: "land", task, work: "agent/queue/t", pr: "#1" },
  review: { kind: "review", task: tier1, work: "agent/queue/t", pr: "#1", lock: "agent/review/t" },
  fix: { kind: "fix", task: tier1, work: "agent/queue/t", pr: "#1", lock: "agent/review/t" },
  architect: { kind: "architect", task: { ...task, status: "architect", packet: null }, lock: "agent/architect/t", lockExists: true },
  resync: { kind: "resync", task, lock: "agent/architect/t", lockExists: true, decisions: [] },
  "fix-main": { kind: "fix-main", sha: "c".repeat(40), url: "u", lock: "agent/queue/fix-main-cccccccc" },
};

const dirsIn = (text: string) => [...text.matchAll(/\.\.\/skipwaitmanus-wt\/([^\s`]+)/g)].map(m => m[1]);
const render = (pick: object, who: string) => renderPick(pick, { who, date: "2026-11-24", claimed: true });

describe("PICKER-session-worktree: per-session worktree folders (D-388)", () => {
  for (const [kind, pick] of Object.entries(picks)) {
    it(`${kind}: two sessions get different folders, each ending with its own tag`, () => {
      const a = dirsIn(render(pick, "Alpha · aa11"));
      const b = dirsIn(render(pick, "Beta · bb22"));
      expect(a.length).toBeGreaterThan(0);
      expect(b).toHaveLength(a.length);
      for (const dir of a) expect(dir.endsWith("-aa11")).toBe(true);
      for (const dir of b) expect(dir.endsWith("-bb22")).toBe(true);
      for (const dir of a) expect(b).not.toContain(dir);
    });

    it(`${kind}: says to stop, not reuse, a folder that holds uncommitted changes`, () => {
      const text = render(pick, "Alpha · aa11");
      expect(text).not.toContain("if it already exists, use it");
      expect(text).toContain("if it holds uncommitted changes, stop and report instead of using it");
    });
  }

  it("one helper builds every folder from the base name and the session tag", () => {
    expect(worktreeDirFor("d178-read", "Qoder · 2b1b")).toBe("../skipwaitmanus-wt/d178-read-2b1b");
    expect(worktreeDirFor("architect-p", "Claude Code · s9")).toBe("../skipwaitmanus-wt/architect-p-s9");
  });

  it("a name without a session tag still yields a safe, distinct folder", () => {
    expect(worktreeDirFor("t", "Claude Code")).toBe("../skipwaitmanus-wt/t-claude-code");
    expect(worktreeDirFor("t", "Odd/Name · ../x y")).toBe("../skipwaitmanus-wt/t-x-y");
  });
});

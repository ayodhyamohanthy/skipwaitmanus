// PICKER-landed-marker-continuity (docs/plans/PICKER-landed-marker-continuity.md).
// S1: a deleted task branch whose pull request merged normally into main stays landed even when that pull
// request is outside the newest-100 closed window. S2: recreating the branch with only provably empty,
// recognized picker markers does not un-land it. Controls keep substantive work, unmerged marker-only
// branches and unknown reads unfinished. Adapter facts come from disposable local git history; GitHub pages
// are injected data, so nothing reaches a real remote.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as core from "./nextTaskCore.mjs";

const { pickNextTask, statusBoard, markerSubject, parseBranchLog } = core;
// The new adapter helpers; undefined before the fix, so every test that needs them fails for that reason.
const { BRANCH_LOG_FORMAT, markerOnlyOf, verifyMergedPull, collectLandedEvidence } = core as Record<string, any>;

const NOW = Date.parse("2026-11-05T21:00:00Z");
const B = "Builder · b1";
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Fixture ${id}`, row: id, packet: "docs/plans/test.md", tier: 2, lane: `lane-${id}`,
  branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [], syncedTo: "D-001", ...extra,
});
const tasks = [row("X"), row("Y")];
const base = { tasks, mainCi: { state: "green" }, openPrs: new Map(), prCi: new Map(), reports: [], now: NOW, claimant: "Picker · p1" };
const marker = (verb: string, id: string, who: string) => ({ verb, id, who });
const markerBranch = (extra: Record<string, unknown> = {}) => ({
  tipMs: NOW - 60_000, tipSha: "f".repeat(40), merged: false, work: false, markerOnly: true, markers: [marker("Claim", "X", B)], ...extra,
});
const merged = new Map([["agent/queue/x", { state: "merged", number: 7, mergeSha: "a".repeat(40) }]]);
const doneOf = (args: Record<string, unknown>) => {
  const board = statusBoard({ ...base, branches: new Map(), mergedHeads: new Map(), ...args } as any);
  const r = board.find((x: any) => x.id === "X");
  return { ...r, done: r.state === "done" };
};

describe("core: landed continuity (S1, S2)", () => {
  it("S1: a deleted branch merged outside the closed-PR window stays landed", () => {
    const args = { branches: new Map(), mergedHeads: new Map(), landedEvidence: merged };
    const pick = pickNextTask({ ...base, ...args } as any);
    expect(pick.kind).toBe("build");
    expect(pick.task.id).toBe("Y");
    expect(doneOf(args).done).toBe(true);
  });

  it("S2: recreating the merged branch with only recognized empty markers does not un-land it", () => {
    const args = { branches: new Map([["agent/queue/x", markerBranch()]]), mergedHeads: new Map(), landedEvidence: merged };
    const pick = pickNextTask({ ...base, ...args } as any);
    expect(pick.task.id).toBe("Y");
    expect(doneOf(args).done).toBe(true);
  });

  it("S2 inside the window: a merged head from the newest-100 read plus a marker-only tip is landed too", () => {
    const args = { branches: new Map([["agent/queue/x", markerBranch()]]), mergedHeads: new Map([["agent/queue/x", new Set(["b".repeat(40)])]]), landedEvidence: merged };
    expect(doneOf(args).done).toBe(true);
  });

  it("control: a substantive commit after the merge keeps the row unfinished", () => {
    const args = { branches: new Map([["agent/queue/x", markerBranch({ work: true, markerOnly: false })]]), mergedHeads: new Map(), landedEvidence: merged };
    expect(doneOf(args).done).toBe(false);
  });

  it("control: an empty commit that is not a recognized marker keeps the row unfinished", () => {
    const args = { branches: new Map([["agent/queue/x", markerBranch({ markerOnly: false, markers: [] })]]), mergedHeads: new Map(), landedEvidence: merged };
    expect(doneOf(args).done).toBe(false);
  });

  it("control: a marker-only branch with no merged pull request is never landed", () => {
    const args = { branches: new Map([["agent/queue/x", markerBranch()]]), mergedHeads: new Map(), landedEvidence: new Map() };
    expect(doneOf(args).done).toBe(false);
  });

  it("control: an unknown landed read is never converted into done", () => {
    for (const branches of [new Map(), new Map([["agent/queue/x", markerBranch()]])]) {
      const args = { branches, mergedHeads: new Map(), landedEvidence: new Map([["agent/queue/x", { state: "unknown", reason: "rate limited" }]]) };
      expect(doneOf(args).done).toBe(false);
    }
  });

  it("control: exact merged-head and ancestor evidence still land without the new read", () => {
    const exact = { branches: new Map([["agent/queue/x", markerBranch({ work: true, markerOnly: false, tipSha: "c".repeat(40) })]]), mergedHeads: new Map([["agent/queue/x", new Set(["c".repeat(40)])]]) };
    expect(doneOf(exact).done).toBe(true);
    const ancestor = { branches: new Map([["agent/queue/x", markerBranch({ merged: true, work: true, markerOnly: false })]]), mergedHeads: new Map() };
    expect(doneOf(ancestor).done).toBe(true);
    const unknownDoesNotRemove = { ...ancestor, landedEvidence: new Map([["agent/queue/x", { state: "unknown" }]]) };
    expect(doneOf(unknownDoesNotRemove).done).toBe(true);
  });
});

// ---- adapter: real git history in a disposable repository ----
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function repo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "next-task-lmc-"));
  dirs.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  writeFileSync(path.join(dir, "a.txt"), "one\n");
  git("add", ".");
  git("commit", "-q", "-m", "root");
  const tryGit = (...args: string[]) => { try { return git(...args); } catch { return null; } };
  return { dir, git, tryGit };
}

/** The loader's read: commits beyond main (no merges) in the shared format, plus the merge count. */
function factsOf(r: ReturnType<typeof repo>, ref: string) {
  const commits = parseBranchLog(r.git("log", "--reverse", "--no-merges", `--format=${BRANCH_LOG_FORMAT}`, "--name-only", `main..${ref}`));
  const merges = Number(r.git("rev-list", "--merges", "--count", `main..${ref}`));
  return { commits, merges };
}

describe("adapter: marker-only provenance from git", () => {
  it("recognized empty markers only -> marker-only", () => {
    const r = repo();
    r.git("switch", "-q", "-c", "agent/queue/x");
    r.git("commit", "-q", "--allow-empty", "-m", markerSubject("Claim", "X", B));
    r.git("commit", "-q", "--allow-empty", "-m", markerSubject("Takeover", "X", "Other · o2"));
    const { commits, merges } = factsOf(r, "agent/queue/x");
    expect(markerOnlyOf(commits, merges)).toBe(true);
  });

  it("an arbitrary empty commit is not a marker merely because it is empty", () => {
    const r = repo();
    r.git("switch", "-q", "-c", "agent/queue/x");
    r.git("commit", "-q", "--allow-empty", "-m", markerSubject("Claim", "X", B));
    r.git("commit", "-q", "--allow-empty", "-m", "wip: nothing yet");
    const { commits, merges } = factsOf(r, "agent/queue/x");
    expect(markerOnlyOf(commits, merges)).toBe(false);
  });

  it("a commit with a marker subject that changes files is work, not a marker", () => {
    const r = repo();
    r.git("switch", "-q", "-c", "agent/queue/x");
    writeFileSync(path.join(r.dir, "a.txt"), "two\n");
    r.git("commit", "-q", "-am", markerSubject("Claim", "X", B));
    const { commits, merges } = factsOf(r, "agent/queue/x");
    expect(markerOnlyOf(commits, merges)).toBe(false);
  });

  it("post-merge content later reverted stays unfinished (reported, not guessed)", () => {
    const r = repo();
    r.git("switch", "-q", "-c", "agent/queue/x");
    r.git("commit", "-q", "--allow-empty", "-m", markerSubject("Claim", "X", B));
    writeFileSync(path.join(r.dir, "a.txt"), "two\n");
    r.git("commit", "-q", "-am", "X: more work");
    r.git("revert", "--no-edit", "HEAD");
    const { commits, merges } = factsOf(r, "agent/queue/x");
    expect(markerOnlyOf(commits, merges)).toBe(false);
  });

  it("a merge commit on the branch is never a marker", () => {
    const r = repo();
    r.git("switch", "-q", "-c", "side");
    writeFileSync(path.join(r.dir, "b.txt"), "b\n");
    r.git("add", ".");
    r.git("commit", "-q", "-m", "side");
    r.git("switch", "-q", "-c", "agent/queue/x", "main");
    r.git("commit", "-q", "--allow-empty", "-m", markerSubject("Claim", "X", B));
    r.git("merge", "-q", "--no-ff", "--no-edit", "side");
    const { commits, merges } = factsOf(r, "agent/queue/x");
    expect(merges).toBe(1);
    expect(markerOnlyOf(commits, merges)).toBe(false);
  });

  it("no commits beyond main is not marker-only (the ancestor rule covers it)", () => {
    const r = repo();
    r.git("branch", "agent/queue/x");
    const { commits, merges } = factsOf(r, "agent/queue/x");
    expect(markerOnlyOf(commits, merges)).toBe(false);
  });
});

describe("adapter: verified merged pull request evidence", () => {
  function normalMerge() {
    const r = repo();
    r.git("switch", "-q", "-c", "agent/queue/x");
    writeFileSync(path.join(r.dir, "x.txt"), "x\n");
    r.git("add", ".");
    r.git("commit", "-q", "-m", "X: the work");
    const head = r.git("rev-parse", "HEAD");
    r.git("switch", "-q", "main");
    r.git("merge", "-q", "--no-ff", "-m", "Merge pull request #7 from o/agent/queue/x", "agent/queue/x");
    const mergeSha = r.git("rev-parse", "HEAD");
    return { r, head, mergeSha };
  }
  const pull = (o: Record<string, any>) => ({ number: 7, merged_at: "2026-10-01T00:00:00Z", base: { ref: "main" }, head: { ref: "agent/queue/x", sha: o.head, repo: { full_name: "o/r" } }, merge_commit_sha: o.mergeSha, ...o.extra });

  it("a normal merge on main whose parents include the pull request head is merged", () => {
    const { r, head, mergeSha } = normalMerge();
    expect(verifyMergedPull(pull({ head, mergeSha }), { repo: "o/r", tryGit: r.tryGit, mainRef: "main" }).state).toBe("merged");
  });

  it("a merge subject alone is not provenance: a commit claiming the pull request without its head as a parent", () => {
    const { r, head } = normalMerge();
    r.git("commit", "-q", "--allow-empty", "-m", "Merge pull request #7 from o/agent/queue/x");
    const fake = r.git("rev-parse", "HEAD");
    r.git("commit", "-q", "--allow-empty", "-m", "Merge pull request #8 from o/agent/queue/y");
    const twoParentElsewhere = r.git("commit-tree", `${fake}^{tree}`, "-p", fake, "-p", r.git("rev-parse", "main~2"), "-m", "Merge pull request #7 from o/agent/queue/x");
    expect(verifyMergedPull(pull({ head, mergeSha: twoParentElsewhere }), { repo: "o/r", tryGit: r.tryGit, mainRef: "main" }).state).toBe("none");
  });

  it("a merge commit that is not on main is not landed", () => {
    const { r, head } = normalMerge();
    r.git("switch", "-q", "-c", "other", "main~1");
    r.git("merge", "-q", "--no-ff", "-m", "merge into other", "agent/queue/x");
    const elsewhere = r.git("rev-parse", "HEAD");
    expect(verifyMergedPull(pull({ head, mergeSha: elsewhere }), { repo: "o/r", tryGit: r.tryGit, mainRef: "main" }).state).toBe("none");
  });

  it("a merge commit missing from local history is unknown, never done", () => {
    const { r, head } = normalMerge();
    expect(verifyMergedPull(pull({ head, mergeSha: "d".repeat(40) }), { repo: "o/r", tryGit: r.tryGit, mainRef: "main" }).state).toBe("unknown");
  });

  it("a squash merge on main with GitHub's merged pull request is merged", () => {
    const r = repo();
    writeFileSync(path.join(r.dir, "x.txt"), "x\n");
    r.git("add", ".");
    r.git("commit", "-q", "-m", "X: the work (#7)");
    const squash = r.git("rev-parse", "HEAD");
    expect(verifyMergedPull(pull({ head: "e".repeat(40), mergeSha: squash }), { repo: "o/r", tryGit: r.tryGit, mainRef: "main" }).state).toBe("merged");
  });

  it("an unmerged, fork, or other-base pull request is not evidence", () => {
    const { r, head, mergeSha } = normalMerge();
    const ctx = { repo: "o/r", tryGit: r.tryGit, mainRef: "main" };
    expect(verifyMergedPull(pull({ head, mergeSha, extra: { merged_at: null } }), ctx).state).toBe("none");
    expect(verifyMergedPull(pull({ head, mergeSha, extra: { base: { ref: "release" } } }), ctx).state).toBe("none");
    expect(verifyMergedPull({ ...pull({ head, mergeSha }), head: { ref: "agent/queue/x", sha: head, repo: { full_name: "fork/r" } } }, ctx).state).toBe("none");
  });
});

describe("adapter: bounded pagination, cache and explicit unknown", () => {
  const verifyAll = () => ({ state: "merged" });
  const pr = (n: number, ref: string, updated: string, mergedAt: string | null = updated) => ({
    number: n, updated_at: updated, merged_at: mergedAt, base: { ref: "main" }, head: { ref, sha: String(n).padStart(40, "0"), repo: { full_name: "o/r" } }, merge_commit_sha: String(n).padStart(40, "1"),
  });
  const filler = (from: number, count: number, day: number) => Array.from({ length: count }, (_, i) => pr(from + i, `agent/queue/other-${from + i}`, `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`));

  it("finds a merged pull request on a later page (history-window truncation) and stops once resolved", async () => {
    const pages = [filler(1000, 100, 30), [pr(7, "agent/queue/x", "2026-10-02T00:00:00Z"), ...filler(2000, 99, 1)], filler(3000, 100, 1)];
    const asked: number[] = [];
    const out = await collectLandedEvidence({ repo: "o/r", candidates: ["agent/queue/x"], firstPage: pages[0], fetchPage: async (p: number) => { asked.push(p); return pages[p - 1]; }, verify: verifyAll, cache: null, now: NOW, maxPages: 5 });
    expect(out.evidence.get("agent/queue/x")).toMatchObject({ state: "merged", number: 7 });
    expect(asked).toEqual([2]);
  });

  it("a short last page proves absence: a never-merged branch is none, not unknown", async () => {
    const out = await collectLandedEvidence({ repo: "o/r", candidates: ["agent/queue/x"], firstPage: filler(1, 100, 30), fetchPage: async () => filler(200, 3, 1), verify: verifyAll, cache: null, now: NOW, maxPages: 5 });
    expect(out.evidence.get("agent/queue/x")?.state ?? "none").toBe("none");
    expect(out.complete).toBe(true);
  });

  it("the page cap leaves unresolved candidates unknown, never done and never none", async () => {
    const out = await collectLandedEvidence({ repo: "o/r", candidates: ["agent/queue/x"], firstPage: filler(1, 100, 30), fetchPage: async (p: number) => filler(p * 1000, 100, 1), verify: verifyAll, cache: null, now: NOW, maxPages: 2 });
    expect(out.evidence.get("agent/queue/x")).toMatchObject({ state: "unknown" });
  });

  it("a failed page read is unknown for the unresolved, and keeps evidence already found", async () => {
    const first = [pr(9, "agent/queue/y", "2026-10-30T00:00:00Z"), ...filler(1, 99, 30)];
    const out = await collectLandedEvidence({ repo: "o/r", candidates: ["agent/queue/x", "agent/queue/y"], firstPage: first, fetchPage: async () => { throw new Error("GitHub answered 403 rate limit"); }, verify: verifyAll, cache: null, now: NOW, maxPages: 5 });
    expect(out.evidence.get("agent/queue/y")).toMatchObject({ state: "merged", number: 9 });
    expect(out.evidence.get("agent/queue/x")).toMatchObject({ state: "unknown" });
  });

  it("a complete cache plus a window that reaches back to it needs no further pages", async () => {
    const cache = { repo: "o/r", completeAt: "2026-10-29T00:00:00Z", merged: { "agent/queue/x": [{ number: 7, headSha: "7".padStart(40, "0"), mergeSha: "7".padStart(40, "1") }] } };
    const first = [...filler(1, 50, 31), ...filler(100, 50, 28)];
    let asked = 0;
    const out = await collectLandedEvidence({ repo: "o/r", candidates: ["agent/queue/x", "agent/queue/z"], firstPage: first, fetchPage: async () => { asked++; return []; }, verify: verifyAll, cache, now: NOW, maxPages: 5 });
    expect(asked).toBe(0);
    expect(out.evidence.get("agent/queue/x")).toMatchObject({ state: "merged", number: 7 });
    expect(out.evidence.get("agent/queue/z")?.state ?? "none").toBe("none");
    expect(out.cache.completeAt).toBe(new Date(NOW).toISOString());
  });

  it("cached evidence is re-verified against main, and a cache for another repo is ignored", async () => {
    const cache = { repo: "other/r", completeAt: "2026-10-29T00:00:00Z", merged: { "agent/queue/x": [{ number: 7, headSha: "a", mergeSha: "b" }] } };
    const out = await collectLandedEvidence({ repo: "o/r", candidates: ["agent/queue/x"], firstPage: filler(1, 100, 30), fetchPage: async () => [], verify: () => ({ state: "none" }), cache, now: NOW, maxPages: 5 });
    expect(out.evidence.get("agent/queue/x")?.state ?? "none").toBe("none");
  });

  it("ambiguous names: only the exact head ref of this repository counts", async () => {
    const first = [pr(5, "agent/other/x", "2026-10-30T00:00:00Z"), { ...pr(6, "agent/queue/x", "2026-10-30T00:00:00Z"), head: { ref: "agent/queue/x", sha: "6".padStart(40, "0"), repo: { full_name: "fork/r" } } }];
    const out = await collectLandedEvidence({ repo: "o/r", candidates: ["agent/queue/x"], firstPage: first, fetchPage: async () => [], verify: verifyAll, cache: null, now: NOW, maxPages: 5 });
    expect(out.evidence.get("agent/queue/x")?.state ?? "none").toBe("none");
  });
});

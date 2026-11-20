import { describe, expect, it } from "vitest";
import { autoLandCandidates, autoLandHold, prNumberOf, runAutoLand } from "./autoLand.mjs";

// PICKER-auto-land (D-371): green, in-sync task pull requests land on their own.
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const url = (n: number) => `https://github.com/o/r/pull/${n}`;
const task = (id: string, status = "todo") => ({ id, branch: `agent/queue/${id.toLowerCase()}`, status });

describe("autoLandCandidates", () => {
  const tasks = [task("A"), task("B"), task("C"), task("D", "owner"), task("E"), task("F")];
  const prCi = new Map<string, { state: string; sha?: string }>([
    ["agent/queue/a", { state: "green", sha: SHA }],
    ["agent/queue/b", { state: "green", sha: SHA }],
    ["agent/queue/c", { state: "green", sha: SHA }],
    ["agent/queue/d", { state: "green", sha: SHA }],
    ["agent/queue/e", { state: "running", sha: SHA }],
    ["agent/queue/f", { state: "green" }],
  ]);
  const rows = [
    { id: "A", state: "pr-green", health: "green", pr: url(1) },
    { id: "B", state: "pr-green", health: "red", pr: url(2) }, // reported blocked or red
    { id: "C", state: "re-sync (D-371)", health: "open", pr: url(3) }, // out of sync
    { id: "D", state: "pr-green", health: "green", pr: url(4) }, // parked
    { id: "E", state: "pr-green", health: "green", pr: url(5) }, // CI moved on
    { id: "F", state: "pr-green", health: "green", pr: url(6) }, // no green sha
    { id: "Z", state: "pr-green", health: "green", pr: url(7) }, // no such task
    { id: "A", state: "pr-green", health: "progress", pr: url(8) }, // review still pending under the old rule
  ];

  it("keeps only green rows of open, unparked tasks with a green CI head", () => {
    expect(autoLandCandidates({ rows, tasks, prCi })).toEqual([{ id: "A", number: 1, branch: "agent/queue/a", sha: SHA, quietHours: null }]);
  });

  it("reads the number from a PR URL and nothing else", () => {
    expect(prNumberOf(url(1402))).toBe(1402);
    expect(prNumberOf("https://github.com/o/r/pull/0")).toBeNull();
    expect(prNumberOf("https://github.com/o/r/issues/5")).toBeNull();
    expect(prNumberOf(undefined)).toBeNull();
  });
});

describe("autoLandHold", () => {
  it("holds while main is not green or the pull requests are unknown", () => {
    expect(autoLandHold({ mainCi: { state: "green" }, openPrs: new Map() })).toBeNull();
    expect(autoLandHold({ mainCi: { state: "red" }, openPrs: new Map() })).toContain("main CI is red");
    expect(autoLandHold({ mainCi: { state: "running-after-red" }, openPrs: new Map() })).toContain("running-after-red");
    expect(autoLandHold({ mainCi: { state: "unknown" }, openPrs: new Map() })).toContain("unknown");
    expect(autoLandHold({ mainCi: { state: "green" }, openPrs: null })).toBe("pull requests unreadable");
  });
});

describe("runAutoLand", () => {
  const base = { state: "open", merged: false, draft: false, node_id: "N", mergeable_state: "clean", auto_merge: null };
  function harness(pulls: Record<number, object>, fail: Partial<Record<string, string>> = {}) {
    const calls: string[] = [];
    const lines: string[] = [];
    const io = {
      readPull: async (n: number) => { calls.push(`read ${n}`); if (fail.read) throw new Error(fail.read); return pulls[n]; },
      markReady: async (id: string) => { calls.push(`ready ${id}`); if (fail.ready) throw new Error(fail.ready); },
      updateBranch: async (n: number, sha: string) => { calls.push(`update ${n} ${sha.slice(0, 1)}`); },
      enableAutoMerge: async (id: string) => { calls.push(`auto ${id}`); if (fail.auto) throw new Error(fail.auto); },
      mergeNow: async (n: number, sha: string) => { calls.push(`merge ${n} ${sha.slice(0, 1)}`); },
      log: (line: string) => lines.push(line),
    };
    return { io, calls, lines };
  }
  const c = (number: number, quietHours: number | null = 3) => ({ id: `T${number}`, number, branch: `agent/queue/t${number}`, sha: SHA, quietHours });
  const pr = (number: number, extra: object = {}) => ({ ...base, head: { ref: `agent/queue/t${number}`, sha: SHA }, ...extra });

  it("marks a draft ready, updates a behind branch and turns auto-merge on", async () => {
    const h = harness({ 1: pr(1, { draft: true, mergeable_state: "behind" }) });
    const r = await runAutoLand([c(1)], h.io);
    expect(h.calls).toEqual(["read 1", "ready N", "update 1 a", "auto N"]);
    expect(r).toEqual([{ id: "T1", number: 1, outcome: "queued", detail: "ready, updated with main, auto-merge on" }]);
    expect(h.lines).toEqual(["auto-land: T1 #1 queued (ready, updated with main, auto-merge on)"]);
  });

  it("does nothing more for a PR already queued", async () => {
    const h = harness({ 2: pr(2, { auto_merge: { merge_method: "merge" } }) });
    expect((await runAutoLand([c(2)], h.io))[0].outcome).toBe("already-queued");
    expect(h.calls).toEqual(["read 2"]);
  });

  it("leaves a conflicting, closed, moved or foreign-branch PR alone", async () => {
    const h = harness({
      3: pr(3, { mergeable_state: "dirty" }),
      4: pr(4, { state: "closed" }),
      5: pr(5, { head: { ref: "agent/queue/t5", sha: OTHER } }),
      6: pr(6, { head: { ref: "someone/else", sha: SHA } }),
      7: pr(7, { merged: true }),
    });
    const r = await runAutoLand([c(3), c(4), c(5), c(6), c(7)], h.io);
    expect(r.map(x => x.outcome)).toEqual(["conflict", "skipped", "skipped", "skipped", "skipped"]);
    expect(h.calls.filter(x => !x.startsWith("read"))).toEqual([]);
  });

  it("reports an API failure and still lands the next candidate", async () => {
    const pulls = { 8: pr(8, { draft: true }), 9: pr(9) };
    const h = harness(pulls, { ready: "GraphQL 403" });
    const r = await runAutoLand([c(8), c(9)], h.io);
    expect(r[0]).toEqual({ id: "T8", number: 8, outcome: "error", detail: "GraphQL 403" });
    expect(r[1].outcome).toBe("queued");
    expect(h.calls).toContain("auto N");
  });

  it("leaves a draft alone while its holder was active in the last 2 hours", async () => {
    const h = harness({ 10: pr(10, { draft: true }), 11: pr(11, { draft: true }) });
    const r = await runAutoLand([c(10, 1), c(11, null)], h.io);
    expect(r.map(x => x.outcome)).toEqual(["skipped", "skipped"]);
    expect(r[0].detail).toContain("draft");
    expect(h.calls).toEqual(["read 10", "read 11"]);
  });

  it("merges a clean ready PR over REST when auto-merge cannot be enabled", async () => {
    const h = harness({ 12: pr(12) }, { auto: "GitHub GraphQL answered 403" });
    const r = await runAutoLand([c(12)], h.io);
    expect(r[0]).toEqual({ id: "T12", number: 12, outcome: "queued", detail: "merged" });
    expect(h.calls).toEqual(["read 12", "auto N", "merge 12 a"]);
  });

  it("never merges a behind or draft PR over REST", async () => {
    const h = harness({ 13: pr(13, { mergeable_state: "behind" }) }, { auto: "GitHub GraphQL answered 403" });
    const r = await runAutoLand([c(13)], h.io);
    expect(r[0].outcome).toBe("error");
    expect(h.calls).toEqual(["read 13", "update 13 a", "auto N"]);
  });

  it("does nothing with no candidates", async () => {
    const h = harness({});
    expect(await runAutoLand([], h.io)).toEqual([]);
    expect(h.calls).toEqual([]);
  });
});

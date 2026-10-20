// @vitest-environment node
// D-083: the queue picker hands every agent the same next task, in Claude
// Code's order, and never two agents the same one. Pins each decision.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  STALE_MS, ciStateFromRuns, markerSubject, parseMarker, pickNextTask, reviewStateOf, validateAssignments,
} from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const root = path.resolve(__dirname, "..");
const real = JSON.parse(readFileSync(path.join(root, "docs/plans/assignments.json"), "utf8"));
const exists = (p: string) => existsSync(path.join(root, p));
const NOW = Date.parse("2026-10-20T12:00:00Z");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/run/1" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; merged: boolean; markers: Marker[] };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 2, lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], ...extra,
});
const claimBy = (who: string, id: string, hoursAgo = 1, merged = false): Branch =>
  ({ tipMs: NOW - hoursAgo * HOUR, merged, markers: [{ verb: "Claim", id, who }] });
const pick = (tasks: ReturnType<typeof task>[], opts: { branches?: [string, Branch][]; prs?: [string, string][]; claimant?: string; ci?: object } = {}) =>
  pickNextTask({
    tasks, mainCi: opts.ci ?? green, branches: new Map(opts.branches ?? []), openPrs: new Map(opts.prs ?? []),
    now: NOW, claimant: opts.claimant ?? null,
  });

describe("the task list Claude Code keeps (docs/plans/assignments.json)", () => {
  it("is valid and every packet it names exists", () => {
    expect(validateAssignments(real, exists)).toEqual([]);
  });

  it("hands a fresh agent the first pickable task in order", () => {
    // GO-LIVE-1 is done (PR #351); D-084 queues GO-LIVE-1b (passes stay off until a paid
    // pass can always be activated) right after it, so it is the first pickable task.
    const first = pickNextTask({ tasks: real.tasks, mainCi: green, branches: new Map(), openPrs: new Map(), now: NOW, claimant: null });
    expect(first).toMatchObject({ kind: "build", task: { id: "GO-LIVE-1b" } });
  });

  it("rejects unknown keys, duplicates, bad branches, missing packets, unknown dependencies and cycles", () => {
    const bad = {
      version: 1, repo: "o/r", extra: true,
      tasks: [
        task("A", { colour: "red", dependsOn: ["B"] }),
        task("A", { branch: "feature/x", dependsOn: ["B"] }),
        task("B", { packet: null, dependsOn: ["A", "Z"] }),
        task("C", { branch: "agent/review/c", packet: "docs/plans/nope.md", tier: 4, status: "doing" }),
      ],
    };
    const errors = validateAssignments(bad, exists).join("\n");
    for (const expected of [
      'unknown top-level key "extra"', 'unknown key "colour"', "duplicate id", "branch must be agent/<owner>/<slug>",
      "a todo task needs a packet", "depends on unknown task Z", "dependency cycle", "reserved for review locks",
      "packet docs/plans/nope.md does not exist", "tier must be 1, 2 or 3", "status must be one of",
    ]) expect(errors).toContain(expected);
  });
});

describe("main's CI decides first (D-082)", () => {
  const run = (status: string, conclusion: string | null, sha = "b".repeat(40)) => ({ status, conclusion, head_sha: sha, html_url: `https://ci/${sha.slice(0, 4)}` });

  it("reads green, red, running, running after red, and unknown from the newest runs", () => {
    expect(ciStateFromRuns([run("completed", "success")]).state).toBe("green");
    expect(ciStateFromRuns([run("completed", "failure")]).state).toBe("red");
    expect(ciStateFromRuns([run("in_progress", null), run("completed", "success")]).state).toBe("running");
    expect(ciStateFromRuns([run("in_progress", null), run("completed", "failure")]).state).toBe("running-after-red");
    expect(ciStateFromRuns([run("completed", "cancelled"), run("completed", "failure")]).state).toBe("red");
    expect(ciStateFromRuns([]).state).toBe("unknown");
  });

  it("while main is red, the only task is fixing it, and only one agent gets it", () => {
    const red = { state: "red", sha: "c".repeat(40), url: "https://ci/red" };
    expect(pick([task("A")], { ci: red })).toMatchObject({ kind: "fix-main", lock: "agent/queue/fix-main-cccccccc", parent: null });
    const held: [string, Branch] = ["agent/queue/fix-main-cccccccc", claimBy("Kimi · s2", "fix-main-cccccccc")];
    expect(pick([task("A")], { ci: red, branches: [held] })).toMatchObject({ kind: "wait" });
    const stale: [string, Branch] = ["agent/queue/fix-main-cccccccc", claimBy("Kimi · s2", "fix-main-cccccccc", 30)];
    expect(pick([task("A")], { ci: red, branches: [stale] })).toMatchObject({ kind: "fix-main", parent: "agent/queue/fix-main-cccccccc" });
  });

  it("stops when CI cannot be read, and waits while CI re-runs after a failure", () => {
    expect(pick([task("A")], { ci: { state: "unknown" } }).kind).toBe("stop");
    expect(pick([task("A")], { ci: { state: "running-after-red" } }).kind).toBe("wait");
    expect(pick([task("A")], { ci: { state: "running" } })).toMatchObject({ kind: "build", ciRunning: true });
  });
});

describe("new work: order, dependencies, lanes and claims", () => {
  it("skips tasks waiting on another task, a busy lane, a claim, Claude Code or the owner", () => {
    const tasks = [
      task("A", { status: "architect", packet: null }), task("B", { dependsOn: ["A"] }),
      task("C", { lane: "shared" }), task("D", { lane: "shared" }), task("E", { status: "owner" }), task("F"),
    ];
    const result = pick(tasks, { branches: [["agent/queue/c", claimBy("Qwen · s1", "C")]] });
    expect(result).toMatchObject({ kind: "build", task: { id: "F" } });
  });

  it("counts a branch merged into main as done, so its dependents unblock", () => {
    const tasks = [task("A"), task("B", { dependsOn: ["A"] })];
    expect(pick(tasks, { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 2, true)]] })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("treats a branch started from the packet's legacy name as a claim", () => {
    expect(pick([task("A"), task("B")], { branches: [["agent/opencode/a", claimBy("x", "A")]] })).toMatchObject({ task: { id: "B" } });
  });

  it("hands over a claim with no commits for 24 hours before any new work (queue rule 2)", () => {
    const result = pick([task("A"), task("B")], { branches: [["agent/queue/a", claimBy("Gemini · s3", "A", 25)]] });
    expect(result).toMatchObject({ kind: "takeover", task: { id: "A" }, from: "Gemini · s3" });
  });

  it("says why nothing is pickable", () => {
    const result = pick([task("A", { status: "done" }), task("B", { status: "owner" })]);
    expect(result).toEqual({ kind: "none", skipped: [{ id: "A", reason: "done" }, { id: "B", reason: "waits for the owner" }] });
  });
});

describe("Tier 1 review loop on review locks", () => {
  const t1 = task("M", { tier: 1, lane: "money" });
  const built: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 2)];
  const pr: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
  const lock = (...markers: Marker[]): [string, Branch] => ["agent/review/m", { tipMs: NOW - HOUR, merged: false, markers }];

  it("offers the review before new work, never to the agent that built it", () => {
    expect(pick([t1, task("N")], { branches: [built], prs: [pr] })).toMatchObject({ kind: "review", lock: "agent/review/m", builder: "DeepSeek · s4" });
    expect(pick([t1, task("N")], { branches: [built], prs: [pr], claimant: "DeepSeek · s4" })).toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("moves review -> findings -> fix -> review again, and the reviewer never fixes", () => {
    const reviewing = lock({ verb: "Review claim", id: "M", who: "Claude · r1" });
    expect(pick([t1], { branches: [built, reviewing], prs: [pr] }).kind).toBe("none");
    const findings = lock({ verb: "Review claim", id: "M", who: "Claude · r1" }, { verb: "Verdict", id: "M", who: "Claude · r1", verdict: "findings" });
    expect(reviewStateOf(findings[1])).toBe("needs-fix");
    expect(pick([t1], { branches: [built, findings], prs: [pr] })).toMatchObject({ kind: "fix" });
    expect(pick([t1], { branches: [built, findings], prs: [pr], claimant: "Claude · r1" }).kind).toBe("none");
    const fixed = lock(...findings[1].markers, { verb: "Fix claim", id: "M", who: "Kimi · f1" }, { verb: "Fixed", id: "M", who: "Kimi · f1" });
    expect(pick([t1], { branches: [built, fixed], prs: [pr], claimant: "Kimi · f1" }).kind).toBe("none");
    expect(pick([t1], { branches: [built, fixed], prs: [pr], claimant: "Claude · r1" })).toMatchObject({ kind: "review", lockExists: true });
  });

  it("leaves a passed review to its reviewer to land", () => {
    const passed = lock({ verb: "Review claim", id: "M", who: "Claude · r1" }, { verb: "Verdict", id: "M", who: "Claude · r1", verdict: "pass" });
    const result = pick([t1], { branches: [built, passed], prs: [pr] });
    expect(result).toEqual({ kind: "none", skipped: [{ id: "M", reason: "review passed; Claude · r1 lands it" }] });
  });

  it("re-offers a review lock that went quiet for 24 hours", () => {
    const quiet: [string, Branch] = ["agent/review/m", { tipMs: NOW - STALE_MS - HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Claude · r1" }] }];
    expect(pick([t1], { branches: [built, quiet], prs: [pr] })).toMatchObject({ kind: "review", lockExists: true });
  });
});

describe("markers and printed steps", () => {
  it("round-trips every marker", () => {
    for (const [verb, verdict] of [["Claim"], ["Takeover"], ["Review claim"], ["Fix claim"], ["Fixed"], ["Verdict", "pass"], ["Verdict", "findings"]]) {
      const subject = markerSubject(verb, "GO-LIVE-1", "Qwen 3 · s1", verdict);
      expect(parseMarker(subject)).toEqual({ verb, id: "GO-LIVE-1", who: "Qwen 3 · s1", ...(verdict ? { verdict } : {}) });
    }
    expect(parseMarker("Fix the claim flow")).toBeNull();
  });

  it("tells a Tier 1 builder to stop at a draft PR, and a Tier 2 builder to land only when green", () => {
    const ctx = { who: "Qwen · s1", date: "2026-10-20", claimed: true };
    const t1 = renderPick({ kind: "build", task: task("M", { tier: 1 }), ciRunning: false }, ctx);
    expect(t1).toContain("DRAFT pull request");
    expect(t1).toContain("Never land it yourself");
    const t2 = renderPick({ kind: "build", task: task("N"), ciRunning: true }, ctx);
    expect(t2).toContain("Land under D-082");
    expect(t2).toContain('"status" to "done" in docs/plans/assignments.json');
    expect(t2).toContain("push nothing to main until it is green");
    expect(renderPick({ kind: "build", task: task("N"), ciRunning: false }, { ...ctx, claimed: false })).toContain("--claim");
  });
});

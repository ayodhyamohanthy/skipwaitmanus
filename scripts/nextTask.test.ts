// @vitest-environment node
// D-083: the queue picker hands every agent the same next task, in Claude
// Code's order, and never two agents the same one. Pins each decision.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as core from "./nextTaskCore.mjs";
import {
  IDLE_MS, ciStateFromRuns, epicSummaries, localSyncIssues, markerSubject, parseMarker, pickNextTask, reviewStateOf, roleOf, statusBoard, validateAssignments,
} from "./nextTaskCore.mjs";
import { renderBoard, renderPick } from "./nextTaskText.mjs";
import { scopeViolations } from "./scope-check.mjs";

const root = path.resolve(__dirname, "..");
const real = JSON.parse(readFileSync(path.join(root, "docs/plans/assignments.json"), "utf8"));
const exists = (p: string) => existsSync(path.join(root, p));
const NOW = Date.parse("2026-10-20T12:00:00Z");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/run/1" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; merged: boolean; markers: Marker[]; tipSha?: string };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 2, lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], ...extra,
});
const claimBy = (who: string, id: string, hoursAgo = 1, merged = false): Branch =>
  ({ tipMs: NOW - hoursAgo * HOUR, merged, markers: [{ verb: "Claim", id, who }] });
type Report = { id: string; status: string; who: string; at: number; note: string };
type PickOpts = { branches?: [string, Branch][]; prs?: [string, string][] | null; prCi?: [string, string][]; prCiAt?: [string, number][]; merged?: [string, string[]][] | null; reports?: Report[]; claimant?: string; ci?: object };
const pick = (tasks: ReturnType<typeof task>[], opts: PickOpts = {}) =>
  pickNextTask({
    tasks, mainCi: opts.ci ?? green, branches: new Map(opts.branches ?? []), openPrs: opts.prs === null ? null : new Map(opts.prs ?? []),
    prCi: new Map((opts.prCi ?? []).map(([b, state]) => [b, { state, at: new Map(opts.prCiAt ?? []).get(b) }])), reports: opts.reports ?? [],
    mergedHeads: opts.merged === null ? null : new Map((opts.merged ?? []).map(([b, shas]) => [b, new Set(shas)])),
    now: NOW, claimant: opts.claimant ?? null,
  });

describe("the task list Claude Code keeps (docs/plans/assignments.json)", () => {
  it("is valid and every packet it names exists", () => {
    expect(validateAssignments(real, exists)).toEqual([]);
  });

  it("hands a fresh agent the first pickable task in order", () => {
    // D-149 keeps the two live regressions first. Owner-registered follow-ups
    // remain together immediately afterward; all existing rows keep their order.
    expect(real.tasks.slice(0, 4).map(t => t.id)).toEqual([
      "P0-ask-link-signin", "P1-queue-attestation", "PREMIUM-total-label", "D-067-outbox-fixture-repair",
    ]);
    const first = pickNextTask({ tasks: real.tasks, mainCi: green, branches: new Map(), openPrs: new Map(), now: NOW, claimant: null });
    // P0-ask-link-signin and P1-queue-attestation are both done (each landed after its
    // review; P1 as merge 2be41b2d), and both owner follow-ups are done. The launch batch
    // (LAUNCH-oct25, D-200 (2)) comes next, starting with the security advisories.
    expect(first).toMatchObject({ kind: "build", task: { id: "SEC-deps-oct24" } });
    // Both owner follow-ups (PREMIUM-total-label and D-067-outbox-fixture-repair) are done,
    // so slicing off the live regressions still leaves the launch batch first.
    const followUps = pickNextTask({ tasks: real.tasks.slice(2), mainCi: green, branches: new Map(), openPrs: new Map(), now: NOW, claimant: null });
    expect(followUps).toMatchObject({ kind: "build", task: { id: "SEC-deps-oct24" } });
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
  it("skips tasks waiting on another task, a busy lane, a claim, a packet someone is writing or the owner", () => {
    const tasks = [
      task("A", { status: "architect", packet: null }), task("B", { dependsOn: ["A"] }),
      task("C", { lane: "shared" }), task("D", { lane: "shared" }), task("E", { status: "owner" }), task("F"),
    ];
    const writing: [string, Branch] = ["agent/architect/a", claimBy("Kimi · s3", "A", 1)];
    const result = pick(tasks, { branches: [["agent/queue/c", claimBy("Qwen · s1", "C")], writing] });
    expect(result).toMatchObject({ kind: "build", task: { id: "F" } });
    // D-109: nobody is writing A's packet, so the next agent writes it first.
    expect(pick(tasks, { branches: [["agent/queue/c", claimBy("Qwen · s1", "C")]] })).toMatchObject({ kind: "architect", task: { id: "A" } });
  });

  it("counts a branch merged into main as done, so its dependents unblock", () => {
    const tasks = [task("A"), task("B", { dependsOn: ["A"] })];
    expect(pick(tasks, { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 2, true)]] })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("treats a branch started from the packet's legacy name as a claim", () => {
    expect(pick([task("A"), task("B")], { branches: [["agent/opencode/a", claimBy("x", "A")]] })).toMatchObject({ task: { id: "B" } });
  });

  it("hands over a claim nobody has pushed to for 2 hours before any lower task (queue rule 2, D-085)", () => {
    const result = pick([task("A"), task("B")], { branches: [["agent/queue/a", claimBy("Gemini · s3", "A", 3)]] });
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
    const reviewing = lock({ verb: "Review claim", id: "M", who: "Mistral · r1" });
    expect(pick([t1], { branches: [built, reviewing], prs: [pr] }).kind).toBe("none");
    const findings = lock({ verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" });
    expect(reviewStateOf(findings[1])).toBe("needs-fix");
    expect(pick([t1], { branches: [built, findings], prs: [pr] })).toMatchObject({ kind: "fix" });
    expect(pick([t1], { branches: [built, findings], prs: [pr], claimant: "Mistral · r1" }).kind).toBe("none");
    const fixed = lock(...findings[1].markers, { verb: "Fix claim", id: "M", who: "Kimi · f1" }, { verb: "Fixed", id: "M", who: "Kimi · f1" });
    expect(pick([t1], { branches: [built, fixed], prs: [pr], claimant: "Kimi · f1" }).kind).toBe("none");
    expect(pick([t1], { branches: [built, fixed], prs: [pr], claimant: "Mistral · r1" })).toMatchObject({ kind: "review", lockExists: true });
  });

  it("leaves a passed review to its reviewer to land", () => {
    const passed = lock({ verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "pass" });
    const result = pick([t1], { branches: [built, passed], prs: [pr] });
    expect(result).toEqual({ kind: "none", skipped: [{ id: "M", reason: "review passed; Mistral · r1 lands it" }] });
  });

  it("re-offers a review lock that went quiet for 2 hours", () => {
    const quiet: [string, Branch] = ["agent/review/m", { tipMs: NOW - IDLE_MS - HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Mistral · r1" }] }];
    expect(pick([t1], { branches: [built, quiet], prs: [pr] })).toMatchObject({ kind: "review", lockExists: true });
  });
});

// D-085 (owner, Oct 20): build, resume, continue and next all run the picker.
// Your own unfinished work comes back first; everything else goes in strict
// priority order, and work nobody has touched for 2 hours is free again.
describe("own work first, then strict priority (D-085)", () => {
  const t1 = task("M", { tier: 1, lane: "money" });
  const built: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)];
  const pr: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
  const lock = (...markers: Marker[]): [string, Branch] => ["agent/review/m", { tipMs: NOW - HOUR, merged: false, markers }];
  const red = { state: "red", sha: "c".repeat(40), url: "https://ci/red" };
  const mine: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];

  it("the idle window is 2 hours", () => {
    expect(IDLE_MS).toBe(2 * HOUR);
  });

  it("hands an agent back its own open claim before any new work, and never to anyone else", () => {
    expect(pick([task("A"), task("B")], { branches: [mine], claimant: "Qwen · s1" })).toMatchObject({ kind: "continue", of: "build", task: { id: "A" }, work: "agent/queue/a" });
    expect(pick([task("A"), task("B")], { branches: [mine], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("gives an idle claim back to its owner if the owner returns first; anyone else takes it over", () => {
    const quiet: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 3)];
    expect(pick([task("A"), task("B")], { branches: [quiet], claimant: "Qwen · s1" })).toMatchObject({ kind: "continue", task: { id: "A" } });
    expect(pick([task("A"), task("B")], { branches: [quiet], claimant: "Kimi · s2" })).toMatchObject({ kind: "takeover", task: { id: "A" }, from: "Qwen · s1" });
  });

  it("a heartbeat keeps a long step alive; without one the claim is free after 2 hours", () => {
    const old: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 5)];
    const beat: [string, Branch] = ["agent/heartbeat/a", { tipMs: NOW - HOUR / 2, merged: false, markers: [{ verb: "Heartbeat", id: "A", who: "Qwen · s1" }] }];
    expect(pick([task("A"), task("B")], { branches: [old, beat], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
    expect(pick([task("A"), task("B")], { branches: [old], claimant: "Kimi · s2" })).toMatchObject({ kind: "takeover", task: { id: "A" } });
  });

  it("after a takeover the task belongs to the agent that took it over", () => {
    const taken: [string, Branch] = ["agent/queue/a", { tipMs: NOW - HOUR, merged: false, markers: [{ verb: "Claim", id: "A", who: "Qwen · s1" }, { verb: "Takeover", id: "A", who: "Kimi · s2" }] }];
    expect(pick([task("A"), task("B")], { branches: [taken], claimant: "Qwen · s1" })).toMatchObject({ kind: "build", task: { id: "B" } });
    expect(pick([task("A"), task("B")], { branches: [taken], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", task: { id: "A" } });
  });

  it("several agents started at once each get a different task, and each later gets its own back", () => {
    const tasks = [task("A"), task("B"), task("C")];
    const agents = ["Qwen · s1", "Kimi · s2", "Gemini · s3"];
    const branches: [string, Branch][] = [];
    const got: string[] = [];
    for (const who of agents) {
      const p = pick(tasks, { branches, claimant: who });
      expect(p.kind).toBe("build");
      if (p.kind !== "build") return;
      got.push(p.task.id);
      branches.push([p.task.branch, claimBy(who, p.task.id, 0)]);
    }
    expect(got).toEqual(["A", "B", "C"]);
    agents.forEach((who, i) => expect(pick(tasks, { branches, claimant: who })).toMatchObject({ kind: "continue", task: { id: got[i] } }));
    expect(pick(tasks, { branches, claimant: "Mistral · s5" }).kind).toBe("none");
  });

  it("finishing pending work comes before any new work, each top down (owner: \"completing a pending task is important than taking new one\")", () => {
    const abandonedA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 3)];
    expect(pick([task("A"), task("B")], { branches: [abandonedA], claimant: "Kimi · s2" })).toMatchObject({ kind: "takeover", task: { id: "A" } });
    const abandonedB: [string, Branch] = ["agent/queue/b", claimBy("Qwen · s1", "B", 3)];
    expect(pick([task("A"), task("B")], { branches: [abandonedB], claimant: "Kimi · s2" })).toMatchObject({ kind: "takeover", task: { id: "B" } });
    expect(pick([task("A"), t1], { branches: [built], prs: [pr], claimant: "Kimi · s2" })).toMatchObject({ kind: "review", task: { id: "M" } });
    const abandonedC: [string, Branch] = ["agent/queue/c", claimBy("Qwen · s1", "C", 3)];
    expect(pick([task("A"), task("B"), task("C")], { branches: [abandonedB, abandonedC], claimant: "Kimi · s2" })).toMatchObject({ kind: "takeover", task: { id: "B" } });
  });

  it("a builder whose Tier 1 pull request waits for review takes new work; its reviewer, fixer and lander continue theirs", () => {
    const reviewing = lock({ verb: "Review claim", id: "M", who: "Mistral · r1" });
    expect(pick([t1, task("N")], { branches: [built, reviewing], prs: [pr], claimant: "DeepSeek · s4" })).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(pick([t1, task("N")], { branches: [built, reviewing], prs: [pr], claimant: "Mistral · r1" })).toMatchObject({ kind: "continue", of: "review", task: { id: "M" }, lock: "agent/review/m", pr: pr[1] });
    const fixing = lock({ verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" }, { verb: "Fix claim", id: "M", who: "Kimi · f1" });
    expect(pick([t1, task("N")], { branches: [built, fixing], prs: [pr], claimant: "Kimi · f1" })).toMatchObject({ kind: "continue", of: "fix", task: { id: "M" } });
    const passed = lock({ verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "pass" });
    expect(pick([t1, task("N")], { branches: [built, passed], prs: [pr], claimant: "Mistral · r1" })).toMatchObject({ kind: "continue", of: "land", task: { id: "M" } });
  });

  it("while main is red, the agent holding the fix lock continues it instead of waiting on itself, and red main still beats own work", () => {
    const held: [string, Branch] = ["agent/queue/fix-main-cccccccc", claimBy("Kimi · s2", "fix-main-cccccccc")];
    expect(pick([task("A")], { ci: red, branches: [held], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", of: "fix-main", lock: "agent/queue/fix-main-cccccccc" });
    expect(pick([task("A")], { ci: red, branches: [held], claimant: "Qwen · s1" }).kind).toBe("wait");
    expect(pick([task("A")], { ci: red, branches: [mine], claimant: "Qwen · s1" }).kind).toBe("fix-main");
  });
});

describe("built but not green, or green but not landed, and nobody on it (D-085)", () => {
  const t2pr: [string, string] = ["agent/queue/a", "https://github.com/o/r/pull/7"];
  const t1 = task("M", { tier: 1, lane: "money" });
  const built: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)];
  const pr: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];

  it("a pull request with red CI goes to the next agent once its owner has been quiet for 2 hours; until then it is theirs", () => {
    const quiet: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 3)];
    expect(pick([task("A"), task("B")], { branches: [quiet], prs: [t2pr], prCi: [["agent/queue/a", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "green", task: { id: "A" }, pr: t2pr[1], from: "Qwen · s1" });
    const busy: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    // Its owner is on it: nothing in its lane or depending on it starts until it is green; other lanes go on (D-109).
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [busy], prs: [t2pr], prCi: [["agent/queue/a", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "wait", gate: "A" });
    expect(pick([task("A"), task("B")], { branches: [busy], prs: [t2pr], prCi: [["agent/queue/a", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
    expect(pick([task("A"), task("B")], { branches: [busy], prs: [t2pr], prCi: [["agent/queue/a", "red"]], claimant: "Qwen · s1" })).toMatchObject({ kind: "continue", of: "green", task: { id: "A" } });
  });

  it("a red Tier 1 pull request is made green before any review, never by its reviewer", () => {
    const reviewing: [string, Branch] = ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Mistral · r1" }] }];
    expect(pick([t1], { branches: [built, reviewing], prs: [pr], prCi: [["agent/queue/m", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "green", task: { id: "M" } });
    // Its reviewer keeps the review it holds (a red PR is a finding), but never takes the code fix.
    expect(pick([t1], { branches: [built, reviewing], prs: [pr], prCi: [["agent/queue/m", "red"]], claimant: "Mistral · r1" })).toMatchObject({ kind: "continue", of: "review" });
    const fresh: [string, Branch] = ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" }] }];
    expect(pick([t1], { branches: [built, fresh], prs: [pr], prCi: [["agent/queue/m", "red"]], claimant: "Mistral · r1" })).toMatchObject({ kind: "wait", gate: "M" });
    expect(pick([t1], { branches: [built], prs: [pr], prCi: [["agent/queue/m", "red"]], claimant: "DeepSeek · s4" })).toMatchObject({ kind: "continue", of: "green" });
  });

  it("waits while a pull request's CI is still running", () => {
    const quiet: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 3)];
    expect(pick([task("A")], { branches: [quiet], prs: [t2pr], prCi: [["agent/queue/a", "running"]], claimant: "Kimi · s2" }).kind).toBe("none");
  });

  it("a green Tier 2 pull request nobody lands goes to the next agent to land", () => {
    const quiet: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 3)];
    expect(pick([task("A")], { branches: [quiet], prs: [t2pr], prCi: [["agent/queue/a", "green"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "land", task: { id: "A" }, tier1: false });
    const busy: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    expect(pick([task("A")], { branches: [busy], prs: [t2pr], prCi: [["agent/queue/a", "green"]], claimant: "Qwen · s1" })).toMatchObject({ kind: "continue", of: "land" });
  });

  it("a passed Tier 1 review whose reviewer went quiet is landed by someone who neither built nor fixed it", () => {
    const passed: [string, Branch] = ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "pass" }] }];
    expect(pick([t1], { branches: [built, passed], prs: [pr], claimant: "Kimi · s2" })).toMatchObject({ kind: "land", task: { id: "M" }, tier1: true, lock: "agent/review/m" });
    expect(pick([t1], { branches: [built, passed], prs: [pr], claimant: "DeepSeek · s4" }).kind).toBe("none");
    const landing: [string, Branch] = ["agent/review/m", { tipMs: NOW - HOUR, merged: false, markers: [...passed[1].markers, { verb: "Land claim", id: "M", who: "Kimi · s2" }] }];
    expect(reviewStateOf(landing[1])).toBe("landing");
    expect(pick([t1], { branches: [built, landing], prs: [pr], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", of: "land" });
    expect(pick([t1], { branches: [built, landing], prs: [pr], claimant: "Gemini · s3" }).kind).toBe("none");
  });
});

describe("dependsOn holds a landing, not only a build (D-134)", () => {
  const prB: [string, string] = ["agent/queue/b", "https://github.com/o/r/pull/8"];
  it("a green pull request whose dependency is not done is never handed out to land", () => {
    const quietB: [string, Branch] = ["agent/queue/b", claimBy("Qwen · s1", "B", 3)];
    const tasks = [task("A"), task("B", { dependsOn: ["A"] }), task("C")];
    expect(pick(tasks, { branches: [quietB], prs: [prB], prCi: [["agent/queue/b", "green"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "A" } });
    const doneA: [string, Branch] = ["agent/queue/a", claimBy("Mistral · s5", "A", 5, true)];
    expect(pick(tasks, { branches: [doneA, quietB], prs: [prB], prCi: [["agent/queue/b", "green"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "land", task: { id: "B" } });
  });
  it("a packet whose dependency is not done waits; the packet it depends on comes first", () => {
    const tasks = [task("F", { status: "architect", packet: null }), task("P", { status: "architect", packet: null, dependsOn: ["F"] }), task("C")];
    const writingF: [string, Branch] = ["agent/architect/f", claimBy("Qwen · s1", "F", 1)];
    expect(pick(tasks, { branches: [writingF], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "C" } });
    expect(pick(tasks, { claimant: "Kimi · s2" })).toMatchObject({ kind: "architect", task: { id: "F" } });
  });
  it("a task whose dependency is not done gets no work handed out: no continue, takeover or make-green (D-134)", () => {
    const tasks = [task("A", { lane: "X" }), task("B", { dependsOn: ["A"] })];
    const mineB: [string, Branch] = ["agent/queue/b", claimBy("Kimi · s2", "B", 0.5)];
    expect(pick(tasks, { branches: [mineB], prs: [prB], prCi: [["agent/queue/b", "green"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "A" } });
    const quietB: [string, Branch] = ["agent/queue/b", claimBy("Qwen · s1", "B", 3)];
    expect(pick(tasks, { branches: [quietB], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "A" } });
    const red = pick(tasks, { branches: [quietB], prs: [prB], prCi: [["agent/queue/b", "red"]], claimant: "Kimi · s2" });
    expect(red).toMatchObject({ kind: "build", task: { id: "A" } });
    const writingA: [string, Branch] = ["agent/queue/a", claimBy("Mistral · s5", "A", 0.5)];
    const none = pick(tasks, { branches: [writingA, quietB], prs: [prB], prCi: [["agent/queue/b", "red"]], claimant: "Kimi · s2" });
    expect(none).toMatchObject({ kind: "none" });
    expect(none.kind === "none" && none.skipped.find(x => x.id === "B")?.reason).toBe("waits for A");
  });
  it("a Tier 1 pull request whose dependency is not done is not reviewed or landed yet; its reviewer moves on", () => {
    const t1 = task("M", { tier: 1, lane: "money", dependsOn: ["A"] });
    const built: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)];
    const prM: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
    expect(pick([t1, task("A", { lane: "X" })], { branches: [built], prs: [prM], claimant: "Gemini · s3" })).toMatchObject({ kind: "build", task: { id: "A" } });
    const passedByMe: [string, Branch] = ["agent/review/m", { tipMs: NOW - 0.2 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Gemini · s3" }, { verb: "Verdict", id: "M", who: "Gemini · s3", verdict: "pass" }] }];
    expect(pick([t1, task("A", { lane: "X" })], { branches: [built, passedByMe], prs: [prM], claimant: "Gemini · s3" })).toMatchObject({ kind: "build", task: { id: "A" } });
  });
  it("a held task waiting for a dependency is not own work; the agent continues its real work, and --heartbeat keeps every claim alive", () => {
    const tasks = [task("A", { lane: "X" }), task("B", { dependsOn: ["A"] }), task("Y")];
    const mineB: [string, Branch] = ["agent/queue/b", claimBy("Kimi · s2", "B", 0.5)];
    const mineY: [string, Branch] = ["agent/queue/y", claimBy("Kimi · s2", "Y", 0.5)];
    const branches = new Map([mineB, mineY]);
    const prCi = new Map([["agent/queue/b", { state: "green" }]]);
    expect(pick(tasks, { branches: [mineB, mineY], prs: [prB], prCi: [["agent/queue/b", "green"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", of: "build", task: { id: "Y" } });
    expect(core.heldBy({ tasks, branches, openPrs: new Map([prB]), prCi, claimant: "Kimi · s2", now: NOW })).toMatchObject({ of: "build", task: { id: "Y" } });
    // The heartbeat keeps the waiting claim alive too: it is nobody's work yet, but it stays Kimi's.
    expect(core.heldAllBy({ tasks, branches, openPrs: new Map([prB]), prCi, claimant: "Kimi · s2", now: NOW }).map((h: { task: { id: string } }) => h.task.id)).toEqual(["B", "Y"]);
    // Once A is done, B is Kimi's work again.
    const done = [{ ...tasks[0], status: "done" }, tasks[1], tasks[2]];
    expect(pick(done, { branches: [mineB, mineY], prs: [prB], prCi: [["agent/queue/b", "green"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", task: { id: "B" } });
  });
  it("a task that waits for a dependency never holds its lane, so two waiting tasks cannot deadlock one lane or two", () => {
    const oneLane = [task("O", { lane: "L", dependsOn: ["X"] }), task("P", { lane: "L", dependsOn: ["Q"] }), task("X", { lane: "L" }), task("Q", { lane: "L" })];
    const builtO: [string, Branch] = ["agent/queue/o", claimBy("Qwen · s1", "O", 0.5)];
    const builtP: [string, Branch] = ["agent/queue/p", claimBy("Kimi · s2", "P", 0.5)];
    expect(pick(oneLane, { branches: [builtO, builtP], claimant: "Mistral · s5" })).toMatchObject({ kind: "build", task: { id: "X" } });
    const crossLane = [task("O1", { lane: "L", dependsOn: ["X"] }), task("O2", { lane: "M", dependsOn: ["Y"] }), task("X", { lane: "M" }), task("Y", { lane: "L" })];
    const built1: [string, Branch] = ["agent/queue/o1", claimBy("Qwen · s1", "O1", 3)];
    const built2: [string, Branch] = ["agent/queue/o2", claimBy("Kimi · s2", "O2", 3)];
    expect(pick(crossLane, { branches: [built1, built2], claimant: "Mistral · s5" })).toMatchObject({ kind: "build", task: { id: "X" } });
    expect(pick(crossLane, { branches: [built1, built2, ["agent/queue/x", claimBy("Mistral · s5", "X", 0.2)]], claimant: "Gemini · s3" })).toMatchObject({ kind: "build", task: { id: "Y" } });
  });
  it("a Tier 1 pull request built outside the picker is not reviewed while its branch is still being pushed", () => {
    const t1 = task("M", { tier: 1, lane: "money" });
    const prM: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
    const outside = (hoursAgo: number): [string, Branch] => ["agent/queue/m", { tipMs: NOW - hoursAgo * HOUR, merged: false, markers: [] }];
    const fresh = pick([t1], { branches: [outside(0.5)], prs: [prM], prCi: [["agent/queue/m", "green"]], claimant: "Gemini · s3" });
    expect(fresh).toMatchObject({ kind: "none" });
    expect(fresh.kind === "none" && fresh.skipped.find(x => x.id === "M")?.reason).toContain("built outside the picker");
    expect(pick([t1], { branches: [outside(3)], prs: [prM], prCi: [["agent/queue/m", "green"]], claimant: "Gemini · s3" })).toMatchObject({ kind: "review", task: { id: "M" } });
    // After a picker fix round the fresh pushes are the fixer's, so the re-review is handed out at once.
    const lockM: [string, Branch] = ["agent/review/m", { tipMs: NOW - 0.2 * HOUR, merged: false, markers: [
      { verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" },
      { verb: "Fix claim", id: "M", who: "Kimi · f1" }, { verb: "Fixed", id: "M", who: "Kimi · f1" }] }];
    expect(pick([t1], { branches: [outside(0.2), lockM], prs: [prM], prCi: [["agent/queue/m", "green"]], claimant: "Gemini · s3" })).toMatchObject({ kind: "review", task: { id: "M" } });
    // But an outside push after the Fixed marker is new work the fix round never saw: the review waits again.
    const lockOld: [string, Branch] = ["agent/review/m", { ...lockM[1], tipMs: NOW - 5 * HOUR }];
    expect(pick([t1], { branches: [outside(0.2), lockOld], prs: [prM], prCi: [["agent/queue/m", "green"]], claimant: "Gemini · s3" })).toMatchObject({ kind: "none" });
  });
  it("the board keeps a built task's colour while it waits: red for a red pull request, in progress otherwise", () => {
    const built: [string, Branch] = ["agent/queue/b", claimBy("Qwen · s1", "B", 3)];
    const board = (ci: string) => statusBoard({ tasks: [task("A"), task("B", { dependsOn: ["A"] }), task("C", { dependsOn: ["A"] })], branches: new Map([built]), openPrs: new Map([prB]), prCi: new Map([["agent/queue/b", { state: ci }]]), reports: [], now: NOW });
    expect(board("red").map(r => [r.id, r.state, r.health])).toEqual([["A", "todo", "open"], ["B", "waiting", "red"], ["C", "waiting", "open"]]);
    expect(board("green").find(r => r.id === "B")?.health).toBe("progress");
    // A red or blocked report on a waiting built task also reads red.
    for (const status of ["red", "blocked"]) {
      const rows = statusBoard({ tasks: [task("A"), task("B", { dependsOn: ["A"] })], branches: new Map([built]), openPrs: new Map([prB]), prCi: new Map([["agent/queue/b", { state: "green" }]]), reports: [{ id: "B", status, who: "Qwen · s1", at: NOW - HOUR, note: "stuck" }], now: NOW });
      expect(rows.find(r => r.id === "B")?.health).toBe("red");
    }
    // A packet being written for a task that waits keeps reading in progress, not 'not started'.
    const held: [string, Branch] = ["agent/architect/p", claimBy("Qwen · s1", "P", 0.5)];
    const packet = statusBoard({ tasks: [task("A"), task("P", { status: "architect", packet: null, dependsOn: ["A"] })], branches: new Map([held]), openPrs: new Map(), reports: [], now: NOW });
    expect(packet.find(r => r.id === "P")).toMatchObject({ state: "waiting", health: "progress" });
  });
  it("a reviewer whose passed review waits to land continues the next review it holds", () => {
    const t1 = task("M", { tier: 1, lane: "money", dependsOn: ["A"] });
    const t2 = task("N", { tier: 1, lane: "money2" });
    const builtM: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)];
    const builtN: [string, Branch] = ["agent/queue/n", claimBy("DeepSeek · s5", "N", 3)];
    const passedM: [string, Branch] = ["agent/review/m", { tipMs: NOW - 0.2 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Gemini · s3" }, { verb: "Verdict", id: "M", who: "Gemini · s3", verdict: "pass" }] }];
    const reviewingN: [string, Branch] = ["agent/review/n", { tipMs: NOW - 0.2 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "N", who: "Gemini · s3" }] }];
    const prs: [string, string][] = [["agent/queue/m", "https://github.com/o/r/pull/9"], ["agent/queue/n", "https://github.com/o/r/pull/10"]];
    expect(pick([t1, t2, task("A", { lane: "X" })], { branches: [builtM, builtN, passedM, reviewingN], prs, claimant: "Gemini · s3" })).toMatchObject({ kind: "continue", of: "review", task: { id: "N" } });
  });
  it("a red dependent that waits for its dependency never gates or holds that dependency's lane", () => {
    const busyB: [string, Branch] = ["agent/queue/b", claimBy("Qwen · s1", "B", 0.5)];
    const tasks = [task("B", { lane: "L", dependsOn: ["A"] }), task("A", { lane: "L" })];
    expect(pick(tasks, { branches: [busyB], prs: [prB], prCi: [["agent/queue/b", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "A" } });
  });
  it("tasks that share a plan row write their status in their packet, and landing is fast-forward only", () => {
    const ctx = { who: "Kimi · s2", date: "2026-10-21", claimed: true };
    const shared = [task("A", { row: "D-048", lane: "a" }), task("B", { row: "D-048", lane: "b" })];
    const text = renderPick(pick(shared, { claimant: "Kimi · s2" }), ctx);
    expect(text).toContain("Status section of");
    expect(text).not.toContain("§3b row \"D-048\" to \"in progress");
    const own = renderPick(pick([task("C")], { claimant: "Kimi · s2" }), ctx);
    expect(own).toContain("§3b row \"C\"");
    expect(own).toContain("git push origin <sha>:main");
    expect(own).not.toContain("merge the pull request");
  });
  it("a lane-mate that depends on a task never makes that task's lane busy (no deadlock)", () => {
    const tasks = [task("A", { lane: "L" }), task("B", { lane: "L", dependsOn: ["A"] })];
    const quietB: [string, Branch] = ["agent/queue/b", claimBy("Qwen · s1", "B", 3)];
    expect(pick(tasks, { branches: [quietB], prs: [prB], prCi: [["agent/queue/b", "green"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "A" } });
  });
  it("the board shows every task whose dependency is not done as waiting, with or without a branch", () => {
    const quietB: [string, Branch] = ["agent/queue/b", claimBy("Qwen · s1", "B", 3)];
    const rows = statusBoard({ tasks: [task("A"), task("B", { dependsOn: ["A"] }), task("P", { status: "architect", packet: null, dependsOn: ["A"] })], branches: new Map([quietB]), openPrs: new Map([prB]), prCi: new Map([["agent/queue/b", { state: "green" }]]), reports: [], now: NOW });
    expect(rows.map(r => [r.id, r.state])).toEqual([["A", "todo"], ["B", "waiting"], ["P", "waiting"]]);
  });
  it("a Tier 1 pull request whose review passed waits to land until its dependency is done", () => {
    const t1 = task("M", { tier: 1, lane: "money", dependsOn: ["A"] });
    const built: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)];
    const prM: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
    const passed: [string, Branch] = ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Kimi · r1" }, { verb: "Verdict", id: "M", who: "Kimi · r1", verdict: "pass" }] }];
    expect(pick([t1, task("A")], { branches: [built, passed], prs: [prM], claimant: "Gemini · s3" })).toMatchObject({ kind: "build", task: { id: "A" } });
  });
});

describe("a red priority holds its lane and its dependents (D-085, narrowed by D-109: \"dont block tasks let open models execute\")", () => {
  const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
  const quietA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 3)];
  const red = (status: string, at = NOW - HOUR, note = "gate red on coverage") => ({ id: "A", status, who: "Qwen · s1", at, note });

  it("a red report from an active owner makes its lane wait, and a newer green report releases it", () => {
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [busyA], reports: [red("red")], claimant: "Kimi · s2" })).toMatchObject({ kind: "wait", gate: "A" });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [red("red")], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
    // Reports arrive newest first (the log's order), never sorted by an agent's clock.
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [{ ...red("green"), at: NOW - 2 * HOUR }, red("red")], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("a red report whose owner went quiet goes to the next agent to make green", () => {
    expect(pick([task("A"), task("B")], { branches: [quietA], reports: [red("red", NOW - 3 * HOUR)], claimant: "Kimi · s2" })).toMatchObject({ kind: "takeover", task: { id: "A" } });
  });

  it("D-200: a blocked task goes to any other session to unblock; while one is on it, its lane waits and other lanes go on", () => {
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [red("blocked")], claimant: "Claude Code · s9" })).toMatchObject({ kind: "unblock", task: { id: "A" }, report: { status: "blocked" } });
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [quietA], reports: [red("blocked", NOW - 3 * HOUR)], claimant: "Kimi · s2" })).toMatchObject({ kind: "unblock", task: { id: "A" } });
    const unblocking: [string, Branch] = ["agent/architect/a", { tipMs: NOW - 0.5 * HOUR, merged: false, markers: [{ verb: "Unblock", id: "A", who: "Mistral · u1" }] }];
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [quietA, unblocking], reports: [red("blocked", NOW - 3 * HOUR)], claimant: "Kimi · s2" })).toMatchObject({ kind: "wait", gate: "A" });
    expect(pick([task("A"), task("B")], { branches: [quietA, unblocking], reports: [red("blocked", NOW - 3 * HOUR)], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("new work above the red priority or in another lane starts; nothing in its lane or depending on it does", () => {
    expect(pick([task("N"), task("A"), task("B")], { branches: [busyA], reports: [red("red")], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "N" } });
    const below = [task("A"), task("B", { lane: "A" }), task("C", { dependsOn: ["A"] }), task("C2", { dependsOn: ["C"] }), task("D")];
    expect(pick(below, { branches: [busyA], reports: [red("red")], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "D" } });
  });

  it("a red priority holds the CEO only in its own lane: reviews elsewhere and packets go on", () => {
    const t1 = task("M", { tier: 1, lane: "money" });
    const builtM: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)];
    const prM: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
    expect(pick([task("A"), t1], { branches: [busyA, builtM], prs: [prM], reports: [red("red")], claimant: "Claude Code · s9" })).toMatchObject({ kind: "review", task: { id: "M" } });
    expect(pick([task("A"), { ...t1, lane: "A" }], { branches: [busyA, builtM], prs: [prM], reports: [red("red")], claimant: "Claude Code · s9" }).kind).toBe("ceo");
    expect(pick([task("A"), task("P", { status: "architect", packet: null })], { branches: [busyA], reports: [red("red")], claimant: "Claude Code · s9" })).toMatchObject({ kind: "architect", task: { id: "P" } });
  });

  it("the board marks each priority's health, top down", () => {
    const rows = statusBoard({ tasks: [task("A"), task("B")], branches: new Map([busyA]), openPrs: new Map(), reports: [red("red")], now: NOW });
    expect(rows.map(r => [r.id, r.health])).toEqual([["A", "red"], ["B", "open"]]);
  });
});

describe("tasks waiting for a packet (D-085; any agent writes it since D-109)", () => {
  const arch = task("P", { status: "architect", packet: null });

  it("are offered to any agent in priority order", () => {
    expect(pick([arch, task("B")], { claimant: "Claude Code · s9" })).toMatchObject({ kind: "architect", task: { id: "P" }, lock: "agent/architect/p", lockExists: false });
    expect(pick([arch, task("B")], { claimant: "Qwen · s1" })).toMatchObject({ kind: "architect", task: { id: "P" }, lock: "agent/architect/p" });
    const writing: [string, Branch] = ["agent/architect/p", claimBy("Kimi · s3", "P", 1)];
    expect(pick([arch, task("B")], { branches: [writing], claimant: "Qwen · s1" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("an architect claim continues for its holder, waits for others, and is free again after 2 quiet hours", () => {
    const held: [string, Branch] = ["agent/architect/p", claimBy("Claude Code · s9", "P", 1)];
    expect(pick([arch, task("B")], { branches: [held], claimant: "Claude Code · s9" })).toMatchObject({ kind: "continue", of: "architect", task: { id: "P" } });
    expect(pick([arch, task("B")], { branches: [held], claimant: "Claude Code · s7" })).toMatchObject({ kind: "build", task: { id: "B" } });
    const quiet: [string, Branch] = ["agent/architect/p", claimBy("Claude Code · s9", "P", 3)];
    expect(pick([arch, task("B")], { branches: [quiet], claimant: "Claude Code · s7" })).toMatchObject({ kind: "architect", lockExists: true, from: "Claude Code · s9" });
  });
});

// D-200 (owner, Oct 24): Claude Code builds like any other session; nothing waits for one model.
describe("Claude Code sessions build too (D-200)", () => {
  const ceo = "Claude Code · s9";
  const t1 = task("M", { tier: 1, lane: "money" });
  const built: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)];
  const pr: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];

  it("is handed a build, a takeover, a red pull request, findings to fix and a Tier 2 landing", () => {
    expect(pick([task("A")], { claimant: ceo })).toMatchObject({ kind: "build", task: { id: "A" } });
    expect(pick([task("A")], { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 3)]], claimant: ceo })).toMatchObject({ kind: "takeover", task: { id: "A" } });
    const t2pr: [string, string] = ["agent/queue/a", "https://github.com/o/r/pull/7"];
    expect(pick([task("A")], { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 3)]], prs: [t2pr], prCi: [["agent/queue/a", "red"]], claimant: ceo })).toMatchObject({ kind: "green", task: { id: "A" } });
    expect(pick([task("A")], { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 3)]], prs: [t2pr], prCi: [["agent/queue/a", "green"]], claimant: ceo })).toMatchObject({ kind: "land", task: { id: "A" } });
    const findings: [string, Branch] = ["agent/review/m", { tipMs: NOW - HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Kimi · r2" }, { verb: "Verdict", id: "M", who: "Kimi · r2", verdict: "findings" }] }];
    expect(pick([t1], { branches: [built, findings], prs: [pr], claimant: ceo })).toMatchObject({ kind: "fix", task: { id: "M" } });
  });

  it("takes red main, its own work, packets and Tier 1 reviews, in priority order", () => {
    const red = { state: "red", sha: "c".repeat(40), url: "https://ci/red" };
    expect(pick([task("A")], { ci: red, claimant: ceo }).kind).toBe("fix-main");
    expect(pick([task("A")], { branches: [["agent/queue/a", claimBy(ceo, "A", 1)]], claimant: ceo })).toMatchObject({ kind: "continue", of: "build" });
    expect(pick([task("A"), t1], { branches: [built], prs: [pr], claimant: ceo })).toMatchObject({ kind: "review", task: { id: "M" } });
    // Pending before new: a review waiting on the CEO comes before writing a new packet, then the packet.
    expect(pick([task("P", { status: "architect", packet: null }), t1], { branches: [built], prs: [pr], claimant: ceo })).toMatchObject({ kind: "review", task: { id: "M" } });
    expect(pick([task("P", { status: "architect", packet: null }), task("A")], { claimant: ceo })).toMatchObject({ kind: "architect", task: { id: "P" } });
  });

  it("prints the CEO review when nothing at its level waits", () => {
    const text = renderPick({ kind: "ceo", skipped: [{ id: "A", reason: "in progress by Qwen · s1 on agent/queue/a" }] }, { who: ceo, date: "2026-10-20", claimed: true });
    expect(text).toContain("NEXT: CEO REVIEW");
    expect(text).toContain("rate");
    expect(text).toContain("docs/plans/assignments.json");
  });
});

describe("local and origin stay in sync (D-085)", () => {
  const remote = new Map<string, Branch>([["agent/queue/a", claimBy("Qwen · s1", "A", 1)], ["agent/queue/b", claimBy("Kimi · s2", "B", 1)]]);

  it("blocks new work while your own task branch has unpushed commits or uncommitted changes", () => {
    const out = localSyncIssues({ local: [{ branch: "agent/queue/a", ahead: 2, dirty: false, path: "/wt/a" }, { branch: "agent/queue/a", ahead: 0, dirty: true, path: "/wt/a2" }], branches: remote, claimant: "Qwen · s1" });
    expect(out.blocking).toHaveLength(2);
    expect(out.blocking[0]).toContain("git -C /wt/a push origin agent/queue/a");
    expect(out.blocking[1]).toContain("uncommitted changes in /wt/a2");
  });

  it("only notes another agent's or an unclaimed local branch, and is quiet when everything is pushed", () => {
    const out = localSyncIssues({ local: [{ branch: "agent/queue/b", ahead: 1, dirty: false, path: "/wt/b" }, { branch: "agent/claude/new", ahead: null, dirty: false, path: "/wt/n" }], branches: remote, claimant: "Qwen · s1" });
    expect(out.blocking).toEqual([]);
    expect(out.notes.join("\n")).toContain("agent/queue/b");
    expect(out.notes.join("\n")).toContain("agent/claude/new is not on origin");
    expect(localSyncIssues({ local: [{ branch: "agent/queue/a", ahead: 0, dirty: false, path: "/wt/a" }], branches: remote, claimant: "Qwen · s1" })).toEqual({ blocking: [], notes: [], unpushed: [] });
  });

  it("notes a local main behind origin so nobody reads stale docs", () => {
    expect(localSyncIssues({ local: [], branches: remote, claimant: null, mainBehind: 7 }).notes.join("\n")).toContain("7 commits behind origin/main");
  });
});

describe("markers and printed steps", () => {
  it("round-trips every marker", () => {
    for (const [verb, verdict] of [["Claim"], ["Takeover"], ["Review claim"], ["Fix claim"], ["Land claim"], ["Heartbeat"], ["Fixed"], ["Verdict", "pass"], ["Verdict", "findings"]]) {
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

  it("tells every builder to push after each commit and to heartbeat through long steps (D-085)", () => {
    const text = renderPick({ kind: "build", task: task("N"), ciRunning: false }, { who: "Qwen · s1", date: "2026-10-20", claimed: true });
    expect(text).toContain("Push your branch after every commit");
    expect(text).toContain('--heartbeat --as "Qwen · s1"');
  });

  it("prints a continue as already yours, with where you stopped, and no claim step", () => {
    const ctx = { who: "Qwen · s1", date: "2026-10-20", claimed: true };
    const text = renderPick({ kind: "continue", of: "build", task: task("A"), work: "agent/queue/a" }, ctx);
    expect(text).toContain("NEXT: CONTINUE A");
    expect(text).toContain("already yours");
    expect(text).toContain("git log --oneline origin/main..origin/agent/queue/a");
    expect(text).not.toContain("--claim");
    for (const of of ["review", "fix", "land", "green", "architect", "fix-main"]) {
      const pickOf = { kind: "continue", of, task: task("M", { tier: 1 }), work: "agent/queue/m", pr: "https://github.com/o/r/pull/9", lock: "agent/review/m", sha: "c".repeat(40), url: "https://ci/red" };
      expect(renderPick(pickOf, ctx)).toContain("already yours");
    }
  });

  it("prints make-green, land and architect steps", () => {
    const ctx = { who: "Kimi · s2", date: "2026-10-20", claimed: true };
    const green = renderPick({ kind: "green", task: task("A"), work: "agent/queue/a", pr: "https://github.com/o/r/pull/7", from: "Qwen · s1", since: NOW - 3 * HOUR }, ctx);
    expect(green).toContain("MAKE GREEN A");
    expect(green).toContain("https://github.com/o/r/pull/7");
    const land1 = renderPick({ kind: "land", task: task("M", { tier: 1 }), work: "agent/queue/m", pr: "https://github.com/o/r/pull/9", lock: "agent/review/m", tier1: true, from: "Mistral · r1" }, ctx);
    expect(land1).toContain("LAND M");
    expect(land1).toContain("re-run the full gate");
    // D-134 (6): landing is a fast-forward to the exact green commit (the merge button only for an up-to-date branch), never squash, with a step for a refused push.
    expect(land1).toContain("git push origin <sha>:main");
    expect(land1).toContain("If that push is refused because main moved");
    expect(land1).toContain("never squash or rebase-merge");
    const fixMain = renderPick({ kind: "fix-main", sha: "c".repeat(40), url: "https://ci/run/2", lock: "agent/queue/fix-main-cccccccc", parent: null, from: null }, ctx);
    expect(fixMain).toContain("git push origin <sha>:main");
    expect(fixMain).not.toContain("Then merge it");
    expect(fixMain).toContain("if that push is refused because main moved");
    // D-074: a Tier 1 landing checks that nothing was pushed after the pass verdict.
    expect(land1).toContain("was never reviewed (D-074)");
    expect(land1).toContain("<reviewed>..origin/agent/queue/m ^origin/main");
    expect(land1).toContain("git log --merges --cc");
    const review = renderPick({ kind: "review", task: task("M", { tier: 1 }), work: "agent/queue/m", pr: "https://github.com/o/r/pull/9", lock: "agent/review/m", lockExists: true, builder: "Qwen · s1" }, ctx);
    expect(review).toContain("Before reading any code, record the head you review");
    expect(review).toContain("Name <reviewed> with your verdict, never a fresh rev-parse");
    expect(review).not.toContain("goes back to review");
    const arch = renderPick({ kind: "architect", task: task("P", { status: "architect", packet: null }), lock: "agent/architect/p", lockExists: false }, { ...ctx, who: "Claude Code · s9" });
    expect(arch).toContain("WRITE THE PACKET FOR P");
    expect(arch).toContain("docs/DELEGATION.md");
  });

  it("reserves the review, heartbeat and architect prefixes", () => {
    const doc = { version: 1, repo: "o/r", tasks: [task("A", { branch: "agent/heartbeat/a" }), task("B", { branch: "agent/architect/b" })] };
    expect(validateAssignments(doc, exists).filter(e => e.includes("reserved"))).toHaveLength(2);
  });

  it("ends every work step list with the report to the CEO", () => {
    const ctx = { who: "Qwen · s1", date: "2026-10-20", claimed: true };
    for (const p of [
      { kind: "build", task: task("N"), ciRunning: false },
      { kind: "continue", of: "build", task: task("A"), work: "agent/queue/a" },
      { kind: "green", task: task("A"), work: "agent/queue/a", pr: "https://github.com/o/r/pull/7", from: "x", since: NOW },
      { kind: "review", task: task("M", { tier: 1 }), work: "agent/queue/m", pr: "https://github.com/o/r/pull/9", lock: "agent/review/m", lockExists: false, builder: "x" },
    ]) expect(renderPick(p, ctx)).toContain(`--report <green|red|blocked|review|landed> --task ${p.task.id} --as "Qwen · s1"`);
  });
});

// The organisation (owner, Oct 20): the open models (CTO, CDO and the rest)
// report the status of every priority task to the CEO (Claude Code), who reads
// one board, in priority order, before deciding direction (D-085).
describe("status reports to the CEO and the board (D-085)", () => {
  it("round-trips a report with its status", () => {
    const subject = markerSubject("Report", "GO-LIVE-1", "Qwen 3 · s1", "green");
    expect(subject).toBe("Report GO-LIVE-1: green — Qwen 3 · s1");
    expect(parseMarker(subject)).toEqual({ verb: "Report", id: "GO-LIVE-1", status: "green", who: "Qwen 3 · s1" });
    expect(parseMarker("Report GO-LIVE-1: shiny — Qwen 3 · s1")).toBeNull();
  });

  it("names the executive role from the lane", () => {
    expect(roleOf(task("A", { lane: "design" }))).toBe("CDO");
    expect(roleOf(task("A", { lane: "design-system" }))).toBe("CDO");
    expect(roleOf(task("A", { lane: "d048-platform" }))).toBe("CDO");
    expect(roleOf(task("A", { lane: "payments" }))).toBe("CTO");
    expect(roleOf(task("A", { lane: "d049-platform" }))).toBe("CTO");
  });

  it("accepts only optional epic strings with the assignment identifier shape", () => {
    expect(validateAssignments({ version: 1, repo: "o/r", tasks: [task("A")] }, exists)).toEqual([]);
    for (const epic of ["D-048-p3", "epic.v2", "A1-foo.bar"]) {
      expect(validateAssignments({ version: 1, repo: "o/r", tasks: [task("A", { epic })] }, exists)).toEqual([]);
    }
    for (const epic of ["", " bad", "bad ", "bad/epic", "bad_epic", 42, null, false, [], {}]) {
      const errors = validateAssignments({ version: 1, repo: "o/r", tasks: [task("A", { epic })] }, exists);
      expect(errors.some(e => e.includes("epic"))).toBe(true);
    }
  });

  it("adds epic and only valid open-PR behind-main data to board rows", () => {
    const tasks = [
      task("A", { epic: "D-048-p3" }),
      task("B", { epic: "D-048-p3" }),
      task("C", { status: "done", epic: "D-048-p3" }),
      task("D", { status: "done", epic: "D-048-p3" }),
      task("U", { epic: "D-049" }),
      task("N"),
    ];
    const openPrs = new Map([
      ["agent/queue/a", "https://github.com/o/r/pull/1"],
      ["agent/queue/b", "https://github.com/o/r/pull/2"],
      ["agent/queue/c", "https://github.com/o/r/pull/3"],
    ]);
    const rows = statusBoard({
      tasks, branches: new Map([
        ["agent/queue/a", claimBy("Builder · a", "A")],
        ["agent/queue/b", claimBy("Builder · b", "B")],
        ["agent/queue/c", claimBy("Builder · c", "C")],
      ]), openPrs,
      prCi: new Map([["agent/queue/a", { state: "green" }], ["agent/queue/b", { state: "green" }]]),
      prBehind: new Map([["agent/queue/a", 4], ["agent/queue/b", "bad"], ["agent/queue/c", 9], ["agent/queue/u", null]]),
      now: NOW,
    });
    expect(rows.map(r => [r.id, r.epic, r.behindMain])).toEqual([
      ["A", "D-048-p3", 4], ["B", "D-048-p3", null], ["C", "D-048-p3", undefined],
      ["D", "D-048-p3", undefined], ["U", "D-049", undefined], ["N", undefined, undefined],
    ]);
    expect(rows[2]).toMatchObject({ pr: "https://github.com/o/r/pull/3" });
    expect(rows[2]).not.toHaveProperty("behindMain");
  });

  it("keeps a measured zero distinct from missing or invalid behind-main data", () => {
    for (const [measured, expected] of [[0, 0], [undefined, null], [null, null], [-1, null], [1.5, null], [NaN, null], [Infinity, null], ["2", null]]) {
      const rows = statusBoard({
        tasks: [task("A")], branches: new Map([["agent/queue/a", claimBy("Builder · a", "A")]]),
        openPrs: new Map([["agent/queue/a", "https://github.com/o/r/pull/1"]]),
        prBehind: new Map([["agent/queue/a", measured]]), now: NOW,
      });
      expect(rows[0].behindMain).toBe(expected);
    }
    expect(renderBoard([])).not.toContain("released:");
    expect(epicSummaries([])).toEqual([]);
  });

  it("summarizes epics in first-seen order and renders summaries without dropping rows", () => {
    const rows = [
      { id: "A", title: "A title", tier: 2, role: "CTO", state: "pr-green", health: "green", holder: null, quietHours: null, pr: "https://github.com/o/r/pull/1", behindMain: 2, report: null, epic: "D-048-p3" },
      { id: "B", title: "B title", tier: 2, role: "CDO", state: "done", health: "done", holder: null, quietHours: null, pr: "https://github.com/o/r/pull/2", report: null, epic: "D-048-p3" },
      { id: "C", title: "C title", tier: 2, role: "CTO", state: "done", health: "done", holder: null, quietHours: null, pr: null, report: null, epic: "D-049" },
      { id: "D", title: "D title", tier: 2, role: "CTO", state: "todo", health: "red", holder: null, quietHours: null, pr: null, report: null, epic: "D-048-p3" },
      { id: "E", title: "E title", tier: 2, role: "CTO", state: "todo", health: "open", holder: null, quietHours: null, pr: null, report: null },
    ];
    expect(epicSummaries(rows)).toEqual([
      { epic: "D-048-p3", total: 3, done: 1, prs: 1, red: 1, released: ["B"] },
      { epic: "D-049", total: 1, done: 1, prs: 0, red: 0, released: ["C"] },
    ]);
    const text = renderBoard(rows);
    expect(text).toMatch(/1\. A[\s\S]*2\. B[\s\S]*3\. C[\s\S]*4\. D[\s\S]*5\. E/);
    expect(text).toContain("D-048-p3: 1/3 done, 1 PR, 1 red, released: B");
    expect(text).toContain("D-049: 1/1 done, 0 PR, 0 red, released: C");
    expect(text).toContain("behind main 2");
    expect(renderBoard([{ ...rows[0], behindMain: null }])).toContain("behind main unknown");
  });

  it("shows every task in priority order with its state, holder, quiet time and latest report", () => {
    const tasks = [task("A"), task("B", { tier: 1 }), task("C"), task("D", { status: "done" }), task("E", { status: "owner" })];
    const branches = new Map<string, Branch>([
      ["agent/queue/a", claimBy("Qwen · s1", "A", 3)],
      ["agent/queue/b", claimBy("Kimi · s2", "B", 1)],
    ]);
    const reports = [
      { id: "B", status: "green", who: "Kimi · s2", at: NOW - HOUR / 2, note: "CI green" },
      { id: "B", status: "review", who: "Kimi · s2", at: NOW - HOUR, note: "draft PR open" },
      { id: "A", status: "red", who: "Qwen · s1", at: NOW - 4 * HOUR, note: "gate red on the coverage test" },
    ];
    const rows = statusBoard({ tasks, branches, openPrs: new Map([["agent/queue/b", "https://github.com/o/r/pull/9"]]), prCi: new Map([["agent/queue/b", { state: "green" }]]), reports, now: NOW });
    expect(rows.map(r => [r.id, r.state])).toEqual([["A", "quiet"], ["B", "pr-green"], ["C", "todo"], ["D", "done"], ["E", "owner"]]);
    expect(rows[0]).toMatchObject({ holder: "Qwen · s1", role: "CTO", quietHours: 3, report: { status: "red", note: "gate red on the coverage test" } });
    expect(rows[1].report).toMatchObject({ status: "green" });
    const text = renderBoard(rows);
    expect(text).toContain("STATUS BOARD");
    expect(text).toContain("A");
    expect(text).toContain("quiet 3h");
    expect(text).toContain("red — Qwen · s1: gate red on the coverage test");
  });

  it("shows the three reports after a standing block in oldest-first order while the task stays red", () => {
    // D-200: only a newer report from another session, or this session's own green or landed one, clears a block.
    const reports: Report[] = [
      { id: "A", status: "review", who: "Builder · s1", at: NOW - HOUR, note: "asked for a ruling" },
      { id: "A", status: "red", who: "Builder · s1", at: NOW - 2 * HOUR, note: "implementation underway" },
      { id: "A", status: "review", who: "Builder · s1", at: NOW - 3 * HOUR, note: "owner waiver reported" },
      { id: "A", status: "blocked", who: "Builder · s1", at: NOW - 4 * HOUR, note: "awaiting a ruling" },
      { id: "A", status: "green", who: "Builder · s1", at: NOW - 5 * HOUR, note: "predates block" },
    ];
    const rows = statusBoard({
      tasks: [task("A")], branches: new Map([["agent/queue/a", claimBy("Builder · s1", "A")]]),
      openPrs: new Map(), reports, now: NOW,
    });
    expect(rows[0]).toMatchObject({
      health: "red",
      report: { status: "blocked", newer: [
        { note: "owner waiver reported" },
        { note: "implementation underway" },
        { note: "asked for a ruling" },
      ] },
    });
    const text = renderBoard(rows);
    expect(text).toContain("report: blocked — Builder · s1: awaiting a ruling");
    for (const line of ["then: review — Builder · s1: owner waiver reported", "then: red — Builder · s1: implementation underway", "then: review — Builder · s1: asked for a ruling"]) expect(text).toContain(line);
    const notes = ["owner waiver reported", "implementation underway", "asked for a ruling"]
      .map(note => text.indexOf(note));
    expect(notes[0]).toBeLessThan(notes[1]);
    expect(notes[1]).toBeLessThan(notes[2]);
    expect(text).not.toContain("predates block");
  });

  it("shows at most three of five newer reports on the board and counts the rest", () => {
    const followUps = [5, 4, 3, 2, 1].map((n, i) => ({
      id: "A", status: "review", who: "Builder · s1", at: NOW - (i + 1) * HOUR, note: `follow-up ${n}`,
    }));
    const rows = statusBoard({
      tasks: [task("A")], branches: new Map([["agent/queue/a", claimBy("Builder · s1", "A")]]),
      openPrs: new Map(), reports: [...followUps, { id: "A", status: "blocked", who: "Builder · s1", at: NOW - 6 * HOUR, note: "awaiting CEO" }], now: NOW,
    });
    expect(rows[0].report.newer).toHaveLength(5);
    const text = renderBoard(rows);
    const firstThree = ["follow-up 1", "follow-up 2", "follow-up 3"]
      .map(note => text.indexOf(`then: review — Builder · s1: ${note}`));
    expect(firstThree.every(index => index >= 0)).toBe(true);
    expect(firstThree[0]).toBeLessThan(firstThree[1]);
    expect(firstThree[1]).toBeLessThan(firstThree[2]);
    expect(text).toContain("+2 more");
    expect(text).not.toContain("follow-up 4");
    expect(text).not.toContain("follow-up 5");
  });

  it("clears the block when another session reports after it, so no newer reports are listed (D-200)", () => {
    const reports: Report[] = [
      { id: "A", status: "review", who: "Kimi · s9", at: NOW, note: "ruling recorded" },
      { id: "A", status: "green", who: "Builder · s1", at: NOW - HOUR, note: "focused tests passed" },
      { id: "A", status: "green", who: "Builder · s1", at: NOW - 2 * HOUR, note: "implementation underway" },
      { id: "A", status: "green", who: "Builder · s1", at: NOW - 3 * HOUR, note: "owner waiver reported" },
      { id: "A", status: "blocked", who: "Builder · s1", at: NOW - 4 * HOUR, note: "awaiting a ruling" },
    ];
    const rows = statusBoard({
      tasks: [task("A")], branches: new Map([["agent/queue/a", claimBy("Builder · s1", "A")]]),
      openPrs: new Map(), reports, now: NOW,
    });
    expect(rows[0].report).toMatchObject({ status: "review", newer: [] });
    expect(rows[0].health).not.toBe("red");
  });

  it("prints every newer report in full before ruling, including on a resumed unblock", () => {
    const newer = [
      { id: "A", status: "green", who: "Builder · s1", at: NOW - 2 * HOUR, note: "owner waiver recorded" },
      { id: "A", status: "green", who: "Builder · s1", at: NOW - HOUR, note: "focused tests passed" },
    ];
    const report = { id: "A", status: "blocked", who: "Builder · s1", at: NOW - 3 * HOUR, note: "awaiting CEO ruling", newer };
    const shared = { task: task("A"), report, lock: "agent/architect/a", lockExists: false };
    const picks = [
      { kind: "unblock", ...shared },
      { kind: "continue", of: "unblock", ...shared },
    ];
    for (const pickResult of picks) {
      const text = renderPick(pickResult, { who: "Claude Code · s9", date: "2026-10-23", claimed: true });
      expect(text).toContain("Read these newer reports before ruling; a builder may have recorded an owner's word.");
      expect(text).toContain(new Date(NOW - 2 * HOUR).toISOString());
      const notes = ["owner waiver recorded", "focused tests passed"].map(note => text.indexOf(note));
      expect(notes.every(index => index >= 0)).toBe(true);
      expect(notes[0]).toBeLessThan(notes[1]);
    }
  });

  it("the CEO review starts from the board", () => {
    const text = renderPick({ kind: "ceo", skipped: [], board: [{ id: "A", title: "A title", tier: 2, role: "CTO", state: "todo", holder: null, quietHours: null, pr: null, report: null }] }, { who: "Claude Code · s9", date: "2026-10-20", claimed: true });
    expect(text).toContain("STATUS BOARD");
    expect(text).toContain("CEO REVIEW");
  });
});

// The adversarial review of D-085 (Oct 20): each finding pinned with the
// failing case it reported, so the picker never hands two agents one task.
describe("hardening from the D-085 review", () => {
  const t1 = task("M", { tier: 1, lane: "money" });
  const pr: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
  const prA: [string, string] = ["agent/queue/a", "https://github.com/o/r/pull/7"];
  const lockOf = (hoursAgo: number, ...markers: Marker[]): [string, Branch] => ["agent/review/m", { tipMs: NOW - hoursAgo * HOUR, merged: false, markers }];
  const blocked = { id: "A", status: "blocked", who: "Qwen · s1", at: NOW - HOUR, note: "needs a ruling on refunds" };

  it("stops when the pull requests or the merged pull requests cannot be read; one task's unreadable PR CI only skips that task (D-109)", () => {
    const reviewing = lockOf(0.5, { verb: "Review claim", id: "M", who: "Kimi · r1" });
    expect(pick([t1], { branches: [["agent/queue/m", claimBy("DeepSeek · s4", "M", 5)], reviewing], prs: null, claimant: "Gemini · s3" }).kind).toBe("stop");
    expect(pick([task("A")], { merged: null }).kind).toBe("stop");
    expect(pick([task("A"), task("B")], { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 1)]], prs: [prA], prCi: [["agent/queue/a", "error"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("an unblock is claimed like a packet: one session gets it, and it comes back to that session", () => {
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const lock: [string, Branch] = ["agent/architect/a", { tipMs: NOW - HOUR, merged: false, markers: [{ verb: "Unblock", id: "A", who: "Claude Code · s7" }] }];
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [blocked], claimant: "Claude Code · s9" })).toMatchObject({ kind: "unblock", lock: "agent/architect/a", lockExists: false });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [blocked], claimant: "Kimi · s2" })).toMatchObject({ kind: "unblock", lock: "agent/architect/a", lockExists: false });
    expect(pick([task("A"), task("B")], { branches: [busyA, lock], reports: [blocked], claimant: "Claude Code · s9" })).toMatchObject({ kind: "build", task: { id: "B" } });
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [busyA, lock], reports: [blocked], claimant: "Claude Code · s9" }).kind).toBe("ceo");
    expect(pick([task("A"), task("B")], { branches: [busyA, lock], reports: [blocked], claimant: "Claude Code · s7" })).toMatchObject({ kind: "continue", of: "unblock", task: { id: "A" } });
    const quiet: [string, Branch] = ["agent/architect/a", { ...lock[1], tipMs: NOW - 3 * HOUR }];
    expect(pick([task("A"), task("B")], { branches: [busyA, quiet], reports: [blocked], claimant: "Claude Code · s9" })).toMatchObject({ kind: "unblock", from: "Claude Code · s7" });
  });

  it("a squash-merged pull request counts as done, so a landed task is never rebuilt or taken over", () => {
    const tasks = [task("A"), task("B", { dependsOn: ["A"] })];
    const landed: [string, Branch] = ["agent/queue/a", { ...claimBy("Qwen · s1", "A", 3), tipSha: "f00d" }];
    expect(pick(tasks, { branches: [landed], merged: [["agent/queue/a", ["f00d"]]], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
    expect(pick(tasks, { merged: [["agent/queue/a", ["f00d"]]], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
    // New commits after the merge are new work on that branch, not the landed head.
    expect(pick(tasks, { branches: [landed], merged: [["agent/queue/a", ["beef"]]], claimant: "Kimi · s2" })).toMatchObject({ kind: "takeover", task: { id: "A" } });
  });

  it("on a Tier 1 pull request the review lock decides: a reviewer's red report never makes the builder wait or the reviewer fix", () => {
    const findings = lockOf(0.4, { verb: "Review claim", id: "M", who: "Kimi · r1" }, { verb: "Verdict", id: "M", who: "Kimi · r1", verdict: "findings" });
    const said = [{ id: "M", status: "red", who: "Kimi · r1", at: NOW - 0.4 * HOUR, note: "3 findings" }];
    expect(pick([t1], { branches: [["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)], findings], prs: [pr], prCi: [["agent/queue/m", "green"]], reports: said, claimant: "DeepSeek · s4" })).toMatchObject({ kind: "fix" });
    const result = pick([t1], { branches: [["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)], findings], prs: [pr], prCi: [["agent/queue/m", "green"]], reports: said, claimant: "Kimi · r1" });
    expect(["green", "fix", "takeover"]).not.toContain(result.kind);
  });

  it("nobody reviews or lands code they ever built or fixed, across takeovers and fix rounds", () => {
    const takenOver: [string, Branch] = ["agent/queue/m", { tipMs: NOW - HOUR, merged: false, markers: [{ verb: "Claim", id: "M", who: "DeepSeek · s4" }, { verb: "Takeover", id: "M", who: "Kimi · s2" }] }];
    expect(pick([t1], { branches: [takenOver], prs: [pr], prCi: [["agent/queue/m", "green"]], claimant: "DeepSeek · s4" }).kind).not.toBe("review");
    const rounds = lockOf(3,
      { verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" },
      { verb: "Fix claim", id: "M", who: "Kimi · f1" }, { verb: "Fixed", id: "M", who: "Kimi · f1" },
      { verb: "Review claim", id: "M", who: "Mistral · r2" }, { verb: "Verdict", id: "M", who: "Mistral · r2", verdict: "findings" },
      { verb: "Fix claim", id: "M", who: "Gemini · f2" }, { verb: "Fixed", id: "M", who: "Gemini · f2" });
    expect(pick([t1], { branches: [["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)], rounds], prs: [pr], claimant: "Kimi · f1" }).kind).not.toBe("review");
    expect(pick([t1], { branches: [["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)], rounds], prs: [pr], claimant: "Qwen · s1" })).toMatchObject({ kind: "review" });
  });

  it("a fixer or lander pushing to the pull request's branch keeps its stage, whatever the lock's age", () => {
    const work: [string, Branch] = ["agent/queue/m", { tipMs: NOW - 10 * 60_000, merged: false, markers: [{ verb: "Claim", id: "M", who: "DeepSeek · s4" }] }];
    const fixing = lockOf(3, { verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" }, { verb: "Fix claim", id: "M", who: "Kimi · f1" });
    expect(pick([t1], { branches: [work, fixing], prs: [pr], prCi: [["agent/queue/m", "green"]], claimant: "Gemini · s3" }).kind).not.toBe("fix");
    const landing = lockOf(3, { verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "pass" }, { verb: "Land claim", id: "M", who: "Kimi · l1" });
    expect(pick([t1], { branches: [work, landing], prs: [pr], prCi: [["agent/queue/m", "green"]], claimant: "Gemini · s3" }).kind).not.toBe("land");
  });

  it("heartbeats on a review lock never change its stage, and a side heartbeat counts only for the branch's holder", () => {
    const beat = lockOf(0.1, { verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" }, { verb: "Heartbeat", id: "M", who: "Mistral · r1" });
    expect(reviewStateOf(beat[1], "M")).toBe("needs-fix");
    const left: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 5)];
    const reviewersBeat: [string, Branch] = ["agent/heartbeat/m", { tipMs: NOW - 10 * 60_000, merged: false, markers: [{ verb: "Heartbeat", id: "M", who: "Mistral · r1" }] }];
    const reviewing = lockOf(0.2, { verb: "Review claim", id: "M", who: "Mistral · r1" });
    expect(pick([t1, task("B")], { branches: [left, reviewing, reviewersBeat], prs: [pr], prCi: [["agent/queue/m", "red"]], claimant: "Gemini · s3" })).toMatchObject({ kind: "green", task: { id: "M" } });
  });

  it("a marker for another task, or with another id, never changes a branch's holder", () => {
    const mixed: [string, Branch] = ["agent/queue/a", { tipMs: NOW - HOUR, merged: false, markers: [{ verb: "Claim", id: "A", who: "Qwen · s1" }, { verb: "Claim", id: "B", who: "Gemini · s3" }] }];
    expect(pick([task("A"), task("B")], { branches: [mixed], claimant: "Qwen · s1" })).toMatchObject({ kind: "continue", task: { id: "A" } });
  });

  it("pending work ranked above your own comes first; a red priority whose owner is on it does not stop your own work", () => {
    const mineC: [string, Branch] = ["agent/queue/c", claimBy("Kimi · s2", "C", 0.5)];
    const quietRedA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 3)];
    expect(pick([task("A"), task("C")], { branches: [quietRedA, mineC], prs: [prA], prCi: [["agent/queue/a", "red"]], claimant: "Kimi · s2" }))
      .toMatchObject({ kind: "green", task: { id: "A" }, holds: { id: "C", branch: "agent/queue/c" } });
    const busyRedA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 0.5)];
    expect(pick([task("A"), task("C")], { branches: [busyRedA, mineC], prs: [prA], prCi: [["agent/queue/a", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", task: { id: "C" } });
    // Pending work below your own waits for you to finish.
    expect(pick([task("C"), task("A")], { branches: [quietRedA, mineC], prs: [prA], prCi: [["agent/queue/a", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", task: { id: "C" } });
  });

  it("a blocked task waits for another session or the owner: its holder is told so, any other session gets the unblock", () => {
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const own = pick([task("A"), task("B")], { branches: [busyA], reports: [blocked], claimant: "Qwen · s1" });
    expect(own).toMatchObject({ kind: "wait", gate: "A", blocked: true, own: true });
    expect(renderPick(own, { who: "Qwen · s1", date: "2026-10-20", claimed: true })).toContain("neither raised the block nor holds the task, or the owner");
    const ctx = { who: "Kimi · s2", date: "2026-10-20", claimed: false };
    const other = pick([task("A"), task("B", { lane: "A" })], { branches: [busyA], reports: [blocked], claimant: "Kimi · s2" });
    expect(other).toMatchObject({ kind: "unblock", task: { id: "A" } });
    const text = renderPick(other, ctx);
    expect(text).toContain("D-200");
    expect(text).toContain("owner");
    expect(text).not.toContain("until main is green");
  });

  it("a red-priority WAIT says what it waits on, not main", () => {
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const text = renderPick(pick([task("A"), task("B", { lane: "A" })], { branches: [busyA], reports: [{ id: "A", status: "red", who: "Qwen · s1", at: NOW - HOUR, note: "x" }], claimant: "Kimi · s2" }), { who: "Kimi · s2", date: "d", claimed: false });
    expect(text).not.toContain("until main is green");
    expect(text).toContain("ranked below A");
  });

  it("a red report older than a green CI run on its pull request no longer holds anything", () => {
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const old = { id: "A", status: "red", who: "Qwen · s1", at: NOW - 5 * HOUR, note: "x" };
    expect(pick([task("A"), task("B")], { branches: [busyA], prs: [prA], prCi: [["agent/queue/a", "green"]], prCiAt: [["agent/queue/a", NOW - HOUR]], reports: [old], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("--heartbeat keeps what you hold alive even while main is red", () => {
    const branches = new Map<string, Branch>([["agent/queue/a", claimBy("Qwen · s1", "A", 1)], ["agent/queue/fix-main-cccccccc", claimBy("Kimi · s2", "fix-main-cccccccc", 1)]]);
    expect(core.heldBy({ tasks: [task("A")], branches, openPrs: new Map(), claimant: "Qwen · s1", mainSha: "c".repeat(40) })).toMatchObject({ kind: "continue", of: "build", task: { id: "A" } });
    expect(core.heldBy({ tasks: [task("A")], branches, openPrs: new Map(), claimant: "Kimi · s2", mainSha: "c".repeat(40) })).toMatchObject({ of: "fix-main", lock: "agent/queue/fix-main-cccccccc" });
    expect(core.heldBy({ tasks: [task("A")], branches, openPrs: new Map(), claimant: "Gemini · s3", mainSha: null })).toBeNull();
  });

  it("a holder back on a quiet claim re-takes it on the ref a takeover would push to, so the first push wins", () => {
    const a = (hoursAgo: number) => new Map<string, Branch>([["agent/queue/a", claimBy("Qwen · s1", "A", hoursAgo)]]);
    const own = { kind: "continue", of: "build", task: task("A"), work: "agent/queue/a" };
    expect(core.leaseFor(own, a(1), NOW)).toMatchObject({ ref: "agent/heartbeat/a", verb: "Heartbeat", reclaim: false });
    expect(core.leaseFor(own, a(1.6), NOW)).toMatchObject({ ref: "agent/queue/a", verb: "Claim", reclaim: true });
    expect(core.leaseFor(own, a(5), NOW)).toMatchObject({ ref: "agent/queue/a", reclaim: true });
    expect(core.leaseFor({ kind: "continue", of: "review", task: t1, lock: "agent/review/m" }, a(5), NOW)).toMatchObject({ ref: "agent/review/m", verb: "Heartbeat" });
    expect(core.leaseFor({ kind: "continue", of: "fix-main", sha: "c".repeat(40), lock: "agent/queue/fix-main-cccccccc" }, new Map([["agent/queue/fix-main-cccccccc", claimBy("Kimi · s2", "fix-main-cccccccc", 2)]]), NOW))
      .toMatchObject({ ref: "agent/queue/fix-main-cccccccc", id: "fix-main-cccccccc", reclaim: true });
  });

  it("the red-main fixer works on the lock branch and keeps it alive; the fix is the one push D-082 allows", () => {
    const ctx = { who: "Kimi · s2", date: "d", claimed: true };
    for (const p of [{ kind: "fix-main", sha: "c".repeat(40), url: "u", lock: "agent/queue/fix-main-cccccccc" }, { kind: "continue", of: "fix-main", sha: "c".repeat(40), url: "u", lock: "agent/queue/fix-main-cccccccc" }]) {
      const text = renderPick(p, ctx);
      expect(text).toContain('--heartbeat --as "Kimi · s2"');
      expect(text).toContain("worktree add ../skipwaitmanus-wt/fix-main-cccccccc agent/queue/fix-main-cccccccc");
      expect(text).not.toContain("main's own CI is green");
    }
  });

  it("a freshly claimed packet's worktree tracks the lock the claim pushed", () => {
    const text = renderPick({ kind: "architect", task: task("P", { status: "architect", packet: null }), lock: "agent/architect/p", lockExists: false }, { who: "Claude Code · s9", date: "d", claimed: true });
    expect(text).not.toContain("-b agent/architect/p origin/main");
    expect(text).toContain("worktree add ../skipwaitmanus-wt/architect-p agent/architect/p");
  });

  it("local sync covers packets, fixes and landings; never tells anyone to push onto someone else's branch", () => {
    const packet = localSyncIssues({ local: [{ branch: "agent/architect/p", ahead: 3, dirty: true, path: "/wt/p" }], branches: new Map([["agent/architect/p", claimBy("Claude Code · s9", "P", 3)]]), claimant: "Claude Code · s9", tasks: [task("P", { status: "architect", packet: null })] });
    expect(packet.blocking).toHaveLength(2);
    const fixer = localSyncIssues({
      local: [{ branch: "agent/queue/m", ahead: 2, dirty: false, path: "/wt/m" }],
      branches: new Map([["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)], lockOf(1, { verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" }, { verb: "Fix claim", id: "M", who: "Kimi · f1" })]),
      claimant: "Kimi · f1", tasks: [t1],
    });
    expect(fixer.blocking).toHaveLength(1);
    expect(fixer.unpushed).toEqual(["agent/queue/m"]);
    const taken = localSyncIssues({ local: [{ branch: "agent/queue/a", ahead: 3, dirty: false, path: "/wt/a" }], branches: new Map([["agent/queue/a", { tipMs: NOW, merged: false, markers: [{ verb: "Claim", id: "A", who: "Qwen · s1" }, { verb: "Takeover", id: "A", who: "Kimi · s2" }] }]]), claimant: "Qwen · s1", tasks: [task("A")] });
    expect(taken.blocking).toEqual([]);
    expect(taken.notes.join("\n")).toContain("never push or force-push to it");
    expect(taken.notes.join("\n")).toContain("agent/queue/a-salvage");
  });

  it("a restarted session that picked a new name is told which name holds its local work", () => {
    const out = localSyncIssues({ local: [{ branch: "agent/queue/a", ahead: 2, dirty: true, path: "/wt/a" }], branches: new Map([["agent/queue/a", claimBy("Qwen 3 · 14:05", "A", 0.3)]]), claimant: "Qwen 3 · 15:40", tasks: [task("A")] });
    expect(out.notes.join("\n")).toContain('--claim "Qwen 3 · 14:05"');
  });

  it("names: a bare model name gets a session tag; any Claude session is the CEO; notes and names are cleaned for a public repo", () => {
    expect(core.sessionName("Qwen 3", "k3f9")).toBe("Qwen 3 · k3f9");
    expect(core.sessionName("Qwen 3 · s1", "k3f9")).toBe("Qwen 3 · s1");
    expect(core.isArchitect("Claude · s1")).toBe(true);
    expect(pick([task("A")], { claimant: "Claude · s1" }).kind).toBe("build");
    const note = core.sanitizeNote(`push failed: https://x-access-token:${"t".repeat(20)}@github.com/o/r token ghp_${"a".repeat(36)} mail jane@example.com x\u202e\u0085y\u2028z`);
    expect(note).not.toMatch(/ghp_|jane@example\.com|x-access-token|t{20}/);
    expect(note).not.toMatch(/[\p{Cc}\p{Cf}\u2028\u2029]/u);
    expect(core.sanitizeName("Qwen\n3 ·\u202e s1")).toBe("Qwen 3 · s1");
  });

  it("a push refused by another agent's push is a race; any other refusal is an error", () => {
    expect(core.classifyPushError(" ! [rejected]        abc -> agent/queue/a (fetch first)")).toBe("race");
    expect(core.classifyPushError("remote: Permission to o/r.git denied to bot.")).toBe("error");
    expect(core.classifyPushError("remote: error: GH013: Repository rule violations found")).toBe("error");
  });

  it("the board shows a Tier 1 pull request's review, and is green only once its review passed", () => {
    const findings = lockOf(1, { verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" });
    const rows = statusBoard({ tasks: [t1], branches: new Map([["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)], findings]), openPrs: new Map([pr]), prCi: new Map([["agent/queue/m", { state: "green" }]]), now: NOW });
    expect(rows[0].health).not.toBe("green");
    expect(renderBoard(rows)).toContain("review needs-fix");
    const arch = statusBoard({ tasks: [task("P", { status: "architect", packet: null })], branches: new Map(), openPrs: new Map(), reports: [{ ...blocked, id: "P" }], now: NOW });
    expect(arch[0].health).toBe("open");
  });
});

// The second independent review of D-085 (Oct 21): each finding pinned with its reproduced case.
describe("hardening from the second D-085 review", () => {
  const t1 = task("M", { tier: 1, lane: "money" });
  const pr: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
  const lockOf = (hoursAgo: number, ...markers: Marker[]): [string, Branch] => ["agent/review/m", { tipMs: NOW - hoursAgo * HOUR, merged: false, markers }];
  const passedBy = (who: string): Marker[] => [{ verb: "Review claim", id: "M", who }, { verb: "Verdict", id: "M", who, verdict: "pass" }];

  it("F1: a refused heartbeat on a shared lock is never retried on top of the agent that won it", () => {
    const branches = new Map<string, Branch>([["agent/queue/a", claimBy("Qwen · s1", "A", 0.5)]]);
    for (const of of ["review", "fix", "architect", "unblock"]) expect(core.leaseFor({ kind: "continue", of, task: t1, lock: "agent/review/m" }, branches, NOW).retry).toBe(false);
    expect(core.leaseFor({ kind: "continue", of: "land", tier1: true, task: t1, lock: "agent/review/m" }, branches, NOW).retry).toBe(false);
    expect(core.leaseFor({ kind: "continue", of: "build", task: task("A"), work: "agent/queue/a" }, branches, NOW)).toMatchObject({ ref: "agent/heartbeat/a", retry: true });
    expect(core.leaseFor({ kind: "continue", of: "build", task: task("A"), work: "agent/queue/a" }, new Map([["agent/queue/a", claimBy("Qwen · s1", "A", 3)]]), NOW).retry).toBe(false);
  });

  it("F2: CI that turns red after a passed review goes to a fix stage, so the change is reviewed again; never to the builder, reviewer or lander as green or land", () => {
    const fresh: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 0.5)];
    const passed = lockOf(0.3, ...passedBy("Mistral · r1"));
    const red = { prs: [pr], prCi: [["agent/queue/m", "red"]] as [string, string][] };
    expect(pick([t1], { branches: [fresh, passed], ...red, claimant: "DeepSeek · s4" })).not.toMatchObject({ kind: "continue", of: "green" });
    expect(pick([t1], { branches: [fresh, passed], ...red, claimant: "Mistral · r1" })).not.toMatchObject({ kind: "continue", of: "land" });
    const quiet: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)];
    expect(pick([t1], { branches: [quiet, lockOf(3, ...passedBy("Mistral · r1"))], ...red, claimant: "Gemini · s3" })).toMatchObject({ kind: "fix", task: { id: "M" } });
    const landing = lockOf(3, ...passedBy("Mistral · r1"), { verb: "Land claim", id: "M", who: "Kimi · l1" });
    expect(pick([t1], { branches: [quiet, landing], ...red, claimant: "Gemini · s3" })).toMatchObject({ kind: "fix" });
    expect(pick([t1], { branches: [quiet, landing], ...red, claimant: "Kimi · l1" }).kind).not.toBe("fix");
  });

  it("F3: a reviewer who returned findings is never told to push onto the pull request's branch", () => {
    const findings = lockOf(1, { verb: "Review claim", id: "M", who: "Mistral · r1" }, { verb: "Verdict", id: "M", who: "Mistral · r1", verdict: "findings" });
    const out = localSyncIssues({ local: [{ branch: "agent/queue/m", ahead: 1, dirty: true, path: "/wt/m-review" }], branches: new Map([["agent/queue/m", claimBy("DeepSeek · s4", "M", 3)], findings]), claimant: "Mistral · r1", tasks: [t1] });
    expect(out.blocking).toEqual([]);
  });

  it("F4: a lander pushing to the pull request's branch in the passed stage keeps it", () => {
    const work: [string, Branch] = ["agent/queue/m", { tipMs: NOW - 9 * 60_000, merged: false, markers: [{ verb: "Claim", id: "M", who: "DeepSeek · s4" }] }];
    expect(pick([t1], { branches: [work, lockOf(2.5, ...passedBy("Mistral · r1"))], prs: [pr], prCi: [["agent/queue/m", "green"]], claimant: "Gemini · s3" }).kind).not.toBe("land");
  });

  it("F5: a long session name survives cleaning and a second claim unchanged", () => {
    const name = core.sessionName("x".repeat(62), "ab12");
    expect(core.sanitizeName(name)).toBe(name);
    expect(core.sessionName(name, "zz99")).toBe(name);
  });

  it("F6 (D-200): a newer report from another session clears a block, the blocker's own newer report clears it only when green or landed, and only the task's own people or a Claude Code session may report on it", () => {
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const block = { id: "A", status: "blocked", who: "Qwen · s1", at: NOW - HOUR, note: "x" };
    const after = (who: string, status: string) => ({ id: "A", status, who, at: NOW - 0.5 * HOUR, note: "" });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [after("Kimi · s2", "review"), block], claimant: "Mistral · s3" })).toMatchObject({ kind: "build", task: { id: "B" } });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [after("Claude Code · s9", "review"), block], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [after("Qwen · s1", "review"), block], claimant: "Kimi · s2" })).toMatchObject({ kind: "unblock", task: { id: "A" } });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [after("Qwen · s1", "green"), block], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
    const branches = new Map([busyA]);
    expect(core.mayReport({ task: task("A"), branches, claimant: "Kimi · s2" })).toBe(false);
    expect(core.mayReport({ task: task("A"), branches, claimant: "Qwen · s1" })).toBe(true);
    expect(core.mayReport({ task: task("A"), branches, claimant: "Claude Code · s9" })).toBe(true);
  });

  it("F7: a blocked task of yours does not stop your other work", () => {
    const branches: [string, Branch][] = [["agent/queue/a", claimBy("Qwen · s1", "A", 1)], ["agent/queue/c", claimBy("Qwen · s1", "C", 1)]];
    expect(pick([task("A"), task("C")], { branches, reports: [{ id: "A", status: "blocked", who: "Qwen · s1", at: NOW - HOUR, note: "x" }], claimant: "Qwen · s1" })).toMatchObject({ kind: "continue", task: { id: "C" } });
  });

  it("F8: the board names who holds a Tier 1 review stage, and a restarted session is pointed at its own stage name", () => {
    const reviewing = lockOf(1, { verb: "Review claim", id: "M", who: "Qwen 3 · cccc" });
    const branches = new Map<string, Branch>([["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)], reviewing]);
    const rows = statusBoard({ tasks: [t1], branches, openPrs: new Map([pr]), now: NOW });
    expect(rows[0].stage).toBe("Qwen 3 · cccc");
    expect(renderBoard(rows)).toContain("Qwen 3 · cccc");
    const out = localSyncIssues({ local: [{ branch: "agent/queue/m", ahead: 0, dirty: true, path: "/wt/m" }], branches, claimant: "Qwen 3 · dddd", tasks: [t1] });
    expect(out.notes.join("\n")).toContain('--claim "Qwen 3 · cccc"');
  });

  it("F9: names read from markers are cleaned", () => {
    expect(parseMarker("Claim A: Qwen\u001b[2J\u202e · s1")?.who).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });

  it("F11: one fix-main lock at a time, even when a newer commit is red", () => {
    const held: [string, Branch] = ["agent/queue/fix-main-cccccccc", claimBy("Kimi · s2", "fix-main-cccccccc", 1)];
    const newer = { state: "red", sha: "d".repeat(40), url: "https://ci/red2" };
    expect(pick([task("A")], { ci: newer, branches: [held], claimant: "Gemini · s3" }).kind).toBe("wait");
    expect(pick([task("A")], { ci: newer, branches: [held], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", of: "fix-main", lock: "agent/queue/fix-main-cccccccc" });
    expect(core.heldBy({ tasks: [task("A")], branches: new Map([held]), openPrs: new Map(), claimant: "Kimi · s2", mainSha: "d".repeat(40) })).toMatchObject({ of: "fix-main", lock: "agent/queue/fix-main-cccccccc" });
  });

  it("F13: the CEO prefix ignores case, and the board agrees with the picker on Tier 1 red reports", () => {
    expect(core.isArchitect("claude code · s1")).toBe(true);
    expect(pick([], { claimant: "claude code · s1" }).kind).toBe("ceo");
    const rows = statusBoard({ tasks: [t1], branches: new Map([["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)]]), openPrs: new Map([pr]), prCi: new Map([["agent/queue/m", { state: "green" }]]), reports: [{ id: "M", status: "red", who: "Mistral · r1", at: NOW - HOUR, note: "3 findings" }], now: NOW });
    expect(rows[0].health).not.toBe("red");
  });
});

describe("PICKER-landing-slot: one landing at a time, without discipline", () => {
  const t2prA: [string, string] = ["agent/queue/a", "https://github.com/o/r/pull/11"];
  const t2prB: [string, string] = ["agent/queue/b", "https://github.com/o/r/pull/12"];
  const taskA = task("A", { tier: 2, lane: "lane-a" });
  const taskB = task("B", { tier: 2, lane: "lane-b" });
  const builtA: [string, Branch] = ["agent/queue/a", claimBy("Lander 1 · s1", "A", 1)];
  const builtB: [string, Branch] = ["agent/queue/b", claimBy("Lander 2 · s2", "B", 1)];

  it("reserves agent/queue/landing as a marker-only ref", () => {
    const doc = { version: 1, repo: "o/r", tasks: [task("A", { branch: "agent/queue/landing" })] };
    expect(validateAssignments(doc, exists).filter(e => e.includes("reserved"))).toHaveLength(1);
    expect(core.LAND_SLOT).toBe("agent/queue/landing");
  });

  it("two landers: the second waits and names the first", () => {
    const slotHeld: [string, Branch] = ["agent/queue/landing", {
      tipMs: NOW - 5 * 60_000,
      merged: false,
      markers: [{ verb: "Land claim", id: "A", who: "Lander 1 · s1" }],
    }];
    const branches = [builtA, builtB, slotHeld];
    const prs = [t2prA, t2prB];
    const prCi: [string, string][] = [["agent/queue/a", "green"], ["agent/queue/b", "green"]];

    expect(pick([taskA, taskB], { branches, prs, prCi, claimant: "Lander 1 · s1" })).toMatchObject({
      kind: "continue",
      of: "land",
      task: { id: "A" },
    });

    const second = pick([taskA, taskB], { branches, prs, prCi, claimant: "Lander 2 · s2" });
    expect(second).toMatchObject({
      kind: "wait",
      landing: true,
      holder: "Lander 1 · s1",
    });
    expect(second.reason).toContain("Lander 1 · s1");

    const text = renderPick(second, { who: "Lander 2 · s2", date: "2026-10-23", claimed: false });
    expect(text).toContain("Lander 1 · s1");
    expect(text).toContain("NEXT: WAIT");
  });

  it("a quiet slot is taken over", () => {
    const slotQuiet: [string, Branch] = ["agent/queue/landing", {
      tipMs: NOW - 35 * 60_000,
      merged: false,
      markers: [{ verb: "Land claim", id: "A", who: "Lander 1 · s1" }],
    }];
    const branches = [builtA, builtB, slotQuiet];
    const prs = [t2prA, t2prB];
    const prCi: [string, string][] = [["agent/queue/a", "green"], ["agent/queue/b", "green"]];

    const res = pick([taskA, taskB], { branches, prs, prCi, claimant: "Lander 2 · s2" });
    expect(res).toMatchObject({
      kind: "continue",
      of: "land",
      task: { id: "B" },
    });
  });

  it("--landed by someone else is refused", () => {
    const slotHeld: [string, Branch] = ["agent/queue/landing", {
      tipMs: NOW - 5 * 60_000,
      merged: false,
      markers: [{ verb: "Land claim", id: "A", who: "Lander 1 · s1" }],
    }];
    const branches = new Map<string, Branch>([slotHeld]);

    const err = core.releaseLandingSlotError({ branches, task: taskA, claimant: "Lander 2 · s2", now: NOW });
    expect(err).toContain("only the lander holding agent/queue/landing releases it");
    expect(err).toContain("Lander 1 · s1");

    const ok = core.releaseLandingSlotError({ branches, task: taskA, claimant: "Lander 1 · s1", now: NOW });
    expect(ok).toBeNull();

    const slotReleased: [string, Branch] = ["agent/queue/landing", {
      tipMs: NOW - 2 * 60_000,
      merged: false,
      markers: [
        { verb: "Land claim", id: "A", who: "Lander 1 · s1" },
        { verb: "Landed", id: "A", who: "Lander 1 · s1" },
      ],
    }];
    const freeBranches = new Map<string, Branch>([slotReleased]);
    const slot = core.landingSlot(freeBranches, NOW);
    expect(slot.holder).toBeNull();
    expect(slot.quiet).toBe(true);
  });

  it("red main still beats everything", () => {
    const slotHeld: [string, Branch] = ["agent/queue/landing", {
      tipMs: NOW - 5 * 60_000,
      merged: false,
      markers: [{ verb: "Land claim", id: "A", who: "Lander 1 · s1" }],
    }];
    const red = { state: "red", sha: "e".repeat(40), url: "https://ci/red" };
    const branches = [builtA, builtB, slotHeld];
    const prs = [t2prA, t2prB];
    const prCi: [string, string][] = [["agent/queue/a", "green"], ["agent/queue/b", "green"]];

    const res = pick([taskA, taskB], { ci: red, branches, prs, prCi, claimant: "Lander 2 · s2" });
    expect(res).toMatchObject({
      kind: "fix-main",
    });
  });
});

describe("D-151 model-independent reviews and landings", () => {
  const money = task("M", { tier: 1 });
  const next = task("N");
  const built: [string, Branch] = [money.branch, claimBy("DeepSeek · s4", "M", 3)];
  const pr: [string, string] = [money.branch, "https://github/pr/1"];
  const lock = (...markers: Marker[]): [string, Branch] => ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers }];

  it("skips another builder session's review and selects the next eligible build", () => {
    expect(pick([money, next], { branches: [built], prs: [pr], claimant: "DeepSeek · other" }))
      .toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it.each(["Fixed", "Fix claim"])("excludes a same-model fixer known by %s", verb => {
    const fixed = lock({ verb, id: "M", who: "Qoder · fixer" }, { verb: "Fixed", id: "M", who: "Qoder · fixer" });
    expect(pick([money, next], { branches: [built, fixed], prs: [pr], claimant: "Qoder · other" }))
      .toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it.each(["Kimi · independent", "Claude Code · ceo"])("offers an independent review to %s", claimant => {
    expect(pick([money, next], { branches: [built], prs: [pr], claimant }))
      .toMatchObject({ kind: "review", task: { id: "M" } });
  });

  it("returns a re-review to its independent findings reviewer", () => {
    const fixed = lock(
      { verb: "Review claim", id: "M", who: "Mistral · reviewer" },
      { verb: "Verdict", id: "M", who: "Mistral · reviewer", verdict: "findings" },
      { verb: "Fixed", id: "M", who: "Qoder · fixer" },
    );
    expect(pick([money, next], { branches: [built, fixed], prs: [pr], claimant: "Mistral · reviewer" }))
      .toMatchObject({ kind: "review", task: { id: "M" } });
  });

  it.each(["DeepSeek · other", "Qoder · other"])("excludes builder/fixer model %s from landing", claimant => {
    const passed = lock(
      { verb: "Fixed", id: "M", who: "Qoder · fixer" },
      { verb: "Review claim", id: "M", who: "Mistral · reviewer" },
      { verb: "Verdict", id: "M", who: "Mistral · reviewer", verdict: "pass" },
    );
    expect(pick([money, next], { branches: [built, passed], prs: [pr], claimant }))
      .toMatchObject({ kind: "build", task: { id: "N" } });
    expect(pick([money], { branches: [built, passed], prs: [pr], claimant: "Kimi · independent" }))
      .toMatchObject({ kind: "land", task: { id: "M" } });
  });

  it("prints the model and outside-picker attribution checks", () => {
    const selection = pick([money], { branches: [built], prs: [pr], claimant: "Kimi · independent" });
    const text = renderPick(selection, "Kimi · independent");
    expect(text).toContain("No session of your model");
    expect(text).toContain("outside the picker");
    expect(text).toContain("post no verdict");
  });
});

describe("actual next-task --status integration", () => {
  it("counts main-only commits behind an open PR and renders its epic and role", () => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), "next-task-status-"));
    const work = path.join(fixture, "work");
    const origin = path.join(fixture, "origin.git");
    const mock = path.join(fixture, "mock.mjs");
    const runGit = (args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8" }).trim();
    const run = (args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8" });
    const mainSha = "a".repeat(40);
    const branchSha = "b".repeat(40);
    try {
      mkdirSync(work, { recursive: true });
      execFileSync("git", ["init", "--bare", origin], { encoding: "utf8" });
      run(["init", "-b", "main"]);
      run(["config", "user.name", "Fixture"]);
      run(["config", "user.email", "fixture@example.test"]);
      run(["remote", "add", "origin", origin]);
      mkdirSync(path.join(work, "docs/plans"), { recursive: true });
      writeFileSync(path.join(work, "docs/plans/test.md"), "# fixture\n");
      writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({
        version: 1,
        repo: "o/r",
        tasks: [{
          id: "A", title: "Fixture task", row: "A", packet: "docs/plans/test.md", tier: 2,
          lane: "design", branch: "agent/queue/a", status: "todo", dependsOn: [], epic: "E",
        }],
      }, null, 2) + "\n");
      run(["add", "."]);
      run(["commit", "-m", "root"]);
      run(["commit", "--allow-empty", "-m", "main-only 1"]);
      run(["commit", "--allow-empty", "-m", "main-only 2"]);
      run(["push", "-u", "origin", "main"]);
      const rootSha = runGit(["rev-list", "--max-parents=0", "HEAD"]);
      run(["branch", "agent/queue/a", rootSha]);
      run(["switch", "agent/queue/a"]);
      run(["commit", "--allow-empty", "-m", "Claim A: Builder · fixture"]);
      run(["push", "-u", "origin", "agent/queue/a"]);
      run(["switch", "main"]);

      writeFileSync(mock, `
const response = body => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/actions/workflows/ci.yml/runs?branch=main')) return response({ workflow_runs: [
    { status: 'completed', conclusion: 'success', head_sha: '${mainSha}', head_branch: 'main', updated_at: '2026-10-23T12:00:00Z', html_url: 'https://example.test/ci/main' },
  ] });
  if (url.includes('/actions/workflows/ci.yml/runs?per_page=100')) return response({ workflow_runs: [
    { status: 'completed', conclusion: 'success', head_sha: '${branchSha}', head_branch: 'agent/queue/a', updated_at: '2026-10-23T12:00:00Z', html_url: 'https://example.test/ci/branch' },
  ] });
  if (url.includes('/pulls?state=open')) return response([{ head: { repo: { full_name: 'o/r' }, ref: 'agent/queue/a' }, html_url: 'https://example.test/pr/1' }]);
  if (url.includes('/pulls?state=closed')) return response([]);
  throw new Error('unexpected fetch: ' + url);
};
`);
      const result = execFileSync(process.execPath, ["--import", mock, path.join(root, "scripts/next-task.mjs"), "--status"], {
        cwd: work,
        encoding: "utf8",
        env: { ...process.env, GH_TOKEN: "fixture-not-real", NODE_USE_ENV_PROXY: "1" },
      });
      expect(result).toContain("behind main 2");
      expect(result).toContain("E: 0/1 done, 1 PR");
      expect(result).toContain("CDO");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});

/*
 * PICKER-owns-scope (docs/plans/PICKER-PARALLEL.md): a task declares the files it will
 * touch, so two lanes cannot edit one file unseen. `owns` holds paths, folder prefixes
 * ending in "/", globs using "*" and "**", and " (switch only)" for a file a task may
 * only flip a flag in.
 */
describe("PICKER-owns-scope: declared file ownership", () => {
  it("matches exact paths, folder prefixes and globs, and keeps a single star inside one folder", () => {
    expect(core.ownsMatches("client/src/pages/Landed.tsx", "client/src/pages/Landed.tsx")).toBe(true);
    expect(core.ownsMatches("client/src/pages/", "client/src/pages/Landed.tsx")).toBe(true);
    expect(core.ownsMatches("client/src/**", "client/src/a/b/c.ts")).toBe(true);
    expect(core.ownsMatches("client/src/*.ts", "client/src/a/b.ts")).toBe(false);
    expect(core.ownsMatches("server/db.ts", "server/db.tsx")).toBe(false);
    expect(core.ownsMatches("./server/db.ts", "server/db.ts")).toBe(true);
    expect(core.ownsEntry("shared/planCatalog.ts (switch only)")).toEqual({ pattern: "shared/planCatalog.ts", switchOnly: true });
    expect(core.ownsEntry("shared/planCatalog.ts").switchOnly).toBe(false);
  });

  it("refuses two live tasks that own overlapping paths", () => {
    const doc = {
      version: 1, repo: "o/r", tasks: [
        task("A", { owns: ["client/src/pages/"] }),
        task("B", { owns: ["client/src/pages/Landed.tsx"] }),
      ],
    };
    const errors = validateAssignments(doc, exists).join("\n");
    expect(errors).toContain("tasks A and B own overlapping paths and neither waits for the other");
  });

  it("allows the same overlap when one task waits for the other", () => {
    const doc = {
      version: 1, repo: "o/r", tasks: [
        task("A", { owns: ["client/src/pages/"] }),
        task("B", { owns: ["client/src/pages/Landed.tsx"], dependsOn: ["A"] }),
      ],
    };
    expect(validateAssignments(doc, exists).filter(e => e.includes("overlapping"))).toEqual([]);
  });

  it("lets disjoint ownership through, and refuses a malformed owns", () => {
    const ok = { version: 1, repo: "o/r", tasks: [task("A", { owns: ["client/src/pages/"] }), task("B", { owns: ["server/db.ts"] })] };
    expect(validateAssignments(ok, exists).filter(e => e.includes("overlapping"))).toEqual([]);
    const bad = { version: 1, repo: "o/r", tasks: [task("A", { owns: "client/src/pages/" })] };
    expect(validateAssignments(bad, exists).join("\n")).toContain("owns must be a non-empty array of paths");
    const empty = { version: 1, repo: "o/r", tasks: [task("A", { owns: [] })] };
    expect(validateAssignments(empty, exists).join("\n")).toContain("owns must be a non-empty array of paths");
  });

  it("holds a build while another lane's open task owns an overlapping path, and frees it when they differ", () => {
    const claimant = "workbuddy · b0eb";
    const held = pick([task("A", { status: "in-review", owns: ["client/src/pages/"] }), task("B", { owns: ["client/src/pages/Landed.tsx"] })], { claimant });
    expect(JSON.stringify(held)).toContain("owns the same files");
    const free = pick([task("A", { status: "in-review", owns: ["client/src/pages/"] }), task("B", { owns: ["server/db.ts"] })], { claimant });
    expect(free.kind).toBe("build");
  });
});
/*
 * PICKER-owns-scope: the runtime guard. It judges what the branch changed against the
 * owns its task declared on origin/main, and fails open only when it cannot run at all.
 */
describe("PICKER-owns-scope: the scope check", () => {
  it("passes inside owns and fails outside it", () => {
    const owns = ["client/src/pages/"];
    expect(scopeViolations({ owns, changed: ["client/src/pages/Landed.tsx"] })).toEqual([]);
    // server/ has its own message: a task that owns nothing there may not touch it at all.
    expect(scopeViolations({ owns, changed: ["client/src/pages/Landed.tsx", "server/db.ts"] }).join("\n")).toContain("owns nothing under shared/ or server/");
  });

  it("always allows the task's own packet and its status line", () => {
    const owns = ["client/src/pages/"];
    expect(scopeViolations({ owns, changed: ["docs/plans/ROW20.md", "docs/plans/assignments.json"], packet: "docs/plans/ROW20.md" })).toEqual([]);
  });

  it("fails on a test file it does not own", () => {
    const owns = ["client/src/pages/Landed.tsx"];
    expect(scopeViolations({ owns, changed: ["client/src/pages/other.test.tsx"] }).join("\n")).toContain("a test file outside this task's owns");
  });

  it("fails on shared/ or server/ when the task owns neither", () => {
    const owns = ["client/src/pages/"];
    expect(scopeViolations({ owns, changed: ["shared/moneyCopy.ts"] }).join("\n")).toContain("owns nothing under shared/ or server/");
  });

  it("bounds a switch-only file at twelve changed lines", () => {
    const owns = ["shared/planCatalog.ts (switch only)"];
    expect(scopeViolations({ owns, changed: ["shared/planCatalog.ts"], lineCounts: new Map([["shared/planCatalog.ts", 12]]) })).toEqual([]);
    expect(scopeViolations({ owns, changed: ["shared/planCatalog.ts"], lineCounts: new Map([["shared/planCatalog.ts", 13]]) }).join("\n")).toContain("changed 13 lines");
  });

  it("fails open when it cannot run at all, and says so", () => {
    // Outside a pull request the queue gate stands aside, so this tests scope-check's own fail-open on any branch.
    const run = spawnSync(process.execPath, ["scripts/scope-check.mjs", "no-such-task"], { encoding: "utf8", cwd: root, env: { ...process.env, GITHUB_EVENT_NAME: "push" } });
    expect(run.status).toBe(0);
    expect(`${run.stdout}${run.stderr}`).toContain("could not run");
  });
});

describe("PICKER-lane-busy", () => {
  const builder = "Qwen · busy";
  const laneTasks = (ownsA: string[] | undefined, ownsB: string[] | undefined) => [
    task("A", { tier: 1, lane: "cluster", owns: ownsA }),
    task("B", { lane: "cluster", owns: ownsB }),
  ];
  const waiting = (ci = "green"): PickOpts => ({
    claimant: builder,
    branches: [["agent/queue/a", claimBy(builder, "A", 0.5)]],
    prs: [["agent/queue/a", "#1"]], prCi: [["agent/queue/a", ci]],
  });
  it("builds disjoint work while the builder's green Tier 1 PR awaits independent review", () => {
    expect(pick(laneTasks(["client/a.ts"], ["client/b.ts"]), waiting())).toMatchObject({ kind: "build", task: { id: "B" } });
  });
  it("keeps overlapping ownership blocked even with a green PR", () => {
    expect(pick(laneTasks(["client/"], ["client/b.ts"]), waiting()).kind).not.toBe("build");
  });
  it.each([[undefined, ["client/b.ts"]], [["client/a.ts"], undefined], [undefined, undefined]])(
    "does not assume missing ownership is disjoint (%j, %j)", (a, b) => {
      expect(pick(laneTasks(a, b), waiting()).kind).not.toBe("build");
    },
  );
  it.each(["red", "running", "running-after-red", "unknown", "error"])("does not release an active %s PR", ci => {
    expect(pick(laneTasks(["client/a.ts"], ["client/b.ts"]), waiting(ci)).kind).not.toBe("build");
  });
  it("keeps a claimed build with no PR in its lane", () => {
    expect(pick(laneTasks(["client/a.ts"], ["client/b.ts"]), { ...waiting(), prs: [] }).kind).not.toBe("build");
  });
  it("releases disjoint work while a green Tier 2 PR waits for landing", () => {
    const tasks = laneTasks(["client/a.ts"], ["client/b.ts"]);
    tasks[0].tier = 2;
    expect(pick(tasks, { ...waiting(), claimant: "Kimi · next" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });
  it("still prioritizes an eligible independent review", () => {
    expect(pick(laneTasks(["client/a.ts"], ["client/b.ts"]), { ...waiting(), claimant: "Kimi · review" })).toMatchObject({ kind: "review", task: { id: "A" } });
  });
  it("lets an architect write a same-lane packet below a blocked priority someone else is unblocking", () => {
    const tasks = [task("A", { lane: "cluster" }), task("B", { lane: "cluster", status: "architect" })];
    const unblocking: [string, Branch] = ["agent/architect/a", { tipMs: NOW - 0.5 * HOUR, merged: false, markers: [{ verb: "Unblock", id: "A", who: "Mistral · u1" }] }];
    const opts = waiting();
    expect(pick(tasks, { ...opts, branches: [...(opts.branches ?? []), unblocking], claimant: "Kimi · architect", reports: [{ id: "A", status: "blocked", who: builder, at: NOW, note: "needs CEO" }] })).toMatchObject({ kind: "architect", task: { id: "B" } });
  });
  it("does not bypass an architect's unfinished explicit dependency", () => {
    const tasks = [task("A", { lane: "cluster" }), task("B", { lane: "cluster", status: "architect", dependsOn: ["A"] })];
    expect(pick(tasks, { ...waiting(), claimant: "Kimi · architect", reports: [{ id: "A", status: "blocked", who: builder, at: NOW, note: "needs CEO" }] }).kind).not.toBe("architect");
  });
});

// Findings from the independent review of #640 (D-200): one block rule for the picker, the board and the reports.
describe("D-200 block rule: nobody clears a block they raised or a task they hold", () => {
  const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
  const at = (h: number) => NOW - h * HOUR;
  const rep = (who: string, status: string, hoursAgo: number) => ({ id: "A", status, who, at: at(hoursAgo), note: "" });
  const unblockLock = (who: string, hoursAgo = 0.5): [string, Branch] => ["agent/architect/a", { tipMs: at(hoursAgo), merged: false, markers: [{ verb: "Unblock", id: "A", who }] }];

  it("an unblocker that reports the block itself hands it on: it waits, its lock holds nobody off, and its own review does not clear it", () => {
    const tasks = [task("A"), task("B", { lane: "A" })];
    const branches = [busyA, unblockLock("Mistral · u1")];
    const reports = [rep("Mistral · u1", "blocked", 0.2), rep("Qwen · s1", "blocked", 2)];
    expect(pick(tasks, { branches, reports, claimant: "Mistral · u1" })).toMatchObject({ kind: "wait", gate: "A", blocked: true });
    expect(pick(tasks, { branches, reports, claimant: "Kimi · s2" })).toMatchObject({ kind: "unblock", task: { id: "A" }, from: "Mistral · u1" });
    const after = [rep("Mistral · u1", "review", 0.1), ...reports];
    expect(pick(tasks, { branches, reports: after, claimant: "Kimi · s2" })).toMatchObject({ kind: "unblock", task: { id: "A" } });
    expect(core.heldBy({ tasks, branches: new Map(branches), openPrs: new Map(), reports, claimant: "Mistral · u1", now: NOW })).toBeNull();
  });

  it("a second block does not let the first blocker clear its own question", () => {
    const reports = [rep("Cue · c1", "review", 0.1), rep("Kimi · s2", "blocked", 0.5), rep("Cue · c1", "blocked", 1)];
    expect(pick([task("A"), task("B")], { branches: [busyA], reports, claimant: "Mistral · s3" })).toMatchObject({ kind: "unblock", task: { id: "A" } });
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [busyA], reports, claimant: "Cue · c1" })).toMatchObject({ kind: "wait", gate: "A", blocked: true });
  });

  it("the holder of a task someone else blocked is not offered the unblock, and only its green or landed report clears it", () => {
    const blocked = [rep("Mistral · r1", "blocked", 1)];
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: blocked, claimant: "Qwen · s1" })).toMatchObject({ kind: "wait", gate: "A", own: true });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [rep("Qwen · s1", "review", 0.5), ...blocked], claimant: "Kimi · s2" })).toMatchObject({ kind: "unblock", task: { id: "A" } });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [rep("Qwen · s1", "green", 0.5), ...blocked], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
    const rows = statusBoard({ tasks: [task("A")], branches: new Map([busyA]), openPrs: new Map(), reports: [rep("Qwen · s1", "review", 0.5), ...blocked], now: NOW });
    expect(rows[0]).toMatchObject({ health: "red", report: { status: "blocked", who: "Mistral · r1" } });
  });

  it("a holder with other work keeps building it instead of being handed the unblock of its own blocked task", () => {
    const ceo = "Claude Code · s9";
    const branches: [string, Branch][] = [["agent/queue/a", claimBy(ceo, "A", 1)], ["agent/queue/c", claimBy(ceo, "C", 1)]];
    expect(pick([task("A"), task("C")], { branches, reports: [rep("Kimi · r2", "blocked", 0.5)], claimant: ceo })).toMatchObject({ kind: "continue", task: { id: "C" } });
  });

  it("a Claude Code session that raised a block waits; it never gets the CEO review telling it to clear that block", () => {
    const reports = [rep("Claude Code · s9", "blocked", 0.5)];
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [busyA], reports, claimant: "Claude Code · s9" })).toMatchObject({ kind: "wait", gate: "A", blocked: true });
  });

  it("the unblock steps say to report before landing the ruling, and how to hand on a block you cannot decide", () => {
    const text = renderPick({ kind: "unblock", task: task("A"), report: rep("Qwen · s1", "blocked", 1), lock: "agent/architect/a", lockExists: false }, { who: "Kimi · s2", date: "d", claimed: true });
    expect(text).toContain("Report before you land the ruling's pull request");
    expect(text).toContain("report it `blocked`");
  });
});

// Cue's blocks, Oct 24-25: a session that may not take a task, a review worktree with no packages, git-only access.
describe("an agent is never stuck on its own limits (D-200 (5))", () => {
  it("--avoid hands a session something else, without a blocked report and without lifting a red task's hold", () => {
    expect(pick([task("A"), task("B")], { claimant: "Cue Agent · c1" })).toMatchObject({ kind: "build", task: { id: "A" } });
    expect(pickNextTask({ tasks: [task("A"), task("B")], mainCi: { state: "green" }, branches: new Map(), openPrs: new Map(), now: NOW, claimant: "Cue Agent · c1", avoid: new Set(["A"]) })).toMatchObject({ kind: "build", task: { id: "B" } });
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const redA = { id: "A", status: "red", who: "Qwen · s1", at: NOW - HOUR, note: "x" };
    expect(pickNextTask({ tasks: [task("A"), task("B", { lane: "A" })], mainCi: { state: "green" }, branches: new Map([busyA]), openPrs: new Map(), reports: [redA], now: NOW, claimant: "Cue Agent · c1", avoid: new Set(["A"]) })).toMatchObject({ kind: "wait", gate: "A" });
  });

  it("every worktree step and the review step install the pinned packages, and a verdict needs no GitHub permission", () => {
    const ctx = { who: "Cue Agent · c1", date: "2026-10-25", claimed: true };
    const review = renderPick({ kind: "review", task: task("M", { tier: 1 }), work: "agent/queue/m", pr: "https://github.com/o/r/pull/9", lock: "agent/review/m", lockExists: true, builder: "Qwen · s1" }, ctx);
    expect(review).toContain("pnpm install --frozen-lockfile");
    expect(review).toContain("always allowed");
    expect(review).toContain("a GitHub review is never required");
    expect(review).toContain("--avoid M");
    const build = renderPick({ kind: "build", task: task("A") }, ctx);
    expect(build).toContain("pnpm install --frozen-lockfile");
    expect(build).not.toContain("report it blocked to avoid");
  });
});

// D-200: two switch-only claims on one wiring file never make two tasks wait for each other (#649).
describe("switch-only claims share a file", () => {
  it("two switch-only claims on the same file do not overlap; a full claim still overlaps a switch-only one", () => {
    expect(core.ownsOverlap(["server/_core/index.ts (switch only)"], ["server/_core/index.ts (switch only)"])).toBe(false);
    expect(core.ownsOverlap(["server/_core/index.ts (switch only)"], ["server/_core/index.ts"])).toBe(true);
    expect(core.ownsOverlap(["server/_core/index.ts"], ["server/_core/"])).toBe(true);
    expect(core.ownsOverlap(["server/_core/index.ts (switch only)"], ["server/_core/"])).toBe(true);
  });

  it("the registry accepts two open tasks that each hold a switch-only claim on one file", () => {
    const doc = { version: 1, repo: "o/r", tasks: [
      { ...task("A"), packet: "docs/plans/p.md", owns: ["server/a.ts", "server/_core/index.ts (switch only)"] },
      { ...task("B"), packet: "docs/plans/p.md", owns: ["server/b.ts", "server/_core/index.ts (switch only)"] },
    ] };
    expect(validateAssignments(doc, () => true).filter(e => e.includes("overlapping"))).toEqual([]);
    const full = { ...doc, tasks: [doc.tasks[0], { ...doc.tasks[1], owns: ["server/b.ts", "server/_core/index.ts"] }] };
    expect(validateAssignments(full, () => true).filter(e => e.includes("overlapping"))).toHaveLength(1);
  });
});

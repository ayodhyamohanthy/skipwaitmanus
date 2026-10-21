// @vitest-environment node
// D-083: the queue picker hands every agent the same next task, in Claude
// Code's order, and never two agents the same one. Pins each decision.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as core from "./nextTaskCore.mjs";
import {
  IDLE_MS, ciStateFromRuns, localSyncIssues, markerSubject, parseMarker, pickNextTask, reviewStateOf, roleOf, statusBoard, validateAssignments,
} from "./nextTaskCore.mjs";
import { renderBoard, renderPick } from "./nextTaskText.mjs";

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

  it("a blocked task waits for the CEO: Claude Code gets the unblock, its lane waits, other lanes go on", () => {
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [red("blocked")], claimant: "Claude Code · s9" })).toMatchObject({ kind: "unblock", task: { id: "A" }, report: { status: "blocked" } });
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [quietA], reports: [red("blocked", NOW - 3 * HOUR)], claimant: "Kimi · s2" })).toMatchObject({ kind: "wait", gate: "A" });
    expect(pick([task("A"), task("B")], { branches: [quietA], reports: [red("blocked", NOW - 3 * HOUR)], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
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
    expect(pick([arch, task("B")], { branches: [held], claimant: "Claude Code · s7" })).toMatchObject({ kind: "ceo" });
    const quiet: [string, Branch] = ["agent/architect/p", claimBy("Claude Code · s9", "P", 3)];
    expect(pick([arch, task("B")], { branches: [quiet], claimant: "Claude Code · s7" })).toMatchObject({ kind: "architect", lockExists: true, from: "Claude Code · s9" });
  });
});

// D-085 (owner, Oct 20): Claude Code works as the CEO; open frontier models build.
describe("Claude Code is the CEO, never the builder (D-085)", () => {
  const ceo = "Claude Code · s9";
  const t1 = task("M", { tier: 1, lane: "money" });
  const built: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)];
  const pr: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];

  it("is never handed a build, a takeover, a red pull request, findings to fix or a Tier 2 landing", () => {
    expect(pick([task("A")], { claimant: ceo })).toMatchObject({ kind: "ceo" });
    expect(pick([task("A")], { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 3)]], claimant: ceo }).kind).toBe("ceo");
    const t2pr: [string, string] = ["agent/queue/a", "https://github.com/o/r/pull/7"];
    expect(pick([task("A")], { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 3)]], prs: [t2pr], prCi: [["agent/queue/a", "red"]], claimant: ceo }).kind).toBe("ceo");
    expect(pick([task("A")], { branches: [["agent/queue/a", claimBy("Qwen · s1", "A", 3)]], prs: [t2pr], prCi: [["agent/queue/a", "green"]], claimant: ceo }).kind).toBe("ceo");
    const findings: [string, Branch] = ["agent/review/m", { tipMs: NOW - HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Kimi · r2" }, { verb: "Verdict", id: "M", who: "Kimi · r2", verdict: "findings" }] }];
    expect(pick([t1], { branches: [built, findings], prs: [pr], claimant: ceo }).kind).toBe("ceo");
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
    const text = renderPick({ kind: "ceo", skipped: [{ id: "A", reason: "development work: the open models build it (D-085)" }] }, { who: ceo, date: "2026-10-20", claimed: true });
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
    expect(roleOf(task("A", { lane: "payments" }))).toBe("CTO");
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

  it("an unblock is claimed like a packet: one Claude Code session gets it, and it comes back to that session", () => {
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const lock: [string, Branch] = ["agent/architect/a", { tipMs: NOW - HOUR, merged: false, markers: [{ verb: "Unblock", id: "A", who: "Claude Code · s7" }] }];
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [blocked], claimant: "Claude Code · s9" })).toMatchObject({ kind: "unblock", lock: "agent/architect/a", lockExists: false });
    expect(pick([task("A"), task("B")], { branches: [busyA, lock], reports: [blocked], claimant: "Claude Code · s9" }).kind).toBe("ceo");
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

  it("a blocked task waits for the CEO or the owner: its holder is told so, and nothing in its lane starts", () => {
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const own = pick([task("A"), task("B")], { branches: [busyA], reports: [blocked], claimant: "Qwen · s1" });
    expect(own).toMatchObject({ kind: "wait", gate: "A", blocked: true, own: true });
    const ctx = { who: "Kimi · s2", date: "2026-10-20", claimed: false };
    const other = pick([task("A"), task("B", { lane: "A" })], { branches: [busyA], reports: [blocked], claimant: "Kimi · s2" });
    const text = renderPick(other, ctx);
    expect(text).toContain("Claude Code");
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
    expect(pick([task("A")], { claimant: "Claude · s1" }).kind).toBe("ceo");
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

  it("F6: only the CEO clears a blocked task, and only the task's own people or the CEO may report on it", () => {
    const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
    const block = { id: "A", status: "blocked", who: "Qwen · s1", at: NOW - HOUR, note: "x" };
    expect(pick([task("A"), task("B", { lane: "A" })], { branches: [busyA], reports: [{ id: "A", status: "green", who: "Kimi · s2", at: NOW - 0.5 * HOUR, note: "" }, block], claimant: "Kimi · s2" })).toMatchObject({ kind: "wait", gate: "A" });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [{ id: "A", status: "review", who: "Claude Code · s9", at: NOW - 0.5 * HOUR, note: "ruled" }, block], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
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
    expect(pick([task("A")], { claimant: "claude code · s1" }).kind).toBe("ceo");
    const rows = statusBoard({ tasks: [t1], branches: new Map([["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)]]), openPrs: new Map([pr]), prCi: new Map([["agent/queue/m", { state: "green" }]]), reports: [{ id: "M", status: "red", who: "Mistral · r1", at: NOW - HOUR, note: "3 findings" }], now: NOW });
    expect(rows[0].health).not.toBe("red");
  });
});

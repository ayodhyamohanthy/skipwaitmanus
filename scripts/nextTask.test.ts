// @vitest-environment node
// D-083: the queue picker hands every agent the same next task, in Claude
// Code's order, and never two agents the same one. Pins each decision.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
type Branch = { tipMs: number; merged: boolean; markers: Marker[] };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 2, lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], ...extra,
});
const claimBy = (who: string, id: string, hoursAgo = 1, merged = false): Branch =>
  ({ tipMs: NOW - hoursAgo * HOUR, merged, markers: [{ verb: "Claim", id, who }] });
type Report = { id: string; status: string; who: string; at: number; note: string };
const pick = (tasks: ReturnType<typeof task>[], opts: { branches?: [string, Branch][]; prs?: [string, string][]; prCi?: [string, string][]; reports?: Report[]; claimant?: string; ci?: object } = {}) =>
  pickNextTask({
    tasks, mainCi: opts.ci ?? green, branches: new Map(opts.branches ?? []), openPrs: new Map(opts.prs ?? []),
    prCi: new Map((opts.prCi ?? []).map(([b, state]) => [b, { state }])), reports: opts.reports ?? [],
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

  it("re-offers a review lock that went quiet for 2 hours", () => {
    const quiet: [string, Branch] = ["agent/review/m", { tipMs: NOW - IDLE_MS - HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Claude · r1" }] }];
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
    const reviewing = lock({ verb: "Review claim", id: "M", who: "Claude · r1" });
    expect(pick([t1, task("N")], { branches: [built, reviewing], prs: [pr], claimant: "DeepSeek · s4" })).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(pick([t1, task("N")], { branches: [built, reviewing], prs: [pr], claimant: "Claude · r1" })).toMatchObject({ kind: "continue", of: "review", task: { id: "M" }, lock: "agent/review/m", pr: pr[1] });
    const fixing = lock({ verb: "Review claim", id: "M", who: "Claude · r1" }, { verb: "Verdict", id: "M", who: "Claude · r1", verdict: "findings" }, { verb: "Fix claim", id: "M", who: "Kimi · f1" });
    expect(pick([t1, task("N")], { branches: [built, fixing], prs: [pr], claimant: "Kimi · f1" })).toMatchObject({ kind: "continue", of: "fix", task: { id: "M" } });
    const passed = lock({ verb: "Review claim", id: "M", who: "Claude · r1" }, { verb: "Verdict", id: "M", who: "Claude · r1", verdict: "pass" });
    expect(pick([t1, task("N")], { branches: [built, passed], prs: [pr], claimant: "Claude · r1" })).toMatchObject({ kind: "continue", of: "land", task: { id: "M" } });
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
    // Its owner is on it, so nobody touches anything below it until it is green.
    expect(pick([task("A"), task("B")], { branches: [busy], prs: [t2pr], prCi: [["agent/queue/a", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "wait", gate: "A" });
    expect(pick([task("A"), task("B")], { branches: [busy], prs: [t2pr], prCi: [["agent/queue/a", "red"]], claimant: "Qwen · s1" })).toMatchObject({ kind: "continue", of: "green", task: { id: "A" } });
  });

  it("a red Tier 1 pull request is made green before any review, never by its reviewer", () => {
    const reviewing: [string, Branch] = ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Claude · r1" }] }];
    expect(pick([t1], { branches: [built, reviewing], prs: [pr], prCi: [["agent/queue/m", "red"]], claimant: "Kimi · s2" })).toMatchObject({ kind: "green", task: { id: "M" } });
    // Its reviewer keeps the review it holds (a red PR is a finding), but never takes the code fix.
    expect(pick([t1], { branches: [built, reviewing], prs: [pr], prCi: [["agent/queue/m", "red"]], claimant: "Claude · r1" })).toMatchObject({ kind: "continue", of: "review" });
    const fresh: [string, Branch] = ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Claude · r1" }, { verb: "Verdict", id: "M", who: "Claude · r1", verdict: "findings" }] }];
    expect(pick([t1], { branches: [built, fresh], prs: [pr], prCi: [["agent/queue/m", "red"]], claimant: "Claude · r1" })).toMatchObject({ kind: "wait", gate: "M" });
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
    const passed: [string, Branch] = ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: "Claude · r1" }, { verb: "Verdict", id: "M", who: "Claude · r1", verdict: "pass" }] }];
    expect(pick([t1], { branches: [built, passed], prs: [pr], claimant: "Kimi · s2" })).toMatchObject({ kind: "land", task: { id: "M" }, tier1: true, lock: "agent/review/m" });
    expect(pick([t1], { branches: [built, passed], prs: [pr], claimant: "DeepSeek · s4" }).kind).toBe("none");
    const landing: [string, Branch] = ["agent/review/m", { tipMs: NOW - HOUR, merged: false, markers: [...passed[1].markers, { verb: "Land claim", id: "M", who: "Kimi · s2" }] }];
    expect(reviewStateOf(landing[1])).toBe("landing");
    expect(pick([t1], { branches: [built, landing], prs: [pr], claimant: "Kimi · s2" })).toMatchObject({ kind: "continue", of: "land" });
    expect(pick([t1], { branches: [built, landing], prs: [pr], claimant: "Gemini · s3" }).kind).toBe("none");
  });
});

describe("a red priority holds everything below it (owner: \"top priorities should always be green before touching the next priority\")", () => {
  const busyA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 1)];
  const quietA: [string, Branch] = ["agent/queue/a", claimBy("Qwen · s1", "A", 3)];
  const red = (status: string, at = NOW - HOUR, note = "gate red on coverage") => ({ id: "A", status, who: "Qwen · s1", at, note });

  it("a red report from an active owner makes everyone else wait, and a newer green report releases it", () => {
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [red("red")], claimant: "Kimi · s2" })).toMatchObject({ kind: "wait", gate: "A" });
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [red("red"), { ...red("green"), at: NOW - HOUR / 2 }], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("a red report whose owner went quiet goes to the next agent to make green", () => {
    expect(pick([task("A"), task("B")], { branches: [quietA], reports: [red("red", NOW - 3 * HOUR)], claimant: "Kimi · s2" })).toMatchObject({ kind: "takeover", task: { id: "A" } });
  });

  it("a blocked task waits for the CEO: Claude Code gets the unblock, everyone else waits", () => {
    expect(pick([task("A"), task("B")], { branches: [busyA], reports: [red("blocked")], claimant: "Claude Code · s9" })).toMatchObject({ kind: "unblock", task: { id: "A" }, report: { status: "blocked" } });
    expect(pick([task("A"), task("B")], { branches: [quietA], reports: [red("blocked", NOW - 3 * HOUR)], claimant: "Kimi · s2" })).toMatchObject({ kind: "wait", gate: "A" });
  });

  it("new work ranked above the red priority may still start; nothing below it does", () => {
    expect(pick([task("N"), task("A"), task("B")], { branches: [busyA], reports: [red("red")], claimant: "Kimi · s2" })).toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("below a red priority the CEO only writes packets and unblocks", () => {
    const t1 = task("M", { tier: 1, lane: "money" });
    const builtM: [string, Branch] = ["agent/queue/m", claimBy("DeepSeek · s4", "M", 1)];
    const prM: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];
    expect(pick([task("A"), t1], { branches: [busyA, builtM], prs: [prM], reports: [red("red")], claimant: "Claude Code · s9" }).kind).toBe("ceo");
    expect(pick([task("A"), task("P", { status: "architect", packet: null })], { branches: [busyA], reports: [red("red")], claimant: "Claude Code · s9" })).toMatchObject({ kind: "architect", task: { id: "P" } });
  });

  it("the board marks each priority's health, top down", () => {
    const rows = statusBoard({ tasks: [task("A"), task("B")], branches: new Map([busyA]), openPrs: new Map(), reports: [red("red")], now: NOW });
    expect(rows.map(r => [r.id, r.health])).toEqual([["A", "red"], ["B", "open"]]);
  });
});

describe("tasks waiting for Claude Code's packet (D-085)", () => {
  const arch = task("P", { status: "architect", packet: null });

  it("are offered to a Claude Code session in priority order and skipped by everyone else", () => {
    expect(pick([arch, task("B")], { claimant: "Claude Code · s9" })).toMatchObject({ kind: "architect", task: { id: "P" }, lock: "agent/architect/p", lockExists: false });
    expect(pick([arch, task("B")], { claimant: "Qwen · s1" })).toMatchObject({ kind: "build", task: { id: "B" } });
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
    expect(localSyncIssues({ local: [{ branch: "agent/queue/a", ahead: 0, dirty: false, path: "/wt/a" }], branches: remote, claimant: "Qwen · s1" })).toEqual({ blocking: [], notes: [] });
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
    const land1 = renderPick({ kind: "land", task: task("M", { tier: 1 }), work: "agent/queue/m", pr: "https://github.com/o/r/pull/9", lock: "agent/review/m", tier1: true, from: "Claude · r1" }, ctx);
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
      { id: "A", status: "red", who: "Qwen · s1", at: NOW - 4 * HOUR, note: "gate red on the coverage test" },
      { id: "B", status: "review", who: "Kimi · s2", at: NOW - HOUR, note: "draft PR open" },
      { id: "B", status: "green", who: "Kimi · s2", at: NOW - HOUR / 2, note: "CI green" },
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

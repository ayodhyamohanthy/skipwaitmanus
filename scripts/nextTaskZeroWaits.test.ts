// @vitest-environment node
// D-322 (owner, Nov 11: "no blockers for letting agents automatically pick work tasks 0 waits 0 blocks").
// 1. A task whose claim history names an external model route (D-311) can only be claimed with that route: the CLI
//    refuses any other claim. Handing it to a session without one made the session fail at the claim and get the
//    same task on every retry (measured Nov 11: 26 of 30 simulated sessions). It is now passed over.
// 2. Red main holds every landing, not every session: its one fix comes first, then branch work goes on.
import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-11-11T09:00:00Z");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/main" };
type Marker = { verb: string; id: string; who: string; verdict?: string; body?: string };
type Branch = { tipMs: number; tipSha?: string; merged: boolean; markers: Marker[] };

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/FND-1-toolchain-and-test-collection.md", tier: 2,
  lane: id.toLowerCase(), branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], ...extra,
});
const pick = (tasks: ReturnType<typeof task>[], opts: { branches?: [string, Branch][]; prs?: [string, string][]; prCi?: [string, string][]; ci?: object; claimant?: string; routeId?: string } = {}) =>
  pickNextTask({
    tasks, mainCi: opts.ci ?? green, branches: new Map(opts.branches ?? []), openPrs: new Map(opts.prs ?? []),
    prCi: new Map((opts.prCi ?? []).map(([b, state]) => [b, { state, sha: "b".repeat(40) }])),
    mergedHeads: new Map(), reports: [], now: NOW, claimant: opts.claimant ?? "Kimi · k1", avoid: new Set(), register: [],
    ...(opts.routeId ? { provenance: { routeId: opts.routeId } } : {}),
  });

// X was claimed through an external model route and has been quiet for 10 hours: the picker's ordinary answer is TAKEOVER X.
const EXTERNAL = "provenance route-free-model-1";
const quietExternal: [string, Branch] = ["agent/queue/x", { tipMs: NOW - 10 * HOUR, tipSha: "b".repeat(40), merged: false, markers: [{ verb: "Claim", id: "X", who: "Instinct · op1", body: EXTERNAL }] }];
const quietPlain: [string, Branch] = ["agent/queue/x", { tipMs: NOW - 10 * HOUR, tipSha: "b".repeat(40), merged: false, markers: [{ verb: "Claim", id: "X", who: "Qwen · q1" }] }];

describe("D-322: a task only an external route can claim is never handed to a session without one", () => {
  it("control: the same quiet task with an ordinary claim is handed as a takeover", () => {
    expect(pick([task("X"), task("N")], { branches: [quietPlain] })).toMatchObject({ kind: "takeover", task: { id: "X" } });
  });

  it("the external task is passed over and the next task is handed out", () => {
    const got = pick([task("X"), task("N")], { branches: [quietExternal] });
    expect(got).toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("every session falls through to its own task instead of all being handed X", () => {
    const tasks = [task("X"), task("N1"), task("N2")];
    const first = pick(tasks, { branches: [quietExternal], claimant: "Kimi · k1" });
    expect(first).toMatchObject({ kind: "build", task: { id: "N1" } });
    const n1Busy: [string, Branch] = ["agent/queue/n1", { tipMs: NOW - 0.1 * HOUR, merged: false, markers: [{ verb: "Claim", id: "N1", who: "Kimi · k1" }] }];
    expect(pick(tasks, { branches: [quietExternal, n1Busy], claimant: "GLM · g1" })).toMatchObject({ kind: "build", task: { id: "N2" } });
  });

  it("alone, it is an honest wait that names the task and the reason, never a hand-out the claim would refuse", () => {
    const got = pick([task("X")], { branches: [quietExternal] });
    expect(got.kind).toBe("wait");
    expect(got.reason).toContain("X can only be claimed with its qualified operator route");
  });

  it("an execution line marks a history external too", () => {
    const viaExecution: [string, Branch] = ["agent/queue/x", { ...quietExternal[1], markers: [{ verb: "Claim", id: "X", who: "Instinct · op1", body: "provenance r1\nexecution e1" }] }];
    expect(pick([task("X"), task("N")], { branches: [viaExecution] })).toMatchObject({ kind: "build", task: { id: "N" } });
  });
});

describe("D-322: red main holds landings, not sessions", () => {
  const red = { state: "red", sha: "c".repeat(40), url: "https://ci/red" };
  const fixing: [string, Branch] = ["agent/queue/fix-main-cccccccc", { tipMs: NOW - 0.2 * HOUR, merged: false, markers: [{ verb: "Claim", id: "fix-main-cccccccc", who: "Qwen · q1" }] }];
  const built = (id: string): [string, Branch] => [`agent/queue/${id.toLowerCase()}`, { tipMs: NOW - 3 * HOUR, tipSha: "b".repeat(40), merged: false, markers: [{ verb: "Claim", id, who: "DeepSeek · d1" }] }];

  it("nobody has the fix: it is handed out first, whatever else is waiting", () => {
    expect(pick([task("A")], { ci: red })).toMatchObject({ kind: "fix-main" });
  });

  it("the fix is in hand: a green pull request is not landed, other work is built and says nothing lands", () => {
    const opts = { ci: red, branches: [fixing, built("L")], prs: [["agent/queue/l", "https://github.com/o/r/pull/5"]] as [string, string][], prCi: [["agent/queue/l", "green"]] as [string, string][] };
    const got = pick([task("L"), task("N")], opts);
    expect(got).toMatchObject({ kind: "build", task: { id: "N" }, mainRedNote: true });
    expect(renderPick(got, { who: "Kimi · k1", date: "2026-11-11", claimed: false })).toContain("main is red right now (D-322)");
    expect(pick([task("L")], opts)).toMatchObject({ kind: "wait", mainRed: true });
  });

  it("a session's own landing waits with the rest; it is handed other work meanwhile", () => {
    const mine: [string, Branch] = ["agent/queue/m", { tipMs: NOW - 0.5 * HOUR, tipSha: "b".repeat(40), merged: false, markers: [{ verb: "Claim", id: "M", who: "Kimi · k1" }] }];
    const opts = { ci: red, branches: [fixing, mine], prs: [["agent/queue/m", "https://github.com/o/r/pull/6"]] as [string, string][], prCi: [["agent/queue/m", "green"]] as [string, string][], claimant: "Kimi · k1" };
    const got = pick([task("M"), task("N")], opts);
    expect(got.kind).not.toBe("land");
    expect(got).toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("green main is unchanged: the same pull request is a landing and nothing is marked", () => {
    const got = pick([task("L"), task("N")], { branches: [built("L")], prs: [["agent/queue/l", "https://github.com/o/r/pull/5"]], prCi: [["agent/queue/l", "green"]] });
    expect(got).toMatchObject({ kind: "land", task: { id: "L" } });
    expect(got).not.toHaveProperty("mainRedNote");
  });
});

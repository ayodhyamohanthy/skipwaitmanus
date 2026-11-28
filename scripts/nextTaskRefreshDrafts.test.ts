// @vitest-environment node
// D-407 (4) (owner, Nov 26: "agents are still getting wait instructions ... when we so many todos and tasks pending"):
// when every unfinished row is already built ahead as a draft pull request, the picker hands out keeping a quiet draft
// current (merge main, make required CI green, never land) instead of WAIT. WAIT stays only when that is empty too.
import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-11-26T02:00:00Z");
const HOUR = 3_600_000;
const mainGreen = { state: "green", sha: "a".repeat(40), url: "https://ci/main" };
type Marker = { verb: string; id: string; who: string };
type Branch = { tipMs: number; tipSha?: string; merged: boolean; markers: Marker[] };

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/FND-1-toolchain-and-test-collection.md", tier: 2,
  lane: id.toLowerCase(), branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], syncedTo: "D-001", ...extra,
});
const branchOf = (id: string) => `agent/queue/${id.toLowerCase()}`;
const claimed = (id: string, who: string, hoursAgo: number): [string, Branch] =>
  [branchOf(id), { tipMs: NOW - hoursAgo * HOUR, tipSha: "b".repeat(40), merged: false, markers: [{ verb: "Claim", id, who }] }];

type Opts = { branches?: [string, Branch][]; prs?: string[]; prCi?: [string, string][]; behind?: [string, number][]; avoid?: string[]; only?: string };
const pick = (tasks: ReturnType<typeof task>[], opts: Opts = {}) =>
  pickNextTask({
    tasks, mainCi: mainGreen, branches: new Map(opts.branches ?? []),
    openPrs: new Map((opts.prs ?? []).map((id, n) => [branchOf(id), `https://github.com/o/r/pull/${100 + n}`])),
    prCi: new Map((opts.prCi ?? []).map(([id, state]) => [branchOf(id), { state, sha: "b".repeat(40) }])),
    prBehind: new Map((opts.behind ?? []).map(([id, n]) => [branchOf(id), n])),
    mergedHeads: new Map(), reports: [], now: NOW, claimant: "Kimi · k1",
    avoid: new Set(opts.avoid ?? []), register: [], ...(opts.only ? { only: opts.only } : {}),
  });
const ctx = { who: "Kimi · k1", date: "2026-11-26", claimed: false };

// A is being built by someone else right now, so B (which depends on A) is held; B is already built ahead as a draft.
const busyA = claimed("A", "Qwen · q1", 0.5);
const tasks = () => [task("A"), task("B", { dependsOn: ["A"] })];

describe("D-407 (4): keep built-ahead drafts current instead of WAIT", () => {
  // D-412 (1): a draft is refreshed only when its unmet dependency (A) already has an open pull request with green CI.
  it("hands a quiet draft that is far behind main as a refresh takeover, and says it must never land", () => {
    const got = pick(tasks(), { branches: [busyA, claimed("B", "Gemini · g1", 5)], prs: ["A", "B"], prCi: [["A", "green"], ["B", "green"]], behind: [["B", 40]] });
    expect(got).toMatchObject({ kind: "takeover", task: { id: "B" }, work: branchOf("B"), refresh: "its draft is 40 commits behind main" });
    const text = renderPick(got, ctx);
    expect(text).toContain("KEEP A BUILT-AHEAD DRAFT CURRENT (D-407 (4))");
    expect(text).toContain("merge origin/main");
    expect(text).toContain("never land it");
  });

  it("hands a quiet draft whose required CI is red even when it is current", () => {
    const got = pick(tasks(), { branches: [busyA, claimed("B", "Gemini · g1", 5)], prs: ["A", "B"], prCi: [["A", "green"], ["B", "red"]], behind: [["B", 0]] });
    expect(got).toMatchObject({ kind: "takeover", task: { id: "B" }, refresh: "its draft's required CI is red" });
  });

  it.each([
    ["an active draft (pushed under 2 h ago)", { branches: [busyA, claimed("B", "Gemini · g1", 1)], prs: ["B"], prCi: [["B", "green"]], behind: [["B", 40]] }],
    ["a current, green draft (5 behind)", { branches: [busyA, claimed("B", "Gemini · g1", 5)], prs: ["B"], prCi: [["B", "green"]], behind: [["B", 5]] }],
    ["an avoided draft", { branches: [busyA, claimed("B", "Gemini · g1", 5)], prs: ["B"], prCi: [["B", "red"]], behind: [["B", 40]], avoid: ["B"] }],
    ["a draft whose distance from main is unknown and whose CI is green", { branches: [busyA, claimed("B", "Gemini · g1", 5)], prs: ["B"], prCi: [["B", "green"]] }],
  ] as [string, Opts][])("passes over %s, so nothing is handed out", (_name, opts) => {
    expect(pick(tasks(), opts)).not.toMatchObject({ kind: "takeover", task: { id: "B" } });
  });

  it("never hands out an out-of-sync draft (D-202)", () => {
    const register = [{ id: "D-001", date: "2026-11-24", affects: [] }, { id: "D-002", date: "2026-11-25", affects: ["B"] }];
    const got = pickNextTask({
      tasks: tasks(), mainCi: mainGreen, branches: new Map([busyA, claimed("B", "Gemini · g1", 5)]),
      openPrs: new Map([[branchOf("B"), "https://github.com/o/r/pull/100"]]), prCi: new Map([[branchOf("B"), { state: "red", sha: "b".repeat(40) }]]),
      prBehind: new Map([[branchOf("B"), 40]]), mergedHeads: new Map(), reports: [], now: NOW, claimant: "Kimi · k1", avoid: new Set(), register,
    });
    expect(got).not.toMatchObject({ kind: "takeover", task: { id: "B" } });
  });

  it("ordinary work and plain build-ahead still come first", () => {
    const list = [...tasks(), task("C", { dependsOn: ["A"] })];
    expect(pick(list, { branches: [busyA, claimed("B", "Gemini · g1", 5)], prs: ["B"], prCi: [["B", "red"]], behind: [["B", 40]] }))
      .toMatchObject({ kind: "build", task: { id: "C" }, ahead: ["A"] });
  });

  // PICKER-dep-about-to-land (D-415 (4)(c)): the D-048-dark-mode / D-048-K-kit shape. A dependency parked at `owner`
  // or waiting on its own unmet dependencies never counts as about to land, even with an open green pull request.
  it("never refreshes a draft whose dependency is parked at owner, even with that dependency's green pull request", () => {
    const list = [task("A", { status: "owner" }), task("B", { dependsOn: ["A"] })];
    const got = pick(list, { branches: [claimed("A", "Qwen · q1", 5), claimed("B", "Gemini · g1", 5)], prs: ["A", "B"], prCi: [["A", "green"], ["B", "red"]], behind: [["B", 300]] });
    expect(got).not.toMatchObject({ kind: "takeover", task: { id: "B" } });
  });

  it("never refreshes a draft whose dependency still waits on its own unmet dependency", () => {
    const list = [task("Z"), task("A", { dependsOn: ["Z"] }), task("B", { dependsOn: ["A"] })];
    const busyZ = claimed("Z", "Qwen · q2", 0.5);
    const got = pick(list, { branches: [busyZ, claimed("A", "Qwen · q1", 5), claimed("B", "Gemini · g1", 5)], prs: ["A", "B"], prCi: [["A", "green"], ["B", "red"]], behind: [["B", 300]] });
    expect(got).not.toMatchObject({ kind: "takeover", task: { id: "B" } });
  });

  it("a draft whose dependencies are done keeps its normal stage, never a refresh", () => {
    const got = pick([task("B")], { branches: [claimed("B", "Gemini · g1", 5)], prs: ["B"], prCi: [["B", "red"]], behind: [["B", 40]] });
    expect(got.refresh).toBeUndefined();
  });
});

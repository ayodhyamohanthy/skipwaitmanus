// @vitest-environment node
// D-315 (owner, Nov 10: "when i say build in agents they should get a task to work . no wait no block"): when nothing
// else is eligible, a session works AHEAD on the oldest task held only by unfinished dependencies, on that task's own
// branch. Nothing lands early: review, fix and landing stay withheld until every dependency is done (D-134). A review
// or landing held by external provenance is passed over for this session instead of returning a WAIT.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-11-10T20:00:00Z");
const HOUR = 3_600_000;
const mainGreen = { state: "green", sha: "a".repeat(40), url: "https://ci/main" };
type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; tipSha?: string; merged: boolean; markers: Marker[] };

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/FND-1-toolchain-and-test-collection.md", tier: 2,
  lane: id.toLowerCase(), branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], ...extra,
});
const claimed = (id: string, who: string, hoursAgo: number): [string, Branch] =>
  [`agent/queue/${id.toLowerCase()}`, { tipMs: NOW - hoursAgo * HOUR, tipSha: "b".repeat(40), merged: false, markers: [{ verb: "Claim", id, who }] }];
const pick = (tasks: ReturnType<typeof task>[], opts: { branches?: [string, Branch][]; prs?: [string, string][]; prCi?: [string, string][]; claimant?: string; avoid?: string[]; register?: unknown[] } = {}) =>
  pickNextTask({
    tasks, mainCi: mainGreen, branches: new Map(opts.branches ?? []), openPrs: new Map(opts.prs ?? []),
    prCi: new Map((opts.prCi ?? []).map(([b, state]) => [b, { state, sha: "b".repeat(40) }])),
    mergedHeads: new Map(), reports: [], now: NOW, claimant: opts.claimant ?? "Kimi · k1",
    avoid: new Set(opts.avoid ?? []), register: opts.register ?? [],
  });
const ctx = { who: "Kimi · k1", date: "2026-11-10", claimed: false };

// A is being built by someone else (fresh claim, no pull request): every task that depends on A is held.
const busyA: [string, Branch] = claimed("A", "Qwen · q1", 0.5);

describe("D-315: nobody idles — work ahead of unfinished dependencies", () => {
  it("hands the oldest dependency-held task as an AHEAD build when nothing else is free, and says it must not land", () => {
    const tasks = [task("A"), task("B", { dependsOn: ["A"] }), task("C", { dependsOn: ["A"] })];
    const got = pick(tasks, { branches: [busyA] });
    expect(got).toMatchObject({ kind: "build", task: { id: "B" }, ahead: ["A"] });
    const text = renderPick(got, ctx);
    expect(text).toContain("AHEAD OF ITS DEPENDENCIES (D-315): A is not done yet");
    expect(text).toContain("never land it, never mark it done");
  });

  it("ordinary eligible work always comes first; ahead work only fills the gap", () => {
    const tasks = [task("A"), task("B", { dependsOn: ["A"] }), task("N")];
    expect(pick(tasks, { branches: [busyA] })).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(pick(tasks, { branches: [busyA] })).not.toHaveProperty("ahead");
  });

  it("puts tasks whose unmet dependency waits for the owner after every other", () => {
    const tasks = [task("O", { status: "owner" }), task("P", { dependsOn: ["O"] }), task("A"), task("B", { dependsOn: ["A"] })];
    expect(pick(tasks, { branches: [busyA] })).toMatchObject({ kind: "build", task: { id: "B" }, ahead: ["A"] });
    expect(pick(tasks, { branches: [busyA], avoid: ["B"] })).toMatchObject({ kind: "build", task: { id: "P" }, ahead: ["O"] });
  });

  it("never hands one task twice: a branch somebody is pushing to, or one with a pull request, is theirs", () => {
    const tasks = [task("A"), task("B", { dependsOn: ["A"] }), task("C", { dependsOn: ["A"] })];
    const bBusy = claimed("B", "Gemini · g1", 0.5);
    expect(pick(tasks, { branches: [busyA, bBusy] })).toMatchObject({ kind: "build", task: { id: "C" }, ahead: ["A"] });
    const bQuietWithPr = claimed("B", "Gemini · g1", 5);
    expect(pick(tasks, { branches: [busyA, bQuietWithPr], prs: [["agent/queue/b", "https://github.com/o/r/pull/9"]], prCi: [["agent/queue/b", "green"]] }))
      .toMatchObject({ kind: "build", task: { id: "C" } });
  });

  it("a quiet half-built ahead branch is taken over ahead; a fresh one is passed over", () => {
    const tasks = [task("A"), task("B", { dependsOn: ["A"] })];
    expect(pick(tasks, { branches: [busyA, claimed("B", "Gemini · g1", 3)] })).toMatchObject({ kind: "takeover", task: { id: "B" }, ahead: ["A"] });
    expect(pick(tasks, { branches: [busyA, claimed("B", "Gemini · g1", 0.5)] }).kind).toBe("none");
  });

  it("never lands early: a green ahead pull request gets no landing while its dependency is unfinished", () => {
    const tasks = [task("A"), task("B", { dependsOn: ["A"] })];
    const got = pick(tasks, { branches: [busyA, claimed("B", "Gemini · g1", 5)], prs: [["agent/queue/b", "https://github.com/o/r/pull/9"]], prCi: [["agent/queue/b", "green"]] });
    expect(got.kind).not.toBe("land");
    expect(got.kind).toBe("none");
  });

  it("a packet still to write is written ahead; an out-of-sync task is re-synced ahead", () => {
    expect(pick([task("A"), task("W", { status: "architect", packet: null, dependsOn: ["A"] })], { branches: [busyA] }))
      .toMatchObject({ kind: "architect", task: { id: "W" }, ahead: ["A"] });
    const register = [
      { id: "D-001", number: 1, date: "2026-11-01", title: "one", affects: [] },
      { id: "D-002", number: 2, date: "2026-11-02", title: "two", affects: ["S"] },
    ];
    expect(pick([task("A"), task("S", { syncedTo: "D-001", dependsOn: ["A"] })], { branches: [busyA], register }))
      .toMatchObject({ kind: "resync", task: { id: "S" }, ahead: ["A"] });
  });

  it("a Claude Code session keeps its CEO review instead of building ahead (D-225)", () => {
    expect(pick([task("A"), task("B", { dependsOn: ["A"] })], { branches: [busyA], claimant: "Claude Opus · c1" }).kind).toBe("ceo");
  });
});

describe("D-315: a review held by external provenance does not make the session wait", () => {
  it("the held review is passed over and the next independent task is handed out; alone, it is still the wait", () => {
    // The same standalone-core probe as modelProvenance.test.ts: a copied core with no provenance support keeps an
    // external history fail-closed, which is the held case.
    const src = path.dirname(new URL(import.meta.url).pathname);
    const dir = mkdtempSync(path.join(os.tmpdir(), "nowait-"));
    copyFileSync(path.join(src, "nextTaskCore.mjs"), path.join(dir, "nextTaskCore.mjs"));
    const t = { id: "T", title: "t", row: "T", packet: "docs/plans/t.md", tier: 1, lane: "t", branch: "agent/queue/t", status: "todo", dependsOn: [], syncedTo: "D-001" };
    const n = { ...t, id: "N", row: "N", lane: "n", branch: "agent/queue/n", tier: 2 };
    const head = "c".repeat(40);
    const external = "provenance route-x\nexecution exec-y";
    const branches = [
      [t.branch, { tipSha: head, tipMs: 0, work: true, markers: [{ verb: "Claim", id: "T", who: "Operator · b", body: external }] }],
      // As in modelProvenance.test.ts: the reviewer's own pending Review claim, so its stage is a review continuation.
      ["agent/review/t", { tipMs: 0, markers: [{ verb: "Review claim", id: "T", who: "Operator · r", body: external }] }],
    ];
    const probe = (tasks: unknown[]) => {
      const input = { tasks, mainCi: { state: "green" }, branches, now: Date.now(), claimant: "Operator · r" };
      const code = `import {pickNextTask} from './nextTaskCore.mjs';const i=${JSON.stringify(input)};i.branches=new Map(i.branches);i.openPrs=new Map([['${t.branch}','https://example.test/pr']]);i.prCi=new Map([['${t.branch}',{state:'green',sha:'${head}'}]]);i.mergedHeads=new Map();i.reports=[];console.log(JSON.stringify(pickNextTask(i)));`;
      writeFileSync(path.join(dir, "probe.mjs"), code);
      const run = spawnSync(process.execPath, ["probe.mjs"], { cwd: dir, encoding: "utf8" });
      expect(run.status, run.stderr).toBe(0);
      return JSON.parse(run.stdout.trim().split("\n").at(-1) ?? "{}");
    };
    const alone = probe([t]);
    expect(alone.kind).toBe("wait");
    expect(alone.reason).toContain("external provenance held");
    const withOther = probe([t, n]);
    expect(withOther).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(existsSync(path.join(dir, "probe.mjs")) && readFileSync(path.join(dir, "probe.mjs"), "utf8")).toContain("pickNextTask");
  });
});

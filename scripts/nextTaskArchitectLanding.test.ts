// @vitest-environment node
// D-190: a packet's pull request is opened from its architect lock branch
// (agent/architect/<slug>). The picker must see that pull request, its CI and
// its merge, and hand the landing to any session but the packet's writer.
import { describe, expect, it } from "vitest";
import { pickNextTask, statusBoard } from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-10-30T06:00:00+05:30");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/run/1" };
const PR = "https://github.com/o/r/pull/557";
const LOCK = "agent/architect/p";

type Marker = { verb: string; id: string; who: string };
type Branch = { tipMs: number; merged: boolean; markers: Marker[]; tipSha?: string; work?: boolean };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/PICKER-PARALLEL.md",
  tier: 2, lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], ...extra,
});
const packetTask = task("P", { status: "architect", packet: null });
const writer = "Kimi · s3";
// `work: true`: the loader saw at least one commit on the lock that changes files (the packet itself).
const lock = (extra: Partial<Branch> = {}): Branch => ({
  tipMs: NOW - 1 * HOUR, merged: false, tipSha: "p1", work: true, markers: [{ verb: "Claim", id: "P", who: writer }], ...extra,
});

type Opts = { branches?: [string, Branch][]; prs?: [string, string][]; ci?: [string, string][]; merged?: [string, string[]][]; claimant?: string; tasks?: ReturnType<typeof task>[] };
const pick = (opts: Opts = {}) => pickNextTask({
  tasks: opts.tasks ?? [packetTask, task("B")], mainCi: green,
  branches: new Map(opts.branches ?? []), openPrs: new Map(opts.prs ?? []),
  prCi: new Map((opts.ci ?? []).map(([b, state]) => [b, { state }])),
  mergedHeads: new Map((opts.merged ?? []).map(([b, shas]) => [b, new Set(shas)])),
  reports: [], now: NOW, claimant: opts.claimant ?? null, register: [],
});

describe("a packet pull request on its architect lock branch (D-190)", () => {
  it("with green CI is handed out as a landing to another session, on the lock branch", () => {
    const got = pick({ branches: [[LOCK, lock()]], prs: [[LOCK, PR]], ci: [[LOCK, "green"]], claimant: "Qwen · s1" });
    expect(got).toMatchObject({ kind: "land", task: { id: "P" }, work: LOCK, pr: PR, lock: LOCK, packet: true, from: writer });
  });

  it("is never handed to its writer, nor to a session that took the packet over", () => {
    expect(pick({ branches: [[LOCK, lock()]], prs: [[LOCK, PR]], ci: [[LOCK, "green"]], claimant: writer })).not.toMatchObject({ kind: "land" });
    const takenOver = lock({ markers: [{ verb: "Claim", id: "P", who: writer }, { verb: "Takeover", id: "P", who: "Mistral · t2" }] });
    expect(pick({ branches: [[LOCK, takenOver]], prs: [[LOCK, PR]], ci: [[LOCK, "green"]], claimant: writer })).not.toMatchObject({ kind: "land" });
    expect(pick({ branches: [[LOCK, takenOver]], prs: [[LOCK, PR]], ci: [[LOCK, "green"]], claimant: "Mistral · t2" })).not.toMatchObject({ kind: "land" });
    expect(pick({ branches: [[LOCK, takenOver]], prs: [[LOCK, PR]], ci: [[LOCK, "green"]], claimant: "Qwen · s1" })).toMatchObject({ kind: "land", task: { id: "P" } });
  });

  it("with red or running CI is not handed out as a landing", () => {
    for (const state of ["red", "running", "unknown"]) {
      const got = pick({ branches: [[LOCK, lock()]], prs: [[LOCK, PR]], ci: [[LOCK, state]], claimant: "Qwen · s1" });
      expect(got).toMatchObject({ kind: "build", task: { id: "B" } });
    }
  });

  it("a lock branch with only markers is not treated as work, even with a pull request", () => {
    const markersOnly = lock({ work: false });
    const got = pick({ branches: [[LOCK, markersOnly]], prs: [[LOCK, PR]], ci: [[LOCK, "green"]], claimant: "Qwen · s1" });
    expect(got).toMatchObject({ kind: "build", task: { id: "B" } });
    const row = statusBoard({ tasks: [packetTask], branches: new Map([[LOCK, markersOnly]]), openPrs: new Map([[LOCK, PR]]), prCi: new Map([[LOCK, { state: "green" }]]), reports: [], now: NOW });
    expect(row[0]).toMatchObject({ id: "P", state: "packet", pr: null });
  });

  it("goes through the landing slot: a busy slot makes the lander wait", () => {
    const slot: Branch = { tipMs: NOW - 0.2 * HOUR, merged: false, markers: [{ verb: "Land claim", id: "X", who: "GPT · g1" }] };
    const got = pick({ branches: [[LOCK, lock()], ["agent/queue/landing", slot]], prs: [[LOCK, PR]], ci: [[LOCK, "green"]], claimant: "Qwen · s1" });
    expect(got).toMatchObject({ kind: "wait", landing: true, holder: "GPT · g1" });
  });

  it("its lander continues the landing, and nobody else is handed it meanwhile", () => {
    const landing = lock({ tipMs: NOW - 0.5 * HOUR, markers: [{ verb: "Claim", id: "P", who: writer }, { verb: "Land claim", id: "P", who: "Qwen · s1" }] });
    const opts = { branches: [[LOCK, landing]] as [string, Branch][], prs: [[LOCK, PR]] as [string, string][], ci: [[LOCK, "green"]] as [string, string][] };
    expect(pick({ ...opts, claimant: "Qwen · s1" })).toMatchObject({ kind: "continue", of: "land", task: { id: "P" }, work: LOCK, lock: LOCK, packet: true });
    expect(pick({ ...opts, claimant: "GPT · g1" })).toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("after its merge the row reads landed and its dependents may start", () => {
    const merged = lock({ merged: true });
    const tasks = [packetTask, task("D", { dependsOn: ["P"] })];
    const rows = statusBoard({ tasks, branches: new Map([[LOCK, merged]]), openPrs: new Map(), mergedHeads: new Map([[LOCK, new Set(["p1"])]]), reports: [], now: NOW });
    expect(rows[0]).toMatchObject({ id: "P", state: "done" });
    expect(pick({ tasks, branches: [[LOCK, merged]], merged: [[LOCK, ["p1"]]], claimant: "Qwen · s1" })).toMatchObject({ kind: "build", task: { id: "D" } });
  });

  it("shows its pull request and CI on the board while it waits for a lander", () => {
    const rows = statusBoard({ tasks: [packetTask], branches: new Map([[LOCK, lock()]]), openPrs: new Map([[LOCK, PR]]), prCi: new Map([[LOCK, { state: "green" }]]), reports: [], now: NOW });
    expect(rows[0]).toMatchObject({ id: "P", pr: PR, state: "pr-green", health: "green" });
  });

  it("leaves every other row's reserved branches alone", () => {
    // A todo row never takes its architect lock as a work branch, even with file commits on it.
    const rows = statusBoard({ tasks: [task("Q")], branches: new Map([["agent/architect/q", lock({ markers: [{ verb: "Claim", id: "Q", who: writer }] })]]), openPrs: new Map([["agent/architect/q", PR]]), prCi: new Map([["agent/architect/q", { state: "green" }]]), reports: [], now: NOW });
    expect(rows[0]).toMatchObject({ id: "Q", state: "todo", pr: null });
  });
});

describe("the printed packet landing step (D-190, D-183)", () => {
  const ctx = { who: "Qwen · s1", date: "2026-10-30", claimed: true };
  const landPick = { kind: "land", task: packetTask, work: LOCK, pr: PR, lock: LOCK, tier1: true, packet: true, from: writer };

  it("keeps main's rows, adds only the packet's, and validates before landing", () => {
    for (const text of [renderPick(landPick, ctx), renderPick({ ...landPick, kind: "continue", of: "land" }, ctx)]) {
      expect(text).toContain("keep every row main has unchanged and add only the packet's rows (D-183)");
      expect(text).toContain("validateAssignments");
      expect(text).toContain("vitest run scripts/");
      expect(text).toContain("You must not have written this packet");
      expect(text).not.toContain("reviewed and passed");
    }
  });
});

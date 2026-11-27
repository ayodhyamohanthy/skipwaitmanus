// @vitest-environment node
// D-412 (owner, Nov 27 2026): four picker speed fixes.
// (1) refresh a withheld draft only when it is about to become landable (amends D-407 (4));
// (2) an unblocker still clears an evidence-backed block after its ruling's pull request merged;
// (3) a pull request holding only status notes is unbuilt: never reviewed, landed or auto-landed;
// (4) the board shows a claim quiet past the 2-hour lease as free.
import { describe, expect, it } from "vitest";
import * as core from "./nextTaskCore.mjs";
import { renderBoard, renderPick } from "./nextTaskText.mjs";
import { autoLandCandidates } from "./autoLand.mjs";

const NOW = Date.parse("2026-11-27T06:00:00Z");
const HOUR = 3_600_000;
const SHA = "b".repeat(40);
const mainGreen = { state: "green", sha: "a".repeat(40), url: "https://ci/main" };
type Marker = { verb: string; id: string; who: string };
type Branch = { tipMs: number; tipSha?: string; merged: boolean; markers: Marker[] };

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: `docs/plans/${id}.md`, tier: 2,
  lane: id.toLowerCase(), branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], syncedTo: "D-001", ...extra,
});
const branchOf = (id: string) => `agent/queue/${id.toLowerCase()}`;
const prOf = (id: string, n = 100) => `https://github.com/o/r/pull/${n}`;
const claimed = (id: string, who: string, hoursAgo: number): [string, Branch] =>
  [branchOf(id), { tipMs: NOW - hoursAgo * HOUR, tipSha: SHA, merged: false, markers: [{ verb: "Claim", id, who }] }];

type Opts = {
  branches?: [string, Branch][]; prs?: string[]; prCi?: [string, string][]; behind?: [string, number][];
  facts?: [string, string[]][]; claimant?: string; reports?: object[];
};
const input = (tasks: ReturnType<typeof task>[], opts: Opts = {}) => ({
  tasks, mainCi: mainGreen, branches: new Map(opts.branches ?? []),
  openPrs: new Map((opts.prs ?? []).map((id, n) => [branchOf(id), prOf(id, 100 + n)])),
  prCi: new Map((opts.prCi ?? []).map(([id, state]) => [branchOf(id), { state, sha: SHA }])),
  prBehind: new Map((opts.behind ?? []).map(([id, n]) => [branchOf(id), n])),
  prFacts: new Map((opts.facts ?? []).map(([id, paths]) => [branchOf(id), { tipSha: SHA, paths, gateClear: false }])),
  mergedHeads: new Map(), reports: opts.reports ?? [], now: NOW, claimant: opts.claimant ?? "Kimi · k1",
  avoid: new Set<string>(), register: [],
});
const pick = (tasks: ReturnType<typeof task>[], opts: Opts = {}) => core.pickNextTask(input(tasks, opts));
const ctx = { who: "Kimi · k1", date: "2026-11-27", claimed: false };

describe("D-412 (1): refresh only drafts that could land", () => {
  // A is being built right now; B (depends on A) is a quiet draft, red and far behind main.
  const busyA = claimed("A", "Qwen · q1", 0.5);
  const quietB = claimed("B", "Gemini · g1", 5);
  const tasks = () => [task("A"), task("B", { dependsOn: ["A"] })];

  it("passes over a draft whose dependency has no pull request yet (was a refresh under D-407 (4))", () => {
    const got = pick(tasks(), { branches: [busyA, quietB], prs: ["B"], prCi: [["B", "red"]], behind: [["B", 40]] });
    expect(got).not.toMatchObject({ kind: "takeover", task: { id: "B" } });
    expect(got.refresh).toBeUndefined();
  });

  it("passes over a draft whose dependency's pull request is red", () => {
    const got = pick(tasks(), { branches: [busyA, quietB], prs: ["A", "B"], prCi: [["A", "red"], ["B", "red"]], behind: [["B", 40]] });
    expect(got).not.toMatchObject({ kind: "takeover", task: { id: "B" } });
  });

  it("passes over a draft parked at owner, even with a green dependency pull request", () => {
    const list = [task("A"), task("B", { dependsOn: ["A"], status: "owner" })];
    const got = pick(list, { branches: [busyA, quietB], prs: ["A", "B"], prCi: [["A", "green"], ["B", "red"]], behind: [["B", 40]] });
    expect(got).not.toMatchObject({ kind: "takeover", task: { id: "B" } });
  });

  it("passes over an owner-parked draft with no dependency at all (was a refresh under D-407 (4))", () => {
    const got = pick([task("B", { status: "owner" })], { branches: [quietB], prs: ["B"], prCi: [["B", "red"]], behind: [["B", 40]] });
    expect(got).not.toMatchObject({ kind: "takeover", task: { id: "B" } });
  });

  it("still refreshes a draft whose every unmet dependency has a green pull request", () => {
    const got = pick(tasks(), { branches: [busyA, quietB], prs: ["A", "B"], prCi: [["A", "green"], ["B", "red"]], behind: [["B", 40]] });
    expect(got).toMatchObject({ kind: "takeover", task: { id: "B" }, refresh: "its draft's required CI is red and it is 40 commits behind main" });
    expect(renderPick(got, ctx)).toContain("KEEP A BUILT-AHEAD DRAFT CURRENT (D-407 (4))");
  });
});

describe("D-412 (2): an unblocker still counts after its ruling merges", () => {
  const RULER = "Ruler · u1";
  const a = task("A", { packet: "docs/plans/D-344-unblock.md" });
  const work: Branch = { tipMs: NOW - 30 * HOUR, tipSha: SHA, merged: false, markers: [{ verb: "Claim", id: "A", who: "Builder · b1" }] };
  const evidence = { version: 1, work: [{ branch: a.branch, sha: SHA }], decisions: [] as string[], doneDependencies: [] as string[] };
  const block = { id: "A", status: "blocked", who: "Builder · b1", at: NOW - 25 * HOUR, note: "Needs a ruling", evidence };
  const ruling = { id: "A", status: "review", who: RULER, at: NOW - HOUR, note: "Ruling landed", evidence: null };
  // The ruling's pull request merged from the lock: the loader reads no markers beyond main on it any more.
  const mergedLock: Branch = { tipMs: NOW - 3 * HOUR, tipSha: "c".repeat(40), merged: true, markers: [] };
  const fixture = (extra: object = {}) => ({
    tasks: [a, task("NEXT")], branches: new Map<string, Branch>([[a.branch, work], ["agent/architect/a", mergedLock]]),
    openPrs: new Map(), mainCi: mainGreen, reports: [ruling, block], register: [], now: NOW, claimant: "Worker · w1", ...extra,
  });
  const landed = new Map([["A", [RULER]]]);

  it("clears the block with the unblocker's report once its Unblock marker is in main", () => {
    const row = core.statusBoard({ ...fixture(), landedUnblocks: landed }).find(r => r.id === "A");
    expect(row?.report).toMatchObject({ status: "review", who: RULER });
    expect(core.pickNextTask({ ...fixture(), landedUnblocks: landed })).not.toMatchObject({ kind: "unblock", task: { id: "A" } });
  });

  it("also clears it when the merged lock was deleted", () => {
    const branches = new Map<string, Branch>([[a.branch, work]]);
    const row = core.statusBoard({ ...fixture({ branches }), landedUnblocks: landed }).find(r => r.id === "A");
    expect(row?.report).toMatchObject({ status: "review", who: RULER });
  });

  it("without the landed markers the stale block stands (the bug), and an unrelated session still never clears it", () => {
    expect(core.statusBoard(fixture()).find(r => r.id === "A")?.report).toMatchObject({ status: "blocked" });
    const reports = [{ ...ruling, who: "Other · o1" }, block];
    expect(core.statusBoard({ ...fixture({ reports }), landedUnblocks: landed }).find(r => r.id === "A")?.report).toMatchObject({ status: "blocked" });
  });

  it("lets the landed unblocker report, and reads the loader's marker list into task -> sessions", () => {
    const branches = new Map<string, Branch>([[a.branch, work]]);
    expect(core.mayReport({ task: a, branches, claimant: RULER })).toBe(false);
    expect(core.mayReport({ task: a, branches, claimant: RULER, landedUnblocks: landed })).toBe(true);
    expect(core.mayReport({ task: a, branches, claimant: "Other · o1", landedUnblocks: landed })).toBe(false);
    const parsed = core.landedUnblocksOf([
      core.parseMarker(`Unblock A: ${RULER}`), core.parseMarker("Unblock A: Second · s2"), core.parseMarker(`Unblock A: ${RULER}`),
      core.parseMarker("Claim A: Builder · b1"), core.parseMarker("Unblock B: Third · t3"),
    ]);
    expect(Object.fromEntries(parsed)).toEqual({ A: [RULER, "Second · s2"], B: ["Third · t3"] });
  });
});

describe("D-412 (3): a pull request holding only status notes is unbuilt", () => {
  const owning = (extra: Record<string, unknown> = {}) => task("S", { owns: ["server/switch.ts", "docs/plans/S.md"], ...extra });
  const notes = ["docs/plans/S.md", "docs/plans/assignments.json", "docs/KIT_V4_BUILD_PLAN.md"];
  const base = (extra: Opts = {}): Opts => ({ branches: [claimed("S", "Qwen · q1", 3)], prs: ["S"], prCi: [["S", "green"]], facts: [["S", notes]], ...extra });

  it("hands a quiet status-only pull request out as a build takeover, never LAND", () => {
    const got = pick([owning()], base());
    expect(got).toMatchObject({ kind: "takeover", task: { id: "S" }, statusOnly: true });
    expect(got.why).toContain("holds only status notes");
    expect(renderPick(got, ctx)).toContain("holds only status notes");
  });

  it("never hands its review for a Tier 1 row", () => {
    expect(pick([owning({ tier: 1 })], base())).toMatchObject({ kind: "takeover", task: { id: "S" }, statusOnly: true });
  });

  it("leaves an active builder's status-only pull request alone, and tells that builder to keep building", () => {
    const active = base({ branches: [claimed("S", "Qwen · q1", 0.5)] });
    expect(pick([owning()], active)).not.toMatchObject({ task: { id: "S" } });
    const own = pick([owning()], { ...active, claimant: "Qwen · q1" });
    expect(own).toMatchObject({ kind: "continue", of: "build", task: { id: "S" }, statusOnly: true });
    expect(renderPick(own, { ...ctx, who: "Qwen · q1" })).toContain("STATUS NOTES ARE NOT THE BUILD (D-412)");
  });

  it("never shows it pr-green on the board, so auto-land never takes it", () => {
    const i = input([owning()], base());
    const rows = core.statusBoard(i);
    expect(rows[0].state).not.toBe("pr-green");
    expect(autoLandCandidates({ rows, tasks: i.tasks, prCi: i.prCi })).toEqual([]);
  });

  it.each([
    ["a pull request that also changes an owned source file", base({ facts: [["S", [...notes, "server/switch.ts"]]] }), owning()],
    ["a row that owns only documentation", base(), task("S", { owns: ["docs/plans/S.md", "docs/guide/"] })],
    ["unknown changed paths (no facts for the tip)", base({ facts: [] }), owning()],
  ] as [string, Opts, ReturnType<typeof task>][])("keeps today's LAND for %s", (_name, opts, row) => {
    expect(pick([row], opts)).toMatchObject({ kind: "land", task: { id: "S" } });
    const i = input([row], opts);
    expect(autoLandCandidates({ rows: core.statusBoard(i), tasks: i.tasks, prCi: i.prCi })).toMatchObject([{ id: "S" }]);
  });

  it("statusOnlyPull reads hunk objects and Markdown anywhere as documentation", () => {
    const row = owning();
    expect(core.statusOnlyPull({ task: row, paths: ["README.md", { path: "docs/x.md" }] })).toBe(true);
    expect(core.statusOnlyPull({ task: row, paths: [{ path: "server/db.ts" }] })).toBe(false);
    expect(core.statusOnlyPull({ task: row, paths: [] })).toBe(false);
  });
});

describe("D-412 (4): the board shows quiet claims as free", () => {
  const boardOf = (hoursAgo: number) => core.statusBoard(input([task("Q")], { branches: [claimed("Q", "Qwen · q1", hoursAgo)] }));

  it("prints a claim quiet past the 2-hour lease as free, naming its last holder", () => {
    const rows = boardOf(3);
    expect(rows[0]).toMatchObject({ holder: "Qwen · q1", free: true, quietHours: 3 });
    const text = renderBoard(rows);
    expect(text).toContain("free (last: Qwen · q1, quiet 3h)");
    expect(text).not.toContain("· Qwen · q1 · quiet 3h");
  });

  it("keeps an active claim's holder as it was", () => {
    const rows = boardOf(1);
    expect(rows[0].free).toBeUndefined();
    expect(renderBoard(rows)).toContain("· Qwen · q1 · quiet 1h");
  });
});

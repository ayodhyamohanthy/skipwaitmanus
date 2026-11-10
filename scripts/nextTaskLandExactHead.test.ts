// @vitest-environment node
// PICKER-land-exact-head (D-293): the picker hands LAND only when the CI run it relies on
// is green and its head_sha matches the pull request branch's current tip on origin.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ciOnTip, pickNextTask, statusBoard } from "./nextTaskCore.mjs";

const NOW = Date.parse("2026-11-07T10:00:00+05:30");
const HOUR = 3_600_000;
const S_TIP = "a".repeat(40);
const S_OLD = "b".repeat(40);
const green = { state: "green", sha: "c".repeat(40), url: "https://ci/main" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; tipSha?: string; merged: boolean; markers: Marker[]; work?: boolean };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${id} title`,
  row: id,
  packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 2,
  lane: id.toLowerCase(),
  branch: `agent/queue/${id.toLowerCase()}`,
  status: "todo",
  dependsOn: [] as string[],
  owns: [`server/${id.toLowerCase()}.ts`],
  ...extra,
});

const BUILDER = "DeepSeek · b1";
const ME = "Antigravity · 2651";
const branchOf = (id: string) => `agent/queue/${id.toLowerCase()}`;
const built = (id: string, tipSha?: string, hoursAgo = 3): [string, Branch] => [
  branchOf(id),
  { tipMs: NOW - hoursAgo * HOUR, ...(tipSha ? { tipSha } : {}), merged: false, markers: [{ verb: "Claim", id, who: BUILDER }] },
];
const pr = (id: string): [string, string] => [branchOf(id), "https://github.com/o/r/pull/952"];

type Ci = { state: string; sha?: string; url?: string; runId?: number; gateOnly?: boolean };
const greenOldCi = (runId = 101): Ci => ({ state: "green", sha: S_OLD, url: "https://ci/run/101", runId });
const greenTipCi = (runId = 102): Ci => ({ state: "green", sha: S_TIP, url: "https://ci/run/102", runId });
const redOldCi = (runId = 103): Ci => ({ state: "red", sha: S_OLD, url: "https://ci/run/103", runId });

const pick = (tasks: ReturnType<typeof task>[], opts: { ci?: Ci; branches?: [string, Branch][]; claimant?: string } = {}) =>
  pickNextTask({
    tasks,
    mainCi: green,
    branches: new Map(opts.branches ?? [built(tasks[0].id, S_TIP)]),
    openPrs: new Map([pr(tasks[0].id)]),
    prCi: new Map([[branchOf(tasks[0].id), opts.ci ?? greenOldCi()]]),
    mergedHeads: new Map(),
    reports: [],
    now: NOW,
    claimant: opts.claimant ?? ME,
    avoid: new Set(),
    register: null,
  });

describe("PICKER-land-exact-head: core acceptance cases", () => {
  it("(l) a green payload without a sha string is never landable", () => {
    expect(ciOnTip({ state: "green" }, S_TIP).state).toBe("no-tip-ci");
    expect(ciOnTip({ state: "green", sha: undefined }, S_TIP).state).toBe("no-tip-ci");
    expect(pick([task("T")], { ci: { state: "green" } }).kind).not.toBe("land");
    expect(pick([task("T")], { ci: { state: "green" }, branches: [built("T", S_TIP, 0)] }).kind).not.toBe("land");
  });
  // (a) Green run on a stale sha -> no LAND
  it("(a) green run on a stale sha does not hand LAND; hands MAKE GREEN with short tip and runId", () => {
    const result = pick([task("T")], { ci: greenOldCi(101), branches: [built("T", S_TIP, 3)] });
    expect(result.kind).not.toBe("land");
    expect(result).toMatchObject({ kind: "green", task: { id: "T" } });
    expect((result as { why?: string }).why).toContain(S_TIP.slice(0, 8));
    expect((result as { why?: string }).why).toContain("101");
  });

  // (b) Green run on the tip -> LAND
  it("(b) green run on the exact tip hands LAND", () => {
    const result = pick([task("T")], { ci: greenTipCi(102), branches: [built("T", S_TIP, 3)] });
    expect(result).toMatchObject({ kind: "land", tier1: false, task: { id: "T" } });
  });

  // (c) No run on the tip -> no LAND
  it("(c) unknown CI on an open pull request does not hand LAND", () => {
    const result = pick([task("T")], { ci: { state: "unknown" }, branches: [built("T", S_TIP, 3)] });
    expect(result.kind).not.toBe("land");
    expect(result).toMatchObject({ kind: "green", task: { id: "T" } });
  });

  // (d) Tip-read failure -> no LAND
  it("(d) tip-read failure (branch view carrying no tipSha) never hands LAND", () => {
    const noTipBranch = built("T", undefined, 3);
    const result = pick([task("T")], { ci: greenOldCi(101), branches: [noTipBranch] });
    expect(result.kind).not.toBe("land");
  });

  // (e) Stale and not quiet -> wait
  it("(e) stale CI and work branch not quiet returns wait skip", () => {
    const freshBranch = built("T", S_TIP, 0.5); // pushed 30 mins ago (< 2h)
    const result = pick([task("T")], { ci: greenOldCi(101), branches: [freshBranch] });
    expect(result.kind).not.toBe("land");
    const skipReason = "skipped" in result ? result.skipped.find(s => s.id === "T")?.reason : (result as { reason?: string }).reason;
    expect(skipReason).toContain("waiting for CI on the tip");
  });

  // (f) Tier 1, passed review, stale CI -> no LAND
  it("(f) Tier 1 pull request with passed review but stale CI does not hand LAND", () => {
    const t1 = task("T1", { tier: 1 });
    const lock: [string, Branch] = [
      "agent/review/t1",
      { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Verdict", verdict: "pass", id: "T1", who: "Reviewer · r1" }] },
    ];
    // Another agent should not get kind: "land"
    const resultOther = pick([t1], {
      ci: greenOldCi(101),
      branches: [built("T1", S_TIP, 3), lock],
      claimant: "Other · o1",
    });
    expect(resultOther.kind).not.toBe("land");

    // The reviewer itself should not get of: "land"
    const resultReviewer = pick([t1], {
      ci: greenOldCi(101),
      branches: [built("T1", S_TIP, 3), lock],
      claimant: "Reviewer · r1",
    });
    expect((resultReviewer as { of?: string }).of).not.toBe("land");
  });

  // (g) Packet pull request, green on a stale lock tip -> no packet LAND
  it("(g) packet pull request green on a stale lock tip does not hand packet LAND", () => {
    const archTask = task("P", { status: "architect", packet: null });
    const archLock: [string, Branch] = [
      "agent/architect/p",
      { tipMs: NOW - 3 * HOUR, tipSha: S_TIP, work: true, merged: false, markers: [{ verb: "Claim", id: "P", who: "Writer · w1" }] },
    ];
    const archPr: [string, string] = ["agent/architect/p", "https://github.com/o/r/pull/999"];
    const result = pickNextTask({
      tasks: [archTask],
      mainCi: green,
      branches: new Map([archLock]),
      openPrs: new Map([archPr]),
      prCi: new Map([["agent/architect/p", greenOldCi(101)]]),
      mergedHeads: new Map(),
      reports: [],
      now: NOW,
      claimant: "Other · o1",
      avoid: new Set(),
      register: null,
    });
    expect(result.kind).not.toBe("land");
  });

  // (h) Red on a stale sha -> MAKE GREEN, as today
  it("(h) red CI on a stale sha hands MAKE GREEN as today", () => {
    const result = pick([task("T")], { ci: redOldCi(103), branches: [built("T", S_TIP, 3)] });
    expect(result).toMatchObject({ kind: "green", task: { id: "T" } });
  });

  // (i) Board
  it("(i) board line for a pull request with stale CI is not pr-green and not coloured green", () => {
    const rows = statusBoard({
      tasks: [task("T")],
      branches: new Map([built("T", S_TIP, 3)]),
      openPrs: new Map([pr("T")]),
      prCi: new Map([[branchOf("T"), greenOldCi(101)]]),
      reports: [],
      now: NOW,
    });
    expect(rows[0].state).not.toBe("pr-green");
    expect(rows[0].health).not.toBe("green");
  });

  // (j) Own-work continue
  it("(j) own-work continue for the holder of a stale CI pull request returns of: 'build', not 'land'", () => {
    const result = pick([task("T")], {
      ci: greenOldCi(101),
      branches: [built("T", S_TIP, 0.5)],
      claimant: BUILDER,
    });
    expect(result).toMatchObject({ kind: "continue", of: "build" });
    expect((result as { of?: string }).of).not.toBe("land");
  });
});

describe("PICKER-land-exact-head: wiring cases with mocked-fetch", () => {
  const root = path.resolve(__dirname, "..");
  type TipRunMode = "tip-green" | "empty" | "error";

  const setup = (opts: { tipRunMode: TipRunMode }) => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), "next-task-exact-head-"));
    const work = path.join(fixture, "work");
    const origin = path.join(fixture, "origin.git");
    const mock = path.join(fixture, "mock.mjs");
    const tipHits = path.join(fixture, "tip-hits.log");
    const old = new Date(Date.now() - 3 * HOUR).toISOString();
    const env = { ...process.env, GIT_AUTHOR_DATE: old, GIT_COMMITTER_DATE: old };
    const run = (args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", env }).trim();

    mkdirSync(work, { recursive: true });
    execFileSync("git", ["init", "--bare", origin], { encoding: "utf8" });
    run(["init", "-b", "main"]);
    run(["config", "user.name", "Fixture"]);
    run(["config", "user.email", "fixture@example.test"]);
    run(["remote", "add", "origin", origin]);
    mkdirSync(path.join(work, "docs/plans"), { recursive: true });
    writeFileSync(path.join(work, "docs/plans/test.md"), "# fixture\n");
    writeFileSync(path.join(work, "docs/DECISIONS.md"), [
      "# Decisions", "", "| ID | Date | Decision | Evidence | Notes | Status |", "|---|---|---|---|---|---|",
      "| D-001 | 2026-11-01 | **One** | e | — | adopted |", "",
    ].join("\n"));
    writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({
      version: 1, repo: "o/r",
      tasks: [{ id: "A", title: "Fixture task", row: "A", packet: "docs/plans/test.md", tier: 2, lane: "process", branch: "agent/queue/a", status: "todo", dependsOn: [], syncedTo: "D-001" }],
    }, null, 2) + "\n");
    run(["add", "."]);
    run(["commit", "-m", "root"]);
    run(["push", "-u", "origin", "main"]);

    run(["switch", "-c", "agent/queue/a"]);
    run(["commit", "--allow-empty", "-m", "Claim A: Builder · b1"]);
    writeFileSync(path.join(work, "docs/plans/test.md"), "# fixture, older commit\n");
    run(["commit", "-am", "A: older commit"]);
    const olderSha = run(["rev-parse", "HEAD"]);
    writeFileSync(path.join(work, "docs/plans/test.md"), "# fixture, tip commit\n");
    run(["commit", "-am", "A: tip commit"]);
    run(["push", "-u", "origin", "agent/queue/a"]);
    const tipSha = run(["rev-parse", "HEAD"]);
    run(["switch", "main"]);

    writeFileSync(mock, `
import { appendFileSync } from "node:fs";
const response = body => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/actions/workflows/ci.yml/runs?head_sha=')) {
    appendFileSync(${JSON.stringify(tipHits)}, url + "\\n");
    if (${JSON.stringify(opts.tipRunMode)} === 'tip-green') {
      return response({
        total_count: 1,
        workflow_runs: [
          { id: 2002, status: 'completed', conclusion: 'success', head_sha: '${tipSha}', head_branch: 'agent/queue/a', updated_at: '${old}', html_url: 'https://example.test/ci/run/2002' }
        ]
      });
    }
    if (${JSON.stringify(opts.tipRunMode)} === 'empty') {
      return response({ total_count: 0, workflow_runs: [] });
    }
    if (${JSON.stringify(opts.tipRunMode)} === 'error') {
      return { ok: false, status: 500, json: async () => ({}) };
    }
  }
  if (url.includes('/actions/workflows/ci.yml/runs?branch=main')) return response({ workflow_runs: [
    { id: 1, status: 'completed', conclusion: 'success', head_sha: '${"a".repeat(40)}', head_branch: 'main', updated_at: '${old}', html_url: 'https://example.test/ci/main' },
  ] });
  if (url.includes('/actions/workflows/ci.yml/runs?per_page=100')) return response({ workflow_runs: [
    { id: 1001, status: 'completed', conclusion: 'success', head_sha: '${olderSha}', head_branch: 'agent/queue/a', updated_at: '${old}', html_url: 'https://example.test/ci/run/1001' },
  ] });
  if (url.includes('/pulls?state=open')) return response([{ head: { repo: { full_name: 'o/r' }, ref: 'agent/queue/a', sha: '${tipSha}' }, html_url: 'https://example.test/pr/1' }]);
  if (url.includes('/pulls?state=closed')) return response([]);
  throw new Error('unexpected fetch: ' + url);
};
`);

    const picker = () => spawnSync(process.execPath, ["--import", mock, path.join(root, "scripts/next-task.mjs"), "--as", "Lander · l1"], {
      cwd: work, encoding: "utf8", env: { ...process.env, GH_TOKEN: "fixture-not-real", NODE_USE_ENV_PROXY: "1" },
    });
    const hits = () => (existsSync(tipHits) ? readFileSync(tipHits, "utf8").trim().split("\n").filter(Boolean) : []);
    return { fixture, picker, hits, tipSha };
  };

  const handOut = (out: string) => /^NEXT: (?:CONTINUE: )?(MAKE GREEN|LAND) A\b/m.exec(out)?.[1] ?? null;

  it("(k1) when head_sha query returns a green completed run on the tip, hands LAND", () => {
    const f = setup({ tipRunMode: "tip-green" });
    try {
      const res = f.picker();
      const out = `${res.stdout}\n--- stderr ---\n${res.stderr}`;
      expect(f.hits().length).toBe(1);
      expect(f.hits()[0]).toContain(`head_sha=${f.tipSha}`);
      expect(handOut(out), out).toBe("LAND");
    } finally {
      rmSync(f.fixture, { recursive: true, force: true });
    }
  }, 30_000);

  it("(k2) when head_sha query returns empty array, hands no LAND", () => {
    const f = setup({ tipRunMode: "empty" });
    try {
      const res = f.picker();
      const out = `${res.stdout}\n--- stderr ---\n${res.stderr}`;
      expect(f.hits().length).toBe(1);
      expect(handOut(out), out).not.toBe("LAND");
    } finally {
      rmSync(f.fixture, { recursive: true, force: true });
    }
  }, 30_000);

  it("(k3) when head_sha query returns HTTP 500, hands no LAND and logs next-task error", () => {
    const f = setup({ tipRunMode: "error" });
    try {
      const res = f.picker();
      const out = `${res.stdout}\n--- stderr ---\n${res.stderr}`;
      expect(f.hits().length).toBe(1);
      expect(handOut(out), out).not.toBe("LAND");
      expect(res.stderr).toContain("next-task:");
    } finally {
      rmSync(f.fixture, { recursive: true, force: true });
    }
  }, 30_000);
});

import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as core from "./nextTaskCore.mjs";
import { renderBoard } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const HOUR = 3_600_000;
const SHA = "a".repeat(40);
const task = (id: string, extra: object = {}) => ({
  id, title: id, row: id, packet: "docs/plans/D-344-unblock.md", tier: 2,
  lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[],
  syncedTo: "D-001", ...extra,
});
const a = task("A");
const next = task("NEXT");
const branch = { tipMs: NOW - 4 * HOUR, tipSha: SHA, merged: false, markers: [{ verb: "Claim", id: "A", who: "Builder · b1" }] };
const evidence = { version: 1, work: [{ branch: a.branch, sha: SHA }], decisions: [] as string[], doneDependencies: [] as string[] };
const block = { id: "A", status: "blocked", who: "Builder · b1", at: NOW - HOUR, note: "Evidence unavailable", evidence };
const fixture = (extra: object = {}) => ({
  tasks: [a, next], branches: new Map([[a.branch, branch]]), openPrs: new Map(),
  mainCi: { state: "green", sha: SHA }, reports: [block], register: [],
  now: NOW, claimant: "Worker · w1", ...extra,
});

describe("D-346: unchanged blocked stages wait for new evidence", () => {
  it("hands another task to every session rather than repeating an unchanged unblock", () => {
    for (const claimant of ["Worker · w1", "Builder · b1", "Claude Code · c1"]) {
      expect(core.pickNextTask(fixture({ claimant }))).toMatchObject({ kind: "build", task: { id: "NEXT" } });
    }
  });

  it("does not resume a blocked fix claim for the reporting fixer", () => {
    const lock = { tipMs: NOW, merged: false, markers: [{ verb: "Fix claim", id: "A", who: "Fixer · f1" }] };
    expect(core.pickNextTask(fixture({
      claimant: "Fixer · f1", reports: [{ ...block, who: "Fixer · f1" }],
      branches: new Map([[a.branch, branch], ["agent/review/a", lock]]),
      tasks: [task("A", { tier: 1 }), next], openPrs: new Map([[a.branch, "https://github.com/o/r/pull/1"]]),
    }))).toMatchObject({ kind: "build", task: { id: "NEXT" } });
  });

  it("permits an unblock after a new task-branch head", () => {
    expect(core.pickNextTask(fixture({ branches: new Map([[a.branch, { ...branch, tipSha: "b".repeat(40), tipMs: NOW }]]) })))
      .toMatchObject({ kind: "unblock", task: { id: "A" } });
  });

  it("permits an unblock when a new PR carrier appears", () => {
    const report = { ...block, evidence: { ...evidence, work: [] } };
    expect(core.pickNextTask(fixture({ reports: [report], openPrs: new Map([[a.branch, "https://github.com/o/r/pull/1"]]) })))
      .toMatchObject({ kind: "unblock", task: { id: "A" } });
  });

  it("ignores an unblock heartbeat or a new unrelated decision", () => {
    const arch = { tipMs: NOW, merged: false, markers: [{ verb: "Unblock", id: "A", who: "Worker · w1" }] };
    const register = [{ id: "D-002", number: 2, date: "2026-11-16", title: "Unrelated", affects: ["OTHER"] }];
    expect(core.pickNextTask(fixture({ branches: new Map([[a.branch, branch], ["agent/architect/a", arch]]), register })))
      .toMatchObject({ kind: "build", task: { id: "NEXT" } });
  });

  it("an unrelated follow-up report cannot replace missing evidence", () => {
    const reports = [{ ...block, status: "review", who: "Other · o1", at: NOW }, block];
    expect(core.pickNextTask(fixture({ reports }))).toMatchObject({ kind: "build", task: { id: "NEXT" } });
    expect(core.blockedReportError({ ...fixture({ reports }), task: a })).toMatch(/already reported/);
  });

  it("permits an unblock after a decision naming the task", () => {
    const register = [{ id: "D-002", number: 2, date: "2026-11-16", title: "A changed", affects: ["A"] }];
    expect(core.pickNextTask(fixture({ register }))).toMatchObject({ kind: "unblock", task: { id: "A" } });
  });

  it("permits an unblock after a dependency becomes done", () => {
    expect(core.pickNextTask(fixture({ tasks: [task("DEP", { status: "done" }), task("A", { dependsOn: ["DEP"] }), next] })))
      .toMatchObject({ kind: "unblock", task: { id: "A" } });
  });

  it("reopens after exactly 24 hours, but the reporting session still moves on", () => {
    const reports = [{ ...block, at: NOW - 24 * HOUR }];
    expect(core.pickNextTask(fixture({ reports }))).toMatchObject({ kind: "unblock", task: { id: "A" } });
    expect(core.pickNextTask(fixture({ reports, claimant: block.who }))).toMatchObject({ kind: "build", task: { id: "NEXT" } });
  });

  it("keeps the blocked lane and dependent rows held", () => {
    const tasks = [a, task("SAME", { lane: "A" }), task("DEP", { dependsOn: ["A"] }), next];
    expect(core.pickNextTask(fixture({ tasks }))).toMatchObject({ kind: "build", task: { id: "NEXT" } });
  });

  it("shows the standing block age and deduplication state", () => {
    const rows = core.statusBoard(fixture());
    expect(rows[0]).toMatchObject({ blockAgeHours: 1, blockWaitingForEvidence: true });
    expect(renderBoard(rows)).toContain("blocked 1h · waiting for new evidence or 24h");
  });
});

describe("structured blocked-report evidence", () => {
  it("rejects an unchanged repeat report and accepts changed evidence or timeout", () => {
    expect(core.blockedReportError({ ...fixture(), task: a })).toMatch(/already reported; nothing changed since/);
    expect(core.blockedReportError({ ...fixture({ now: NOW + 23 * HOUR }), task: a })).toBeNull();
    expect(core.blockedReportError({ ...fixture({ branches: new Map([[a.branch, { ...branch, tipSha: "b".repeat(40) }]]) }), task: a })).toBeNull();
  });

  it("round-trips note/evidence without leaking metadata into the human note", () => {
    const body = core.blockedReportBody("Needs evidence", evidence);
    expect(core.parseReportBody(body)).toEqual({ note: "Needs evidence", evidence });
    expect(core.parseReportBody("Legacy report")).toEqual({ note: "Legacy report", evidence: null });
    expect(core.parseReportBody(core.blockedReportBody("", evidence))).toEqual({ note: "", evidence });
  });

  it("refuses malformed or unknown metadata instead of accepting it as evidence", () => {
    expect(() => core.parseReportBody('Needs evidence\nblock-evidence {"version":2}')).toThrow(/block evidence/i);
    expect(() => core.parseReportBody('Needs evidence\nblock-evidence {"version":1,"work":[],"decisions":[],"doneDependencies":[],"extra":true}')).toThrow(/block evidence/i);
  });
});

describe("blocked report CLI integration", () => {
  it("persists evidence, refuses the duplicate, then accepts a new task commit", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "block-dedupe-cli-"));
    const work = path.join(dir, "work");
    mkdirSync(path.join(work, "docs/plans"), { recursive: true });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    try {
      execFileSync("git", ["init", "--bare", path.join(dir, "origin.git")], { stdio: "pipe" });
      git("init", "-b", "main");
      git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
      git("remote", "add", "origin", path.join(dir, "origin.git"));
      writeFileSync(path.join(work, "docs/plans/D-344-unblock.md"), "# Fixture\n");
      writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: "o/r", tasks: [a, next] }));
      writeFileSync(path.join(work, "docs/DECISIONS.md"), "| D-001 | 2026-11-16 | **Fixture** | e | Affects tasks: none | adopted |\n");
      git("add", "docs"); git("commit", "-m", "root"); git("push", "-u", "origin", "main");
      const mainSha = git("rev-parse", "HEAD");
      git("switch", "-c", a.branch);
      git("commit", "--allow-empty", "-m", "Claim A: Builder · b1"); git("push", "-u", "origin", a.branch);
      const mock = path.join(dir, "fetch.mjs");
      writeFileSync(mock, `
const response = body => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/actions/workflows/ci.yml/runs?branch=main')) return response({workflow_runs:[{status:'completed',conclusion:'success',head_sha:'${mainSha}',head_branch:'main',updated_at:'2026-11-16T12:00:00Z'}]});
  if (url.includes('/pulls?state=open') || url.includes('/pulls?state=closed')) return response([]);
  throw new Error('Unexpected fixture URL: '+url);
};
`);
      const cli = path.resolve(__dirname, "next-task.mjs");
      const run = (...args: string[]) => spawnSync(process.execPath, ["--import", mock, cli, ...args], {
        cwd: work, encoding: "utf8", env: { ...process.env, GH_TOKEN: "fixture", NODE_USE_ENV_PROXY: "1" },
      });
      const reportArgs = ["--report", "blocked", "--task", "A", "--as", "Builder · b1", "--note", "Needs evidence"];
      const first = run(...reportArgs);
      expect(first.status, first.stderr).toBe(0);
      const tip = git("rev-parse", "origin/agent/reports/log");
      const stored = core.parseReportBody(git("show", "-s", "--format=%b", tip));
      expect(stored).toMatchObject({ note: "Needs evidence", evidence: { version: 1, work: [{ branch: a.branch, sha: git("rev-parse", "HEAD") }] } });
      const duplicate = run(...reportArgs);
      expect(duplicate.status).toBe(1);
      expect(duplicate.stderr).toContain("already reported; nothing changed since");
      expect(git("rev-parse", "origin/agent/reports/log")).toBe(tip);
      const claimed = run("--claim", "Worker · w1");
      expect(claimed.status, claimed.stderr).toBe(0);
      expect(claimed.stdout).toContain("BUILD NEXT");
      // D-358: a claim prints the short board and points to --status, which keeps every task's line.
      expect(claimed.stdout).toContain("node scripts/next-task.mjs --status");
      expect(run("--status").stdout).toContain("waiting for new evidence or 24h");
      writeFileSync(path.join(work, "progress.txt"), "new task evidence\n");
      git("add", "progress.txt"); git("commit", "-m", "new task work"); git("push", "origin", a.branch);
      const changed = run(...reportArgs);
      expect(changed.status, changed.stderr).toBe(0);
      expect(git("rev-parse", "origin/agent/reports/log")).not.toBe(tip);
      const parent = git("rev-parse", "origin/agent/reports/log");
      const legacy = git("commit-tree", `${parent}^{tree}`, "-p", parent, "-m", "Report A: blocked — Builder · b1", "-m", "Legacy block with no snapshot");
      git("push", "origin", `${legacy}:refs/heads/agent/reports/log`);
      const legacyDuplicate = run(...reportArgs);
      expect(legacyDuplicate.status, legacyDuplicate.stderr).toBe(1);
      expect(legacyDuplicate.stderr).toContain("already reported; nothing changed since");
      expect(git("rev-parse", "origin/agent/reports/log")).toBe(legacy);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});
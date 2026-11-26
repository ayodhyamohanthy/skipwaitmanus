// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { blockEvidenceFor, blockedReportBody } from "./nextTaskCore.mjs";

const ME = "GPT-6.1 Sol · requested-task-test";
const CLI = fileURLToPath(new URL("./next-task.mjs", import.meta.url));
interface TaskOverrides { status?: string; }
interface ClaimRace { realGit: string; rivalSha: string; markerPath: string; }

function fixture(extra: TaskOverrides = {}, redMain = false, blockedPreview = false) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "requested-task-cli-"));
  const work = path.join(dir, "work"), remote = path.join(dir, "origin.git"), mock = path.join(dir, "mock.mjs");
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: "pipe" }).trim();
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("remote", "add", "origin", remote);
  const task = (id: string) => ({
    id, title: `${id} title`, row: id, packet: "docs/plans/test.md", tier: 2, lane: id,
    branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [], syncedTo: "D-001",
    owns: [`scripts/${id}.mjs`],
  });
  const a = task("A"), b = { ...task("B"), ...extra };
  writeFileSync(path.join(work, "docs/plans/test.md"), "# Fixture\n");
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({
    version: 1, repo: "o/r", tasks: [a, b],
  }));
  writeFileSync(path.join(work, "docs/DECISIONS.md"), [
    "# Decisions", "| ID | Date | Decision | Evidence | Notes | Status |",
    "|---|---|---|---|---|---|", "| D-001 | 2026-11-17 | Fixture | e | Affects tasks: none. | adopted |", "",
  ].join("\n"));
  git("add", "docs");
  git("commit", "-m", "fixture");
  git("push", "-u", "origin", "main");
  const head = git("rev-parse", "HEAD");
  let blockedHead = head;
  if (blockedPreview) {
    blockedHead = git("commit-tree", `${head}^{tree}`, "-p", head, "-m", "Claim A: Builder · blocked-preview");
    git("push", "origin", `${blockedHead}:refs/heads/${a.branch}`);
    const evidence = blockEvidenceFor({ task: a, tasks: [a, b], branches: new Map([[a.branch, { tipSha: blockedHead }]]) });
    const report = git("commit-tree", `${head}^{tree}`, "-p", head, "-m", "Report A: blocked — Builder · blocked-preview",
      "-m", blockedReportBody("Needs evidence", evidence));
    git("push", "origin", `${report}:refs/heads/agent/reports/log`);
    git("fetch", "origin");
  }
  const unexpectedNetwork = path.join(dir, "unexpected-network.txt");
  writeFileSync(mock, `
import childProcess from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const realSpawn = childProcess.spawnSync;
const race = process.env.CLAIM_RACE ? JSON.parse(process.env.CLAIM_RACE) : null;
if (race) {
  childProcess.spawnSync = (command, args, options) => {
    if (command === 'git' && args[0] === 'push' && args.some(arg => arg.endsWith(':refs/heads/agent/queue/b')) && !existsSync(race.markerPath)) {
      writeFileSync(race.markerPath, 'raced');
      childProcess.execFileSync(race.realGit, ['push', '-q', 'origin', race.rivalSha + ':refs/heads/agent/queue/b']);
    }
    return realSpawn(command, args, options);
  };
  syncBuiltinESMExports();
}
if (${blockedPreview}) {
  const policy = await import(${JSON.stringify(new URL("./sessionPolicy.mjs", import.meta.url).href)});
  if (policy.INDEPENDENT_REVIEW_REQUIRED || policy.MODEL_ROUTES_ENFORCED) throw Error('expected production policy defaults');
}
const response = body => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/runs?branch=main') && url.includes('/ci.yml/')) return response({ workflow_runs: [{
    status: '${blockedPreview ? "in_progress" : "completed"}', conclusion: ${JSON.stringify(blockedPreview ? null : redMain ? "failure" : "success")}, head_sha: '${head}',
    updated_at: '2026-11-17T12:00:00Z',
  }, ...(${blockedPreview} ? [{ status: 'completed', conclusion: 'failure', head_sha: '${head}',
    updated_at: '2026-11-17T11:00:00Z' }] : [])] });
  if (${blockedPreview}) {
    if (url.includes('/pulls?state=open')) return response([{ html_url: 'https://github.com/o/r/pull/1',
      head: { ref: '${a.branch}', sha: '${blockedHead}', repo: { full_name: 'o/r' } } }]);
    if (url.includes('/ci.yml/runs?')) return response({ workflow_runs: [{ status: 'in_progress', conclusion: null,
      head_sha: '${blockedHead}', head_branch: '${a.branch}' }, { status: 'completed', conclusion: 'failure',
      head_sha: '${blockedHead}', head_branch: '${a.branch}' }] });
    if (url.includes('/deploy-api.yml/runs?') || url.includes('/deploy-pages.yml/runs?')) return response({ workflow_runs: [] });
    if (url.includes('/git/ref/tags/api-runtime')) return response({});
    if (url.includes('/issues?')) return response([]);
    if (url.startsWith('https://skipwait.me/')) return { ok: false, status: 503, text: async () => '' };
  }
  if (url.includes('/pulls?state=open') || url.includes('/pulls?state=closed')) return response([]);
  if (${blockedPreview}) writeFileSync(${JSON.stringify(unexpectedNetwork)}, url);
  throw Error('unexpected fetch: ' + url);
};
`);
  const refs = () => git("ls-remote", "--heads", "origin");
  const localRefs = () => git("for-each-ref", "--format=%(refname) %(objectname)");
  const inheritedEnv = { ...process.env };
  if (blockedPreview) delete inheritedEnv.SKIPWAIT_LEGACY_REVIEW_RULES;
  const run = (id: string | null = "B", args: string[] = [], preview = false, race?: ClaimRace) => spawnSync(process.execPath,
    ["--import", mock, CLI, preview ? "--as" : "--claim", ME, ...(id ? ["--task", id] : []), ...args], {
      cwd: work, encoding: "utf8", env: {
        ...inheritedEnv, NEXT_TASK_LIST_REF: "origin/main", NODE_USE_ENV_PROXY: "1", GH_TOKEN: "fixture-only",
        ...(race ? { CLAIM_RACE: JSON.stringify(race) } : {}),
      },
    });
  return { dir, work, git, refs, localRefs, run, unexpectedNetwork };
}

function withFixture(test: (f: ReturnType<typeof fixture>) => void, extra: TaskOverrides = {}, redMain = false) {
  const f = fixture(extra, redMain);
  try { test(f); } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

describe("actual --claim --task with local Git origins", () => {
  it("default production preview passes an unchanged blocked PR and builds the owner without writing refs", () => {
    const f = fixture({ status: "owner" }, false, true);
    try {
      const before = { remote: f.refs(), local: f.localRefs() };
      const result = f.run(null, [], true);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("NEXT: BUILD B");
      expect(result.stdout).toContain("BUILD AHEAD OF A HOLD (D-399)");
      expect(result.stdout).toContain("never land it");
      expect(result.stdout).toContain('Not claimed yet. To take it: node scripts/next-task.mjs --claim "<your model name>"\n');
      const board = f.run(null, ["--status"], true);
      expect(board.status, board.stdout + board.stderr).toBe(0);
      expect(board.stdout).toContain("waiting for new evidence or 24h");
      expect({ remote: f.refs(), local: f.localRefs() }).toEqual(before);
      expect(existsSync(f.unexpectedNetwork)).toBe(false);
      expect(existsSync(path.join(f.work, ".git/hooks/post-commit"))).toBe(false);
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });

  it("a read-only preview preserves --task B in its follow-up claim command", () => withFixture(f => {
    const before = f.refs(), result = f.run("B", [], true);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD B");
    expect(result.stdout).toContain('Not claimed yet. To take it: node scripts/next-task.mjs --claim "<your model name>" --task B');
    expect(f.refs()).toBe(before);
  }));

  it("claims B although A is first, leaving A unclaimed", () => withFixture(f => {
    const result = f.run();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD B");
    expect(f.git("log", "-1", "--format=%s", "origin/agent/queue/b")).toBe(`Claim B: ${ME}`);
    expect(f.refs()).not.toContain("refs/heads/agent/queue/a");
  }));

  it("D-399: an owner row with a packet is claimed to build ahead, on its own branch, never landed", () => withFixture(f => {
    const result = f.run("B");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD B");
    expect(result.stdout).toContain("BUILD AHEAD OF A HOLD (D-399)");
    expect(result.stdout).toContain("never land it");
    expect(f.git("log", "-1", "--format=%s", "origin/agent/queue/b")).toBe(`Claim B: ${ME}`);
  }, { status: "owner" }));

  it.each([
    { extra: { status: "owner", packet: null }, id: "B", args: [], reason: "waits for the owner" },
    { extra: { status: "done" }, id: "B", args: [], reason: "done" },
    { extra: {}, id: "MISSING", args: [], reason: "no task MISSING" },
    { extra: {}, id: "B", args: ["--avoid", "B"], reason: "you asked to avoid it" },
  ])("refuses $reason without writing a marker", ({ extra, id, args, reason }) => withFixture(f => {
    const before = f.refs(), result = f.run(id, args);
    expect(result.status, result.stdout + result.stderr).toBe(6);
    expect(result.stdout).toContain(reason);
    expect(f.refs()).toBe(before);
  }, extra));

  it("does not claim fix-main as a side effect of refusing B", () => withFixture(f => {
    const before = f.refs(), result = f.run();
    expect(result.status, result.stdout + result.stderr).toBe(6);
    expect(result.stdout).toContain("main is red");
    expect(f.refs()).toBe(before);
  }, {}, true));

  it("rechecks B after losing its claim race and never claims A", () => withFixture(f => {
    const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    const rivalSha = f.git("commit-tree", "origin/main^{tree}", "-p", "origin/main", "-m", "Claim B: Codex · rival");
    const markerPath = path.join(f.dir, "raced");
    const result = f.run("B", [], false, { realGit, rivalSha, markerPath });
    expect(result.status, result.stdout + result.stderr).toBe(6);
    expect(result.stderr).toContain("another agent pushed first");
    expect(result.stdout).toContain("in progress by Codex · rival");
    expect(f.refs()).not.toContain("refs/heads/agent/queue/a");
    expect(f.git("log", "-1", "--format=%s", "origin/agent/queue/b")).toBe("Claim B: Codex · rival");
  }), 30_000);
});

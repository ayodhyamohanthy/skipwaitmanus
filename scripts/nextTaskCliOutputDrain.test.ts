// @vitest-environment node
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDecisionRegister, pickNextTask, statusBoard } from "./nextTaskCore.mjs";
import { renderBoardSummary, renderPick } from "./nextTaskText.mjs";

const CLI = fileURLToPath(new URL("./next-task.mjs", import.meta.url));
const WHO = "Qoder · output-drain-test";
const BRANCH = "agent/queue/output-drain";
type Mode = "green" | "wait" | "stop" | "late-error";
type Status = "todo" | "owner" | "done";
interface Task {
  id: string; title: string; row: string; packet: string; tier: number; lane: string; branch: string;
  status: Status; dependsOn: string[]; syncedTo: string; owns: string[]; epic: string;
}
interface Result { status: number | null; signal: NodeJS.Signals | null; stdout: Buffer; stderr: Buffer; }
interface Fixture {
  dir: string; work: string; mock: string; head: string; tasks: Task[]; register: ReturnType<typeof parseDecisionRegister>;
  git: (...args: string[]) => string; refs: () => string; env: (mode?: Mode) => NodeJS.ProcessEnv;
  runFile: (args?: string[], mode?: Mode) => Result;
  runPipe: (args: string[], mode: Mode) => Promise<Result>;
}
function fixture(status: Status = "todo"): Fixture {
  const dir = mkdtempSync(path.join(os.tmpdir(), "picker-output-drain-"));
  const work = path.join(dir, "work"), remote = path.join(dir, "origin.git"), mock = path.join(dir, "mock.mjs");
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  const gitEnv = { ...process.env, GIT_AUTHOR_DATE: "2026-11-24T00:00:00Z", GIT_COMMITTER_DATE: "2026-11-24T00:00:00Z" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: "pipe", env: gitEnv }).trim();
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe", env: gitEnv });
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("remote", "add", "origin", remote);
  const tasks: Task[] = [{
    id: "A", title: "Output drain fixture", row: "A", packet: "docs/plans/test.md", tier: 2, lane: "picker-output",
    branch: BRANCH, status, dependsOn: [], syncedTo: "D-001", owns: ["scripts/next-task.mjs"], epic: `OUTPUT-${"x".repeat(70000)}`,
  }];
  const registerRaw = [
    "# Decisions", "| ID | Date | Decision | Evidence | Notes | Status |", "|---|---|---|---|---|---|",
    "| D-001 | 2026-11-23 | Fixture decision | fixture | Affects tasks: none. | adopted |", "",
  ].join("\n");
  writeFileSync(path.join(work, "docs/plans/test.md"), "# Fixture\n");
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: "fixture/repo", tasks }));
  writeFileSync(path.join(work, "docs/DECISIONS.md"), registerRaw);
  git("add", "docs");
  git("commit", "-m", "fixture");
  git("push", "-q", "-u", "origin", "main");
  const head = git("rev-parse", "HEAD");
  writeFileSync(mock, `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const realSpawn = childProcess.spawnSync;
if (process.env.FIXTURE_MODE === 'late-error') {
  childProcess.spawnSync = (command, args, options) => {
    if (globalThis.__boardWritten && command === 'git' && args[0] === 'rev-parse' && args[1] === 'origin/main') {
      throw Error('fixture late failure after board');
    }
    return realSpawn(command, args, options);
  };
  syncBuiltinESMExports();
}
const realWrite = process.stdout.write.bind(process.stdout);
let announced = false, bytes = 0;
process.stdout.write = (chunk, ...args) => {
  const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
  bytes += Buffer.byteLength(text);
  const hit = bytes > 65536;
  if (!announced && hit) {
    announced = true;
    globalThis.__boardWritten = true;
    process.send?.('capture');
  }
  return realWrite(chunk, ...args);
};
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const textResponse = body => ({ ok: true, status: 200, text: async () => body });
const head = process.env.FIXTURE_HEAD;
const at = '2026-11-24T00:00:00.000Z';
const run = { id: 1, head_sha: head, head_branch: 'main', status: 'completed', conclusion: 'success', created_at: at, updated_at: at, html_url: 'https://example.test/run/1' };
globalThis.fetch = async (input, options = {}) => {
  if ((options.method || 'GET') !== 'GET') throw Error('fixture forbids network writes');
  const url = String(input);
  if (url === 'https://skipwait.me/api/health/jobs') return textResponse(JSON.stringify({ ok: true }));
  if (url === 'https://skipwait.me/api/health') return textResponse(JSON.stringify({ commitSha: head }));
  if (url === 'https://skipwait.me/') return textResponse('<meta name="git-commit" content="' + head + '">');
  if (url.includes('/actions/workflows/ci.yml/runs?branch=main')) {
    if (process.env.FIXTURE_MODE === 'stop') return response({ message: 'fixture' }, 500);
    if (process.env.FIXTURE_MODE === 'wait') return response({ workflow_runs: [
      { ...run, id: 2, status: 'in_progress', conclusion: null }, { ...run, conclusion: 'failure' },
    ] });
    return response({ workflow_runs: [run] });
  }
  if (url.includes('/actions/workflows/deploy-api.yml/runs') || url.includes('/actions/workflows/deploy-pages.yml/runs')) return response({ workflow_runs: [] });
  if (url.includes('/pulls?state=open') || url.includes('/pulls?state=closed')) return response([]);
  if (url.includes('/issues?state=open')) return response([]);
  if (url.includes('/git/ref/tags/api-runtime')) return response({ object: { type: 'commit', sha: head } });
  if (url.includes('/status?per_page=100')) return response({ sha: head, statuses: [{ context: 'release/verified', state: 'success', created_at: at, updated_at: at }] });
  if (url.includes('/commits/') && url.endsWith('/pulls?per_page=100')) return response([]);
  throw Error('unexpected fixture fetch: ' + url);
};
`);
  let capture = 0;
  const env = (mode: Mode = "green"): NodeJS.ProcessEnv => ({
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GH_TOKEN: "fixture-only",
    NEXT_TASK_LIST_REF: "origin/main", NODE_USE_ENV_PROXY: "1", SKIPWAIT_AUTO_SYNC: "off", SKIPWAIT_LEGACY_REVIEW_RULES: "off",
    FIXTURE_HEAD: head, FIXTURE_MODE: mode,
  });
  const runFile = (args: string[] = [], mode: Mode = "green"): Result => {
    const file = path.join(dir, `capture-${++capture}.out`), fd = openSync(file, "w");
    try {
      const result = spawnSync(process.execPath, ["--import", mock, CLI, ...args], { cwd: work, env: env(mode), stdio: ["ignore", fd, "pipe"], timeout: 15_000, killSignal: "SIGKILL" });
      return { status: result.status, signal: result.signal, stdout: readFileSync(file), stderr: Buffer.from(result.stderr ?? []) };
    } finally { closeSync(fd); }
  };
  const runPipe = (args: string[], mode: Mode): Promise<Result> => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", mock, CLI, ...args], {
      cwd: work, env: env(mode), stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const stdout = child.stdout, stderr = child.stderr;
    if (!stdout || !stderr) { child.kill(); reject(new Error("fixture pipes unavailable")); return; }
    const out: Buffer[] = [], err: Buffer[] = [];
    let resumed = false, settled = false, resumeTimer: NodeJS.Timeout | undefined;
    const drain = () => {
      if (!resumed) return;
      let chunk: Buffer | string | null;
      while ((chunk = stdout.read()) !== null) out.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (resumeTimer) clearTimeout(resumeTimer);
      done();
    };
    stdout.on("readable", drain);
    stderr.on("data", chunk => err.push(Buffer.from(chunk)));
    const watchdog = setTimeout(() => finish(() => { child.kill("SIGKILL"); reject(new Error("fixture pipe did not drain within 15s")); }), 15_000);
    child.on("message", message => {
      if (message === "capture") resumeTimer = setTimeout(() => { resumed = true; drain(); stdout.resume(); }, 100);
    });
    child.on("error", error => finish(() => reject(error)));
    child.on("close", (status, signal) => finish(() => {
      resumed = true; drain();
      resolve({ status, signal, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    }));
  });
  return { dir, work, mock, head, tasks, register: parseDecisionRegister(registerRaw), git, refs: () => git("ls-remote", "--heads", "origin"), env, runFile, runPipe };
}

async function inFixture(status: Status, test: (f: Fixture) => Promise<void> | void) {
  const f = fixture(status);
  try { await test(f); } finally { rmSync(f.dir, { recursive: true, force: true }); }
}
function expectedReadOnly(f: Fixture, mainCi: { state: string }) {
  const now = Date.now();
  const common = { tasks: f.tasks, branches: new Map(), openPrs: new Map(), mergedHeads: new Map(), reports: [], now, register: f.register };
  const board = statusBoard(common);
  const pick = pickNextTask({ ...common, mainCi, claimant: null, avoid: new Set() });
  return Buffer.from(`${renderBoardSummary(board)}\n${renderPick(pick, { who: "<your session name>", date: new Date().toLocaleDateString("en-CA"), claimed: false, register: f.register })}\n`);
}
function expectedBoard(f: Fixture) {
  return renderBoardSummary(statusBoard({ tasks: f.tasks, branches: new Map(), openPrs: new Map(), mergedHeads: new Map(), reports: [], now: Date.now(), register: f.register }));
}
describe("actual picker CLI output drain", () => {
  it("drains exact >64KiB WAIT output to a file and a delayed pipe without remote writes", async () => {
    await inFixture("owner", async f => {
      const before = f.refs(), expected = expectedReadOnly(f, { state: "running-after-red" });
      const file = f.runFile([], "wait");
      expect(file.status, file.stderr.toString()).toBe(4);
      expect(file.stderr.length).toBe(0);
      expect(file.stdout.equals(expected), "regular-file bytes differ").toBe(true);
      const pipe = await f.runPipe([], "wait");
      expect(pipe.status, pipe.stderr.toString()).toBe(4);
      expect(pipe.stderr.length).toBe(0);
      expect(pipe.stdout.length).toBeGreaterThan(64 * 1024);
      expect(pipe.stdout.equals(expected), "delayed-pipe bytes differ").toBe(true);
      expect(pipe.stdout.toString()).toContain("NEXT: WAIT");
      expect(f.refs()).toBe(before);
    });
  }, 30_000);

  it("drains exact STOP output and preserves the real GitHub error on stderr", async () => {
    await inFixture("todo", async f => {
      const before = f.refs(), expected = expectedReadOnly(f, { state: "unknown" });
      const stderr = "next-task: GitHub /actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10 answered 500\n";
      const file = f.runFile([], "stop");
      expect(file.status).toBe(2);
      expect(file.stderr.toString()).toBe(stderr);
      expect(file.stdout.equals(expected), "STOP file bytes differ").toBe(true);
      const pipe = await f.runPipe([], "stop");
      expect(pipe.status).toBe(2);
      expect(pipe.stderr.toString()).toBe(stderr);
      expect(pipe.stdout.length).toBeGreaterThan(64 * 1024);
      expect(pipe.stdout.equals(expected), "STOP pipe bytes differ").toBe(true);
      expect(pipe.stdout.toString()).toContain("NEXT: STOP");
      expect(f.refs()).toBe(before);
    });
  }, 30_000);

  it("preserves SYNC 3 after a large board and writes no marker", async () => {
    await inFixture("todo", async f => {
      const marker = f.git("commit-tree", "origin/main^{tree}", "-p", "origin/main", "-m", `Claim A: ${WHO}`);
      f.git("push", "-q", "origin", `${marker}:refs/heads/${BRANCH}`);
      f.git("fetch", "-q", "origin", `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`);
      f.git("checkout", "-q", "-b", BRANCH, `origin/${BRANCH}`);
      f.git("commit", "--allow-empty", "-m", "local ahead");
      f.git("checkout", "-q", "main");
      const before = f.refs(), top = f.git("rev-parse", "--show-toplevel"), result = await f.runPipe(["--claim", WHO, "--task", "A"], "green");
      expect(result.status, result.stderr.toString()).toBe(3);
      expect(result.stderr.length).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(64 * 1024);
      expect(result.stdout.toString()).toContain(`- MUST PUSH: ${BRANCH} has 1 commit not on origin: git -C ${top} push origin ${BRANCH}`);
      expect(result.stdout.toString().trimEnd().endsWith("Nothing new was claimed.")).toBe(true);
      expect(f.refs()).toBe(before);
    });
  }, 30_000);

  it("drains the complete large board before a late claim error", async () => {
    await inFixture("todo", async f => {
      const before = f.refs(), result = await f.runPipe(["--claim", WHO, "--task", "A"], "late-error");
      expect(result.status).toBe(1);
      expect(result.stderr.toString()).toContain("fixture late failure after board");
      expect(result.stdout.length).toBeGreaterThan(64 * 1024);
      expect(result.stdout.toString()).toBe(`auto-land: no green task pull request waiting\n${expectedBoard(f)}\n`);
      expect(result.stdout.toString()).not.toContain("NEXT:");
      expect(f.refs()).toBe(before);
    });
  }, 30_000);

  it("retains exit 0 for a claim, 5 for nothing to pick, and 6 for an ineligible request", async () => {
    await inFixture("todo", async f => {
      const claimed = f.runFile(["--claim", WHO]);
      expect(claimed.status, claimed.stderr.toString()).toBe(0);
      expect(claimed.stdout.length).toBeGreaterThan(64 * 1024);
      expect(claimed.stdout.toString()).toContain("NEXT: BUILD A");
      expect(f.refs()).toContain(`refs/heads/${BRANCH}`);
      expect(f.git("log", "-1", "--format=%s", `origin/${BRANCH}`)).toBe(`Claim A: ${WHO}`);
    });
    await inFixture("done", async f => {
      const before = f.refs(), none = f.runFile();
      expect(none.status, none.stderr.toString()).toBe(5);
      expect(none.stdout.toString()).toContain("NEXT: NOTHING TO PICK");
      expect(f.refs()).toBe(before);
    });
    await inFixture("todo", async f => {
      const before = f.refs(), refused = await f.runPipe(["--task", "MISSING"], "green");
      expect(refused.status, refused.stderr.toString()).toBe(6);
      expect(refused.stdout.length).toBeGreaterThan(64 * 1024);
      expect(refused.stdout.toString()).toContain("NEXT: NOT ELIGIBLE — MISSING");
      expect(f.refs()).toBe(before);
    });
  }, 45_000);

  it("keeps invalid task-list refs on STOP 2 after moving validation into main", async () => {
    await inFixture("done", async f => {
      const before = f.refs();
      const result = spawnSync(process.execPath, ["--import", f.mock, CLI], {
        cwd: f.work, encoding: "utf8", env: { ...f.env(), NEXT_TASK_LIST_REF: "origin/bad..ref" }, timeout: 15_000, killSignal: "SIGKILL",
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("next-task: STOP: invalid task-list ref\n");
      expect(f.refs()).toBe(before);
    });
  }, 30_000);

  it("fails truthfully when the stdout pipe is closed", async () => {
    await inFixture("done", async f => {
      const before = f.refs();
      const result = await new Promise<Result>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", f.mock, CLI], {
          cwd: f.work, env: f.env(), stdio: ["ignore", "pipe", "pipe"],
        });
        const stderr: Buffer[] = [];
        const watchdog = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("closed stdout pipe did not settle within 15s"));
        }, 15_000);
        child.stdout.destroy();
        child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
        child.once("error", error => {
          clearTimeout(watchdog);
          reject(error);
        });
        child.once("close", (status, signal) => {
          clearTimeout(watchdog);
          resolve({ status, stdout: Buffer.alloc(0), stderr: Buffer.concat(stderr), signal });
        });
      });
      expect(result.status).toBe(1);
      expect(result.stderr.toString()).toMatch(/EPIPE|broken pipe|write/i);
      expect(f.refs()).toBe(before);
    });
  }, 30_000);
});

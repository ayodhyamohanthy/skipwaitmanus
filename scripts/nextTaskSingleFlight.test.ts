// @vitest-environment node
// PICKER-single-flight (D-324, D-321 (11)): measured on the owner's Mac, 114 concurrent picker
// processes (oldest 2 h 56 min) drove load average to 624-1006 and two of my own --claim runs took
// 75 and 17 minutes without finishing. `sample` showed the runs inside uv__run_timers -> Function::Call,
// so they were running, not deadlocked: one clone was starved by its own concurrent runs.
//
// Every case below is written so it FAILS without the lock. A first draft passed 4 of 5 without the
// fix because those cases only asserted that a run *eventually* reached NEXT:, which is true either
// way; the fixture now holds a run inside its GitHub reads (`delayMs`) so overlap is deterministic.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("./next-task.mjs", import.meta.url));
const dirs: string[] = [];
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })));

function fixture({ delayMs = 0 } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "single-flight-"));
  dirs.push(dir);
  const work = path.join(dir, "work"), remote = path.join(dir, "origin.git"), mock = path.join(dir, "mock.mjs");
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: "pipe" }).trim();
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("remote", "add", "origin", remote);
  writeFileSync(path.join(work, "docs/plans/test.md"), "# Fixture\n");
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({
    version: 1, repo: "o/r",
    tasks: [{ id: "A", title: "Fixture task", row: "A", packet: "docs/plans/test.md", tier: 2, lane: "a",
      branch: "agent/queue/a", status: "todo", dependsOn: [], syncedTo: "D-001" }],
  }));
  writeFileSync(path.join(work, "docs/DECISIONS.md"), ["# Decisions", "| ID | Date | Decision | Evidence | Notes | Status |",
    "|---|---|---|---|---|---|", "| D-001 | 2026-11-20 | Fixture | e | Affects tasks: none. | adopted |", ""].join("\n"));
  git("add", "docs"); git("commit", "-m", "fixture"); git("push", "-u", "origin", "main");
  writeFileSync(mock, `
const response = body => ({ ok: true, status: 200, json: async () => body });
const sleep = ms => new Promise(r => setTimeout(r, ms));
globalThis.fetch = async input => {
  const url = String(input);
  // Hold the run inside its GitHub reads so two runs provably overlap.
  if (${delayMs} > 0 && url.includes('/actions/workflows/ci.yml/runs')) await sleep(${delayMs});
  if (url.includes('/actions/workflows/ci.yml/runs')) return response({ workflow_runs: [
    { status: 'completed', conclusion: 'success', head_sha: '${git("rev-parse", "HEAD")}', head_branch: 'main', updated_at: '2026-11-24T00:00:00Z', html_url: 'https://example.test/ci' },
  ] });
  if (url.includes('/pulls?state=open')) return response([]);
  if (url.includes('/pulls?state=closed')) return response([]);
  return response({});
};
`);
  const lock = path.join(work, ".git/next-task-run.lock");
  const spawnArgs = ["--import", mock, CLI];
  const env = { ...process.env, GH_TOKEN: "fixture-not-real", NODE_USE_ENV_PROXY: "1" };
  const picker = (args: string[]) => spawnSync(process.execPath, [...spawnArgs, ...args], { cwd: work, encoding: "utf8", env });
  const pickerAsync = (args: string[]) => spawn(process.execPath, [...spawnArgs, ...args], { cwd: work, env });
  const writeLock = (body: unknown) => writeFileSync(lock, JSON.stringify(body));
  return { dir, work, lock, picker, pickerAsync, writeLock, git };
}

const alivePid = () => process.pid;
const deadPid = () => spawnSync(process.execPath, ["-e", "0"]).pid ?? 999_999;

/** Runs a picker to completion, with a hook called while it is still running. */
function running(child: ReturnType<typeof spawn>, during?: () => void) {
  return new Promise<{ code: number | null; out: string }>(resolve => {
    let out = "";
    child.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { out += d.toString(); });
    const timer = during ? setTimeout(during, 1500) : null;
    child.on("close", code => { if (timer) clearTimeout(timer); resolve({ code, out }); });
  });
}

/** Polls for the lock while a run is alive; resolves with its body, or null if it never appears. */
async function lockDuringRun(file: string, isAlive: () => boolean, accept: (body: { pid?: number }) => boolean = () => true) {
  for (let i = 0; i < 200; i += 1) {
    try {
      const body = JSON.parse(readFileSync(file, "utf8"));
      if (accept(body)) return body;
    } catch { /* not written yet */ }
    if (!isAlive()) break;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

describe("one picker run per clone", () => {
  it("refuses a live lock: exit 4, WAIT copy, no marker pushed", () => {
    const f = fixture();
    f.writeLock({ pid: alivePid(), startedAt: new Date().toISOString() });
    const res = f.picker(["--as", "Fixture · refs"]);
    const out = `${res.stdout}\n${res.stderr}`;
    expect(res.status).toBe(4);
    expect(out).toContain("another picker run is in progress");
    expect(out).toContain("NEXT: WAIT");
    expect(out).not.toMatch(/^NEXT: (BUILD|REVIEW|LAND|CONTINUE|FIX|MAKE GREEN|RESYNC|UNBLOCK|CEO)/m);
    const refs = execFileSync("git", ["--git-dir", path.join(f.dir, "origin.git"), "for-each-ref", "--format=%(refname)"], { encoding: "utf8" });
    expect(refs).not.toContain("agent/queue/a");
  }, 120_000);

  it("holds the lock for its own run and removes it on exit", async () => {
    const f = fixture({ delayMs: 8000 });
    const child = f.pickerAsync(["--as", "Fixture · holder"]);
    let alive = true;
    const seenPromise = lockDuringRun(f.lock, () => alive);
    const res = await running(child);
    alive = false;
    const seen = await seenPromise;
    expect(res.out).toContain("NEXT:");
    expect(seen).not.toBeNull();
    expect(Number(seen?.pid)).toBeGreaterThan(0);
    expect(existsSync(f.lock)).toBe(false);
  }, 120_000);

  it("takes over a dead process's lock and records its own ownership", async () => {
    const f = fixture({ delayMs: 8000 });
    const dead = deadPid();
    f.writeLock({ pid: dead, startedAt: new Date().toISOString() });
    const child = f.pickerAsync(["--as", "Fixture · taker"]);
    let alive = true;
    // Wait for the taker's own record, skipping the dead owner's stale one.
    const seenPromise = lockDuringRun(f.lock, () => alive, body => Number(body?.pid) !== dead);
    const res = await running(child);
    alive = false;
    const seen = await seenPromise;
    expect(res.out).not.toContain("another picker run is in progress");
    expect(seen).not.toBeNull();
    // The taker replaced the dead owner's record with its own pid.
    expect(Number(seen?.pid)).not.toBe(dead);
    expect(Number(seen?.pid)).toBeGreaterThan(0);
  }, 120_000);

  it("refuses a fresh lock but takes over one past the takeover age", () => {
    const f = fixture();
    f.writeLock({ pid: alivePid(), startedAt: new Date().toISOString() });
    expect(f.picker(["--as", "Fixture · refs"]).status).toBe(4);
    f.writeLock({ pid: alivePid(), startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    const old = f.picker(["--as", "Fixture · refs"]);
    expect(`${old.stdout}\n${old.stderr}`).toContain("NEXT:");
    expect(old.status).not.toBe(4);
  }, 180_000);

  it("lets exactly one of two overlapping runs proceed and makes the other wait", async () => {
    const f = fixture({ delayMs: 8000 });
    const results = await Promise.all([
      running(f.pickerAsync(["--as", "Fixture · one"])),
      // Start the second only once the first certainly holds the lock.
      new Promise<{ code: number | null; out: string }>(resolve => setTimeout(() => {
        running(f.pickerAsync(["--as", "Fixture · two"])).then(resolve);
      }, 1500)),
    ]);
    const waited = results.filter(r => r.code === 4 && r.out.includes("another picker run is in progress"));
    const proceeded = results.filter(r => r.code !== 4 && /^NEXT: (BUILD|REVIEW|LAND|CONTINUE)/m.test(r.out));
    expect(waited).toHaveLength(1);
    expect(proceeded).toHaveLength(1);
  }, 180_000);
});

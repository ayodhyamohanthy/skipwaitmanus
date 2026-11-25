// @vitest-environment node
// AGENT-LOOP-supervisor (D-402): a turn-capped agent restarts itself. The pure rules first (next action from the
// run history, how the prompt reaches the command), then the script as a process against a throwaway git
// repository with a fake agent, so every run, log line, stop and clean working tree is proven without a real agent.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKOFF_AFTER, BACKOFF_MS, FAST_RUN_MS, STOP_AFTER, buildArgv, fastStreak, logLine, nextAction, parseArgs, usage,
} from "./agent-loop.mjs";

const root = path.resolve(__dirname, "..");
const SCRIPT = path.join(root, "scripts/agent-loop.mjs");
const fast = (exitCode = 0) => ({ exitCode, ms: 5_000 });
const long = (exitCode = 0) => ({ exitCode, ms: 20 * 60_000 });
const runs = (n: number, make = fast) => Array.from({ length: n }, () => make());
const opts = { stopRequested: false, maxRuns: null };

describe("nextAction", () => {
  it("runs first, and runs again after a normal exit of any code", () => {
    expect(nextAction([], opts)).toEqual({ action: "run" });
    expect(nextAction([long(0)], opts)).toEqual({ action: "run" });
    expect(nextAction([long(1), fast(0), fast(2)], opts)).toEqual({ action: "run" });
  });
  it("waits 5 minutes after 3 fast runs in a row, and keeps waiting while the streak lasts", () => {
    expect(FAST_RUN_MS).toBe(60_000);
    expect(BACKOFF_MS).toBe(5 * 60_000);
    expect(BACKOFF_AFTER).toBe(3);
    expect(nextAction(runs(3), opts)).toEqual({ action: "wait", ms: 300_000 });
    expect(nextAction(runs(9), opts)).toEqual({ action: "wait", ms: 300_000 });
  });
  it("stops after 10 fast runs in a row and says why", () => {
    expect(STOP_AFTER).toBe(10);
    const next = nextAction(runs(10), opts);
    expect(next).toMatchObject({ action: "stop", reason: expect.stringContaining("10 runs in a row") });
  });
  it("treats a run of 60 s or more as resetting the fast count", () => {
    expect(nextAction([...runs(9), long()], opts)).toEqual({ action: "run" });
    expect(nextAction([...runs(9), long(), ...runs(2)], opts)).toEqual({ action: "run" });
    expect(nextAction([...runs(9), { exitCode: 0, ms: 60_000 }], opts)).toEqual({ action: "run" });
    expect(fastStreak([...runs(4), long(), ...runs(3)], FAST_RUN_MS)).toBe(3);
  });
  it("stops when the stop file exists, before anything else", () => {
    expect(nextAction([], { ...opts, stopRequested: true })).toMatchObject({ action: "stop", reason: expect.stringContaining("stop file") });
    expect(nextAction(runs(3), { ...opts, stopRequested: true }).action).toBe("stop");
  });
  it("stops after --max-runs", () => {
    expect(nextAction(runs(1, long), { ...opts, maxRuns: 2 })).toEqual({ action: "run" });
    expect(nextAction(runs(2, long), { ...opts, maxRuns: 2 })).toMatchObject({ action: "stop", reason: expect.stringContaining("2 runs") });
  });
  it("takes overridden thresholds", () => {
    expect(nextAction(runs(3), { ...opts, backoffMs: 10 })).toEqual({ action: "wait", ms: 10 });
    expect(nextAction(runs(3), { ...opts, fastMs: 1_000 })).toEqual({ action: "run" });
  });
});

describe("buildArgv", () => {
  it("appends the prompt as the last argument", () => {
    expect(buildArgv(["opencode", "run"], "build")).toEqual(["opencode", "run", "build"]);
  });
  it("puts the prompt in place of a {prompt} placeholder instead", () => {
    expect(buildArgv(["claude", "-p", "{prompt}", "--max-turns", "20"], "build")).toEqual(["claude", "-p", "build", "--max-turns", "20"]);
    expect(buildArgv(["agent", "--message={prompt}"], "next")).toEqual(["agent", "--message=next"]);
  });
  it("refuses an empty command", () => {
    expect(() => buildArgv([], "build")).toThrow(/command/);
  });
});

describe("parseArgs and usage", () => {
  it("reads options before -- and the command after it", () => {
    expect(parseArgs(["--max-runs", "3", "--prompt", "next", "--", "codex", "exec"])).toEqual({ mode: "loop", prompt: "next", maxRuns: 3, command: ["codex", "exec"] });
    expect(parseArgs(["--", "opencode", "run"])).toEqual({ mode: "loop", prompt: "build", maxRuns: null, command: ["opencode", "run"] });
  });
  it("knows the one-shot modes", () => {
    expect(parseArgs(["--stop"]).mode).toBe("stop");
    expect(parseArgs(["--clear-stop"]).mode).toBe("clear-stop");
    expect(parseArgs(["--help"]).mode).toBe("help");
  });
  it("refuses a bad --max-runs, an unknown option and a missing command", () => {
    expect(() => parseArgs(["--max-runs", "0", "--", "x"])).toThrow(/max-runs/);
    expect(() => parseArgs(["--max-runs", "two", "--", "x"])).toThrow(/max-runs/);
    expect(() => parseArgs(["--bogus", "--", "x"])).toThrow(/unknown/);
    expect(() => parseArgs([])).toThrow(/command/);
  });
  it("prints both headless examples and the fresh-conversation note", () => {
    const text = usage();
    expect(text).toContain("node scripts/agent-loop.mjs -- opencode run");
    expect(text).toContain("node scripts/agent-loop.mjs -- codex exec");
    expect(text).toContain("PICKER-short-session");
    expect(text).toMatch(/fresh conversation/);
  });
  it("formats one log line: time, run number, exit code, seconds", () => {
    expect(logLine({ time: new Date("2026-11-25T10:00:00Z"), run: 4, exit: 1, ms: 12_340 })).toBe("2026-11-25T10:00:00.000Z run=4 exit=1 seconds=12.3");
  });
});

describe("agent-loop.mjs as a process", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const repo = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agent-loop-"));
    dirs.push(dir);
    execFileSync("git", ["init", "-q", dir]);
    return dir;
  };
  const gitDir = (dir: string) => path.resolve(dir, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: dir, encoding: "utf8" }).trim());
  const loop = (dir: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env }, timeout: 60_000 });
  const fakeAgent = [process.execPath, "-e", "console.log('hi ' + JSON.stringify(process.argv.slice(1)))"];

  it("runs the agent twice with the prompt, logs both runs in the git dir and leaves the tree clean", () => {
    const dir = repo();
    const result = loop(dir, ["--max-runs", "2", "--", ...fakeAgent]);
    expect(result.status).toBe(0);
    expect(result.stdout.match(/hi \["build"\]/g)).toHaveLength(2);
    const lines = readFileSync(path.join(gitDir(dir), "skipwait-agent-loop.log"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\S+Z run=1 exit=0 seconds=\d+(\.\d)?$/);
    expect(lines[1]).toMatch(/ run=2 exit=0 /);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" })).toBe("");
  });

  it("--stop leaves a stop file, and the next loop exits without starting the agent until --clear-stop", () => {
    const dir = repo();
    expect(loop(dir, ["--stop"]).status).toBe(0);
    const stopFile = path.join(gitDir(dir), "skipwait-agent-loop.stop");
    expect(existsSync(stopFile)).toBe(true);
    const stopped = loop(dir, ["--max-runs", "2", "--", ...fakeAgent]);
    expect(stopped.status).toBe(0);
    expect(stopped.stdout).not.toContain("hi ");
    expect(stopped.stderr).toContain("stop file");
    expect(loop(dir, ["--clear-stop"]).status).toBe(0);
    expect(existsSync(stopFile)).toBe(false);
    expect(loop(dir, ["--max-runs", "1", "--", ...fakeAgent]).stdout).toContain("hi ");
  });

  it("substitutes {prompt} and stops a fast-exit streak with a logged reason", () => {
    const dir = repo();
    const agent = [process.execPath, "-e", "console.log('arg=' + process.argv[1])", "{prompt}"];
    const result = loop(dir, ["--prompt", "next", "--", ...agent], { SKIPWAIT_AGENT_LOOP_BACKOFF_MS: "1" });
    expect(result.status).toBe(1);
    expect(result.stdout.match(/arg=next/g)).toHaveLength(10);
    const log = readFileSync(path.join(gitDir(dir), "skipwait-agent-loop.log"), "utf8");
    expect(log.match(/ run=\d+ /g)).toHaveLength(10);
    expect(log).toMatch(/stop: .*10 runs in a row/);
  });

  it("prints usage on --help and refuses to run outside a git clone", () => {
    expect(loop(root, ["--help"]).stdout).toContain("codex exec");
    const plain = mkdtempSync(path.join(os.tmpdir(), "agent-loop-plain-"));
    dirs.push(plain);
    const result = spawnSync(process.execPath, [SCRIPT, "--max-runs", "1", "--", ...fakeAgent], { cwd: plain, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: os.tmpdir() } });
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("hi ");
  });
});

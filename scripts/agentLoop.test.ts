// @vitest-environment node
// AGENT-LOOP-supervisor (D-402): a turn-capped agent restarts itself. The pure rules first (next action from the
// run history, how the prompt reaches the command), then the script as a process against a throwaway git
// repository with a fake agent, so every run, log line, stop and clean working tree is proven without a real agent.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKOFF_AFTER, BACKOFF_MS, FAST_RUN_MS, SESSION_ENV, STOP_AFTER, buildArgv, chooseLoopName, fastStreak, logLine, mintName, nextAction,
  parseArgs, parseLoopSessions, releaseLoopName, usage, quoteWindowsArg, windowsCommandLine,
} from "./agent-loop.mjs";
import { sessionName } from "./nextTaskCore.mjs";

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

// CodeQL #123 (incomplete string escaping): Windows quoting follows the Microsoft C runtime's argv rules.
describe("windows command-line quoting", () => {
  it("leaves a plain argument alone and quotes an empty one", () => {
    expect(quoteWindowsArg("opencode")).toBe("opencode");
    expect(quoteWindowsArg("")).toBe('""');
  });
  it("doubles backslashes before the closing quote, so a trailing backslash cannot swallow it", () => {
    expect(quoteWindowsArg("C:\\work dir\\")).toBe('"C:\\work dir\\\\"');
  });
  it("doubles backslashes before an embedded quote and escapes the quote", () => {
    expect(quoteWindowsArg('say \\"hi"')).toBe('"say \\\\\\"hi\\""');
  });
  it("keeps backslashes that are not before a quote literal", () => {
    expect(quoteWindowsArg("a\\b c")).toBe('"a\\b c"');
  });
  it("joins quoted arguments with single spaces", () => {
    expect(windowsCommandLine(["opencode", "run", "build now"])).toBe('opencode run "build now"');
  });
});

// PICKER-durable-session (D-415 (4)(a)): `--session "<model>"` gives the loop one session name for its whole life,
// saved beside the log and passed to every run in SKIPWAIT_SESSION_NAME, so a fresh conversation's bare claim
// continues the loop's own claim instead of minting a tag (and orphaning the old claim for the 2-hour lease).
describe("durable session name: the pure rules", () => {
  const where = { cwd: "/clone", command: ["codex", "exec"], model: "GPT-6.1 Sol", pid: 4242, at: "2026-11-28T10:00:00.000Z" };
  const tags = (...list: string[]) => { const left = [...list]; return () => left.shift() ?? "zz99"; };
  const nobodyAlive = () => false;
  const saved = (name: string, pid: number | null = null, extra: Record<string, unknown> = {}) =>
    ({ cwd: "/clone", command: ["codex", "exec"], name, pid, at: "2026-11-27T10:00:00.000Z", ...extra });

  it("parseArgs takes --session <model> and refuses a tagged, empty or missing one", () => {
    expect(parseArgs(["--session", "GPT-6.1 Sol", "--", "codex", "exec"])).toEqual({ mode: "loop", prompt: "build", maxRuns: null, command: ["codex", "exec"], session: "GPT-6.1 Sol" });
    expect(() => parseArgs(["--session", "GPT-6.1 Sol · ab12", "--", "x"])).toThrow(/model name only/);
    expect(() => parseArgs(["--session", "  ", "--", "x"])).toThrow(/--session/);
    expect(() => parseArgs(["--session", "GPT\n6.1", "--", "x"])).toThrow(/--session/);
    expect(() => parseArgs(["--session"])).toThrow(/--session needs/);
  });
  it("mints exactly the name the picker would mint for that model and tag", () => {
    const long = "A model name that is long enough to be cut before its tag fits";
    for (const model of ["GPT-6.1 Sol", "Claude Code", long]) expect(mintName(model, "ab12")).toBe(sessionName(model, "ab12"));
    expect(mintName(long, "ab12").length).toBeLessThanOrEqual(60);
  });
  it("a first loop mints a fresh name and saves it with its pid", () => {
    const out = chooseLoopName([], { ...where, newTag: tags("ab12"), isAlive: nobodyAlive });
    expect(out.name).toBe("GPT-6.1 Sol · ab12");
    expect(out.entries).toEqual([{ cwd: "/clone", command: ["codex", "exec"], name: "GPT-6.1 Sol · ab12", pid: 4242, at: where.at }]);
  });
  it("a restarted loop reuses its saved name once the loop that held it has ended", () => {
    const out = chooseLoopName([saved("GPT-6.1 Sol · ab12")], { ...where, newTag: tags("cd34"), isAlive: nobodyAlive });
    expect(out.name).toBe("GPT-6.1 Sol · ab12");
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ name: "GPT-6.1 Sol · ab12", pid: 4242 });
    // A crashed loop leaves its pid behind; a pid that no longer runs is free too.
    expect(chooseLoopName([saved("GPT-6.1 Sol · ab12", 999)], { ...where, newTag: tags("cd34"), isAlive: nobodyAlive }).name).toBe("GPT-6.1 Sol · ab12");
  });
  it("two live loops on one clone with the same command never share a name", () => {
    const out = chooseLoopName([saved("GPT-6.1 Sol · ab12", 777)], { ...where, newTag: tags("cd34"), isAlive: (pid: number) => pid === 777 });
    expect(out.name).toBe("GPT-6.1 Sol · cd34");
    expect(out.entries.map((e: { name: string }) => e.name)).toEqual(["GPT-6.1 Sol · ab12", "GPT-6.1 Sol · cd34"]);
    // A drawn tag already in the file is drawn again.
    expect(chooseLoopName([saved("GPT-6.1 Sol · ab12", 777)], { ...where, newTag: tags("ab12", "ef56"), isAlive: (pid: number) => pid === 777 }).name).toBe("GPT-6.1 Sol · ef56");
  });
  it("another working directory, command or model gets its own name", () => {
    for (const other of [saved("GPT-6.1 Sol · ab12", null, { cwd: "/elsewhere" }), saved("GPT-6.1 Sol · ab12", null, { command: ["opencode", "run"] }), saved("Claude Code · ab12")]) {
      expect(chooseLoopName([other], { ...where, newTag: tags("cd34"), isAlive: nobodyAlive }).name).toBe("GPT-6.1 Sol · cd34");
    }
  });
  it("a malformed saved file or entry gives a fresh name, never a wrong one", () => {
    expect(parseLoopSessions("not json")).toEqual([]);
    expect(parseLoopSessions(JSON.stringify({ version: 1, loops: "x" }))).toEqual([]);
    const text = JSON.stringify({ version: 1, loops: [saved("GPT-6.1 Sol · ab12", null, { pid: "x" }), saved("GPT-6.1 Sol · cd34", null, { command: "codex exec" }), saved("GPT-6.1 Sol · ef56")] });
    expect(parseLoopSessions(text).map((e: { name: string }) => e.name)).toEqual(["GPT-6.1 Sol · ef56"]);
    for (const bad of ["GPT-6.1 Sol", "GPT-6.1 Sol · ", "GPT-6.1 Sol · a b", "GPT-6.1 · ab12", "GPT-6.1 Sol · ab12 · cd"]) {
      expect(chooseLoopName([saved(bad)], { ...where, newTag: tags("cd34"), isAlive: nobodyAlive }).name).toBe("GPT-6.1 Sol · cd34");
    }
  });
  it("releasing clears only this loop's pid", () => {
    const entries = [saved("GPT-6.1 Sol · ab12", 4242), saved("GPT-6.1 Sol · cd34", 777)];
    expect(releaseLoopName(entries, { name: "GPT-6.1 Sol · ab12", pid: 4242 }).map((e: { pid: number | null }) => e.pid)).toEqual([null, 777]);
    expect(releaseLoopName(entries, { name: "GPT-6.1 Sol · ab12", pid: 1 }).map((e: { pid: number | null }) => e.pid)).toEqual([4242, 777]);
  });
  it("the usage names --session and the variable it sets", () => {
    expect(usage()).toContain("--session");
    expect(usage()).toContain(SESSION_ENV);
    expect(SESSION_ENV).toBe("SKIPWAIT_SESSION_NAME");
  });
});

describe("durable session name: agent-loop.mjs as a process", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const repo = () => {
    const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "agent-loop-session-")));
    dirs.push(dir);
    execFileSync("git", ["init", "-q", dir]);
    return dir;
  };
  const gitDir = (dir: string) => path.resolve(dir, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: dir, encoding: "utf8" }).trim());
  // The suite itself may run inside an agent loop: only a test that sets the variable passes one on.
  const env = (extra: Record<string, string> = {}) => {
    const out: Record<string, string | undefined> = { ...process.env, ...extra };
    if (!("SKIPWAIT_SESSION_NAME" in extra)) delete out.SKIPWAIT_SESSION_NAME;
    return out;
  };
  const loop = (dir: string, args: string[], extra: Record<string, string> = {}) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env: env(extra), timeout: 60_000 });
  const showName = [process.execPath, "-e", "console.log('name=' + (process.env.SKIPWAIT_SESSION_NAME ?? '-'))"];
  const namesOf = (stdout: string) => [...stdout.matchAll(/^name=(.*)$/gm)].map(m => m[1]);
  const NAME = /^GPT-6\.1 Sol · [0-9a-f]{4}$/;

  it("each loop keeps its own name for every run and across three restarts of the loop", () => {
    const dir = repo();
    const first = loop(dir, ["--session", "GPT-6.1 Sol", "--max-runs", "3", "--", ...showName]);
    expect(first.status, first.stderr).toBe(0);
    const names = namesOf(first.stdout);
    expect(names).toHaveLength(3);
    expect(names[0]).toMatch(NAME);
    expect(new Set(names).size).toBe(1);
    expect(first.stderr).toContain(`session name "${names[0]}"`);
    for (let restart = 1; restart <= 3; restart++) {
      const again = loop(dir, ["--session", "GPT-6.1 Sol", "--max-runs", "1", "--", ...showName]);
      expect(again.status, again.stderr).toBe(0);
      expect(namesOf(again.stdout)).toEqual([names[0]]);
    }
    const saved = JSON.parse(readFileSync(path.join(gitDir(dir), "skipwait-agent-loop-sessions.json"), "utf8"));
    expect(saved.loops).toEqual([expect.objectContaining({ cwd: dir, command: showName, name: names[0], pid: null })]);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" })).toBe("");
  });

  it("two loops running at once on one clone get different names", async () => {
    const dir = repo();
    // Each run outlives the other loop's start by a wide margin, so both loops are running when each picks its name.
    const slow = [process.execPath, "-e", "setTimeout(() => console.log('name=' + process.env.SKIPWAIT_SESSION_NAME), 3000)"];
    const start = () => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT, "--session", "GPT-6.1 Sol", "--max-runs", "1", "--", ...slow], { cwd: dir, env: env() });
      let out = "";
      child.stdout.on("data", (chunk: Buffer) => { out += String(chunk); });
      child.once("error", reject);
      child.once("exit", code => (code === 0 ? resolve(out) : reject(new Error(`loop exited ${code}`))));
    });
    const [a, b] = await Promise.all([start(), start()]);
    const [nameA, nameB] = [namesOf(a)[0], namesOf(b)[0]];
    expect(nameA).toMatch(NAME);
    expect(nameB).toMatch(NAME);
    expect(nameA).not.toBe(nameB);
  }, 60_000);

  it("a malformed saved name file gives a fresh name, never a wrong one", () => {
    const dir = repo();
    const file = path.join(gitDir(dir), "skipwait-agent-loop-sessions.json");
    writeFileSync(file, "{ not json");
    const one = loop(dir, ["--session", "GPT-6.1 Sol", "--max-runs", "1", "--", ...showName]);
    expect(one.status, one.stderr).toBe(0);
    expect(namesOf(one.stdout)[0]).toMatch(NAME);
    // An entry for this very loop whose name is not a GPT-6.1 Sol name is never handed to it.
    for (const wrong of ["Claude Code · ab12", "GPT-6.1 Sol", "GPT-6.1 Sol · a b"]) {
      writeFileSync(file, JSON.stringify({ version: 1, loops: [{ cwd: dir, command: showName, name: wrong, pid: null, at: "2026-11-27T10:00:00.000Z" }] }));
      const run = loop(dir, ["--session", "GPT-6.1 Sol", "--max-runs", "1", "--", ...showName]);
      expect(run.status, run.stderr).toBe(0);
      const name = namesOf(run.stdout)[0];
      expect(name).toMatch(NAME);
      expect(name).not.toBe(wrong);
    }
  });

  it("without --session the runs get no name, and an inherited one is not passed on", () => {
    const dir = repo();
    const result = loop(dir, ["--max-runs", "1", "--", ...showName], { SKIPWAIT_SESSION_NAME: "GPT-6.1 Sol · ab12" });
    expect(result.status, result.stderr).toBe(0);
    expect(namesOf(result.stdout)).toEqual(["-"]);
    expect(existsSync(path.join(gitDir(dir), "skipwait-agent-loop-sessions.json"))).toBe(false);
  });
});

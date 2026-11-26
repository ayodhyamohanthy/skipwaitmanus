#!/usr/bin/env node
// AGENT-LOOP-supervisor (D-402): an agent on a turn-capped provider restarts itself, with nobody typing /new.
//
//   node scripts/agent-loop.mjs -- opencode run              # run "opencode run build" again each time it exits
//   node scripts/agent-loop.mjs -- codex exec                # the same with Codex
//   node scripts/agent-loop.mjs --prompt next -- claude -p {prompt}   # the prompt goes where {prompt} is
//   node scripts/agent-loop.mjs --max-runs 5 -- opencode run # stop after five runs
//   node scripts/agent-loop.mjs --stop                       # ask a running loop to stop before its next run
//   node scripts/agent-loop.mjs --clear-stop                 # allow loops to run again
//
// Each run is a fresh conversation; the picker resumes the same task under the same session name
// (PICKER-short-session, D-401). The loop never edits the working tree: its log and stop file live in the clone's
// git directory. A run shorter than 60 s is fast: after 3 fast runs in a row it waits 5 minutes before the next,
// after 10 it stops. Exit 0: stopped by --max-runs or the stop file. 1: stopped after a fast-exit streak.
// 2: it could not run. 130: Ctrl+C.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FAST_RUN_MS = 60_000;
export const BACKOFF_AFTER = 3;
export const STOP_AFTER = 10;
export const BACKOFF_MS = 5 * 60_000;
export const DEFAULT_PROMPT = "build";
export const LOG_FILE = "skipwait-agent-loop.log";
export const STOP_FILE = "skipwait-agent-loop.stop";
const PLACEHOLDER = "{prompt}";

class Usage extends Error {}

/** How many of the latest runs in a row were shorter than `fastMs`. */
export function fastStreak(history, fastMs = FAST_RUN_MS) {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i].ms < fastMs; i--) n++;
  return n;
}

/**
 * The next step, from the finished runs ({ exitCode, ms } each, oldest first) and the stop state:
 * { action: "run" } | { action: "wait", ms } | { action: "stop", kind, reason }.
 */
export function nextAction(history, { stopRequested, maxRuns, fastMs = FAST_RUN_MS, backoffMs = BACKOFF_MS }) {
  if (stopRequested) return { action: "stop", kind: "stop-file", reason: `the stop file exists (remove it with --clear-stop)` };
  if (maxRuns !== null && maxRuns !== undefined && history.length >= maxRuns) {
    return { action: "stop", kind: "max-runs", reason: `finished ${maxRuns} runs (--max-runs)` };
  }
  const streak = fastStreak(history, fastMs);
  if (streak >= STOP_AFTER) {
    return { action: "stop", kind: "fast-streak", reason: `the agent exited in under ${Math.round(fastMs / 1000)} s ${streak} runs in a row (no work, or an error loop)` };
  }
  if (streak >= BACKOFF_AFTER) return { action: "wait", ms: backoffMs };
  return { action: "run" };
}

/** The command line for one run: the prompt replaces every {prompt}, or is appended when there is none. */
export function buildArgv(command, prompt) {
  if (!Array.isArray(command) || command.length === 0) throw new Usage("no agent command given (put it after --)");
  if (command.some((a) => a.includes(PLACEHOLDER))) return command.map((a) => a.split(PLACEHOLDER).join(prompt));
  return [...command, prompt];
}

export function parseArgs(argv) {
  const out = { mode: "loop", prompt: DEFAULT_PROMPT, maxRuns: null, command: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { out.command = argv.slice(i + 1); break; }
    if (a === "--help" || a === "-h") out.mode = "help";
    else if (a === "--stop") out.mode = "stop";
    else if (a === "--clear-stop") out.mode = "clear-stop";
    else if (a === "--prompt") {
      if (i + 1 >= argv.length) throw new Usage("--prompt needs a value");
      out.prompt = argv[++i];
    } else if (a === "--max-runs") {
      const v = argv[++i];
      if (!/^[1-9]\d*$/.test(v ?? "")) throw new Usage(`--max-runs needs a whole number of 1 or more, got ${v ?? "nothing"}`);
      out.maxRuns = Number(v);
    } else if (a.startsWith("-")) throw new Usage(`unknown option ${a}`);
    else { out.command = argv.slice(i); break; }
  }
  if (out.mode === "loop" && out.command.length === 0) throw new Usage("no agent command given (put it after --)");
  return out;
}

/** One log line: time, run number, exit code (or signal), seconds. */
export function logLine({ time, run, exit, ms }) {
  return `${time.toISOString()} run=${run} exit=${exit} seconds=${Math.round(ms / 100) / 10}`;
}

export function usage() {
  return [
    "Usage: node scripts/agent-loop.mjs [--prompt <text>] [--max-runs N] -- <agent command and args>",
    "       node scripts/agent-loop.mjs --stop | --clear-stop | --help",
    "",
    "Runs the agent's headless mode, and starts it again each time it exits (a turn cap, a finished task, a crash).",
    `The prompt (default "${DEFAULT_PROMPT}") is appended as the last argument, or put where ${PLACEHOLDER} appears.`,
    "",
    "Examples:",
    "  node scripts/agent-loop.mjs -- opencode run",
    "  node scripts/agent-loop.mjs -- codex exec",
    `  node scripts/agent-loop.mjs --prompt next -- claude -p ${PLACEHOLDER}`,
    "",
    "Each run is a fresh conversation; the picker resumes the same task under the same session name",
    "(PICKER-short-session, D-401). Stop with Ctrl+C, with --stop (checked before each run), or with --max-runs.",
    `A run under ${FAST_RUN_MS / 1000} s is fast: after ${BACKOFF_AFTER} in a row the loop waits ${BACKOFF_MS / 60_000} minutes, after ${STOP_AFTER} it stops.`,
    `Log and stop file: <git common dir>/${LOG_FILE} and <git common dir>/${STOP_FILE}; nothing goes to the working tree.`,
  ].join("\n");
}

/**
 * Windows only: one argument quoted for the Microsoft C runtime's argv rules, so `opencode` finds opencode.cmd.
 * Backslashes are literal except before a double quote or the closing quote: a run of n backslashes there becomes 2n,
 * and a double quote becomes \". Quoting only the quote (CodeQL: incomplete escaping) let an argument ending in "\"
 * swallow its closing quote and corrupt every argument after it.
 */
export function quoteWindowsArg(arg) {
  if (arg !== "" && !/[\s"&|<>^()]/.test(arg)) return arg;
  let out = '"';
  let slashes = 0;
  for (const ch of arg) {
    if (ch === "\\") { slashes += 1; continue; }
    if (ch === '"') { out += "\\".repeat(slashes * 2 + 1) + '"'; slashes = 0; continue; }
    out += "\\".repeat(slashes) + ch;
    slashes = 0;
  }
  return `${out}${"\\".repeat(slashes * 2)}"`;
}

/** Windows only: one command line for cmd.exe. */
export function windowsCommandLine(argv) {
  return argv.map(quoteWindowsArg).join(" ");
}

function commonGitDir(cwd) {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out ? path.resolve(cwd, out) : null;
  } catch { return null; }
}

function envMs(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  if (!/^\d+$/.test(v)) throw new Usage(`${name} must be a whole number of milliseconds, got ${v}`);
  return Number(v);
}

const say = (msg) => process.stderr.write(`[agent-loop] ${msg}\n`);

async function main(argv) {
  let opts, fastMs, backoffMs;
  try {
    opts = parseArgs(argv);
    fastMs = envMs("SKIPWAIT_AGENT_LOOP_FAST_MS", FAST_RUN_MS);
    backoffMs = envMs("SKIPWAIT_AGENT_LOOP_BACKOFF_MS", BACKOFF_MS);
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    say(e.message);
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  if (opts.mode === "help") { process.stdout.write(`${usage()}\n`); return 0; }
  const gitDir = commonGitDir(process.cwd());
  if (!gitDir) { say("run this inside a git clone of the repository (the log and stop file live in its git directory)"); return 2; }
  const stopFile = path.join(gitDir, STOP_FILE), logFile = path.join(gitDir, LOG_FILE);
  if (opts.mode === "stop") {
    writeFileSync(stopFile, `${new Date().toISOString()}\n`);
    say(`stop file written: ${stopFile}. A running loop stops before its next run; --clear-stop allows loops again.`);
    return 0;
  }
  if (opts.mode === "clear-stop") { rmSync(stopFile, { force: true }); say("stop file removed"); return 0; }

  const history = [];
  let child = null, interrupted = false, wake = null;
  const onSignal = (signal) => {
    interrupted = true;
    if (child && child.exitCode === null && child.signalCode === null) child.kill(signal);
    if (wake) wake();
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  for (;;) {
    if (interrupted) { say("interrupted; stopping"); return 130; }
    const next = nextAction(history, { stopRequested: existsSync(stopFile), maxRuns: opts.maxRuns, fastMs, backoffMs });
    if (next.action === "stop") {
      say(`stopping: ${next.reason}`);
      if (next.kind === "fast-streak") { appendFileSync(logFile, `${new Date().toISOString()} stop: ${next.reason}\n`); return 1; }
      return 0;
    }
    if (next.action === "wait") {
      say(`${fastStreak(history, fastMs)} fast runs in a row; waiting ${Math.round(next.ms / 1000)} s before the next run`);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, next.ms);
        wake = () => { clearTimeout(timer); resolve(); };
      });
      wake = null;
      if (interrupted) continue;
      if (existsSync(stopFile)) { say("stopping: the stop file exists (remove it with --clear-stop)"); return 0; }
    }
    const runArgv = buildArgv(opts.command, opts.prompt);
    const run = history.length + 1;
    say(`run ${run}: ${runArgv.join(" ")}`);
    const started = Date.now();
    const ended = await new Promise((resolve) => {
      const win = process.platform === "win32";
      child = win
        ? spawn(windowsCommandLine(runArgv), { stdio: "inherit", shell: true })
        : spawn(runArgv[0], runArgv.slice(1), { stdio: "inherit" });
      child.once("error", (error) => resolve({ error }));
      child.once("exit", (code, signal) => resolve({ exit: code ?? signal ?? "unknown" }));
    });
    child = null;
    if (ended.error) {
      appendFileSync(logFile, `${new Date().toISOString()} stop: run ${run} could not start: ${ended.error.message}\n`);
      say(`the agent command could not start: ${ended.error.message}`);
      return 2;
    }
    const ms = Date.now() - started;
    history.push({ exitCode: ended.exit, ms });
    appendFileSync(logFile, `${logLine({ time: new Date(), run, exit: ended.exit, ms })}\n`);
    say(`run ${run} ended: exit ${ended.exit} after ${Math.round(ms / 100) / 10} s`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    say(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 2;
  });
}

#!/usr/bin/env node
// AGENT-LOOP-supervisor (D-402): an agent on a turn-capped provider restarts itself, with nobody typing /new.
//
//   node scripts/agent-loop.mjs -- opencode run              # run "opencode run build" again each time it exits
//   node scripts/agent-loop.mjs -- codex exec                # the same with Codex
//   node scripts/agent-loop.mjs --prompt next -- claude -p {prompt}   # the prompt goes where {prompt} is
//   node scripts/agent-loop.mjs --max-runs 5 -- opencode run # stop after five runs
//   node scripts/agent-loop.mjs --session "GPT-6.1 Sol" -- codex exec   # every run claims as one name for this loop
//   node scripts/agent-loop.mjs --stop                       # ask a running loop to stop before its next run
//   node scripts/agent-loop.mjs --clear-stop                 # allow loops to run again
//
// Each run is a fresh conversation; the picker resumes the same task under the same session name
// (PICKER-short-session, D-401). With --session "<model>" (the exact model name the agent claims with) the loop picks
// one name, "<model> · <tag>", for its whole life and passes it to every run in SKIPWAIT_SESSION_NAME; the agent's
// bare `--claim "<model>"` then takes that name and continues its own claim at once (PICKER-durable-session,
// D-415 (4)(a)), so many loops of one model on one clone never trade names. The name is saved per working directory
// and command, so a restarted loop keeps it; a name another running loop holds is never reused. Without --session
// each run names itself as D-401 says. The loop never edits the working tree: its log, stop file and saved names live
// in the clone's git directory. A run shorter than 60 s is fast: after 3 fast runs in a row it waits 5 minutes before
// the next, after 10 it stops. Exit 0: stopped by --max-runs or the stop file. 1: stopped after a fast-exit streak.
// 2: it could not run. 130: Ctrl+C.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FAST_RUN_MS = 60_000;
export const BACKOFF_AFTER = 3;
export const STOP_AFTER = 10;
export const BACKOFF_MS = 5 * 60_000;
export const DEFAULT_PROMPT = "build";
export const LOG_FILE = "skipwait-agent-loop.log";
export const STOP_FILE = "skipwait-agent-loop.stop";
export const SESSION_ENV = "SKIPWAIT_SESSION_NAME";
export const SESSIONS_FILE = "skipwait-agent-loop-sessions.json";
const PLACEHOLDER = "{prompt}";
const SESSION_TAG = /^[0-9A-Za-z_-]{1,16}$/;
const MAX_SAVED_LOOPS = 64;
const LOCK_STALE_MS = 10_000;

class Usage extends Error {}

// ---- PICKER-durable-session (D-415 (4)(a)): one session name per loop. ----
// The picker's name rules (sanitizeName and sessionName in nextTaskCore.mjs), kept here so the loop imports nothing
// from the tree its agent edits; agentLoop.test.ts proves both mint the same name.
export const cleanName = raw => String(raw ?? "").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
export const mintName = (model, tag) => `${model.slice(0, 60 - 3 - tag.length).trimEnd()} · ${tag}`;

/** True only when `name` is exactly what the picker mints for `model` and the name's own tag. */
export function isNameOf(name, model) {
  if (typeof name !== "string" || cleanName(name) !== name) return false;
  const at = name.lastIndexOf(" · "), tag = at < 0 ? "" : name.slice(at + 3);
  return SESSION_TAG.test(tag) && name.indexOf(" · ") === at && mintName(model, tag) === name;
}

function sessionModel(value) {
  if (value === undefined || value.startsWith("-")) throw new Usage('--session needs the model name the agent claims with, such as "GPT-6.1 Sol"');
  if (value.includes(" · ")) throw new Usage('--session takes the model name only, such as "GPT-6.1 Sol"; the loop adds and keeps its own tag');
  if (!value || cleanName(value) !== value) throw new Usage(`--session needs a one-line model name of at most 60 characters, got ${JSON.stringify(value)}`);
  return value;
}

const sameArgv = (a, b) => a.length === b.length && a.every((arg, i) => arg === b[i]);
const isLoopEntry = e => Boolean(e) && typeof e === "object" && typeof e.cwd === "string" && Array.isArray(e.command)
  && e.command.every(arg => typeof arg === "string") && typeof e.name === "string" && typeof e.at === "string"
  && (e.pid === null || (Number.isSafeInteger(e.pid) && e.pid > 0));

/** The saved loops, `{ version: 1, loops: [{ cwd, command, name, pid, at }] }`; anything malformed is dropped. */
export function parseLoopSessions(text) {
  let raw;
  try { raw = JSON.parse(String(text ?? "")); } catch { return []; }
  const list = raw && typeof raw === "object" && Array.isArray(raw.loops) ? raw.loops : [];
  return list.filter(isLoopEntry).map(({ cwd, command, name, pid, at }) => ({ cwd, command: [...command], name, pid, at }));
}

/**
 * This loop's name: the first saved one for its working directory, command and model whose loop has ended, or a fresh
 * `<model> · <tag>` no saved loop has. A saved name that is not exactly a name of the model is never used, and a name a
 * running loop holds is never shared. -> { name, entries } (the list to save, this loop last, holding `pid`)
 */
export function chooseLoopName(entries, { cwd, command, model, pid, at, newTag, isAlive }) {
  const free = entries.find(e => e.cwd === cwd && sameArgv(e.command, command) && isNameOf(e.name, model) && !(e.pid !== null && isAlive(e.pid)));
  let name = free?.name;
  for (let i = 0; !name && i < 1000; i++) {
    const fresh = mintName(model, newTag());
    if (!entries.some(e => e.name === fresh)) name = fresh;
  }
  if (!name) throw new Error("could not draw a session tag no saved loop has");
  const rest = entries.filter(e => e !== free);
  return { name, entries: [...rest, { cwd, command: [...command], name, pid, at }].slice(-MAX_SAVED_LOOPS) };
}

/** A loop that ends gives its name back: its entry keeps the name and drops the pid. */
export function releaseLoopName(entries, { name, pid }) {
  return entries.map(e => (e.name === name && e.pid === pid ? { ...e, pid: null } : e));
}

/** The environment for every run: this loop's name, or none at all (never one inherited from elsewhere). */
export function runEnv(base, name) {
  const env = { ...base };
  delete env[SESSION_ENV];
  return name ? { ...env, [SESSION_ENV]: name } : env;
}

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
    } else if (a === "--session") {
      out.session = sessionModel(argv[++i]);
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
    "Usage: node scripts/agent-loop.mjs [--session <model>] [--prompt <text>] [--max-runs N] -- <agent command and args>",
    "       node scripts/agent-loop.mjs --stop | --clear-stop | --help",
    "",
    "Runs the agent's headless mode, and starts it again each time it exits (a turn cap, a finished task, a crash).",
    `The prompt (default "${DEFAULT_PROMPT}") is appended as the last argument, or put where ${PLACEHOLDER} appears.`,
    "",
    "Examples:",
    "  node scripts/agent-loop.mjs -- opencode run",
    "  node scripts/agent-loop.mjs -- codex exec",
    '  node scripts/agent-loop.mjs --session "GPT-6.1 Sol" -- codex exec',
    `  node scripts/agent-loop.mjs --prompt next -- claude -p ${PLACEHOLDER}`,
    "",
    "Each run is a fresh conversation; the picker resumes the same task under the same session name",
    "(PICKER-short-session, D-401). Stop with Ctrl+C, with --stop (checked before each run), or with --max-runs.",
    `--session "<model>" (the model name the agent claims with) keeps one name, "<model> · <tag>", for this loop's whole`,
    `life and passes it to every run in ${SESSION_ENV}, so the agent's bare --claim "<model>" continues the loop's own`,
    "claim at once (PICKER-durable-session). A restarted loop with the same directory and command keeps its name; two",
    "running loops never share one. Without --session each run names itself (D-401).",
    `A run under ${FAST_RUN_MS / 1000} s is fast: after ${BACKOFF_AFTER} in a row the loop waits ${BACKOFF_MS / 60_000} minutes, after ${STOP_AFTER} it stops.`,
    `Log, stop file and saved names: <git common dir>/${LOG_FILE}, ${STOP_FILE} and ${SESSIONS_FILE}; nothing goes to the working tree.`,
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pidAlive(pid) {
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

async function takeLock(lock) {
  for (let i = 0; i < 300; i++) {
    try { closeSync(openSync(lock, "wx")); return; } catch (error) { if (error.code !== "EEXIST") throw error; }
    try { if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { force: true }); } catch { /* released meanwhile */ }
    await sleep(50);
  }
  throw new Error(`${path.basename(lock)} stayed locked`);
}

/** Read, change and save the saved loops under a lock, so two loops starting at once never take one name. */
async function updateLoopSessions(gitDir, change) {
  const file = path.join(gitDir, SESSIONS_FILE), lock = `${file}.lock`;
  await takeLock(lock);
  try {
    let text = "";
    try { text = readFileSync(file, "utf8"); } catch { /* no saved loops yet */ }
    const { result, entries } = change(parseLoopSessions(text));
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, loops: entries }, null, 2)}\n`);
    renameSync(tmp, file);
    return result;
  } finally { rmSync(lock, { force: true }); }
}

/** This loop's session name, saved for its restarts; if it cannot be saved, a fresh name for this loop alone. */
async function claimLoopName(gitDir, model, command) {
  const where = { cwd: process.cwd(), command, model, pid: process.pid, at: new Date().toISOString(), newTag: () => randomBytes(2).toString("hex"), isAlive: pidAlive };
  try {
    return await updateLoopSessions(gitDir, (entries) => { const out = chooseLoopName(entries, where); return { result: out.name, entries: out.entries }; });
  } catch (error) {
    say(`could not save this loop's session name (${error.message}); this loop uses a fresh one that a restart will not keep`);
    return chooseLoopName([], where).name;
  }
}

async function releaseName(gitDir, name) {
  try { await updateLoopSessions(gitDir, (entries) => ({ result: null, entries: releaseLoopName(entries, { name, pid: process.pid }) })); }
  catch (error) { say(`could not release the session name (${error.message}); the next loop sees this one has ended and reuses it`); }
}

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

  const name = opts.session ? await claimLoopName(gitDir, opts.session, opts.command) : null;
  if (name) say(`session name "${name}" for every run (${SESSION_ENV}); the agent's bare --claim "${opts.session}" continues it`);
  else say(`no --session: each run picks its own session name (D-401); pass --session "<model>" to keep one name for this loop`);
  try { return await runLoop(opts, { stopFile, logFile, fastMs, backoffMs, env: runEnv(process.env, name) }); }
  finally { if (name) await releaseName(gitDir, name); }
}

/** Run, log and restart the agent until a stop rule fires; every run gets `env`. */
async function runLoop(opts, { stopFile, logFile, fastMs, backoffMs, env }) {
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
        ? spawn(windowsCommandLine(runArgv), { stdio: "inherit", shell: true, env })
        : spawn(runArgv[0], runArgv.slice(1), { stdio: "inherit", env });
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

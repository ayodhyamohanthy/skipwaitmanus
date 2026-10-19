#!/usr/bin/env node
// D-083: `build` for any AI coding agent. Prints the one next task from
// docs/plans/assignments.json (Claude Code decides the order) and, with
// --claim, takes it by pushing its branch to origin (first push wins).
//
//   node scripts/next-task.mjs                         # show the next task
//   node scripts/next-task.mjs --claim "<model · session>"   # take it
//   node scripts/next-task.mjs --verdict pass|findings --task <id> --as "<name>"
//   node scripts/next-task.mjs --fixed --task <id> --as "<name>"
//
// It reads the task list from origin/main, never a local copy, and never
// switches branches or touches the working tree. NEXT_TASK_LIST_REF=<ref>
// reads the list from another ref; it exists only to test the picker itself.
import { execFileSync } from "node:child_process";
import {
  ciStateFromRuns, markerSubject, parseMarker, pickNextTask, reviewLockOf, reviewStateOf, validateAssignments,
} from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const LIST = "docs/plans/assignments.json";
const LIST_REF = process.env.NEXT_TASK_LIST_REF || "origin/main";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
const fail = message => { console.error(`next-task: ${message}`); process.exit(1); };

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixed") out.fixed = true;
    else if (["--claim", "--verdict", "--task", "--as"].includes(a)) {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`${a} needs a value`);
      out[a.slice(2)] = v;
    } else fail(`unknown argument ${a}`);
  }
  if (out.verdict && !["pass", "findings"].includes(out.verdict)) fail("--verdict is pass or findings");
  if ((out.verdict || out.fixed) && (!out.task || !out.as)) fail("--verdict and --fixed need --task <id> and --as \"<name>\"");
  return out;
}

async function github(repo, path) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || tryGit("config", "--get", "github.token");
  const headers = { accept: "application/vnd.github+json", "user-agent": "skipwait-next-task", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GitHub ${path} answered ${res.status}`);
  return res.json();
}

function loadBranches(tasks) {
  const wanted = new Set(tasks.flatMap(t => [t.branch, reviewLockOf(t)]));
  const slugs = tasks.map(t => `/${t.branch.split("/").pop()}`);
  const refs = git("for-each-ref", "--format=%(refname:strip=3)%09%(committerdate:unix)", "refs/remotes/origin/agent");
  const branches = new Map();
  for (const line of refs.split("\n").filter(Boolean)) {
    const [name, unix] = line.split("\t");
    if (!wanted.has(name) && !slugs.some(s => name.endsWith(s)) && !name.startsWith("agent/queue/fix-main-")) continue;
    const ref = `refs/remotes/origin/${name}`;
    const subjects = (tryGit("log", "--reverse", "--format=%s", `origin/main..${ref}`) ?? "").split("\n").filter(Boolean);
    const merged = tryGit("merge-base", "--is-ancestor", ref, "origin/main") !== null;
    branches.set(name, { tipMs: Number(unix) * 1000, merged, markers: subjects.map(parseMarker).filter(Boolean) });
  }
  return branches;
}

/** Push one empty marker commit onto `parent` as `branch`; false when someone else got there first. */
function pushMarker(branch, parent, subject) {
  const sha = git("commit-tree", `${parent}^{tree}`, "-p", parent, "-m", subject);
  return tryGit("push", "-q", "origin", `${sha}:refs/heads/${branch}`) !== null;
}

async function state() {
  if (tryGit("fetch", "-q", "--prune", "origin") === null) fail("git fetch origin failed; check your network and GitHub access");
  const raw = tryGit("show", `${LIST_REF}:${LIST}`);
  if (raw === null) fail(`${LIST} is missing on ${LIST_REF}`);
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { fail(`${LIST} is not valid JSON: ${e.message}`); }
  const errors = validateAssignments(doc, p => tryGit("cat-file", "-e", `${LIST_REF}:${p}`) !== null);
  if (errors.length) fail(`${LIST} is invalid; tell Claude Code:\n- ${errors.join("\n- ")}`);
  let mainCi = { state: "unknown" }, openPrs = new Map();
  try {
    mainCi = ciStateFromRuns((await github(doc.repo, "/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10")).workflow_runs);
    const pulls = await github(doc.repo, "/pulls?state=open&per_page=100");
    openPrs = new Map(pulls.filter(p => p.head?.repo?.full_name === doc.repo).map(p => [p.head.ref, p.html_url]));
  } catch (e) { console.error(`next-task: ${e.message}`); }
  return { doc, mainCi, openPrs, branches: loadBranches(doc.tasks) };
}

function claim(pick, who, branches) {
  const tip = name => git("rev-parse", `refs/remotes/origin/${name}`);
  switch (pick.kind) {
    case "build": return pushMarker(pick.task.branch, git("rev-parse", "origin/main"), markerSubject("Claim", pick.task.id, who));
    case "takeover": return pushMarker(pick.work, tip(pick.work), markerSubject("Takeover", pick.task.id, who));
    case "fix-main": return pushMarker(pick.lock, pick.parent ? tip(pick.parent) : git("rev-parse", "origin/main"), markerSubject("Claim", `fix-main-${pick.sha.slice(0, 8)}`, who));
    case "review": return pushMarker(pick.lock, pick.lockExists ? tip(pick.lock) : git("rev-parse", "origin/main"), markerSubject("Review claim", pick.task.id, who));
    case "fix": return branches.has(pick.lock) && pushMarker(pick.lock, tip(pick.lock), markerSubject("Fix claim", pick.task.id, who));
    default: return false;
  }
}

async function main() {
  const args = argsOf(process.argv.slice(2));
  const date = new Date().toLocaleDateString("en-CA");
  if (args.verdict || args.fixed) {
    const { doc, branches } = await state();
    const task = doc.tasks.find(t => t.id === args.task) ?? fail(`no task ${args.task}`);
    const lockName = reviewLockOf(task), lock = branches.get(lockName);
    const stage = reviewStateOf(lock);
    const holder = lock?.markers.at(-1)?.who;
    if (args.verdict && (stage !== "in-review" || holder !== args.as)) fail(`only the reviewer holding ${lockName} records a verdict (it is ${stage}, held by ${holder ?? "nobody"})`);
    if (args.fixed && (stage !== "fixing" || holder !== args.as)) fail(`only the agent holding the fix claim on ${lockName} marks it fixed (it is ${stage}, held by ${holder ?? "nobody"})`);
    const subject = args.verdict ? markerSubject("Verdict", task.id, args.as, args.verdict) : markerSubject("Fixed", task.id, args.as);
    if (!pushMarker(lockName, git("rev-parse", `refs/remotes/origin/${lockName}`), subject)) fail(`could not push ${lockName}; fetch and run again`);
    console.log(`Recorded on ${lockName}: ${subject}`);
    return;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { doc, mainCi, openPrs, branches } = await state();
    const pick = pickNextTask({ tasks: doc.tasks, mainCi, branches, openPrs, now: Date.now(), claimant: args.claim ?? null });
    const claimable = ["build", "takeover", "fix-main", "review", "fix"].includes(pick.kind);
    if (!args.claim || !claimable) { console.log(renderPick(pick, { who: args.claim ?? "<your model>", date, claimed: false })); if (pick.kind === "stop") process.exit(2); return; }
    if (claim(pick, args.claim, branches)) { console.log(renderPick(pick, { who: args.claim, date, claimed: true })); return; }
    console.error(`next-task: someone claimed it first (attempt ${attempt}); picking again`);
  }
  fail("three claims in a row were taken by other agents; run again in a minute");
}

main().catch(e => fail(e.stack ?? String(e)));

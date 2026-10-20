#!/usr/bin/env node
// D-083 / D-085: `build`, `resume`, `continue` and `next` for any AI coding
// agent. Prints the one next task from docs/plans/assignments.json (Claude Code
// decides the order) and, with --claim, takes it by pushing a marker to origin
// (first push wins). Your own unfinished work always comes back first.
//
//   node scripts/next-task.mjs                                  # show the next task
//   node scripts/next-task.mjs --claim "<model · session>"      # take it (or get your own back)
//   node scripts/next-task.mjs --heartbeat --as "<model · session>"   # keep your claim alive
//   node scripts/next-task.mjs --verdict pass|findings --task <id> --as "<name>"
//   node scripts/next-task.mjs --fixed --task <id> --as "<name>"
//
// It reads the task list from origin/main, never a local copy, and never
// switches branches or touches the working tree. It does read the local clone
// to report work that origin cannot see (D-085). NEXT_TASK_LIST_REF=<ref> reads
// the list from another ref; it exists only to test the picker itself.
import { execFileSync, spawnSync } from "node:child_process";
import {
  architectLockOf, ciStateFromRuns, heartbeatOf, localSyncIssues, markerSubject, parseMarker, pickNextTask, reviewLockOf, reviewStateOf, slugOf, validateAssignments,
} from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

// Cloud sandboxes reach GitHub only through HTTPS_PROXY, which Node's fetch
// ignores unless NODE_USE_ENV_PROXY=1 (Node >= 22.21); without it the CI read
// fails and the picker stops. Re-run once with the proxy switched on.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== "1") {
  const rerun = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(rerun.status ?? 1);
}

const LIST = "docs/plans/assignments.json";
const LIST_REF = process.env.NEXT_TASK_LIST_REF || "origin/main";
const CLAIMABLE = ["build", "takeover", "fix-main", "review", "fix", "green", "land", "architect", "continue"];
const git = (...args) => execFileSync("git", args, { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
const fail = message => { console.error(`next-task: ${message}`); process.exit(1); };

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixed") out.fixed = true;
    else if (a === "--heartbeat") out.heartbeat = true;
    else if (["--claim", "--verdict", "--task", "--as"].includes(a)) {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`${a} needs a value`);
      out[a.slice(2)] = v;
    } else fail(`unknown argument ${a}`);
  }
  if (out.verdict && !["pass", "findings"].includes(out.verdict)) fail("--verdict is pass or findings");
  if ((out.verdict || out.fixed) && (!out.task || !out.as)) fail("--verdict and --fixed need --task <id> and --as \"<name>\"");
  if (out.heartbeat && !out.as) fail("--heartbeat needs --as \"<name>\" (the name you claimed with)");
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
  const wanted = new Set(tasks.flatMap(t => [t.branch, reviewLockOf(t), architectLockOf(t), heartbeatOf(slugOf(t.branch))]));
  const slugs = tasks.map(t => `/${slugOf(t.branch)}`);
  const refs = git("for-each-ref", "--format=%(refname:strip=3)%09%(committerdate:unix)", "refs/remotes/origin/agent");
  const branches = new Map();
  for (const line of refs.split("\n").filter(Boolean)) {
    const [name, unix] = line.split("\t");
    const fixMain = name.startsWith("agent/queue/fix-main-") || name.startsWith("agent/heartbeat/fix-main-");
    if (!wanted.has(name) && !slugs.some(s => name.endsWith(s)) && !fixMain) continue;
    const ref = `refs/remotes/origin/${name}`;
    const subjects = (tryGit("log", "--reverse", "--format=%s", `origin/main..${ref}`) ?? "").split("\n").filter(Boolean);
    const merged = tryGit("merge-base", "--is-ancestor", ref, "origin/main") !== null;
    branches.set(name, { tipMs: Number(unix) * 1000, merged, markers: subjects.map(parseMarker).filter(Boolean) });
  }
  return branches;
}

/** D-085: every local branch with commits no origin branch has, and every worktree with uncommitted changes. */
function localState() {
  const top = tryGit("rev-parse", "--show-toplevel") ?? ".";
  const worktrees = new Map();
  for (const block of (tryGit("worktree", "list", "--porcelain") ?? "").split("\n\n")) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    if (path && branch) worktrees.set(branch, path);
  }
  const local = [];
  for (const branch of (tryGit("for-each-ref", "--format=%(refname:strip=2)", "refs/heads") ?? "").split("\n").filter(Boolean)) {
    const path = worktrees.get(branch) ?? top;
    const unpushed = Number(tryGit("rev-list", "--count", branch, "--not", "--remotes=origin") ?? 0);
    const dirty = worktrees.has(branch) && Boolean(tryGit("-C", path, "status", "--porcelain"));
    if (!unpushed && !dirty) continue;
    const onOrigin = tryGit("rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`) !== null;
    // ahead: commits only this clone has; null means the branch itself is missing from origin with commits on it.
    local.push({ branch, ahead: onOrigin ? unpushed : (unpushed ? null : 0), dirty, path });
  }
  const mainBehind = tryGit("rev-parse", "--verify", "-q", "refs/heads/main") ? Number(tryGit("rev-list", "--count", "main..origin/main") ?? 0) : 0;
  return { local, mainBehind };
}

/** Push one empty marker commit onto `parent` as `branch`; false when someone else got there first. */
function pushMarker(branch, parent, subject) {
  const sha = git("commit-tree", `${parent}^{tree}`, "-p", parent, "-m", subject);
  return tryGit("push", "-q", "origin", `${sha}:refs/heads/${branch}`) !== null;
}

const tip = name => git("rev-parse", `refs/remotes/origin/${name}`);

/** D-085: mark a held task as worked on, so it is not handed to another agent after 2 quiet hours. */
function pushHeartbeat(pick, who, branches) {
  const slug = pick.of === "fix-main" ? slugOf(pick.lock) : slugOf(pick.task.branch);
  const id = pick.of === "fix-main" ? `fix-main-${pick.sha.slice(0, 8)}` : pick.task.id;
  const ref = heartbeatOf(slug);
  const parent = () => (tryGit("rev-parse", "--verify", "-q", `refs/remotes/origin/${ref}`) ? tip(ref) : git("rev-parse", "origin/main"));
  if (pushMarker(ref, branches.has(ref) ? tip(ref) : parent(), markerSubject("Heartbeat", id, who))) return true;
  tryGit("fetch", "-q", "origin", ref);
  return pushMarker(ref, parent(), markerSubject("Heartbeat", id, who));
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
  const prCi = new Map();
  try {
    mainCi = ciStateFromRuns((await github(doc.repo, "/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10")).workflow_runs);
    const pulls = await github(doc.repo, "/pulls?state=open&per_page=100");
    openPrs = new Map(pulls.filter(p => p.head?.repo?.full_name === doc.repo).map(p => [p.head.ref, p.html_url]));
    const slugs = doc.tasks.map(t => `/${slugOf(t.branch)}`);
    for (const head of openPrs.keys()) {
      if (!head.startsWith("agent/") || !slugs.some(s => head.endsWith(s))) continue;
      try { prCi.set(head, ciStateFromRuns((await github(doc.repo, `/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(head)}&per_page=5`)).workflow_runs)); }
      catch (e) { console.error(`next-task: ${e.message}`); }
    }
  } catch (e) { console.error(`next-task: ${e.message}`); }
  return { doc, mainCi, openPrs, prCi, branches: loadBranches(doc.tasks) };
}

function claim(pick, who, branches) {
  switch (pick.kind) {
    case "build": return pushMarker(pick.task.branch, git("rev-parse", "origin/main"), markerSubject("Claim", pick.task.id, who));
    case "takeover":
    case "green": return pushMarker(pick.work, tip(pick.work), markerSubject("Takeover", pick.task.id, who));
    case "land": return pick.tier1
      ? pushMarker(pick.lock, tip(pick.lock), markerSubject("Land claim", pick.task.id, who))
      : pushMarker(pick.work, tip(pick.work), markerSubject("Takeover", pick.task.id, who));
    case "architect": return pushMarker(pick.lock, pick.lockExists ? tip(pick.lock) : git("rev-parse", "origin/main"), markerSubject(pick.lockExists ? "Takeover" : "Claim", pick.task.id, who));
    case "fix-main": return pushMarker(pick.lock, pick.parent ? tip(pick.parent) : git("rev-parse", "origin/main"), markerSubject("Claim", `fix-main-${pick.sha.slice(0, 8)}`, who));
    case "review": return pushMarker(pick.lock, pick.lockExists ? tip(pick.lock) : git("rev-parse", "origin/main"), markerSubject("Review claim", pick.task.id, who));
    case "fix": return branches.has(pick.lock) && pushMarker(pick.lock, tip(pick.lock), markerSubject("Fix claim", pick.task.id, who));
    case "continue":
      // Already held: nothing to win. The heartbeat restarts its 2-hour clock.
      if (!pushHeartbeat(pick, who, branches)) console.error("next-task: could not record a heartbeat; push a commit soon so the claim stays yours");
      return true;
    default: return false;
  }
}

function printSync(sync) {
  if (!sync.blocking.length && !sync.notes.length) return;
  console.log("LOCAL WORK ORIGIN CANNOT SEE (D-085):");
  for (const line of sync.blocking) console.log(`- MUST PUSH: ${line}`);
  for (const line of sync.notes) console.log(`- ${line}`);
  console.log("");
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
  if (args.heartbeat) {
    const { doc, mainCi, openPrs, prCi, branches } = await state();
    const ci = mainCi.state === "unknown" ? { state: "green" } : mainCi;
    const pick = pickNextTask({ tasks: doc.tasks, mainCi: ci, branches, openPrs, prCi, now: Date.now(), claimant: args.as });
    if (pick.kind !== "continue") fail(`"${args.as}" holds no task, so there is nothing to keep alive; run --claim to take one`);
    if (!pushHeartbeat(pick, args.as, branches)) fail("could not push the heartbeat; fetch and run again");
    console.log(`Heartbeat recorded: ${pick.of === "fix-main" ? pick.lock : pick.task.id} stays yours for the next 2 hours.`);
    return;
  }
  const who = args.claim ?? args.as ?? null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { doc, mainCi, openPrs, prCi, branches } = await state();
    const pick = pickNextTask({ tasks: doc.tasks, mainCi, branches, openPrs, prCi, now: Date.now(), claimant: who });
    const { local, mainBehind } = localState();
    const sync = localSyncIssues({ local, branches, claimant: who, mainBehind });
    printSync(sync);
    if (sync.blocking.length && CLAIMABLE.includes(pick.kind) && pick.kind !== "continue") {
      console.log("NEXT: SYNC FIRST\nYour own claimed work is not on origin (the MUST PUSH lines above). Push it, then run this again. Nothing new was claimed.\n");
      process.exit(3);
    }
    if (!args.claim || !CLAIMABLE.includes(pick.kind)) {
      console.log(renderPick(pick, { who: who ?? "<your model>", date, claimed: pick.kind === "continue" && Boolean(args.claim) }));
      if (pick.kind === "stop") process.exit(2);
      return;
    }
    if (claim(pick, args.claim, branches)) { console.log(renderPick(pick, { who: args.claim, date, claimed: true })); return; }
    console.error(`next-task: someone claimed it first (attempt ${attempt}); picking again`);
  }
  fail("three claims in a row were taken by other agents; run again in a minute");
}

main().catch(e => fail(e.stack ?? String(e)));

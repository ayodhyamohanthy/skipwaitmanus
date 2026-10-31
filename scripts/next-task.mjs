#!/usr/bin/env node
// D-083 / D-085: `build`, `resume`, `continue` and `next` for any AI coding
// agent. Prints the one next task from docs/plans/assignments.json (Claude Code
// decides the order) and, with --claim, takes it by pushing a marker to origin
// (first push wins). Your own unfinished work always comes back first.
//
//   node scripts/next-task.mjs                                  # show the next task
//   node scripts/next-task.mjs --claim "<your model name>"      # take it (or get your own back); prints your session name
//   node scripts/next-task.mjs --claim "<session name>" --avoid <id>[,<id>]   # never hand me these tasks (my own instruction or a missing tool)
//   node scripts/next-task.mjs --heartbeat --as "<session name>"       # keep your claim alive
//   node scripts/next-task.mjs --report green|red|blocked|review|landed --task <id> --as "<session name>" --note "<one line>"
//   node scripts/next-task.mjs --status                                # the board: every priority, green or not
//   node scripts/next-task.mjs --verdict pass|findings --task <id> --as "<session name>"
//   node scripts/next-task.mjs --fixed --task <id> --as "<session name>"
//   node scripts/next-task.mjs --landed --task <id> --as "<session name>"
//
// Exit codes: 0 work to do (claimed, your own work, CEO review), 1 error,
// 2 STOP (GitHub unreadable), 3 SYNC FIRST (your work is not on origin),
// 4 WAIT, 5 NOTHING TO PICK.
//
// It reads the task list from origin/main, never a local copy, and never
// switches branches or touches the working tree. It does read the local clone
// to report work that origin cannot see (D-085). NEXT_TASK_LIST_REF=<ref> reads
// the list from another ref; it exists only to test the picker itself.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  LAND_SLOT, REPORT_STATUSES, architectLockOf, ciStateFromRuns, classifyPushError, fixMainIdOf, heartbeatOf, heldAllBy, heldBy, landingSlot, leaseFor, localSyncIssues, markerSubject,
  mayReport, parseBranchLog, parseDecisionRegister, parseMarker, pickNextTask, releaseLandingSlotError, reviewLockOf, reviewStateOf, sanitizeName, sanitizeNote, sessionName, slugOf, stageHolderOf, statusBoard, validateAssignments,
} from "./nextTaskCore.mjs";
import { renderBoard, renderPick } from "./nextTaskText.mjs";

// Cloud sandboxes reach GitHub only through HTTPS_PROXY, which Node's fetch
// ignores unless NODE_USE_ENV_PROXY=1 (Node >= 22.21); without it the CI read
// fails and the picker stops. Re-run once with the proxy switched on.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== "1") {
  const rerun = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(rerun.status ?? 1);
}

const LIST = "docs/plans/assignments.json";
const REGISTER = "docs/DECISIONS.md";
const LIST_REF = process.env.NEXT_TASK_LIST_REF || "origin/main";
const CLAIMABLE = ["build", "takeover", "fix-main", "review", "fix", "green", "land", "architect", "resync", "unblock", "continue"];
const EXIT = { stop: 2, wait: 4, none: 5 };
const REPORTS = "agent/reports/log";
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
const git = (...args) => execFileSync("git", args, { encoding: "utf8", env: GIT_ENV, stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
const fail = (message, code = 1) => { console.error(`next-task: ${message}`); process.exit(code); };

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixed") out.fixed = true;
    else if (a === "--heartbeat") out.heartbeat = true;
    else if (a === "--status") out.status = true;
    else if (a === "--landed") out.landed = true;
    else if (["--claim", "--verdict", "--task", "--as", "--report", "--note", "--avoid"].includes(a)) {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`${a} needs a value`);
      out[a.slice(2)] = v;
    } else fail(`unknown argument ${a}`);
  }
  for (const k of ["claim", "as"]) if (out[k] !== undefined && !sanitizeName(out[k])) fail(`--${k} needs a name`);
  if (out.as) out.as = sanitizeName(out.as);
  if (out.verdict && !["pass", "findings"].includes(out.verdict)) fail("--verdict is pass or findings");
  if ((out.verdict || out.fixed) && (!out.task || !out.as)) fail("--verdict and --fixed need --task <id> and --as \"<session name>\"");
  if (out.landed && (!out.task || !out.as)) fail("--landed needs --task <id> and --as \"<session name>\"");
  if (out.heartbeat && !out.as) fail("--heartbeat needs --as \"<session name>\" (the name your claim printed)");
  if (out.report && !REPORT_STATUSES.includes(out.report)) fail(`--report is one of ${REPORT_STATUSES.join(", ")}`);
  if (out.report && (!out.task || !out.as)) fail("--report needs --task <id> and --as \"<session name>\"");
  return out;
}

/** The GitHub CLI's token, when an agent is signed in with it; never printed. */
function ghToken() {
  try { return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; }
  catch { return null; }
}

async function github(repo, path) {
  // D-109: any token raises GitHub's limit from 60 reads an hour; `gh auth token` covers agents signed in with the GitHub CLI.
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || tryGit("config", "--get", "github.token") || ghToken();
  const headers = { accept: "application/vnd.github+json", "user-agent": "skipwait-next-task", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GitHub ${path} answered ${res.status}`);
  return res.json();
}

/**
 * D-237: one read per branch, shared by the marker list and the `work` flag. Marker commits are empty: a
 * commit that changes files is work, whatever its subject says (D-190).
 */
function commitsOn(ref) {
  return parseBranchLog(tryGit("log", "--reverse", "--no-merges", "--format=%x1e%s%x1f", "--name-only", `origin/main..${ref}`) ?? "");
}

const markersOn = commits => commits.flatMap(({ subject, files }) => {
  const m = files.length ? null : parseMarker(subject);
  return m ? [m] : [];
});

function loadBranches(tasks) {
  const wanted = new Set([...tasks.flatMap(t => [t.branch, reviewLockOf(t), architectLockOf(t), heartbeatOf(slugOf(t.branch))]), LAND_SLOT]);
  const slugs = tasks.map(t => `/${slugOf(t.branch)}`);
  const refs = git("for-each-ref", "--format=%(refname:strip=3)%09%(committerdate:unix)%09%(objectname)", "refs/remotes/origin/agent");
  const branches = new Map();
  for (const line of refs.split("\n").filter(Boolean)) {
    const [name, unix, sha] = line.split("\t");
    const fixMain = name.startsWith("agent/queue/fix-main-") || name.startsWith("agent/heartbeat/fix-main-");
    if (!wanted.has(name) && !slugs.some(s => name.endsWith(s)) && !fixMain) continue;
    const ref = `refs/remotes/origin/${name}`;
    const merged = tryGit("merge-base", "--is-ancestor", ref, "origin/main") !== null;
    const commits = commitsOn(ref);
    // D-237: buildView cannot call git, so the loader reports whether the ref carries a file-changing commit.
    branches.set(name, { tipMs: Number(unix) * 1000, tipSha: sha, merged, work: commits.some(c => c.files.length > 0), markers: markersOn(commits) });
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

/** D-085: the reports the team sent the CEO, newest first (one marker commit each on agent/reports/log), cleaned again on read. */
function loadReports() {
  const raw = tryGit("log", "-n", "500", "--format=%ct%x1f%s%x1f%b%x1e", `refs/remotes/origin/${REPORTS}`);
  if (!raw) return [];
  return raw.split("\x1e").map(rec => rec.trim()).filter(Boolean).flatMap(rec => {
    const [ct, subject, body = ""] = rec.split("\x1f");
    const m = parseMarker(subject ?? "");
    return m?.verb === "Report" ? [{ id: m.id, status: m.status, who: sanitizeName(m.who), at: Number(ct) * 1000, note: sanitizeNote(body) }] : [];
  });
}

const originRef = name => `refs/remotes/origin/${name}`;
const onOrigin = name => tryGit("rev-parse", "--verify", "-q", originRef(name)) !== null;
const tip = name => git("rev-parse", originRef(name));
const base = name => (onOrigin(name) ? tip(name) : git("rev-parse", "origin/main"));

/**
 * Push one empty marker commit onto `parent` as `branch`. Returns the new
 * commit, or null when another agent got there first; any other refusal
 * (auth, a ruleset, the network) stops the run with git's own words.
 */
function pushMarker(branch, parent, subject, body) {
  const sha = git("commit-tree", `${parent}^{tree}`, "-p", parent, "-m", subject, ...(body ? ["-m", body] : []));
  const res = spawnSync("git", ["push", "-q", "origin", `${sha}:refs/heads/${branch}`], { encoding: "utf8", env: GIT_ENV });
  if (res.status === 0) {
    tryGit("update-ref", originRef(branch), sha);
    return sha;
  }
  if (classifyPushError(res.stderr) === "race") return null;
  fail(`could not push ${branch}: ${(res.stderr || res.error?.message || "unknown error").trim()}`);
}

/**
 * D-085: record that `who` is still on a held task. A quiet claim is re-taken on
 * the ref a takeover pushes to (first push wins); a fresh one gets a heartbeat.
 * Returns false when another agent took it first.
 */
function keepClaim(pick, who, branches) {
  if (pick.of === "land") {
    const slot = landingSlot(branches, Date.now());
    if (slot.holder !== who || slot.quiet) {
      const parent = onOrigin(LAND_SLOT) ? tip(LAND_SLOT) : git("rev-parse", "origin/main");
      const took = pushMarker(LAND_SLOT, parent, markerSubject("Land claim", pick.task.id, who));
      if (!took) return false;
    }
  }
  const lease = leaseFor(pick, branches, Date.now());
  const subject = markerSubject(lease.verb, lease.id, who);
  let parent = base(lease.ref);
  let sha = pushMarker(lease.ref, parent, subject);
  if (!sha && lease.retry) {
    // Only this holder writes its side heartbeat; a refused one is a stale view, so read it again once.
    // A refused push on a shared lock or a takeover ref means another agent won it: never retry on top of them.
    tryGit("fetch", "-q", "origin", lease.ref);
    parent = base(lease.ref);
    sha = pushMarker(lease.ref, parent, subject);
  }
  if (!sha) return false;
  // A reclaim adds an empty commit to your own branch: move your local copy onto it so your next push is a fast-forward.
  if (lease.reclaim) {
    const localTip = tryGit("rev-parse", "--verify", "-q", `refs/heads/${lease.ref}`);
    const moved = localTip === parent && tryGit("update-ref", `refs/heads/${lease.ref}`, sha, parent) !== null;
    if (localTip && !moved && localTip !== sha) console.error(`next-task: origin/${lease.ref} gained your claim marker; run git merge --ff-only origin/${lease.ref} (or git pull --no-rebase) in your worktree before your next push, and never force-push`);
  }
  return true;
}

async function state() {
  if (tryGit("fetch", "-q", "--prune", "origin") === null) fail("git fetch origin failed; check your network and GitHub access");
  const raw = tryGit("show", `${LIST_REF}:${LIST}`);
  if (raw === null) fail(`${LIST} is missing on ${LIST_REF}`);
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { fail(`${LIST} is not valid JSON: ${e.message}`); }
  // D-202: the decision register is read with the list, from the same ref, and an unreadable
  // register stops the picker: a guess at which decision is newest would hand out stale work.
  const registerRaw = tryGit("show", `${LIST_REF}:${REGISTER}`);
  if (registerRaw === null) fail(`${REGISTER} is missing on ${LIST_REF}; the picker cannot tell which decision is newest`);
  let register;
  try { register = parseDecisionRegister(registerRaw); } catch (e) { fail(`${e.message}; fix the register before any work is picked`); }
  const errors = validateAssignments(doc, p => tryGit("cat-file", "-e", `${LIST_REF}:${p}`) !== null, register);
  if (errors.length) fail(`${LIST} is invalid; tell Claude Code:\n- ${errors.join("\n- ")}`);
  // D-085: every GitHub read is known or unknown; an unknown one stops the picker instead of looking like "nothing there".
  let mainCi = { state: "unknown" }, openPrs = null, mergedHeads = null;
  const prCi = new Map();
  try { mainCi = ciStateFromRuns((await github(doc.repo, "/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10")).workflow_runs); }
  catch (e) { console.error(`next-task: ${e.message}`); }
  try {
    const pulls = await github(doc.repo, "/pulls?state=open&per_page=100");
    openPrs = new Map(pulls.filter(p => p.head?.repo?.full_name === doc.repo).map(p => [p.head.ref, p.html_url]));
  } catch (e) { console.error(`next-task: ${e.message}`); }
  try {
    const closed = await github(doc.repo, "/pulls?state=closed&sort=updated&direction=desc&per_page=100");
    mergedHeads = new Map();
    for (const p of closed) {
      if (!p.merged_at || p.head?.repo?.full_name !== doc.repo) continue;
      if (!mergedHeads.has(p.head.ref)) mergedHeads.set(p.head.ref, new Set());
      mergedHeads.get(p.head.ref).add(p.head.sha);
    }
  } catch (e) { console.error(`next-task: ${e.message}`); }
  // D-109: one read for every pull request's CI (the newest 100 runs, grouped by branch), not one read per branch,
  // so agents without a token stay inside GitHub's 60 reads an hour. A branch with no run among them reads unknown.
  const slugs = doc.tasks.map(t => `/${slugOf(t.branch)}`);
  const heads = [...(openPrs?.keys() ?? [])].filter(head => head.startsWith("agent/") && slugs.some(s => head.endsWith(s)));
  if (heads.length) {
    try {
      const runs = (await github(doc.repo, "/actions/workflows/ci.yml/runs?per_page=100")).workflow_runs;
      for (const head of heads) prCi.set(head, ciStateFromRuns(runs.filter(r => r.head_branch === head)));
    } catch (e) {
      console.error(`next-task: ${e.message}`);
      for (const head of heads) prCi.set(head, { state: "error" });
    }
  }
  // Count main-only commits, not branch-only commits. Missing refs stay unknown,
  // never a misleading zero; use argv (not a shell) for branch names from GitHub.
  const prBehind = new Map();
  for (const head of openPrs?.keys() ?? []) {
    const raw = tryGit("rev-list", "--count", `${originRef(head)}..origin/main`);
    const count = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
    prBehind.set(head, Number.isSafeInteger(count) ? count : null);
  }
  return { doc, register, mainCi, openPrs, mergedHeads, prCi, prBehind, branches: loadBranches(doc.tasks), reports: loadReports() };
}

function claim(pick, who, branches) {
  const origin = () => git("rev-parse", "origin/main");
  switch (pick.kind) {
    case "build": return Boolean(pushMarker(pick.task.branch, origin(), markerSubject("Claim", pick.task.id, who)));
    case "takeover":
    case "green": return Boolean(pushMarker(pick.work, tip(pick.work), markerSubject("Takeover", pick.task.id, who)));
    case "land": {
      const parent = onOrigin(LAND_SLOT) ? tip(LAND_SLOT) : git("rev-parse", "origin/main");
      const tookSlot = pushMarker(LAND_SLOT, parent, markerSubject("Land claim", pick.task.id, who));
      if (!tookSlot) return false;
      if (pick.tier1) {
        return Boolean(pushMarker(pick.lock, tip(pick.lock), markerSubject("Land claim", pick.task.id, who)));
      }
      return Boolean(pushMarker(pick.work, tip(pick.work), markerSubject("Takeover", pick.task.id, who)));
    }
    case "unblock": return Boolean(pushMarker(pick.lock, pick.lockExists ? tip(pick.lock) : origin(), markerSubject("Unblock", pick.task.id, who)));
    case "architect":
    case "resync": return Boolean(pushMarker(pick.lock, pick.lockExists ? tip(pick.lock) : origin(), markerSubject(pick.lockExists ? "Takeover" : "Claim", pick.task.id, who)));
    case "fix-main": return Boolean(pushMarker(pick.lock, pick.parent ? tip(pick.parent) : origin(), markerSubject(pick.parent ? "Takeover" : "Claim", fixMainIdOf(pick.sha), who)));
    case "review": return Boolean(pushMarker(pick.lock, pick.lockExists ? tip(pick.lock) : origin(), markerSubject("Review claim", pick.task.id, who)));
    case "fix": return branches.has(pick.lock) && Boolean(pushMarker(pick.lock, tip(pick.lock), markerSubject("Fix claim", pick.task.id, who)));
    case "continue": return keepClaim(pick, who, branches);
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

/** --report and --fixed speak for work that must already be on origin. */
function requireSynced(doc, branches, who) {
  const { local, mainBehind } = localState();
  const sync = localSyncIssues({ local, branches, claimant: who, mainBehind, tasks: doc.tasks });
  if (!sync.blocking.length) return;
  printSync(sync);
  fail("your own work is not on origin yet (the MUST PUSH lines above); push it, then run this again", 3);
}

async function main() {
  const args = argsOf(process.argv.slice(2));
  const date = new Date().toLocaleDateString("en-CA");
  if (args.verdict || args.fixed) {
    const { doc, branches } = await state();
    const task = doc.tasks.find(t => t.id === args.task) ?? fail(`no task ${args.task}`);
    const lockName = reviewLockOf(task), lock = branches.get(lockName);
    const stage = reviewStateOf(lock, task.id);
    const holder = stageHolderOf(lock, task.id);
    // PROCESS-review-gate (D-166): the reviewer who passed may re-record the pass on the current head (after a merge of main, or
    // over a verdict written before verdicts named their head); a landing refuses a head no verdict names.
    const reviewer = [...(lock?.markers ?? [])].reverse().find(m => m.id === task.id && m.verb === "Review claim")?.who ?? null;
    const rerecord = args.verdict === "pass" && ["passed", "landing"].includes(stage) && reviewer === args.as;
    if (args.verdict && !rerecord && (stage !== "in-review" || holder !== args.as)) fail(`only the reviewer holding ${lockName} records a verdict (it is ${stage}, held by ${holder ?? "nobody"})`);
    if (args.fixed && (stage !== "fixing" || holder !== args.as)) fail(`only the agent holding the fix claim on ${lockName} marks it fixed (it is ${stage}, held by ${holder ?? "nobody"})`);
    if (args.fixed) requireSynced(doc, branches, args.as);
    const subject = args.verdict ? markerSubject("Verdict", task.id, args.as, args.verdict) : markerSubject("Fixed", task.id, args.as);
    // The body names the head reviewed: the tip of the task's branch on origin now, which the gate compares with the PR head.
    const reviewed = args.verdict ? (onOrigin(task.branch) ? tip(task.branch) : fail(`${task.branch} is not on origin; there is no head to review`)) : null;
    if (!pushMarker(lockName, tip(lockName), subject, reviewed ? `reviewed ${reviewed}` : undefined)) fail(`could not push ${lockName}: it moved; fetch and run again`);
    console.log(`Recorded on ${lockName}: ${subject}${reviewed ? ` (reviewed ${reviewed})` : ""}`);
    return;
  }
  if (args.landed) {
    const { doc, branches } = await state();
    const task = doc.tasks.find(t => t.id === args.task) ?? fail(`no task ${args.task}`);
    const err = releaseLandingSlotError({ branches, task, claimant: args.as, now: Date.now() });
    if (err) fail(err);
    const subject = markerSubject("Landed", task.id, args.as);
    const parent = onOrigin(LAND_SLOT) ? tip(LAND_SLOT) : git("rev-parse", "origin/main");
    if (!pushMarker(LAND_SLOT, parent, subject)) fail(`could not push ${LAND_SLOT}: it moved; fetch and run again`);
    console.log(`Released landing slot ${LAND_SLOT}: ${subject}`);
    return;
  }
  if (args.status) {
    const { doc, register, mainCi, openPrs, mergedHeads, prCi, prBehind, branches, reports } = await state();
    const newest = register.at(-1);
    console.log(`Register: ${newest.id}, ${newest.date} — ${newest.title}`);
    console.log(`main CI: ${mainCi.state}${mainCi.url ? ` (${mainCi.url})` : ""}${openPrs === null || mergedHeads === null ? " · pull requests: UNKNOWN (GitHub read failed; the board may be wrong)" : ""}\n`);
    console.log(renderBoard(statusBoard({ tasks: doc.tasks, branches, openPrs, mergedHeads, prCi, prBehind, reports, now: Date.now(), register })));
    return;
  }
  if (args.report) {
    const { doc, branches } = await state();
    const task = doc.tasks.find(t => t.id === args.task) ?? fail(`no task ${args.task}`);
    // A report can hold or release every lower priority, so only the task's own people or the CEO send one (D-085).
    if (!mayReport({ task, branches, claimant: args.as })) fail(`"${args.as}" holds no part of ${task.id}; only its builder, reviewer, fixer, lander, unblocker or the CEO reports on it`);
    requireSynced(doc, branches, args.as);
    // One plain line: no secrets, tokens or personal data (the repo is public, D-059).
    const note = sanitizeNote(args.note);
    const subject = markerSubject("Report", task.id, args.as, args.report);
    let sha = pushMarker(REPORTS, base(REPORTS), subject, note);
    if (!sha) { tryGit("fetch", "-q", "origin", REPORTS); sha = pushMarker(REPORTS, base(REPORTS), subject, note); }
    if (!sha) fail(`could not push ${REPORTS}: other reports keep arriving; run again`);
    console.log(`Reported to the CEO on ${REPORTS}: ${subject}${note ? ` — ${note}` : ""}`);
    return;
  }
  if (args.heartbeat) {
    const { doc, mainCi, openPrs, mergedHeads, prCi, branches, reports } = await state();
    // Without the pull requests, a Tier 1 branch under review would look like a build to keep alive, and a claim marker would land on it.
    if (openPrs === null || mergedHeads === null) fail("cannot read the pull requests from GitHub; a heartbeat now could push a claim onto a branch under review (D-085); run this again when GitHub answers", 2);
    const mainSha = mainCi.state === "red" || mainCi.state === "running-after-red" ? mainCi.sha : null;
    // A heartbeat keeps what you hold alive whatever main's CI says (D-085).
    // D-134: every claim you hold stays alive, not only the first one in queue order.
    const helds = heldAllBy({ tasks: doc.tasks, branches, openPrs, mergedHeads, prCi, reports, claimant: args.as, mainSha, now: Date.now() });
    if (!helds.length) fail(`"${args.as}" holds no task, so there is nothing to keep alive; run --claim to take one`);
    // Commits only on this machine are the real heartbeat: push them first, or a marker on origin would leave your branch diverged.
    const { local, mainBehind } = localState();
    const sync = localSyncIssues({ local, branches, claimant: args.as, mainBehind, tasks: doc.tasks });
    const unpushed = helds.map(h => h.work ?? h.lock).filter(b => sync.unpushed.includes(b));
    if (unpushed.length) { printSync(sync); fail(`push your commits on ${unpushed.join(", ")} first (that push keeps the claim alive), then run this again`, 3); }
    const lost = helds.filter(h => !keepClaim(h, args.as, branches));
    for (const h of helds.filter(h => !lost.includes(h))) console.log(`Heartbeat recorded: ${h.of === "fix-main" ? h.lock : h.task.id} stays yours for the next 2 hours.`);
    if (lost.length) fail(`another agent took ${lost.map(h => h.task?.id ?? h.lock).join(", ")} first; run --claim "${args.as}" to see what is yours`);
    return;
  }
  // D-085: a bare model name gets a unique session tag, so two sessions of one model never share a claim.
  const who = args.claim ? sessionName(args.claim, randomBytes(3).toString("hex").slice(0, 4)) : args.as ?? null;
  if (args.claim && who !== sanitizeName(args.claim)) console.log(`Your session name is "${who}". Use exactly this name for --heartbeat, --report, --verdict and --fixed, and claim with it when you resume.\n`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { doc, register, mainCi, openPrs, mergedHeads, prCi, prBehind, branches, reports } = await state();
    const now = Date.now();
    const avoid = new Set((args.avoid ?? "").split(",").map(id => id.trim()).filter(Boolean));
    const pick = pickNextTask({ tasks: doc.tasks, mainCi, branches, openPrs, mergedHeads, prCi, reports, now, claimant: who, avoid, register });
    // D-085: every agent starts from the same picture — the priorities top down, green or not.
    const board = statusBoard({ tasks: doc.tasks, branches, openPrs, mergedHeads, prCi, prBehind, reports, now, register });
    if (pick.kind === "ceo") pick.board = board;
    else console.log(renderBoard(board));
    const { local, mainBehind } = localState();
    const sync = localSyncIssues({ local, branches, claimant: who, mainBehind, tasks: doc.tasks });
    printSync(sync);
    const continuing = pick.kind === "continue" ? pick.work ?? pick.lock : null;
    // New work waits until your own work is on origin; your own claim waits until its commits are.
    if (CLAIMABLE.includes(pick.kind) && sync.blocking.length && (!continuing || sync.unpushed.includes(continuing))) {
      console.log("NEXT: SYNC FIRST\nYour own work is not on origin (the MUST PUSH lines above). Push it, then run this again. Nothing new was claimed.\n");
      process.exit(3);
    }
    if (!args.claim || !CLAIMABLE.includes(pick.kind)) {
      console.log(renderPick(pick, { who: who ?? "<your session name>", date, claimed: false, register }));
      process.exit(EXIT[pick.kind] ?? 0);
    }
    if (claim(pick, who, branches)) { console.log(renderPick(pick, { who, date, claimed: true, register })); return; }
    console.error(`next-task: another agent pushed first (attempt ${attempt}); picking again`);
  }
  fail("three claims in a row were taken by other agents; run again in a minute");
}

main().catch(e => fail(e.stack ?? String(e)));

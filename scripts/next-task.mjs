#!/usr/bin/env node
// D-083 / D-085: `build`, `resume`, `continue` and `next` for any AI coding
// agent. Prints the one next task from docs/plans/assignments.json (Claude Code
// decides the order) and, with --claim, takes it by pushing a marker to origin
// (first push wins). Your own unfinished work always comes back first.
//
//   node scripts/next-task.mjs                                  # show the next task
//   node scripts/next-task.mjs --claim "<your model name>"      # take it (or get your own back); prints your session name
//   node scripts/next-task.mjs --claim "<session name>" --avoid <id>[,<id>]   # never hand me these tasks (my own instruction or a missing tool)
//   node scripts/next-task.mjs --claim "<session name>" --task <id>   # only that task under the normal rules, or why not (D-353 (2))
//   node scripts/next-task.mjs --heartbeat --as "<session name>"       # keep your claim alive
//   node scripts/next-task.mjs --report green|red|blocked|review|landed --task <id> --as "<session name>" --note "<one line>"
//   node scripts/next-task.mjs --status                                # the board: every priority, green or not
//   node scripts/next-task.mjs --verdict pass|findings --task <id> --as "<session name>"
//   node scripts/next-task.mjs --fixed --task <id> --as "<session name>"
//   node scripts/next-task.mjs --landed --task <id> --as "<session name>"
//
// Exit codes: 0 work to do (claimed, your own work, CEO review), 1 error,
// 2 STOP (GitHub unreadable), 3 SYNC FIRST (your work is not on origin),
// 4 WAIT, 5 NOTHING TO PICK, 6 requested task NOT ELIGIBLE (nothing claimed).
//
// It reads the task list from origin/main, never a local copy, and never
// switches branches or touches the working tree. It does read the local clone
// to report work that origin cannot see (D-085). NEXT_TASK_LIST_REF=<ref> reads
// the list from another ref; it exists only to test the picker itself.
import { loadTrustedProvenance, markerReferences, parseProvenanceLog, PROVENANCE_LOG_FORMAT, resolveTaskProvenance, routeIdentity } from "./modelProvenance.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  BRANCH_LOG_FORMAT, LAND_SLOT, REPORT_STATUSES, architectLockOf, collectLandedEvidence, collectOpenPulls, markerOnlyOf, verifyMergedPull, ciStateFromRuns, classifyPushError, fixMainIdOf, gateOnlyRedFromJobs, legacyScopeRedFromJobs, heartbeatOf, heldAllBy, heldBy, landingSlot, leaseFor, localSyncIssues, markerSubject,
  mayReport, outOfSyncOf, packetFixHead, parseBranchLog, parseDecisionRegister, parseMarker, pickNextTask, releaseLandingSlotError, reviewLockOf, reviewStateOf, sanitizeName, sanitizeNote, sessionName, slugOf, stageHolderOf, statusBoard, validateAssignments, blockEvidenceFor, blockedReportBody, blockedReportError, parseReportBody,
} from "./nextTaskCore.mjs";
import { renderBoard, renderBoardSummary, renderPick, renderReleaseLights } from "./nextTaskText.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { boundedGitReader, nullableBoundedGitReader } from "./provenanceGitOutput.mjs";
import { changedPathsOf, findGateRow, reviewGateViolation } from "./review-gate.mjs";
import { CLOUD_ROUTES, autoLandCandidates, autoLandHold, graphqlOrRest, releaseHoldLine, runAutoLand } from "./autoLand.mjs";
import { MODEL_ROUTES_ENFORCED } from "./sessionPolicy.mjs";
import { classifyTier, tierReasonPaths } from "./tierClassifyCore.mjs";
import { classifyLocal } from "./branchHygieneCore.mjs";

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
const EXIT = { stop: 2, wait: 4, none: 5, ineligible: 6 };
const REPORTS = "agent/reports/log";
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
// PROCESS-provenance-loader-bounds: both wrappers read Git through the one shared
// bounded reader. The trusted registry is larger than the legacy 1MiB execFileSync
// buffer, so the picker used to fail closed on size. Same env, same stdio, same trim,
// same throw/null split; only the output bound is finite and named. Exported so the
// regression exercises these exact bindings instead of a copy of them.
export const git = boundedGitReader({ env: GIT_ENV });
export const tryGit = nullableBoundedGitReader({ env: GIT_ENV });
class CliFailure extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
const fail = (message, code = 1) => {
  console.error(`next-task: ${message}`);
  throw new CliFailure(message, code);
};

class RefSnapshotChanged extends Error {}
let decisionRefs = null;
const refPatterns = ["refs/heads/main", "refs/heads/agent/*"];
const refspecs = ["+refs/heads/main:refs/remotes/origin/main", "+refs/heads/agent/*:refs/remotes/origin/agent/*"];

function refsFrom(raw, prefix) {
  if (raw === null) fail("STOP: authoritative refs are unreadable; check origin access and run again", 2);
  const refs = new Map();
  for (const line of raw.split("\n").filter(Boolean)) {
    const fields = line.split("\t");
    if (fields.length !== 2 || !/^[a-f0-9]{40}$/.test(fields[0]) || !fields[1].startsWith(prefix)) fail("STOP: malformed authoritative ref response", 2);
    const name = fields[1].slice(prefix.length);
    if (!name || /[\s\x00-\x1f]/.test(name) || refs.has(name)) fail("STOP: invalid or duplicate authoritative ref", 2);
    refs.set(name, fields[0]);
  }
  return refs;
}

function trackingRefs() {
  return refsFrom(tryGit("for-each-ref", "--format=%(objectname)%09%(refname)", ...refPatterns.map(ref => ref.replace("refs/heads/", "refs/remotes/origin/").replace(/\/\*$/, ""))), "refs/remotes/origin/");
}

/**
 * BRANCH-HYGIENE-2 (D-205): on every run, the picker deletes local branches whose upstream is gone
 * and whose tip is in origin/main, using safe delete (`git branch -d`). Never touches checked-out,
 * dirty or unmerged branches. Prints one line for deletions and notes for what was kept. Never blocks a pick.
 */
export function runLocalCleanup({ tryGit, log = console.log, err = console.error } = {}) {
  try {
    const listed = tryGit("worktree", "list", "--porcelain");
    if (!listed) return { deleted: [], kept: [], failed: [] };
    const worktrees = new Map();
    for (const block of listed.split("\n\n")) {
      const path = /^worktree (.+)$/m.exec(block)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
      if (path && branch) worktrees.set(branch, path);
    }
    const forEach = tryGit("for-each-ref", "--format=%(refname:strip=2)%09%(objectname)%09%(upstream:track)", "refs/heads");
    if (!forEach) return { deleted: [], kept: [], failed: [] };
    const branches = forEach.split("\n").filter(Boolean).map(line => {
      const [name, sha, track = ""] = line.split("\t");
      return { name, sha, upstreamGone: track.includes("gone"), inMain: tryGit("merge-base", "--is-ancestor", sha, "refs/remotes/origin/main") !== null, worktree: worktrees.get(name) ?? null };
    });
    const rows = classifyLocal({ local: branches });
    const doomed = rows.filter(r => r.action === "delete");
    const deleted = [], failed = [];
    for (const r of doomed) {
      if (tryGit("branch", "-d", r.name) !== null) deleted.push(r.name);
      else failed.push(r.name);
    }
    const kept = rows.filter(r => r.action === "keep");
    if (deleted.length > 0) {
      log(`LOCAL: deleted ${deleted.length} of ${doomed.length} merged local branches whose upstream is gone`);
    }
    for (const name of failed) err(`branch-cleanup: ${name}: git branch -d refused`);
    for (const r of kept.filter(r => r.reason === "checked-out" || r.reason === "unmerged-local")) {
      if (r.reason === "checked-out") log(`LOCAL: ${r.name} is merged into main but checked out in ${worktrees.get(r.name)} (kept)`);
      else if (r.reason === "unmerged-local") log(`LOCAL: ${r.name} upstream is gone but commits are not in main (kept)`);
    }
    return { deleted, kept, failed };
  } catch (error) {
    return { deleted: [], kept: [], failed: [], error };
  }
}

function refreshAuthoritativeRefs() {
  // Explicit destinations update and prune tracking refs even in a main-only clone; config stays untouched.
  if (tryGit("-c", "fetch.pruneTags=false", "-c", "remote.origin.pruneTags=false", "fetch", "-q", "--prune", "--no-tags", "--refmap=", "origin", ...refspecs) === null) fail("STOP: authoritative ref refresh failed; check origin access and run again; no marker written", 2);
  if (tryGit("rev-parse", "--is-shallow-repository") !== "false") fail("STOP: complete history is required; run git fetch --unshallow origin, then run the picker again", 2);
  runLocalCleanup({ tryGit, log: console.log, err: console.error });
  return trackingRefs();
}

function captureDecisionRefs(tasks, refs, register) {
  const names = new Set(["main", REPORTS, LAND_SLOT, ...(LIST_REF.startsWith("origin/") ? [LIST_REF.slice(7)] : []),
    ...tasks.flatMap(t => [t.branch, reviewLockOf(t), architectLockOf(t), heartbeatOf(slugOf(t.branch))])]);
  const slugs = tasks.map(t => `/${slugOf(t.branch)}`);
  const includes = name => names.has(name) || (name.startsWith("agent/") && slugs.some(slug => name.endsWith(slug))) || name.startsWith("agent/queue/fix-main-") || name.startsWith("agent/heartbeat/fix-main-");
  const selected = new Map([...refs].filter(([name]) => includes(name)));
  if (!selected.has("main") || tryGit("rev-list", "--count", ...new Set(selected.values())) === null) fail("STOP: authoritative history is incomplete; fetch full origin main and agent history before running again", 2);
  decisionRefs = { includes, refs: selected, tasks, register };
}

/**
 * PICKER-snapshot-scope (owner, Nov 21 2026: "all agents should be able to get work"): the inputs one
 * write depends on. Before, every write compared every task's refs and main, so any other agent's
 * heartbeat, claim, push or landing during the GitHub reads invalidated every claim, and busy hours
 * ended in "STOP: authoritative refs kept changing". Now a write compares its own task's work, review,
 * architect and heartbeat refs (and any agent ref ending in its slug), the shared report log and
 * landing slot, red-main fix locks and the refs it names. Main is compared by content: see
 * mainInputsUnchanged. Non-force pushes still give first-push-wins on the written ref itself.
 */
function writeScopeOf(rows, extra = []) {
  const tasks = rows.filter(t => typeof t?.branch === "string");
  const names = new Set([REPORTS, LAND_SLOT, ...extra.filter(Boolean)]);
  for (const t of tasks) for (const name of [t.branch, reviewLockOf(t), architectLockOf(t), heartbeatOf(slugOf(t.branch))]) names.add(name);
  if (LIST_REF.startsWith("origin/") && LIST_REF !== "origin/main") names.add(LIST_REF.slice(7));
  const slugs = tasks.map(t => `/${slugOf(t.branch)}`);
  return {
    taskIds: tasks.map(t => t.id),
    includes: name => names.has(name) || (name.startsWith("agent/") && slugs.some(slug => name.endsWith(slug)))
      || name.startsWith("agent/queue/fix-main-") || name.startsWith("agent/heartbeat/fix-main-"),
  };
}
// A landing-slot lease names its task by id only; its full row comes from the decision's own task list.
const scopeOfPick = pick => {
  const task = pick.task && (pick.task.branch ? pick.task : decisionRefs?.tasks.find(t => t.id === pick.task.id));
  return writeScopeOf(task ? [task] : [], [pick.work, pick.lock]);
};

/**
 * PICKER-snapshot-scope: main moved since the decision. The write stands only when this task's own
 * row, its dependencies' rows and its decision sync are unchanged on current main, and its branch has
 * not since reached main (landed). Returns the current main sha, or null to reread and pick again.
 */
function mainInputsUnchanged(scope) {
  if (tryGit("fetch", "-q", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main") === null) return null;
  const current = tryGit("rev-parse", "refs/remotes/origin/main");
  const raw = current && tryGit("show", `${current}:${LIST}`);
  const registerRaw = current && tryGit("show", `${current}:${REGISTER}`);
  if (!raw || !registerRaw) return null;
  let tasks, register;
  try { tasks = JSON.parse(raw).tasks; register = parseDecisionRegister(registerRaw); } catch { return null; }
  if (!Array.isArray(tasks)) return null;
  const before = new Map(decisionRefs.tasks.map(t => [t.id, t])), after = new Map(tasks.map(t => [t.id, t]));
  const same = id => before.has(id) && JSON.stringify(before.get(id)) === JSON.stringify(after.get(id) ?? null);
  const decidedMain = decisionRefs.refs.get("main");
  for (const id of scope.taskIds) {
    const task = before.get(id);
    if (!task || !same(id) || !(task.dependsOn ?? []).every(same)) return null;
    if (outOfSyncOf({ task }, decisionRefs.register) !== outOfSyncOf({ task: after.get(id) }, register)) return null;
    const tip = decisionRefs.refs.get(task.branch);
    if (tip && tryGit("merge-base", "--is-ancestor", tip, decidedMain) === null && tryGit("merge-base", "--is-ancestor", tip, current) !== null) return null;
  }
  return current;
}

function requireCurrentRefs(scope = null) {
  if (!decisionRefs) fail("STOP: no authoritative decision snapshot; no marker written", 2);
  // Without a scope every decision ref must match (the pre-scope behaviour); with one, only the write's own.
  const relevant = name => decisionRefs.includes(name) && (!scope || name === "main" || scope.includes(name));
  // Main is judged by content for a task's write on the default task list; a red-main fix lock stays exact.
  const mainByContent = Boolean(scope) && scope.taskIds.length > 0 && LIST_REF === "origin/main";
  const differs = (refs, skipMain) => {
    const selected = map => [...map].filter(([name]) => relevant(name) && !(skipMain && name === "main"));
    const now = new Map(selected(refs)), then = selected(decisionRefs.refs);
    return now.size !== then.length || then.some(([name, sha]) => now.get(name) !== sha);
  };
  const remote = refsFrom(tryGit("ls-remote", "--heads", "origin", ...refPatterns), "refs/heads/");
  if (differs(remote, mainByContent)) throw new RefSnapshotChanged("authoritative snapshot changed before write");
  if (mainByContent && remote.get("main") !== decisionRefs.refs.get("main")) {
    const current = remote.has("main") ? mainInputsUnchanged(scope) : null;
    if (!current) throw new RefSnapshotChanged("authoritative snapshot changed before write");
    decisionRefs.refs.set("main", current);
  }
  if (differs(trackingRefs(), false)) throw new RefSnapshotChanged("authoritative snapshot changed before write");
}

/**
 * PICKER-avoid-repeat: the task ids every `--avoid` value names. A value is one id or a comma list,
 * and the flag may repeat, because every hand-out says to re-run "with --avoid <id> added".
 */
export function avoidSetOf(values) {
  const list = Array.isArray(values) ? values : values === undefined ? [] : [values];
  return new Set(list.flatMap(value => String(value).split(",")).map(id => id.trim()).filter(Boolean));
}

export function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixed") out.fixed = true;
    else if (a === "--heartbeat") out.heartbeat = true;
    else if (a === "--status") out.status = true;
    else if (a === "--landed") out.landed = true;
    else if (a === "--auto-land") out.autoLand = true;
    else if (["--claim", "--verdict", "--task", "--as", "--report", "--note", "--avoid", "--provenance", "--execution"].includes(a)) {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`${a} needs a value`);
      // --avoid accumulates (a second flag must not silently drop the first); every other flag is last-wins.
      if (a === "--avoid") (out.avoid ??= []).push(v);
      else out[a.slice(2)] = v;
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

/**
 * PICKER-claim-task (D-353 (2)): the answer to `--claim "<name>" --task <id>` when that task cannot be handed to this
 * session now: the reason the picker recorded for it. Nothing is claimed.
 */
export function renderIneligible(pick, who) {
  const id = pick.task?.id ?? pick.id ?? "that task";
  return [
    `NEXT: NOT ELIGIBLE — ${id}${pick.task?.title ? ` — ${pick.task.title}` : ""}`,
    `${pick.reason}.`,
    `Nothing was claimed. Run \`node scripts/next-task.mjs --claim "${who}"\` without --task to be handed the next eligible task, or ask again with --task once this changes.`,
    "",
  ].join("\n");
}

/** The GitHub CLI's token, when an agent is signed in with it; never printed. */
function ghToken() {
  try { return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; }
  catch { return null; }
}

const githubTokenOf = () => process.env.GH_TOKEN || process.env.GITHUB_TOKEN || tryGit("config", "--get", "github.token") || ghToken();

/**
 * PICKER-network-retry (D-324, D-321 (11)): one dropped connection must not stop every session.
 * Measured on the owner's Mac: 1 of 60 identical reads failed with ECONNRESET through the local
 * proxy, and a run makes about 140 reads, so a single attempt stopped runs that a second attempt
 * finished (four consecutive `--claim` runs died at "cannot read main's CI runs from GitHub").
 * Retried: a transport failure or a 5xx/429 answer, twice, on the same read. Never retried: a 4xx
 * (a real answer), the caller's own cancellation, or the 15 s timeout (a slow GitHub must not
 * become a 45 s stall on every read). Writes are not retried here: the snapshot protocol decides.
 */
export const GITHUB_READ_ATTEMPTS = 3;

export function isTransientGithubFailure(error) {
  if (!error || typeof error !== "object") return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return false;
  const status = typeof error.status === "number" ? error.status : null;
  if (status !== null) return status === 429 || status >= 500;
  return error.name === "TypeError" && /fetch failed/i.test(String(error.message ?? ""));
}

const RETRY_DELAY_MS = 400;

export async function github(repo, path, { signal } = {}) {
  // D-109: any token raises GitHub's limit from 60 reads an hour; `gh auth token` covers agents signed in with the GitHub CLI.
  const token = githubTokenOf();
  const headers = { accept: "application/vnd.github+json", "user-agent": "skipwait-next-task", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
      if (!res.ok) {
        const error = Object.assign(new Error(`GitHub ${path} answered ${res.status}`), { status: res.status });
        if (attempt < GITHUB_READ_ATTEMPTS && isTransientGithubFailure(error)) { await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt)); continue; }
        throw error;
      }
      return res.json();
    } catch (error) {
      if (attempt >= GITHUB_READ_ATTEMPTS || !isTransientGithubFailure(error)) throw error;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
}

/** PICKER-auto-land (D-371): one authenticated GitHub write; REST when `path` starts with "/", else a GraphQL query. */
async function githubWrite(repo, method, path, body) {
  const token = githubTokenOf();
  if (!token) throw new Error("no GitHub token (sign in with gh)");
  const graphql = !path.startsWith("/");
  const res = await fetch(graphql ? "https://api.github.com/graphql" : `https://api.github.com/repos/${repo}${path}`, {
    method: graphql ? "POST" : method, signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "skipwait-next-task", authorization: `Bearer ${token}` },
    body: JSON.stringify(graphql ? { query: path, variables: body } : body),
  });
  const json = await res.json().catch(() => ({}));
  // The status travels with the error: a 403 from GraphQL is the cloud proxy's refusal, which has a REST route (D-376).
  if (!res.ok) throw Object.assign(new Error(`GitHub ${graphql ? "GraphQL" : path} answered ${res.status}`), { status: res.status });
  if (graphql && Array.isArray(json.errors) && json.errors.length) throw new Error(`GraphQL: ${String(json.errors[0]?.message ?? "error").slice(0, 120)}`);
  return json;
}

/**
 * PICKER-auto-land (D-371): land every green, in-sync task pull request the board shows; never while main is red,
 * and while the live release is red only its registered fix (D-376). Where GraphQL is refused (Claude Code cloud
 * sessions), the ready and auto-merge steps use the proxy's REST routes (PICKER-auto-land-cloud, D-373 (4)).
 */
async function autoLandFrom({ doc, mainCi, openPrs, prCi, board, release }) {
  const hold = autoLandHold({ mainCi, openPrs });
  if (hold) { console.log(`auto-land: held (${hold})`); return []; }
  const releaseLine = releaseHoldLine(release);
  if (releaseLine) console.log(`auto-land: ${releaseLine}`);
  const candidates = autoLandCandidates({ rows: board, tasks: doc.tasks, prCi, release });
  if (!candidates.length) { console.log("auto-land: no green task pull request waiting"); return []; }
  const rest = route => githubWrite(doc.repo, route.method, route.path, route.body);
  return runAutoLand(candidates, {
    readPull: number => github(doc.repo, `/pulls/${number}`),
    markReady: graphqlOrRest(
      id => githubWrite(doc.repo, "POST", "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){clientMutationId}}", { id }),
      (_id, number) => rest(CLOUD_ROUTES.ready(number))),
    updateBranch: (number, sha) => githubWrite(doc.repo, "PUT", `/pulls/${number}/update-branch`, { expected_head_sha: sha }),
    enableAutoMerge: graphqlOrRest(
      id => githubWrite(doc.repo, "POST", "mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:MERGE}){clientMutationId}}", { id }),
      (_id, number) => rest(CLOUD_ROUTES.autoMerge(number))),
    mergeNow: (number, sha) => githubWrite(doc.repo, "PUT", `/pulls/${number}/merge`, { merge_method: "merge", sha }),
    log: line => console.log(line),
  });
}

/**
 * D-237: one read per branch, shared by the marker list and the `work` flag. Marker commits are empty: a
 * commit that changes files is work, whatever its subject says (D-190).
 */
function commitsOn(ref) {
  return parseProvenanceLog(tryGit("log", "--reverse", "--no-merges", `--format=${PROVENANCE_LOG_FORMAT}`, "--name-only", `origin/main..${ref}`) ?? "");
}

const markersOn = commits => commits.flatMap(({ sha, subject, body, files }) => {
  const m = files.length ? null : parseMarker(subject);
  return m ? [{ ...m, sha, body, ...(m.verb === "Verdict" ? { reviewed: /^reviewed ([a-f0-9]{40})$/m.exec(body)?.[1] ?? null } : {}) }] : [];
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
    // PICKER-landed-marker-continuity: only provably empty, recognized markers (and no merge commit) beyond main.
    const merges = Number(tryGit("rev-list", "--merges", "--count", `origin/main..${ref}`) ?? NaN);
    branches.set(name, { tipMs: Number(unix) * 1000, tipSha: sha, merged, work: commits.some(c => c.files.length > 0), markerOnly: markerOnlyOf(commits, merges), markers: markersOn(commits) });
  }
  return branches;
}

/**
 * PICKER-landed-marker-continuity: verified merged pull requests for the todo rows whose branch is gone or carries
 * only markers, beyond the newest-100 closed window (S1, S2). Merged pull requests are cached in the clone's git
 * directory (never in the repository); an incomplete or failed read is unknown, which the core never counts as landed.
 */
async function landedEvidenceFor(doc, branches, mergedHeads, closedFirst) {
  if (mergedHeads === null || closedFirst === null) return new Map();
  const candidates = doc.tasks.filter(t => {
    if (t.status !== "todo") return false;
    const info = branches.get(t.branch);
    if (!info) return !mergedHeads.has(t.branch);
    return info.markerOnly === true && !info.merged;
  }).map(t => t.branch);
  if (!candidates.length) return new Map();
  const dir = tryGit("rev-parse", "--git-common-dir");
  const file = dir ? path.join(path.resolve(dir), "skipwait-next-task", "merged-pulls.json") : null;
  let cache = null;
  try { cache = file ? JSON.parse(readFileSync(file, "utf8")) : null; } catch { cache = null; }
  const out = await collectLandedEvidence({
    repo: doc.repo, candidates, firstPage: closedFirst, cache, now: Date.now(),
    fetchPage: page => github(doc.repo, `/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`),
    verify: pull => verifyMergedPull(pull, { repo: doc.repo, tryGit, mainRef: "origin/main" }),
  });
  try { if (file) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(out.cache) + "\n"); } } catch (e) { console.error(`next-task: could not save the merged pull request cache: ${e.message}`); }
  const unknown = [...out.evidence].filter(([, e]) => e.state === "unknown");
  if (unknown.length) console.error(`next-task: landed state UNKNOWN for ${unknown.length} branch(es) (${unknown[0][1].reason}); they are treated as not landed`);
  return out.evidence;
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
    const merged = tryGit("merge-base", "--is-ancestor", branch, "refs/remotes/origin/main") !== null;
    // ahead: commits only this clone has; null means the branch itself is missing from origin with commits on it.
    local.push({ branch, ahead: onOrigin ? unpushed : (unpushed ? null : 0), dirty, path, merged });
  }
  const mainBehind = tryGit("rev-parse", "--verify", "-q", "refs/heads/main") ? Number(tryGit("rev-list", "--count", "main..origin/main") ?? 0) : 0;
  return { local, mainBehind };
}

/** D-085: the reports the team sent the CEO, newest first (one marker commit each on agent/reports/log), cleaned again on read. */
function loadReports(context) {
  const raw = tryGit("log", "-n", "500", "--format=%H%x1f%ct%x1f%s%x1f%b%x1e", `refs/remotes/origin/${REPORTS}`);
  if (!raw) return [];
  const restored = new Set();
  return raw.split("\x1e").map(rec => rec.trim()).filter(Boolean).flatMap(rec => {
    const [sha, ct, subject, body = ""] = rec.split("\x1f");
    const m = parseMarker(subject ?? "");
    if (m?.verb !== "Report") return [];
    const report = { id: m.id, status: m.status, who: sanitizeName(m.who), at: Number(ct) * 1000, ...parseReportBody(body) };
    if (report.status === "blocked" && !report.evidence && context && !restored.has(report.id)) {
      restored.add(report.id);
      const task = context.tasks.find(row => row.id === report.id);
      if (task && task.status !== "done") {
        // The report log's tree is an old marker snapshot, not main at report
        // time. Recover the actual main history rather than that stale tree.
        const mainAt = tryGit("rev-list", "-1", `--before=${Number(ct) + 1}`, "origin/main");
        const oldList = mainAt ? tryGit("show", `${mainAt}:${LIST}`) : null;
        const oldRegister = mainAt ? tryGit("show", `${mainAt}:${REGISTER}`) : null;
        if (oldList && oldRegister) {
          const historicalTasks = JSON.parse(oldList).tasks;
          const oldTask = historicalTasks.find(row => row.id === report.id) ?? task;
          const historicalBranches = new Map();
          for (const name of [task.branch, architectLockOf(task)]) {
            const tipSha = tryGit("rev-list", "-1", `--before=${Number(ct) + 1}`, originRef(name));
            if (tipSha) historicalBranches.set(name, { tipSha });
          }
          report.evidence = blockEvidenceFor({ task: oldTask, tasks: historicalTasks, branches: historicalBranches, register: parseDecisionRegister(oldRegister) });
        }
      }
    }
    return [report];
  });
}

const originRef = name => `refs/remotes/origin/${name}`;

/**
 * PICKER-path-tier-review (D-353 (1)): for each open pull request of a task, the paths its tip changed against main and
 * whether the CI review gate already clears that tip, read with the gate's own functions (changedPathsOf,
 * reviewGateViolation) so the picker and CI never disagree. Any failure leaves the paths unknown (the declared tier then
 * decides) and gateClear false (the review stage is handed out as before). A landing's status commit is not recognised
 * here (isStatusCommit is false), so such a head reads as not clear: stricter than the gate, never looser.
 */
function pullRequestFacts(tasks, heads, branches) {
  const facts = new Map();
  let trusted = null;
  for (const head of heads) {
    const tipSha = tryGit("rev-parse", "--verify", "-q", originRef(head));
    if (!tipSha) continue;
    let paths = null;
    try { paths = changedPathsOf(tipSha); } catch { paths = null; }
    let gateClear = false;
    const task = findGateRow(tasks, head);
    if (task && Array.isArray(paths) && paths.length) {
      try {
        trusted ??= loadTrustedProvenance(tryGit);
        const nonMergeCommitsSince = sha => {
          if (tryGit("merge-base", "--is-ancestor", sha, tipSha) === null) return null;
          return (tryGit("rev-list", "--no-merges", `${sha}..${tipSha}`, "--not", "origin/main") ?? "").split("\n").filter(Boolean);
        };
        const isEmptyCommit = sha => {
          const tree = tryGit("rev-parse", `${sha}^{tree}`);
          return tree !== null && tree === tryGit("rev-parse", `${sha}^1^{tree}`);
        };
        gateClear = reviewGateViolation({
          task, head: tipSha, workMarkers: branches.get(head)?.markers ?? [], lockMarkers: branches.get(reviewLockOf(task))?.markers ?? [],
          nonMergeCommitsSince, isStatusCommit: () => false, isEmptyCommit,
          tierOf: changed => classifyTier(changed).tier, tierReasonPaths, changedPaths: paths, provenance: { ...trusted, git: tryGit },
        }) === null;
      } catch { gateClear = false; }
    }
    facts.set(head, { tipSha, paths, gateClear });
  }
  return facts;
}
const onOrigin = name => tryGit("rev-parse", "--verify", "-q", originRef(name)) !== null;
const tip = name => git("rev-parse", originRef(name));
const base = name => (onOrigin(name) ? tip(name) : git("rev-parse", "origin/main"));
/**
 * A lock ref can vanish between the snapshot read and the claim: another session
 * merges it and a concurrent prune drops the remote-tracking ref. The snapshot
 * said it existed, so `tip()` would throw and the whole pick would fail. Re-check
 * the ref and fall back to main, which is what a lock that never existed uses.
 * Pure over its three readers so the regression can pin it without a live repo.
 */
export const lockTipWith = ({ exists, tipOf, main }) => (name, existed) => (existed && exists(name) ? tipOf(name) : main());

/** Other tasks' empty reports do not change this task's report/deduplication inputs. */
function reportParentFor(task) {
  const previous = decisionRefs.refs.get(REPORTS);
  // A newly created log must still invalidate the original snapshot.
  if (!previous) return base(REPORTS);
  if (tryGit("fetch", "-q", "--no-tags", "origin", `+refs/heads/${REPORTS}:${originRef(REPORTS)}`) === null) {
    throw new RefSnapshotChanged("report log refresh failed before append");
  }
  const current = tip(REPORTS);
  if (current === previous) return current;
  const range = `${previous}..${current}`;
  if (tryGit("merge-base", "--is-ancestor", previous, current) === null
    || tryGit("rev-list", "--count", "--merges", range) !== "0") {
    throw new RefSnapshotChanged("report log history changed before append");
  }
  const changes = parseBranchLog(git("log", "--reverse", `--format=${BRANCH_LOG_FORMAT}`, "--name-only", range));
  if (!changes.length || changes.some(change => {
    const marker = parseMarker(change.subject);
    return change.files.length !== 0 || marker?.verb !== "Report" || !marker.who || marker.id === task.id;
  })) throw new RefSnapshotChanged("relevant or unknown report log input changed before append");
  // The final scoped guard and non-force push still validate this exact parent.
  decisionRefs.refs.set(REPORTS, current);
  return current;
}

/**
 * Push one empty marker commit onto `parent` as `branch`. Returns the new
 * commit, or null when another agent got there first; any other refusal
 * (auth, a ruleset, the network) stops the run with git's own words.
 */
function pushMarker(branch, parent, subject, body, scope = null) {
  const sha = git("commit-tree", `${parent}^{tree}`, "-p", parent, "-m", subject, ...(body ? ["-m", body] : []));
  requireCurrentRefs(scope);
  const res = spawnSync("git", ["push", "-q", "origin", `${sha}:refs/heads/${branch}`], { encoding: "utf8", env: GIT_ENV });
  if (res.status === 0) {
    if (tryGit("update-ref", originRef(branch), sha) === null) fail(`STOP: pushed ${branch}, but its tracking ref could not be refreshed; fetch origin before running again`, 2);
    if (decisionRefs.includes(branch)) decisionRefs.refs.set(branch, sha);
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
function keepClaim(pick, who, branches, provenanceBody) {
  const scope = scopeOfPick(pick);
  const all = [...(branches.get(pick.work || pick.task?.branch)?.markers ?? []), ...(branches.get(pick.lock)?.markers ?? [])];
  const external = all.some(m => m.id === pick.task?.id && markerReferences(m.body).external);
  const leasePreview = leaseFor(pick, branches, Date.now());
  if (MODEL_ROUTES_ENFORCED && external && (leasePreview.verb !== "Heartbeat" || pick.of === "land")) {
    const refs = markerReferences(provenanceBody);
    const role = ({ review: "review", land: "land", fix: "fix", build: "build" })[pick.of];
    const result = routeIdentity(loadTrustedProvenance(tryGit).registry, refs.route, who, pick.task.id, role);
    if (refs.invalid || !result.ok) fail("external reclaim requires its actual qualified operator route");
  }
  if (pick.of === "land") {
    const slot = landingSlot(branches, Date.now());
    // PICKER-heartbeat-slot-safety: another lander's fresh slot is theirs. Renewing this holder's own LAND lease
    // below never writes it; a free or quiet slot is taken as before (first push wins, a lost race fails closed).
    const othersFresh = Boolean(slot.holder) && slot.holder !== who && !slot.quiet;
    if (!othersFresh && (slot.holder !== who || slot.quiet)) {
      const parent = onOrigin(LAND_SLOT) ? tip(LAND_SLOT) : git("rev-parse", "origin/main");
      try {
        const took = pushMarker(LAND_SLOT, parent, markerSubject("Land claim", pick.task.id, who), provenanceBody, scope);
        if (!took) return false;
      } catch (error) {
        // A contested shared slot never retries on top of its new holder or writes a side lease.
        if (error instanceof RefSnapshotChanged) return false;
        throw error;
      }
    }
  }
  const lease = leaseFor(pick, branches, Date.now());
  const subject = markerSubject(lease.verb, lease.id, who);
  let parent = base(lease.ref);
  let sha = pushMarker(lease.ref, parent, subject, lease.verb === "Heartbeat" ? undefined : provenanceBody, scope);
  if (!sha && lease.retry) {
    // Reread ownership as well as the destination tip before retrying a side heartbeat.
    refreshAuthoritativeRefs();
    throw new RefSnapshotChanged("heartbeat push rejected; authoritative snapshot changed");
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

async function state({ withRelease = false } = {}) {
  const refreshedRefs = refreshAuthoritativeRefs();
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
  captureDecisionRefs(doc.tasks, refreshedRefs, register);
  // D-085: every GitHub read is known or unknown; an unknown one stops the picker instead of looking like "nothing there".
  let mainCi = { state: "unknown" }, openPrs = null, mergedHeads = null, closedFirst = null;
  const prCi = new Map();
  try { mainCi = ciStateFromRuns((await github(doc.repo, "/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10")).workflow_runs); }
  catch (e) { console.error(`next-task: ${e.message}`); }
  try {
    // BRANCH-HYGIENE "See every pull request": page by page, never one page of 100 (D-085).
    const first = await github(doc.repo, "/pulls?state=open&per_page=100&page=1");
    const read = await collectOpenPulls({ firstPage: first, fetchPage: page => github(doc.repo, `/pulls?state=open&per_page=100&page=${page}`) });
    if (!read.complete) throw new Error(`open pull requests unknown: ${read.reason}`);
    openPrs = new Map(read.pulls.filter(p => p.head?.repo?.full_name === doc.repo).map(p => [p.head.ref, p.html_url]));
  } catch (e) { console.error(`next-task: ${e.message}`); }
  try {
    const closed = await github(doc.repo, "/pulls?state=closed&sort=updated&direction=desc&per_page=100");
    closedFirst = closed;
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
    // PICKER-land-exact-head (D-293): find the tip's run when it has aged out of the newest 100 runs.
    for (const head of heads) {
      const ci = prCi.get(head);
      if (ci?.state === "error") continue;
      const tipSha = tryGit("rev-parse", "--verify", "-q", originRef(head));
      if (!tipSha || ci?.sha === tipSha) continue;
      try {
        const runs = (await github(doc.repo, `/actions/workflows/ci.yml/runs?head_sha=${tipSha}&per_page=10`)).workflow_runs;
        if (Array.isArray(runs) && runs.length) prCi.set(head, ciStateFromRuns(runs));
      } catch (e) {
        console.error(`next-task: ${e.message}`);
      }
    }
    // PICKER-gate-red-review-route (D-291): a red run on the branch's exact tip gets one read of its jobs, so a red
    // that is only the review gate's own step can be handed REVIEW. Fail closed: a missing run id, a run not on the
    // tip, or any fetch or parse error leaves gateOnly false and the picker keeps handing MAKE GREEN.
    for (const head of heads) {
      const ci = prCi.get(head);
      if (ci?.state !== "red") continue;
      ci.gateOnly = false;
      ci.legacyScope = false;
      const tipSha = tryGit("rev-parse", "--verify", "-q", originRef(head));
      if (!Number.isSafeInteger(ci.runId) || !tipSha || ci.sha !== tipSha) continue;
      try {
        const jobs = await github(doc.repo, `/actions/runs/${ci.runId}/jobs?per_page=100`);
        ci.gateOnly = gateOnlyRedFromJobs(jobs) === true;
        // D-314: the same one read tells a pre-D-292 run red only at the old scope-check step (still MAKE GREEN).
        ci.legacyScope = !ci.gateOnly && legacyScopeRedFromJobs(jobs) === true;
      }
      catch (e) { console.error(`next-task: ${e.message}`); }
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
  const branches = loadBranches(doc.tasks);
  const prFacts = pullRequestFacts(doc.tasks, heads, branches);
  const landedEvidence = await landedEvidenceFor(doc, branches, mergedHeads, closedFirst);
  let release;
  if (withRelease) {
    try {
      const { readLiveRelease } = await import("./nextTaskReleaseRead.mjs");
      release = await readLiveRelease({ repo: doc.repo, github, mainCi, tryGit });
    } catch { console.error("next-task: release reader unavailable; live release is unknown, no added landing hold"); }
  }
  return { doc, register, mainCi, openPrs, mergedHeads, landedEvidence, prCi, prFacts, prBehind, branches, release, reports: loadReports({ tasks: doc.tasks }) };
}

function claim(pick, who, branches, provenanceBody) {
  const history = [...(branches.get(pick.work || pick.task?.branch)?.markers ?? []), ...(branches.get(pick.lock)?.markers ?? [])];
  // D-370: no model dependency; a task's external-route history no longer limits who may claim it.
  if (MODEL_ROUTES_ENFORCED && !provenanceBody && pick.kind !== "continue" && history.some(m => m.id === pick.task?.id && markerReferences(m.body).external)) fail("external task claim requires its actual qualified operator route");
  const origin = () => git("rev-parse", "origin/main");
  const lockTip = lockTipWith({ exists: onOrigin, tipOf: tip, main: origin });
  const scope = scopeOfPick(pick);
  switch (pick.kind) {
    case "build": return Boolean(pushMarker(pick.task.branch, origin(), markerSubject("Claim", pick.task.id, who), provenanceBody, scope));
    case "takeover":
    case "green": return Boolean(pushMarker(pick.work, tip(pick.work), markerSubject("Takeover", pick.task.id, who), provenanceBody, scope));
    case "land": {
      const parent = onOrigin(LAND_SLOT) ? tip(LAND_SLOT) : git("rev-parse", "origin/main");
      const tookSlot = pushMarker(LAND_SLOT, parent, markerSubject("Land claim", pick.task.id, who), provenanceBody, scope);
      if (!tookSlot) return false;
      if (pick.tier1) {
        return Boolean(pushMarker(pick.lock, tip(pick.lock), markerSubject("Land claim", pick.task.id, who), provenanceBody, scope));
      }
      return Boolean(pushMarker(pick.work, tip(pick.work), markerSubject("Takeover", pick.task.id, who), provenanceBody, scope));
    }
    case "unblock": return Boolean(pushMarker(pick.lock, lockTip(pick.lock, pick.lockExists), markerSubject("Unblock", pick.task.id, who), provenanceBody, scope));
    case "architect":
    case "resync": return Boolean(pushMarker(pick.lock, lockTip(pick.lock, pick.lockExists), markerSubject(pick.lockExists ? "Takeover" : "Claim", pick.task.id, who), undefined, scope));
    case "fix-main": return Boolean(pushMarker(pick.lock, pick.parent ? tip(pick.parent) : origin(), markerSubject(pick.parent ? "Takeover" : "Claim", fixMainIdOf(pick.sha), who), undefined, scope));
    case "review": return Boolean(pushMarker(pick.lock, lockTip(pick.lock, pick.lockExists), markerSubject("Review claim", pick.task.id, who), provenanceBody, scope));
    case "fix": return onOrigin(pick.lock) && Boolean(pushMarker(pick.lock, tip(pick.lock), markerSubject("Fix claim", pick.task.id, who), provenanceBody, scope));
    case "continue": return keepClaim(pick, who, branches, provenanceBody);
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

/**
 * SYNC-auto-push (D-375): a clone where sessions claim work pushes every commit on its own. Installs the
 * post-commit hook (and the 15-minute timer on macOS) when missing; silent when in place, in CI, a test run, a
 * cloud container or after an opt-out. It never stops the picker: any failure is one printed line.
 */
function autoSyncSetup() {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("./sync-clone.mjs", import.meta.url)), "--auto-setup"], { encoding: "utf8", timeout: 30_000 });
  const lines = `${run.stdout ?? ""}${run.status === 0 || run.status === 1 ? "" : run.stderr ?? ""}`.trim();
  if (lines) console.log(`AUTO-PUSH (D-375): ${lines.split("\n").join("\n  ")}\n`);
}

async function main() {
  if (LIST_REF.startsWith("origin/") && LIST_REF !== "origin/main" && !LIST_REF.startsWith("origin/agent/")) {
    const branch = LIST_REF.slice(7);
    if (tryGit("check-ref-format", `refs/heads/${branch}`) === null) fail("STOP: invalid task-list ref", 2);
    refPatterns.push(`refs/heads/${branch}`);
    refspecs.push(`+refs/heads/${branch}:refs/remotes/origin/${branch}`);
  }
  const args = argsOf(process.argv.slice(2));
  if (args.claim) {
    autoSyncSetup();
    const who = sessionName(args.claim, randomBytes(3).toString("hex").slice(0, 4));
    if (who !== sanitizeName(args.claim)) console.log(`Your session name is "${who}". Use exactly this name for --heartbeat, --report, --verdict and --fixed, and claim with it when you resume.\n`);
    args.claim = who;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await runCommand(args); }
    catch (error) {
      if (!(error instanceof RefSnapshotChanged)) throw error;
      console.error(`next-task: snapshot changed (attempt ${attempt}); refreshing and rereading before any further write`);
    }
  }
  fail("STOP: authoritative refs kept changing; run again for a fresh decision; earlier confirmed writes remain on origin", 2);
}

async function runCommand(args) {
  const date = new Date().toLocaleDateString("en-CA");
  if (args.verdict || args.fixed) {
    const { doc, register, branches, openPrs } = await state();
    const task = doc.tasks.find(t => t.id === args.task) ?? fail(`no task ${args.task}`);
    const lockName = reviewLockOf(task), lock = branches.get(lockName);
    const stage = reviewStateOf(lock, task.id);
    const holder = stageHolderOf(lock, task.id);
    // PROCESS-review-gate (D-166): the reviewer who passed may re-record the pass on the current head (after a merge of main, or
    // over a verdict written before verdicts named their head); a landing refuses a head no verdict names.
    const reviewer = [...(lock?.markers ?? [])].reverse().find(m => m.id === task.id && m.verb === "Review claim")?.who ?? null;
    const rerecord = args.verdict === "pass" && ["passed", "landing"].includes(stage) && reviewer === args.as;
    if (args.verdict && !rerecord && (stage !== "in-review" || holder !== args.as)) fail(`only the reviewer holding ${lockName} records a verdict (it is ${stage}, held by ${holder ?? "nobody"})`);
    // D-344 (7): the fixer may re-record its own Fixed marker on a newer head (stage needs-review, its own Fixed last).
    const refreshFixed = args.fixed && stage === "needs-review" && holder === args.as && [...(lock?.markers ?? [])].reverse().find(m => m.id === task.id && m.verb !== "Heartbeat")?.verb === "Fixed";
    const packetHead = args.fixed ? packetFixHead({ task, branches, openPrs, claimant: args.as }) : null;
    if (args.fixed && !packetHead && !refreshFixed && (stage !== "fixing" || holder !== args.as)) fail(`only the agent holding the fix claim on ${lockName} marks it fixed (it is ${stage}, held by ${holder ?? "nobody"})`);
    if (args.fixed) {
      requireSynced(doc, branches, args.as);
      const stale = packetHead ? outOfSyncOf({ task }, register) : null;
      if (stale) fail(`re-sync ${task.id} with ${stale} before recording Fixed`);
    }
    const subject = args.verdict ? markerSubject("Verdict", task.id, args.as, args.verdict) : markerSubject("Fixed", task.id, args.as);
    // The body names the head reviewed: the tip of the task's branch on origin now, which the gate compares with the PR head.
    const architect = architectLockOf(task);
    const reviewedBranch = task.status === "architect" && onOrigin(architect) && openPrs?.has(architect) ? architect : task.branch;
    const reviewed = args.verdict ? (onOrigin(reviewedBranch) ? tip(reviewedBranch) : fail(`${reviewedBranch} is not on origin; there is no head to review`)) : null;
    // D-344 (7): a Fixed marker names the head it fixed, so the review gate can land it without a re-review.
    if (packetHead && (reviewedBranch !== architect || tip(architect) !== packetHead)) fail(`${architect} moved; fetch and run again`);
    const fixedAt = args.fixed ? (packetHead ?? (onOrigin(reviewedBranch) ? tip(reviewedBranch) : fail(`${reviewedBranch} is not on origin; there is no head to mark fixed`))) : null;
    const body = [reviewed ? `reviewed ${reviewed}` : null, fixedAt ? `fixed ${fixedAt}` : null, args.provenance ? `provenance ${args.provenance}` : null, args.execution ? `execution ${args.execution}` : null].filter(Boolean).join("\n");
    const history = [...(branches.get(reviewedBranch)?.markers ?? []), ...(lock?.markers ?? [])];
    if (MODEL_ROUTES_ENFORCED && (args.provenance || history.some(m => markerReferences(m.body).external))) {
      if (!args.provenance || !args.execution) fail("external completion requires qualified route and execution IDs");
      const head = reviewed ?? fixedAt;
      const marker = { id: task.id, who: args.as, verb: args.verdict ? "Verdict" : "Fixed", verdict: args.verdict, reviewed, body };
      const trusted = loadTrustedProvenance(tryGit);
      const result = resolveTaskProvenance({ taskId: task.id, head, workMarkers: branches.get(reviewedBranch)?.markers ?? [], lockMarkers: [...(lock?.markers ?? []), marker], ...trusted, git: tryGit });
      if (!result.ok) fail(`external completion held: ${result.reason}`);
      const model = result.reviewers?.get(args.as);
      if (args.verdict && (!model || [...result.builders, ...result.fixers].includes(model))) fail("external reviewer also built or fixed this work");
    }
    const reviewParent = packetHead ? lock.tipSha : tip(lockName);
    if (!pushMarker(lockName, reviewParent, subject, body || undefined, writeScopeOf([task], [lockName]))) fail(`could not push ${lockName}: it moved; fetch and run again`);
    console.log(`Recorded on ${lockName}: ${subject}${reviewed ? ` (reviewed ${reviewed})` : ""}${fixedAt ? ` (fixed ${fixedAt})` : ""}`);
    if (fixedAt) console.log("The PR's review-gate result was computed before this marker: re-run its failed checks (or push a merge of main) so CI re-evaluates the gate on this head.");
    return;
  }
  if (args.landed) {
    const { doc, branches } = await state();
    const task = doc.tasks.find(t => t.id === args.task) ?? fail(`no task ${args.task}`);
    const err = releaseLandingSlotError({ branches, task, claimant: args.as, now: Date.now() });
    if (err) fail(err);
    const subject = markerSubject("Landed", task.id, args.as);
    const parent = onOrigin(LAND_SLOT) ? tip(LAND_SLOT) : git("rev-parse", "origin/main");
    if (!pushMarker(LAND_SLOT, parent, subject, undefined, writeScopeOf([task]))) fail(`could not push ${LAND_SLOT}: it moved; fetch and run again`);
    console.log(`Released landing slot ${LAND_SLOT}: ${subject}`);
    return;
  }
  if (args.autoLand) {
    const { doc, register, mainCi, openPrs, mergedHeads, landedEvidence, prCi, prFacts, prBehind, branches, reports, release } = await state({ withRelease: true });
    const board = statusBoard({ tasks: doc.tasks, branches, openPrs, mergedHeads, landedEvidence, prCi, prFacts, prBehind, reports, now: Date.now(), register });
    await autoLandFrom({ doc, mainCi, openPrs, prCi, board, release });
    return;
  }
  if (args.status) {
    const { doc, register, mainCi, openPrs, mergedHeads, landedEvidence, prCi, prFacts, prBehind, branches, reports, release } = await state({ withRelease: true });
    const newest = register.at(-1);
    console.log(`Register: ${newest.id}, ${newest.date} — ${newest.title}`);
    console.log(`main CI: ${mainCi.state}${mainCi.url ? ` (${mainCi.url})` : ""}${openPrs === null || mergedHeads === null ? " · pull requests: UNKNOWN (GitHub read failed; the board may be wrong)" : ""}\n`);
    console.log(release ? renderReleaseLights(release) : "LIVE RELEASE: unknown (reader unavailable; no added landing hold)\n");
    console.log(renderBoard(statusBoard({ tasks: doc.tasks, branches, openPrs, mergedHeads, landedEvidence, prCi, prFacts, prBehind, reports, now: Date.now(), register })));
    return;
  }
  if (args.report) {
    const { doc, branches, register, reports, openPrs, mergedHeads, landedEvidence } = await state();
    const task = doc.tasks.find(t => t.id === args.task) ?? fail(`no task ${args.task}`);
    // A report can hold or release every lower priority, so only the task's own people or the CEO send one (D-085).
    if (!mayReport({ task, branches, claimant: args.as })) fail(`"${args.as}" holds no part of ${task.id}; only its builder, reviewer, fixer, lander, unblocker or the CEO reports on it`);
    requireSynced(doc, branches, args.as);
    const blockInput = { task, tasks: doc.tasks, branches, register, reports, openPrs: openPrs ?? new Map(), mergedHeads: mergedHeads ?? new Map(), landedEvidence, now: Date.now() };
    if (args.report === "blocked") {
      const duplicate = blockedReportError(blockInput);
      if (duplicate) fail(duplicate);
    }
    // One plain line: no secrets, tokens or personal data (the repo is public, D-059).
    const note = sanitizeNote(args.note);
    const subject = markerSubject("Report", task.id, args.as, args.report);
    const body = args.report === "blocked" ? blockedReportBody(note, blockEvidenceFor(blockInput)) : note;
    const sha = pushMarker(REPORTS, reportParentFor(task), subject, body, writeScopeOf([task]));
    if (!sha) {
      refreshAuthoritativeRefs();
      throw new RefSnapshotChanged("report push rejected; authoritative snapshot changed");
    }
    console.log(`Reported to the CEO on ${REPORTS}: ${subject}${note ? ` — ${note}` : ""}`);
    return;
  }
  if (args.heartbeat) {
    const { doc, mainCi, openPrs, mergedHeads, landedEvidence, prCi, prFacts, branches, reports } = await state();
    // Without the pull requests, a Tier 1 branch under review would look like a build to keep alive, and a claim marker would land on it.
    if (openPrs === null || mergedHeads === null) fail("cannot read the pull requests from GitHub; a heartbeat now could push a claim onto a branch under review (D-085); run this again when GitHub answers", 2);
    const mainSha = mainCi.state === "red" || mainCi.state === "running-after-red" ? mainCi.sha : null;
    // A heartbeat keeps what you hold alive whatever main's CI says (D-085).
    // D-134: every claim you hold stays alive, not only the first one in queue order.
    const helds = heldAllBy({ tasks: doc.tasks, branches, openPrs, mergedHeads, landedEvidence, prCi, prFacts, reports, claimant: args.as, mainSha, now: Date.now() });
    if (!helds.length) fail(`"${args.as}" holds no task, so there is nothing to keep alive; run --claim to take one`);
    // Commits only on this machine are the real heartbeat: push them first, or a marker on origin would leave your branch diverged.
    const { local, mainBehind } = localState();
    const sync = localSyncIssues({ local, branches, claimant: args.as, mainBehind, tasks: doc.tasks });
    const unpushed = helds.map(h => h.work ?? h.lock).filter(b => sync.unpushed.includes(b));
    if (unpushed.length) { printSync(sync); fail(`push your commits on ${unpushed.join(", ")} first (that push keeps the claim alive), then run this again`, 3); }
    const lost = helds.filter(h => !keepClaim(h, args.as, branches, args.provenance ? `provenance ${args.provenance}` : undefined));
    for (const h of helds.filter(h => !lost.includes(h))) console.log(`Heartbeat recorded: ${h.of === "fix-main" ? h.lock : h.task.id} stays yours for the next 2 hours.`);
    if (lost.length) fail(`another agent took ${lost.map(h => h.task?.id ?? h.lock).join(", ")} first; run --claim "${args.as}" to see what is yours`);
    return;
  }
  // Keep the same unique session identity across every snapshot retry.
  const who = args.claim ?? args.as ?? null;
  // D-324: many sessions start at once and race for the same top pick; six tries let each fall through to its own.
  for (let attempt = 1; attempt <= 6; attempt++) {
    const { doc, register, mainCi, openPrs, mergedHeads, landedEvidence, prCi, prFacts, prBehind, branches, reports, release } = await state({ withRelease: true });
    const now = Date.now();
    const avoid = avoidSetOf(args.avoid);
    const provenance = { ...loadTrustedProvenance(tryGit), git: tryGit, routeId: args.provenance };
    // PICKER-claim-task (D-353 (2)): --task restricts the pick to that one task.
    const pick = pickNextTask({ provenance, tasks: doc.tasks, mainCi, branches, openPrs, mergedHeads, landedEvidence, prCi, prFacts, reports, release, now, claimant: who, avoid, register, ...(args.task ? { only: args.task } : {}) });
    if (args.provenance) pick.provenanceRoute = args.provenance;
    // D-085: every agent starts from the same picture — the priorities top down, green or not (in summary, D-358).
    const board = statusBoard({ tasks: doc.tasks, branches, openPrs, mergedHeads, landedEvidence, prCi, prFacts, prBehind, reports, now, register });
    // PICKER-auto-land (D-371): every claim first lands the green, in-sync task pull requests the board shows.
    if (args.claim && attempt === 1) await autoLandFrom({ doc, mainCi, openPrs, prCi, board, release });
    if (pick.kind === "ceo") pick.board = board;
    // D-358: the short board, so the assignment below survives an agent's output cap; --status prints the full one.
    else console.log(renderBoardSummary(board));
    const { local, mainBehind } = localState();
    const sync = localSyncIssues({ local, branches, claimant: who, mainBehind, tasks: doc.tasks });
    printSync(sync);
    const continuing = pick.kind === "continue" ? pick.work ?? pick.lock : null;
    // New work waits until your own work is on origin; your own claim waits until its commits are.
    if (CLAIMABLE.includes(pick.kind) && sync.blocking.length && (!continuing || sync.unpushed.includes(continuing))) {
      console.log("NEXT: SYNC FIRST\nYour own work is not on origin (the MUST PUSH lines above). Push it, then run this again. Nothing new was claimed.\n");
      process.exitCode = 3;
      return;
    }
    if (pick.kind === "ineligible") {
      console.log(renderIneligible(pick, who ?? "<your session name>"));
      process.exitCode = EXIT.ineligible;
      return;
    }
    if (!args.claim || !CLAIMABLE.includes(pick.kind)) {
      console.log(renderPick(pick, { who: who ?? "<your session name>", date, claimed: false, register, requestedTask: args.task }));
      process.exitCode = EXIT[pick.kind] ?? 0;
      return;
    }
    if (args.provenance) {
      const role = ({ build: "build", takeover: "build", green: "build", review: "review", fix: "fix", land: "land" })[pick.kind === "continue" ? pick.of : pick.kind];
      if (!role) fail("external provenance is unsupported for this picked stage");
      const route = routeIdentity(provenance.registry, args.provenance, who, pick.task.id, role);
      if (!route.ok) fail(route.reason);
    }
    if (claim(pick, who, branches, args.provenance ? `provenance ${args.provenance}` : undefined)) { console.log(renderPick(pick, { who, date, claimed: true, register })); return; }
    console.error(`next-task: another agent pushed first (attempt ${attempt}); picking again`);
  }
  fail("six claims in a row were taken by other agents; run again in a minute");
}

// PROCESS-provenance-loader-bounds: run only when executed as the CLI, so the
// regression can import these real bindings without starting a picker run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.on("error", error => {
    console.error(`next-task: stdout write failed: ${error.code ?? error.message}`);
    process.exitCode = 1;
  });
  main().catch(error => {
    if (error instanceof CliFailure) {
      process.exitCode = error.code;
      return;
    }
    console.error(`next-task: ${error.stack ?? String(error)}`);
    process.exitCode = 1;
  });
}

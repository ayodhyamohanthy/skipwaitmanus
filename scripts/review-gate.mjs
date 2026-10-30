#!/usr/bin/env node
/**
 * PROCESS-review-gate (D-166, docs/plans/PROCESS-gates.md): a Tier 1 row merges only after an
 * independent pass verdict on its exact head (D-074, D-151).
 *
 *   node scripts/review-gate.mjs        # check the current branch's head now (a lander's check)
 *
 * In CI it runs from `scripts/scope-check.mjs` right after the queue gate, on pull requests only.
 * It finds the row as the queue gate does (the row's own branch, or a marker branch of its slug).
 * A Tier 2 or 3 row, or no row, passes here; the queue gate handles the no-row case. For a Tier 1
 * row it reads the row's review lock (`agent/review/<slug>`) and passes only when:
 *   1. the newest stage marker is a pass verdict, or a Land claim whose nearest earlier verdict is a pass;
 *   2. that verdict's body `reviewed <sha>` is the head, or every commit after it in the head's own
 *      history that is not on origin/main is a merge or the status commit a landing makes (a merge of
 *      main and the status commit keep the pass, any other new commit does not);
 *   3. the verdict's author's model neither built (Claim, Takeover on the task branch) nor fixed
 *      (Fix claim, Fixed on the lock) the work (D-151).
 * A bot comment is never a review. Like the queue gate it fails open, loudly, only on its own
 * internal error (no git, an unreadable task list, GitHub unreachable).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { modelOf, parseMarker, reviewLockOf, slugOf } from "./nextTaskCore.mjs";

const ASSIGNMENTS = "docs/plans/assignments.json";
export const REVIEW_GATE_FAIL = "Tier 1: this head has no independent passing review (D-074, D-151). Run node scripts/next-task.mjs to get a review.";
const SHA = /^[0-9a-f]{40}$/;
const git = args => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The row a branch belongs to, by the queue gate's rules 1-2; null when none. */
export function findGateRow(tasks, branch) {
  if (!Array.isArray(tasks) || typeof branch !== "string") return null;
  const own = tasks.find(task => task?.branch === branch);
  if (own) return own;
  const marker = /^agent\/(architect|review|heartbeat)\/([^/]+)$/.exec(branch);
  return marker ? tasks.find(task => typeof task?.branch === "string" && slugOf(task.branch) === marker[2]) ?? null : null;
}

/** The head a verdict names in its marker body (`reviewed <sha>`); null for a verdict written before this gate. */
export function reviewedOf(body) {
  const m = /^reviewed ([0-9a-f]{40})\s*$/m.exec(String(body ?? ""));
  return m ? m[1] : null;
}

const fail = why => `${REVIEW_GATE_FAIL} ${why}`;

/** 1-based line numbers of a markdown file's `## Status` section (heading excluded), up to the next `#`/`##` heading. */
function statusSectionLines(text) {
  const lines = String(text ?? "").split("\n");
  const inside = new Set();
  let open = false;
  lines.forEach((line, i) => {
    if (/^#{1,2}\s/.test(line)) { open = /^##\s+Status\s*$/.test(line); return; }
    if (open) inside.add(i + 1);
  });
  return inside;
}

const STATUS_FIELD = /^\s*"status":\s*"[^"]*",?\s*$/;

/**
 * The status commit the landing steps make after the review (nextTaskText.mjs: "set this task's
 * status to done in docs/plans/assignments.json … set its Status line to done — <sha>"): it changes
 * nothing but `"status"` lines of docs/plans/assignments.json and lines inside the `## Status`
 * section of docs/plans/*.md packets. `files` is every file the commit changed, each with its text
 * before and after and the 1-based line numbers removed (in `before`) and added (in `after`).
 */
export function isStatusOnlyChange(files) {
  if (!Array.isArray(files) || !files.length) return false;
  return files.every(file => {
    if (!file || typeof file.path !== "string") return false;
    const removed = Array.isArray(file.removed) ? file.removed : [];
    const added = Array.isArray(file.added) ? file.added : [];
    if (!removed.length && !added.length) return false;
    if (file.path === ASSIGNMENTS) {
      const before = String(file.before ?? "").split("\n");
      const after = String(file.after ?? "").split("\n");
      return removed.every(n => STATUS_FIELD.test(before[n - 1] ?? "")) && added.every(n => STATUS_FIELD.test(after[n - 1] ?? ""));
    }
    if (!/^docs\/plans\/[^/]+\.md$/.test(file.path)) return false;
    const before = statusSectionLines(file.before);
    const after = statusSectionLines(file.after);
    return removed.every(n => before.has(n)) && added.every(n => after.has(n));
  });
}

/**
 * The rule, with no I/O. `workMarkers` are the task branch's markers and `lockMarkers` the review
 * lock's, oldest first, each verdict carrying `reviewed` (sha or null). `nonMergeCommitsSince(sha)`
 * lists the head's own non-merge commits after `sha` that are not on origin/main, or returns null
 * when `sha` is not in the head's history. `isStatusCommit(sha)` is true for the status commit a
 * landing makes (`isStatusOnlyChange`), which keeps the pass. Returns null to pass, or the failure message.
 */
export function reviewGateViolation({ task, head, workMarkers = [], lockMarkers = [], nonMergeCommitsSince, isStatusCommit }) {
  if (!task || Number(task.tier) !== 1) return null;
  const stage = lockMarkers.filter(m => m && m.id === task.id && m.verb !== "Heartbeat");
  const last = stage.at(-1);
  if (!last) return fail(`Nobody has reviewed ${task.id} yet.`);
  if (last.verb !== "Verdict" && last.verb !== "Land claim") return fail(`The review of ${task.id} stands at "${last.verb}", not a pass.`);
  const verdict = [...stage].reverse().find(m => m.verb === "Verdict");
  if (!verdict || verdict.verdict !== "pass") return fail(`The newest verdict on ${task.id} is ${verdict ? verdict.verdict : "missing"}, not a pass.`);

  const reviewed = verdict.reviewed ?? null;
  if (!reviewed) return fail(`The pass by ${verdict.who} was recorded before verdicts named their head: the reviewer re-records it on the current head (node scripts/next-task.mjs --verdict pass --task ${task.id} --as "<session name>"), and nothing is waived.`);
  if (reviewed !== head) {
    const own = typeof nonMergeCommitsSince === "function" ? nonMergeCommitsSince(reviewed) : null;
    if (own === null) return fail(`The reviewed commit ${reviewed.slice(0, 8)} is not in this head's history.`);
    const unreviewed = own.filter(sha => !(typeof isStatusCommit === "function" && isStatusCommit(sha)));
    if (unreviewed.length) return fail(`${unreviewed.length} commit(s) of the branch's own came after the reviewed commit ${reviewed.slice(0, 8)} (only merges of main and the landing's status commit keep a pass).`);
  }

  // D-151: the same sets the picker's did() reads — builders on the task branch, fixers on the lock.
  const ofTask = markers => markers.filter(m => m && m.id === task.id);
  const builders = ofTask(workMarkers).filter(m => m.verb === "Claim" || m.verb === "Takeover").map(m => modelOf(m.who));
  const fixers = stage.filter(m => m.verb === "Fix claim" || m.verb === "Fixed").map(m => modelOf(m.who));
  const model = modelOf(verdict.who);
  if (builders.includes(model) || fixers.includes(model)) return fail(`The pass is by ${model}, the model that ${builders.includes(model) ? "built" : "fixed"} this work; a review must come from another model (D-151).`);
  return null;
}

/** What one non-merge commit changed, for `isStatusOnlyChange`: each file's text on both sides and the changed line numbers. */
function changesOf(sha) {
  // Untrimmed and unbounded by the 1 MB default: line numbers must match the file exactly.
  const show = (rev, path) => {
    try { return execFileSync("git", ["show", `${rev}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { return ""; }
  };
  const paths = git(["diff-tree", "--no-commit-id", "--no-renames", "-r", "--name-only", sha]).split("\n").filter(Boolean);
  return paths.map(path => {
    const removed = [];
    const added = [];
    for (const m of git(["diff", "-U0", "--no-renames", `${sha}^`, sha, "--", path]).matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      const [a, b, c, d] = [Number(m[1]), m[2] === undefined ? 1 : Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      for (let i = 0; i < b; i++) removed.push(a + i);
      for (let i = 0; i < d; i++) added.push(c + i);
    }
    return { path, before: show(`${sha}^`, path), after: show(sha, path), removed, added };
  });
}

/** True when `sha` is the status commit a landing makes; false on any doubt (the commit then counts as unreviewed). */
function statusCommit(sha) {
  try { return isStatusOnlyChange(changesOf(sha)); } catch { return false; }
}

/** Empty marker commits on `range`, oldest first, with each verdict's reviewed head. Commits that change files are work. */
function markersIn(range) {
  const raw = git(["log", "--reverse", "--no-merges", "--format=%x1e%s%x1f%b%x1d", "--name-only", range]);
  return raw.split("\x1e").filter(Boolean).flatMap(record => {
    const [subject, rest = ""] = record.split("\x1f");
    const [body = "", files = ""] = rest.split("\x1d");
    const marker = files.trim() ? null : parseMarker(subject.trim());
    if (!marker) return [];
    return [marker.verb === "Verdict" ? { ...marker, reviewed: reviewedOf(body) } : marker];
  });
}

function pullRequestHead() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  const sha = JSON.parse(readFileSync(eventPath, "utf8"))?.pull_request?.head?.sha;
  return typeof sha === "string" && SHA.test(sha) ? sha : null;
}

/** Fetch one branch into origin's namespace; false when origin has no such branch. Throws when origin is unreachable. */
function fetchBranch(name) {
  if (!git(["ls-remote", "--heads", "origin", `refs/heads/${name}`])) return false;
  git(["fetch", "--no-tags", "-q", "origin", `+refs/heads/${name}:refs/remotes/origin/${name}`]);
  return true;
}

/**
 * Run the gate. From scope-check it runs on pull requests only (`local: false`); run on its own it
 * checks the current head, so a lander can see the answer before pushing to main.
 */
export function runReviewGate({ local = false } = {}) {
  try {
    const eventName = process.env.GITHUB_EVENT_NAME;
    if (!local && eventName !== "pull_request") return 0;

    const tasks = JSON.parse(git(["show", `origin/main:${ASSIGNMENTS}`]))?.tasks;
    if (!Array.isArray(tasks)) {
      console.warn("review-gate: origin/main task list has an unknown structure — not failing the branch.");
      return 0;
    }
    const branch = process.env.GITHUB_HEAD_REF || git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const task = findGateRow(tasks, branch);
    if (!task || Number(task.tier) !== 1) return 0;

    // In CI the checkout is GitHub's merge of the PR into main; the PR's own head is in the event.
    const head = pullRequestHead() ?? git(["rev-parse", "HEAD"]);
    const lock = reviewLockOf(task);
    const lockMarkers = fetchBranch(lock) ? markersIn(`origin/main..refs/remotes/origin/${lock}`) : [];
    const workMarkers = markersIn(`origin/main..${head}`);
    const nonMergeCommitsSince = sha => {
      try { git(["merge-base", "--is-ancestor", sha, head]); } catch { return null; }
      return git(["rev-list", "--no-merges", `${sha}..${head}`, "--not", "origin/main"]).split("\n").filter(Boolean);
    };
    const violation = reviewGateViolation({ task, head, workMarkers, lockMarkers, nonMergeCommitsSince, isStatusCommit: statusCommit });
    if (violation) {
      console.error(`review-gate: ${task.id} at ${head.slice(0, 8)}: ${violation}`);
      return 1;
    }
    console.log(`review-gate: ${task.id} at ${head.slice(0, 8)} has an independent passing review.`);
    return 0;
  } catch (error) {
    console.error(`review-gate: could not run (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`);
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runReviewGate({ local: true });
}

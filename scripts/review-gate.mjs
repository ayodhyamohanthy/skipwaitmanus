#!/usr/bin/env node
import { isStatusOnlyChange, loadTrustedProvenance, markerReferences, routeIdentity, parseProvenanceLog, PROVENANCE_LOG_FORMAT, resolveTaskProvenance } from "./modelProvenance.mjs";
import { nullableBoundedGitReader, readGitOutput } from "./provenanceGitOutput.mjs";
/**
 * PROCESS-review-gate (D-166, docs/plans/PROCESS-gates.md): a Tier 1 row merges only after an
 * independent pass verdict on its exact head (D-074, D-151).
 *
 *   node scripts/review-gate.mjs        # check the current branch's head now (a lander's check)
 *
 * In CI it runs as its own step, "Review gate (independent Tier 1 pass)" (the name the picker reads,
 * D-286/D-291), and again from `scripts/scope-check.mjs` right after the queue gate, on pull requests
 * only. On actions/checkout's depth-one checkout it first fetches origin/main with history, as the queue
 * gate does (REVIEW-GATE-fetch-parity, D-292), so the named step evaluates instead of failing open.
 * It finds the row as the queue gate does (the row's own branch, or a marker branch of its slug).
 * A Tier 2 or 3 row, or no row, passes here; the queue gate handles the no-row case. For a Tier 1
 * row it reads the row's review lock (`agent/review/<slug>`) and passes only when:
 *   1. the newest stage marker is a pass verdict, or a Land claim whose nearest earlier verdict is a pass;
 *   2. that verdict's body `reviewed <sha>` is the head, or every commit after it in the head's own
 *      history that is not on origin/main is a merge, an empty marker commit (D-315) or the status commit
 *      a landing makes (those keep the pass, any other new commit does not);
 *   3. the verdict's author's model neither built (Claim, Takeover on the task branch) nor fixed
 *      (Fix claim, Fixed on the lock) the work (D-151).
 * A bot comment is never a review. Like the queue gate it fails open, loudly, only on its own
 * internal error (no git, an unreadable task list, GitHub unreachable).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { modelOf, parseMarker, reviewLockOf, slugOf } from "./nextTaskCore.mjs";
import { classifyTier, tierReasonPaths } from "./tierClassifyCore.mjs";
import { z } from "zod";
import { INDEPENDENT_REVIEW_REQUIRED, NO_REVIEW_NOTICE } from "./sessionPolicy.mjs";


const ASSIGNMENTS = "docs/plans/assignments.json";
export const REVIEW_GATE_FAIL = "Tier 1: this head has no independent passing review (D-074, D-151). Run node scripts/next-task.mjs to get a review.";

/** GATE-tier-floor (D-212): a declared Tier 2 row whose changed paths compute Tier 1 (money, sign-in, privacy). */
export const TIER_FLOOR_FAIL = "Tier 1: this change touches";

const SHA = /^[0-9a-f]{40}$/;
const queuedPullSchema = z.object({
  number: z.number().int().positive().safe(), state: z.literal("open"),
  head: z.object({ ref: z.string().min(1), sha: z.string().regex(SHA) }),
  base: z.object({ ref: z.literal("main") }),
});
// PROCESS-provenance-loader-bounds: the gate reads through the same bounded reader as
// the picker, so the two loaders cannot diverge on the supported aggregate size.
// Exported so the regression exercises this exact binding.
export const git = args => readGitOutput(args);

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

/** Server-side code a declared Tier 1 row keeps its review for, whatever the classifier computes (the #1219 backstop). */
const SERVER_SIDE = /^(?:server\/|shared\/|drizzle\/|functions\/|src\/worker\.ts$)/;
const pathOfChange = change => (typeof change === "string" ? change : typeof change?.path === "string" ? change.path : "");

export { isStatusOnlyChange } from "./modelProvenance.mjs";

/**
 * The rule, with no I/O. `workMarkers` are the task branch's markers and `lockMarkers` the review
 * lock's, oldest first, each verdict carrying `reviewed` (sha or null). `nonMergeCommitsSince(sha)`
 * lists the head's own non-merge commits after `sha` that are not on origin/main, or returns null
 * when `sha` is not in the head's history. `isStatusCommit(sha)` is true for the status commit a
 * landing makes (`isStatusOnlyChange`), which keeps the pass.
 *
 * GATE-tier-floor (D-212): when `tierOf(changedPaths)` is given, the gate guards the higher of the
 * row's declared tier and the computed tier, so a money or sign-in change filed as Tier 2 still
 * needs the independent pass. Returns null to pass, or the failure message.
 */
export function reviewGateViolation({
  task, head, workMarkers = [], lockMarkers = [], nonMergeCommitsSince, isStatusCommit, isEmptyCommit,
  tierOf, tierReasonPaths = () => [], changedPaths = [], provenance = null,
}) {
  if (!task) return null;
  // The row's declared tier, and the tier its changed paths compute (GATE-tier-floor, D-212).
  const declared = Number(task.tier);
  // D-352 (owner, Nov 16): a review is needed only where the changed paths compute Tier 1 (money, sign-in,
  // privacy, migrations, secrets). With no path classifier (unit callers) the declared tier stands in.
  const computed = typeof tierOf === "function" ? Number(tierOf(changedPaths)) : declared;
  // Backstop (Copilot on #1219): the path classifier has gaps (it misses some money modules), so a row declared
  // Tier 1 still needs its review whenever the diff touches server, shared, migration, worker or functions code.
  // Only a declared Tier 1 change confined to client UI, tests and docs lands on green CI alone (D-352).
  const backstop = declared === 1 && (typeof tierOf !== "function" || changedPaths.some(change => SERVER_SIDE.test(pathOfChange(change))));
  if (computed !== 1 && !backstop) return null;
  // The higher of the two, by path (D-212): the message says which paths raised it and the cure.
  const raised = declared !== 1
    ? `${TIER_FLOOR_FAIL} ${tierReasonPaths(changedPaths).map(path => `\`${path}\``).join(", ")}, which are Tier 1 (D-212). It needs an independent pass on its head; correct the row's tier in docs/plans/assignments.json (any session, D-200 (2)).`
    : REVIEW_GATE_FAIL;
  const stage = lockMarkers.filter(m => m && m.id === task.id && m.verb !== "Heartbeat");
  const last = stage.at(-1);
  if (!last) return `${raised} Nobody has reviewed ${task.id} yet.`;
  // D-344 (7): findings, then a Fixed marker by a session other than the reviewer, land without a re-review.
  // Never for externally routed work: its provenance and qualification checks below always run (Copilot on #1219).
  const provenanceActive = resolveTaskProvenance({ taskId: task.id, head, workMarkers, lockMarkers, isStatusCommit, ...(provenance ?? {}) }).active;
  const builderSessions = workMarkers.filter(m => m && m.id === task.id && (m.verb === "Claim" || m.verb === "Takeover")).map(m => m.who);
  const fixedViolation = provenanceActive ? undefined : fixedPassViolation({ stage, head, raised, builderSessions, nonMergeCommitsSince, isStatusCommit, isEmptyCommit });
  if (fixedViolation !== undefined) return fixedViolation;
  if (last.verb !== "Verdict" && last.verb !== "Land claim") return `${raised} The review of ${task.id} stands at "${last.verb}", not a pass.`;
  const verdict = [...stage].reverse().find(m => m.verb === "Verdict");
  if (!verdict || verdict.verdict !== "pass") return `${raised} The newest verdict on ${task.id} is ${verdict ? verdict.verdict : "missing"}, not a pass.`;

  const reviewed = verdict.reviewed ?? null;
  if (!reviewed) return `${raised} The pass by ${verdict.who} was recorded before verdicts named their head: the reviewer re-records it on the current head (node scripts/next-task.mjs --verdict pass --task ${task.id} --as "<session name>"), and nothing is waived.`;
  if (reviewed !== head) {
    const own = typeof nonMergeCommitsSince === "function" ? nonMergeCommitsSince(reviewed) : null;
    if (own === null) return `${raised} The reviewed commit ${reviewed.slice(0, 8)} is not in this head's history.`;
    // D-315: an empty commit (its tree equals its parent's: a picker Claim, Takeover or Land claim marker) changes no
    // reviewed content, so it keeps the pass like a merge of main or the landing's status commit (#878, D-301).
    const unreviewed = own.filter(sha => !(typeof isStatusCommit === "function" && isStatusCommit(sha)) && !(typeof isEmptyCommit === "function" && isEmptyCommit(sha)));
    if (unreviewed.length) return `${raised} ${unreviewed.length} commit(s) of the branch's own came after the reviewed commit ${reviewed.slice(0, 8)} (only merges of main, empty marker commits and the landing's status commit keep a pass).`;
  }

  const resolved = resolveTaskProvenance({ taskId: task.id, head,
    workMarkers, lockMarkers, isStatusCommit, ...(provenance ?? {}) });
  if (resolved.active) {
    if (!resolved.ok) return `${raised} External provenance held: ${resolved.reason}.`;
    if (!markerReferences(verdict.body).external) return `${raised} External pass requires its qualified execution marker.`;
    const model = resolved.reviewers.get(verdict.who);
    if (!model || [...resolved.builders, ...resolved.fixers].includes(model)) return `${raised} External review is missing or shares a builder/fixer model.`;
    if (last.verb === "Land claim") {
      const refs = markerReferences(last.body);
      const lander = !refs.invalid && refs.route ? routeIdentity(provenance?.registry, refs.route, last.who, task.id, "land") : null;
      if (!lander?.ok || [...resolved.builders, ...resolved.fixers].includes(lander.model)) return `${raised} External lander has no independent qualified route.`;
    }
    return null;
  }

  // D-151: the same sets the picker's did() reads — builders on the task branch, fixers on the lock.
  const ofTask = markers => markers.filter(m => m && m.id === task.id);
  // D-344 (1), amending D-151: independence is per session. Another session of the same model may pass the work.
  const builders = ofTask(workMarkers).filter(m => m.verb === "Claim" || m.verb === "Takeover").map(m => m.who);
  const fixers = stage.filter(m => m.verb === "Fix claim" || m.verb === "Fixed").map(m => m.who);
  if (builders.includes(verdict.who) || fixers.includes(verdict.who)) return `${raised} The pass is by ${verdict.who}, the session that ${builders.includes(verdict.who) ? "built" : "fixed"} this work; a review must come from another session (D-344 (1)).`;
  return null;
}

/** The head a Fixed marker names in its body (`fixed <sha>`); null for one written before markers named their head. */
export function fixedOf(body) {
  const m = /^fixed ([0-9a-f]{40})\s*$/m.exec(String(body ?? ""));
  return m ? m[1] : null;
}

/**
 * D-344 (7): when the newest stage is a Fixed marker (or a Land claim right after one) that follows a findings
 * verdict, the work lands without a re-review, provided the fixer is not the reviewer's own session and the
 * branch gained no commit of its own after the head the marker names. Returns undefined when this rule does not
 * apply (the ordinary pass rules then decide), null to pass, or the failure message.
 */
function fixedPassViolation({ stage, head, raised, builderSessions = [], nonMergeCommitsSince, isStatusCommit, isEmptyCommit }) {
  const work = stage.filter(m => m.verb !== "Land claim");
  const fixed = work.at(-1);
  if (!fixed || fixed.verb !== "Fixed") return undefined;
  const verdictAt = work.map(m => m.verb).lastIndexOf("Verdict");
  const verdict = verdictAt >= 0 ? work[verdictAt] : null;
  if (!verdict || verdict.verdict !== "findings") return undefined;
  if (fixed.who === verdict.who) return `${raised} ${fixed.who} reviewed this work and marked its own findings fixed; another session fixes them (D-344 (7)).`;
  // The findings must be an independent first review: not by a session that built the work or fixed it before
  // the verdict, and naming a commit of this branch's own history (Copilot on #1219).
  const earlierFixers = work.slice(0, verdictAt).filter(m => m.verb === "Fix claim" || m.verb === "Fixed").map(m => m.who);
  if (builderSessions.includes(verdict.who) || earlierFixers.includes(verdict.who)) return `${raised} The findings on this work are by ${verdict.who}, a session that built or fixed it; an independent review is still owed (D-344 (1)).`;
  const reviewed = verdict.reviewed ?? null;
  if (!reviewed) return `${raised} The findings verdict by ${verdict.who} names no reviewed head; an independent review on this branch is still owed.`;
  if (reviewed !== head && typeof nonMergeCommitsSince === "function" && nonMergeCommitsSince(reviewed) === null) return `${raised} The reviewed commit ${reviewed.slice(0, 8)} is not in this head's history.`;
  // A Fixed marker binds to the head it fixed. One without that binding approves nothing (Copilot on #1219):
  // the fixer re-records it with node scripts/next-task.mjs --fixed, which now names the head.
  const at = fixedOf(fixed.body);
  if (!at) return `${raised} The Fixed marker by ${fixed.who} names no fixed head: re-record it with node scripts/next-task.mjs --fixed --task <id> --as "<session>", then re-run this PR's checks.`;
  if (at === head) return null;
  const own = typeof nonMergeCommitsSince === "function" ? nonMergeCommitsSince(at) : null;
  if (own === null) return `${raised} The fixed commit ${at.slice(0, 8)} is not in this head's history.`;
  const later = own.filter(sha => !(typeof isStatusCommit === "function" && isStatusCommit(sha)) && !(typeof isEmptyCommit === "function" && isEmptyCommit(sha)));
  return later.length ? `${raised} ${later.length} commit(s) came after the fix at ${at.slice(0, 8)}: mark it fixed again on the current head (node scripts/next-task.mjs --fixed).` : null;
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

/** D-315: true when `sha` changes no file (its tree is its first parent's); false on any doubt. */
function emptyCommit(sha) {
  try { return git(["rev-parse", `${sha}^{tree}`]) === git(["rev-parse", `${sha}^1^{tree}`]); } catch { return false; }
}

/** True when `sha` is the status commit a landing makes; false on any doubt (the commit then counts as unreviewed). */
function statusCommit(sha) {
  try { return isStatusOnlyChange(changesOf(sha)); } catch { return false; }
}

const DB_HUNK_START = /^@@ -(?:\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const DECLARATION = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/;

/** The name of the outermost function or declaration a hunk sits in, as `server/db.ts` names it. */
export function enclosingName(line) {
  const m = DECLARATION.exec(String(line ?? ""));
  return m ? m[1] : null;
}

/**
 * What the head changed against its merge base with origin/main: the paths, and for `server/db.ts`
 * each hunk's changed lines plus the function each hunk sits in (GATE-tier-floor, D-212).
 */
export function changedPathsOf(head) {
  let base = "";
  try { base = git(["merge-base", "origin/main", head]); } catch { base = ""; }
  if (!base) return [];
  const paths = git(["diff", "--name-only", "--no-renames", `${base}..${head}`]).split("\n").filter(Boolean);
  if (!paths.includes("server/db.ts")) return paths;
  const diff = git(["diff", "--no-renames", "-U0", `${base}..${head}`, "--", "server/db.ts"]).split("\n");
  const hunks = [];
  let hunk = null;
  const close = () => { if (hunk) hunks.push({ added: hunk.added, removed: hunk.removed, context: hunk.context }); hunk = null; };
  for (const line of diff) {
    const start = DB_HUNK_START.exec(line);
    if (start) {
      close();
      hunk = { at: Number(start[1]), added: [], removed: [], context: [] };
      continue;
    }
    if (!hunk || /^[+-]{3}/.test(line)) continue;
    if (line.startsWith("+")) hunk.added.push(line);
    else if (line.startsWith("-")) hunk.removed.push(line);
  }
  close();
  const file = (() => { try { return execFileSync("git", ["show", `${head}:server/db.ts`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); } catch { return ""; } })();
  const lines = file.split("\n");
  for (const h of hunks) {
    h.context = [];
    for (let i = Math.min(h.at, lines.length) - 1; i >= 0; i--) {
      const name = enclosingName(lines[i]);
      if (name) { h.context.push(name); break; }
    }
  }
  return paths.flatMap(path => (path === "server/db.ts" ? hunks.map(h => ({ path, ...h })) : [path]));
}

/** Empty marker commits on `range`, oldest first, with each verdict's reviewed head. Commits that change files are work. */
function markersIn(range) {
  const raw = git(["log", "--reverse", "--no-merges", `--format=${PROVENANCE_LOG_FORMAT}`, "--name-only", range]);
  return parseProvenanceLog(raw).flatMap(({ sha, subject, body, files }) => {
    const marker = files.length ? null : parseMarker(subject);
    return marker ? [{ ...marker, sha, body, ...(marker.verb === "Verdict" ? { reviewed: reviewedOf(body) } : {}) }] : [];
  });
}

/** Bind the queue ref to its PR's own head; the synthetic queue SHA is never a reviewed head. */
export function resolveReviewTarget({ eventName, event, ref, headRef, localHead, readPullRequest, isAncestor }) {
  if (eventName !== "merge_group") {
    const sha = event?.pull_request?.head?.sha;
    return { branch: headRef, head: typeof sha === "string" && SHA.test(sha) ? sha : localHead };
  }
  const group = event?.merge_group;
  const match = /^refs\/heads\/gh-readonly-queue\/main\/pr-([1-9][0-9]*)-[0-9a-f]{7,40}$/.exec(ref ?? "");
  const number = Number(match?.[1]);
  if (!match || !Number.isSafeInteger(number) || group?.base_ref !== "refs/heads/main"
      || group?.head_ref !== ref || !SHA.test(group?.head_sha ?? "") || group.head_sha !== localHead) {
    throw new Error("merge group does not bind to the checked-out main queue ref");
  }
  const pull = queuedPullSchema.parse(readPullRequest(number));
  if (pull.number !== number || !isAncestor(pull.head.sha, localHead)) {
    throw new Error(`queued PR #${number} has no current head in this merge group`);
  }
  return { branch: pull.head.ref, head: pull.head.sha };
}

function readQueuedPullRequest(number) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) throw new Error("merge group repository is unavailable");
  return JSON.parse(execFileSync("gh", ["api", `repos/${repository}/pulls/${number}`], {
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  }));
}

/**
 * REVIEW-GATE-fetch-parity (D-292): the twin of scripts/queue-gate.mjs:15 ensureOriginMainHistory.
 * Does nothing when origin/main and HEAD already share a merge base; otherwise fetches main into
 * refs/remotes/origin/main (unshallowing a shallow checkout) and re-checks. Throws on a fetch error.
 */
function ensureOriginMainHistory() {
  try {
    git(["merge-base", "origin/main", "HEAD"]);
    return;
  } catch {
    // actions/checkout's default depth-one checkout may not include the base history.
    const shallow = git(["rev-parse", "--is-shallow-repository"]) === "true";
    const refspec = "+refs/heads/main:refs/remotes/origin/main";
    git(shallow
      ? ["fetch", "--no-tags", "--unshallow", "origin", refspec]
      : ["fetch", "--no-tags", "origin", refspec]);
    git(["merge-base", "origin/main", "HEAD"]);
  }
}

/** Fetch one branch into origin's namespace; false when origin has no such branch. Throws when origin is unreachable. */
function fetchBranch(name) {
  if (!git(["ls-remote", "--heads", "origin", `refs/heads/${name}`])) return false;
  git(["fetch", "--no-tags", "-q", "origin", `+refs/heads/${name}:refs/remotes/origin/${name}`]);
  return true;
}

/**
 * Run the gate for PR and merge-group events from scope-check (`local: false`);
 * on its own it also checks the current local head.
 */
export function runReviewGate({ local = false } = {}) {
  // D-370: no review dependency. The step keeps its name (the picker reads it) and passes.
  if (!INDEPENDENT_REVIEW_REQUIRED) {
    console.log(NO_REVIEW_NOTICE);
    return 0;
  }
  let externalContext = false;
  const mergeGroup = process.env.GITHUB_EVENT_NAME === "merge_group";
  try {
    const eventName = process.env.GITHUB_EVENT_NAME;
    if (!local && eventName !== "pull_request" && !mergeGroup) return 0;

    // Before the first origin/main read and before the review-lock fetch (D-292). A fetch error throws
    // into the catch below: the only fail-open, loudly.
    try {
      externalContext = /(?:^|\n)(?:provenance|execution)(?: |$)/m.test(git(["log", "-n", "1000", "--format=%b", "HEAD"]))
        || (() => {
          const registry = JSON.parse(git(["show", "origin/main:docs/model-provenance.json"]));
          const tasks = JSON.parse(git(["show", `origin/main:${ASSIGNMENTS}`]))?.tasks;
          const branch = process.env.GITHUB_HEAD_REF || git(["rev-parse", "--abbrev-ref", "HEAD"]);
          const task = findGateRow(tasks, branch);
          return Boolean(task && registry.routes?.some(r => r.taskId === task.id));
        })();
    } catch { /* The work-history probe still detects an external branch when main is absent. */ }
    ensureOriginMainHistory();
    const tasks = JSON.parse(git(["show", `origin/main:${ASSIGNMENTS}`]))?.tasks;
    if (!Array.isArray(tasks)) {
      console.warn("review-gate: origin/main task list has an unknown structure.");
      return externalContext || mergeGroup ? 1 : 0;
    }
    const localHead = git(["rev-parse", "HEAD"]);
    const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
    const { branch, head } = resolveReviewTarget({
      eventName, event, ref: process.env.GITHUB_REF,
      headRef: process.env.GITHUB_HEAD_REF || git(["rev-parse", "--abbrev-ref", "HEAD"]), localHead,
      readPullRequest: readQueuedPullRequest,
      isAncestor: (sha, group) => {
        try { git(["merge-base", "--is-ancestor", sha, group]); return true; } catch { return false; }
      },
    });
    const task = findGateRow(tasks, branch);
    if (!task) return 0;

    // Both pull_request and merge_group evaluate the PR head, while CI tests the merged checkout.
    // GATE-tier-floor (D-212): the computed tier from the PR's own changed paths, plus the hunks of
    // server/db.ts (a money line, or a function whose name names money).
    const changedPaths = changedPathsOf(head);
    const computed = classifyTier(changedPaths);
    const tierOf = paths => (paths === changedPaths ? computed.tier : classifyTier(paths).tier);
    if (Number(task.tier) !== 1 && computed.tier === 1) {
      console.log(`review-gate: ${task.id} declares Tier ${task.tier} but its paths compute Tier 1 (${tierReasonPaths(changedPaths).join(", ")}).`);
    }
    const workMarkers = markersIn(`origin/main..${head}`);
    const trusted = loadTrustedProvenance(nullableBoundedGitReader());
    externalContext = workMarkers.some(m => markerReferences(m.body).external)
      || Boolean(trusted.registry?.routes?.some(r => r.taskId === task.id))
      || (trusted.registryError && trusted.registryError !== "no trusted-main provenance registry");
    const lock = reviewLockOf(task);
    const lockMarkers = fetchBranch(lock) ? markersIn(`origin/main..refs/remotes/origin/${lock}`) : [];
    const nonMergeCommitsSince = sha => {
      try { git(["merge-base", "--is-ancestor", sha, head]); } catch { return null; }
      return git(["rev-list", "--no-merges", `${sha}..${head}`, "--not", "origin/main"]).split("\n").filter(Boolean);
    };
    const violation = reviewGateViolation({
      task, head, workMarkers, lockMarkers, nonMergeCommitsSince, isStatusCommit: statusCommit, isEmptyCommit: emptyCommit,
      tierOf, tierReasonPaths, changedPaths, provenance: { ...trusted, git: (...args) => { try { return git(args); } catch { return null; } } },
    });

    if (violation) {
      console.error(`review-gate: ${task.id} at ${head.slice(0, 8)}: ${violation}`);
      return 1;
    }
    console.log(`review-gate: ${task.id} at ${head.slice(0, 8)} has an independent passing review.`);
    return 0;
  } catch (error) {
    if (mergeGroup) { console.error(`review-gate: merge group could not be evaluated (${error instanceof Error ? error.message : String(error)}) — failing closed`); return 1; }
    if (externalContext) { console.error("review-gate: external provenance source unavailable; failing closed"); return 1; }
    console.error(`review-gate: could not run (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`);
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runReviewGate({ local: true });
}

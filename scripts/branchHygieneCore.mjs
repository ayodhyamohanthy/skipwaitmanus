// BRANCH-HYGIENE-1 (D-205): which branches are done and merged, and may be deleted online and offline.
// Pure: structured refs, SHAs and the parsed task list in, one verdict per branch out; no I/O.
// scripts/branch-cleanup.mjs reads git and GitHub and acts on the verdicts.
//
// A branch is deleted only when it is done and merged (ruling 1): its tip is in main, or a merged pull
// request's head SHA equals its tip. A done task's marker branches go too (ruling 3), but only when every
// commit they hold outside main is an empty picker marker; anything else on them is kept as evidence.
// Never deleted: main, the report log, the landing slot, a branch on the retention list (evidence holds,
// RETENTION_LIST on main), any open pull request's branch (its head or its base: deleting a base closes the
// pull request), any branch of a task that is not done (ruling 2), and the fix-main lock of a red main.
// agent/architect/<slug> is also the picker's unblock lock (scripts/nextTaskCore.mjs, `unblocker` and the
// unblock stage), which a task of any status can hold, so it is kept until its task is done rather than as
// soon as the row leaves "architect".
import { STATUSES, parseMarker } from "./nextTaskCore.mjs";

export const PROTECTED = Object.freeze(["main", "agent/reports/log", "agent/queue/landing"]);
/** The explicit evidence holds on main; --apply refuses to run without it (an empty list holds nothing). */
export const RETENTION_LIST = "docs/plans/branch-retention.json";
const MARKER_REASONS = Object.freeze({ "agent/review/": "done-review", "agent/heartbeat/": "done-heartbeat", "agent/architect/": "stale-architect" });
const FIX_MAIN = /^agent\/(?:queue|heartbeat)\/fix-main-([0-9a-f]{8})$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const BRANCH_NAME = /^[^\s~^:?*[\\]+$/;

const invalid = what => { throw new Error(`branch hygiene: invalid input: ${what}`); };
const slugOf = name => name.split("/").pop();
const isName = v => typeof v === "string" && v.length > 0;
const isText = v => typeof v === "string" && v.trim().length > 0;
const keep = reason => ({ action: "keep", reason });
const remove = reason => ({ action: "delete", reason });

/** The marker branch a name is (agent/review|heartbeat|architect/<slug>), or undefined. */
export const markerPrefixOf = name => Object.keys(MARKER_REASONS).find(prefix => name === `${prefix}${slugOf(name)}`);

/** RETENTION_LIST parsed: exact branch name -> "reason (ref)". Throws on anything but the exact shape. */
export function parseRetention(doc) {
  const bad = what => { throw new Error(`branch hygiene: invalid retention list: ${what}`); };
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) bad("not a JSON object");
  for (const k of Object.keys(doc)) if (!["version", "holds"].includes(k)) bad(`unknown key "${k}"`);
  if (doc.version !== 1) bad("version must be 1");
  if (!Array.isArray(doc.holds)) bad("holds must be an array");
  const out = new Map();
  for (const h of doc.holds) {
    if (!h || typeof h !== "object" || Array.isArray(h)) bad(`hold ${JSON.stringify(h)} is not an object`);
    for (const k of Object.keys(h)) if (!["branch", "reason", "ref"].includes(k)) bad(`hold ${JSON.stringify(h)}: unknown key "${k}"`);
    if (!isName(h.branch) || !BRANCH_NAME.test(h.branch)) bad(`hold ${JSON.stringify(h)} needs an exact branch name`);
    if (!isText(h.reason) || !isText(h.ref)) bad(`hold ${JSON.stringify(h)} needs a reason and a ref`);
    if (out.has(h.branch)) bad(`branch ${h.branch} is held twice`);
    out.set(h.branch, `${h.reason.trim()} (${h.ref.trim()})`);
  }
  return out;
}

/**
 * Whether a marker branch holds nothing but picker markers: every commit outside main has one parent, the
 * parent's tree (it adds no file) and a subject the picker reads as a marker (scripts/next-task.mjs pushMarker).
 */
export function markerOnlyCommits(commits) {
  if (!Array.isArray(commits)) invalid("commits must be an array");
  for (const c of commits) {
    const ok = c && Array.isArray(c.parents) && c.parents.every(p => FULL_SHA.test(p ?? "")) && FULL_SHA.test(c.tree ?? "") && (c.parentTree === null || FULL_SHA.test(c.parentTree ?? "")) && typeof c.subject === "string";
    if (!ok) invalid(`commit ${JSON.stringify(c)} needs parents, tree, parentTree and subject`);
  }
  return commits.every(c => c.parents.length === 1 && c.tree === c.parentTree && parseMarker(c.subject) !== null);
}

/** owner/repo named by a git remote URL (https, ssh, scp-like, a proxy path or a local path), or null. */
export function repoOfRemote(url) {
  if (typeof url !== "string") return null;
  let rest = url.trim();
  const host = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(rest) ?? /^[^/@:]+@[^/:]+:/.exec(rest); // scheme://[user@]host[:port] or user@host:
  if (host) rest = rest.slice(host[0].length);
  const parts = rest.replace(/\/+$/, "").replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts.slice(-2);
  return /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(repo) ? `${owner}/${repo}` : null;
}

/** Whether a branch belongs to a task: its own branch, or any agent/<x>/<slug> (its locks and outside builds). */
export function relatedTo(task, name) {
  return name === task.branch || name.endsWith(`/${slugOf(task.branch)}`);
}

function checkTasks(tasks) {
  if (!Array.isArray(tasks)) invalid("tasks must be an array");
  for (const t of tasks) {
    if (!t || !isName(t.id) || !isName(t.branch) || !isName(t.status)) invalid(`task ${JSON.stringify(t)} needs id, branch and status`);
    // A status the picker does not know is not read as "not done" (or as done): the run stops instead.
    if (!STATUSES.includes(t.status)) invalid(`task ${t.id} has status "${t.status}", not one of ${STATUSES.join(", ")}`);
  }
}

function checkSetOfNames(set, what) {
  if (!(set instanceof Set) || [...set].some(n => !isName(n))) invalid(`${what} must be a Set of branch names`);
}

/**
 * One verdict per origin branch: { name, sha, action: "delete" | "keep", reason }. Throws on malformed input.
 * openPrHeads / openPrBases: the branch names open pull requests come from and target; retained: Map of held
 * branch name -> reason (parseRetention); markerOnly: Set of the marker branches whose commits outside main
 * are all empty picker markers (markerOnlyCommits).
 */
export function classifyBranches({ branches, mainTipAncestry, mergedPrHeads, openPrHeads, openPrBases, tasks, mainRed, retained, markerOnly }) {
  if (!Array.isArray(branches)) invalid("branches must be an array");
  const seen = new Set();
  for (const b of branches) {
    if (!b || !isName(b.name) || !FULL_SHA.test(b.sha ?? "")) invalid(`branch ${JSON.stringify(b)} needs a name and a full SHA`);
    if (seen.has(b.name)) invalid(`branch ${b.name} is listed twice`);
    seen.add(b.name);
  }
  checkSetOfNames(mainTipAncestry, "mainTipAncestry");
  checkSetOfNames(openPrHeads, "openPrHeads");
  checkSetOfNames(openPrBases, "openPrBases");
  if (!(mergedPrHeads instanceof Map) || [...mergedPrHeads].some(([n, shas]) => !isName(n) || !(shas instanceof Set))) invalid("mergedPrHeads must be a Map of branch name to a Set of SHAs");
  checkTasks(tasks);
  if (!(mainRed === null || mainRed === "unknown" || FULL_SHA.test(mainRed?.sha ?? ""))) invalid('mainRed must be null, "unknown" or { sha }');
  if (!(retained instanceof Map) || [...retained].some(([n, why]) => !isName(n) || !isText(why))) invalid("retained must be a Map of branch name to reason");
  checkSetOfNames(markerOnly, "markerOnly");

  const verdict = (name, sha) => {
    if (PROTECTED.includes(name)) return keep("protected");
    const fix = FIX_MAIN.exec(name);
    if (fix && (mainRed === "unknown" || (mainRed && mainRed.sha.startsWith(fix[1])))) return keep("protected");
    if (retained.has(name)) return keep("retained");
    if (openPrHeads.has(name) || openPrBases.has(name)) return keep("open-pr");
    const owners = tasks.filter(t => relatedTo(t, name));
    if (owners.some(t => t.status !== "done")) return keep("task-not-done");
    const marker = owners.length ? markerPrefixOf(name) : undefined;
    if (marker) return markerOnly.has(name) ? remove(MARKER_REASONS[marker]) : keep("has-content");
    if (mainTipAncestry.has(name)) return remove("merged");
    if (mergedPrHeads.get(name)?.has(sha)) return remove("squash-merged");
    return keep("unmerged");
  };
  return branches.map(({ name, sha }) => ({ name, sha, ...verdict(name, sha) }));
}

/** Ruling 5, for one clone: delete a local branch only when its upstream is gone, its tip is in origin/main and no worktree has it. */
export function classifyLocal({ local }) {
  if (!Array.isArray(local)) invalid("local must be an array");
  return local.map(b => {
    const ok = b && isName(b.name) && FULL_SHA.test(b.sha ?? "") && typeof b.upstreamGone === "boolean" && typeof b.inMain === "boolean" && (b.worktree === null || isName(b.worktree));
    if (!ok) invalid(`local branch ${JSON.stringify(b)} needs name, sha, upstreamGone, inMain and worktree`);
    const base = { name: b.name, sha: b.sha };
    if (PROTECTED.includes(b.name)) return { ...base, ...keep("protected") };
    if (b.worktree) return { ...base, ...keep("checked-out") };
    if (!b.upstreamGone) return { ...base, ...keep("upstream-present") };
    if (!b.inMain) return { ...base, ...keep("unmerged-local") };
    return { ...base, ...remove("merged-local") };
  });
}

/** Counts per action and reason. */
export function summarize(rows) {
  const out = { delete: {}, keep: {} };
  for (const r of rows) out[r.action][r.reason] = (out[r.action][r.reason] ?? 0) + 1;
  return out;
}

/** The table: deletions first, then by reason and name. */
export function render(rows) {
  const order = (a, b) => (a.action === b.action ? 0 : a.action === "delete" ? -1 : 1) || a.reason.localeCompare(b.reason) || a.name.localeCompare(b.name);
  return [...rows].sort(order).map(r => `${r.action.padEnd(8)}${r.reason.padEnd(16)}${r.name}  ${r.sha.slice(0, 8)}`);
}

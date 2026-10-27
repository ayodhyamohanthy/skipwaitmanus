// BRANCH-HYGIENE-1 (D-205): which branches are done and merged, and may be deleted online and offline.
// Pure: structured refs, SHAs and the parsed task list in, one verdict per branch out; no I/O.
// scripts/branch-cleanup.mjs reads git and GitHub and acts on the verdicts.
//
// A branch is deleted only when it is done and merged (ruling 1): its tip is in main, or a merged pull
// request's head SHA equals its tip. A done task's marker branches go too (ruling 3). Never deleted:
// main, the report log, the landing slot, an open pull request's branch, any branch of a task that is not
// done (ruling 2), and the fix-main lock of a red main. agent/architect/<slug> is also the picker's unblock
// lock (scripts/nextTaskCore.mjs, `unblocker` and the unblock stage), which a task of any status can hold,
// so it is kept until its task is done rather than as soon as the row leaves "architect".

export const PROTECTED = Object.freeze(["main", "agent/reports/log", "agent/queue/landing"]);
const MARKER_REASONS = Object.freeze({ "agent/review/": "done-review", "agent/heartbeat/": "done-heartbeat", "agent/architect/": "stale-architect" });
const FIX_MAIN = /^agent\/(?:queue|heartbeat)\/fix-main-([0-9a-f]{8})$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

const invalid = what => { throw new Error(`branch hygiene: invalid input: ${what}`); };
const slugOf = name => name.split("/").pop();
const isName = v => typeof v === "string" && v.length > 0;
const keep = reason => ({ action: "keep", reason });
const remove = reason => ({ action: "delete", reason });

/** Whether a branch belongs to a task: its own branch, or any agent/<x>/<slug> (its locks and outside builds). */
export function relatedTo(task, name) {
  return name === task.branch || name.endsWith(`/${slugOf(task.branch)}`);
}

function checkTasks(tasks) {
  if (!Array.isArray(tasks)) invalid("tasks must be an array");
  for (const t of tasks) if (!t || !isName(t.id) || !isName(t.branch) || !isName(t.status)) invalid(`task ${JSON.stringify(t)} needs id, branch and status`);
}

function checkSetOfNames(set, what) {
  if (!(set instanceof Set) || [...set].some(n => !isName(n))) invalid(`${what} must be a Set of branch names`);
}

/** One verdict per origin branch: { name, sha, action: "delete" | "keep", reason }. Throws on malformed input. */
export function classifyBranches({ branches, mainTipAncestry, mergedPrHeads, openPrHeads, tasks, mainRed }) {
  if (!Array.isArray(branches)) invalid("branches must be an array");
  const seen = new Set();
  for (const b of branches) {
    if (!b || !isName(b.name) || !FULL_SHA.test(b.sha ?? "")) invalid(`branch ${JSON.stringify(b)} needs a name and a full SHA`);
    if (seen.has(b.name)) invalid(`branch ${b.name} is listed twice`);
    seen.add(b.name);
  }
  checkSetOfNames(mainTipAncestry, "mainTipAncestry");
  checkSetOfNames(openPrHeads, "openPrHeads");
  if (!(mergedPrHeads instanceof Map) || [...mergedPrHeads].some(([n, shas]) => !isName(n) || !(shas instanceof Set))) invalid("mergedPrHeads must be a Map of branch name to a Set of SHAs");
  checkTasks(tasks);
  if (!(mainRed === null || mainRed === "unknown" || FULL_SHA.test(mainRed?.sha ?? ""))) invalid('mainRed must be null, "unknown" or { sha }');

  const verdict = (name, sha) => {
    if (PROTECTED.includes(name)) return keep("protected");
    const fix = FIX_MAIN.exec(name);
    if (fix && (mainRed === "unknown" || (mainRed && mainRed.sha.startsWith(fix[1])))) return keep("protected");
    if (openPrHeads.has(name)) return keep("open-pr");
    const owners = tasks.filter(t => relatedTo(t, name));
    if (owners.some(t => t.status !== "done")) return keep("task-not-done");
    const marker = owners.length ? Object.keys(MARKER_REASONS).find(prefix => name === `${prefix}${slugOf(name)}`) : undefined;
    if (marker) return remove(MARKER_REASONS[marker]);
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

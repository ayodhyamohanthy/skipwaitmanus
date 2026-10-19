// D-083: the queue picker's pure logic. `scripts/next-task.mjs` does the git
// and GitHub I/O and passes plain data in; everything here is deterministic,
// so `scripts/nextTask.test.ts` can pin each decision.
//
// A claim is a branch on origin. Every state change is one empty "marker"
// commit pushed as a fast-forward, so two agents racing for the same task
// cannot both win: the second push is rejected as non-fast-forward.

export const STALE_MS = 24 * 60 * 60 * 1000;
export const STATUSES = ["todo", "in-review", "done", "architect", "owner"];
const TASK_KEYS = ["id", "title", "row", "packet", "tier", "lane", "branch", "status", "dependsOn", "note"];
const DOC_KEYS = ["version", "repo", "decidedBy", "updated", "rules", "tasks"];
const MARKER = /^(Review claim|Fix claim|Claim|Takeover|Verdict|Fixed) (\S+): (.+)$/;
const RED = new Set(["failure", "timed_out", "startup_failure", "action_required"]);

export const slugOf = branch => branch.split("/").pop();
export const reviewLockOf = task => `agent/review/${slugOf(task.branch)}`;
export const fixMainLockOf = sha => `agent/queue/fix-main-${sha.slice(0, 8)}`;

/** "Claim GO-LIVE-1: Qwen 3 · s1" -> { verb: "Claim", id: "GO-LIVE-1", who: "Qwen 3 · s1" }. */
export function parseMarker(subject) {
  const m = MARKER.exec(subject);
  if (!m) return null;
  if (m[1] === "Verdict") {
    const v = /^(pass|findings) — (.+)$/.exec(m[3]);
    return v ? { verb: "Verdict", id: m[2], verdict: v[1], who: v[2] } : null;
  }
  return { verb: m[1], id: m[2], who: m[3] };
}

export function markerSubject(verb, id, who, verdict) {
  return verb === "Verdict" ? `Verdict ${id}: ${verdict} — ${who}` : `${verb} ${id}: ${who}`;
}

/** Newest-first CI runs on main -> green | red | running | running-after-red | unknown. */
export function ciStateFromRuns(runs) {
  const newest = runs[0];
  const done = runs.find(r => r.status === "completed" && r.conclusion !== "cancelled" && r.conclusion !== "skipped");
  if (!newest || !done) return { state: "unknown" };
  const red = RED.has(done.conclusion);
  const running = newest.status !== "completed";
  const state = running ? (red ? "running-after-red" : "running") : (red ? "red" : "green");
  return { state, sha: done.head_sha, url: done.html_url };
}

/** Every problem with the task list, or [] when it is valid. */
export function validateAssignments(doc, packetExists) {
  const errors = [];
  if (!doc || typeof doc !== "object") return ["the task list is not a JSON object"];
  for (const k of Object.keys(doc)) if (!DOC_KEYS.includes(k)) errors.push(`unknown top-level key "${k}"`);
  if (doc.version !== 1) errors.push("version must be 1");
  if (!/^[\w.-]+\/[\w.-]+$/.test(doc.repo ?? "")) errors.push("repo must be owner/name");
  if (!Array.isArray(doc.tasks) || doc.tasks.length === 0) return [...errors, "tasks must be a non-empty array"];
  const ids = new Set(), branches = new Set(), slugs = new Set();
  for (const t of doc.tasks) {
    const at = `task ${t?.id ?? "?"}`;
    for (const k of Object.keys(t ?? {})) if (!TASK_KEYS.includes(k)) errors.push(`${at}: unknown key "${k}"`);
    if (!/^[A-Za-z0-9.-]+$/.test(t.id ?? "")) errors.push(`${at}: id must be letters, digits, dots or dashes`);
    if (ids.has(t.id)) errors.push(`${at}: duplicate id`);
    ids.add(t.id);
    for (const k of ["title", "row", "lane"]) if (typeof t[k] !== "string" || !t[k].trim()) errors.push(`${at}: ${k} is required`);
    if (![1, 2, 3].includes(t.tier)) errors.push(`${at}: tier must be 1, 2 or 3`);
    if (!STATUSES.includes(t.status)) errors.push(`${at}: status must be one of ${STATUSES.join(", ")}`);
    if (!/^agent\/[a-z0-9-]+\/[a-z0-9.-]+$/.test(t.branch ?? "")) errors.push(`${at}: branch must be agent/<owner>/<slug>`);
    else if (t.branch.startsWith("agent/review/")) errors.push(`${at}: agent/review/ is reserved for review locks`);
    if (branches.has(t.branch)) errors.push(`${at}: duplicate branch`);
    branches.add(t.branch);
    const slug = slugOf(t.branch ?? "");
    if (slugs.has(slug)) errors.push(`${at}: branch slug "${slug}" is used twice (review locks need unique slugs)`);
    slugs.add(slug);
    if (t.packet === null) {
      if (t.status === "todo") errors.push(`${at}: a todo task needs a packet`);
    } else if (typeof t.packet !== "string" || !t.packet.startsWith("docs/plans/") || !packetExists(t.packet)) {
      errors.push(`${at}: packet ${t.packet} does not exist under docs/plans/`);
    }
    if (!Array.isArray(t.dependsOn)) errors.push(`${at}: dependsOn must be an array`);
    if (t.note !== undefined && typeof t.note !== "string") errors.push(`${at}: note must be text`);
  }
  for (const t of doc.tasks) for (const d of t.dependsOn ?? []) {
    if (!ids.has(d)) errors.push(`task ${t.id}: depends on unknown task ${d}`);
    if (d === t.id) errors.push(`task ${t.id}: depends on itself`);
  }
  const byId = new Map(doc.tasks.map(t => [t.id, t]));
  const visiting = new Set(), seen = new Set();
  const visit = id => {
    if (seen.has(id)) return;
    if (visiting.has(id)) { errors.push(`dependency cycle through ${id}`); return; }
    visiting.add(id);
    for (const d of byId.get(id)?.dependsOn ?? []) if (byId.has(d)) visit(d);
    visiting.delete(id); seen.add(id);
  };
  for (const t of doc.tasks) visit(t.id);
  return errors;
}

/**
 * branches: Map<name, { tipMs, merged, markers: parsed markers oldest first }>,
 * only for branches under agent/. The work branch of a task is its own branch,
 * or a legacy agent/<model>/<slug> branch someone started from the packet.
 */
function workBranchOf(task, branches) {
  if (branches.has(task.branch)) return task.branch;
  const slug = slugOf(task.branch);
  for (const name of branches.keys()) {
    if (name.endsWith(`/${slug}`) && !name.startsWith("agent/review/")) return name;
  }
  return null;
}

const lastBy = (markers, verbs) => [...markers].reverse().find(m => verbs.includes(m.verb)) ?? null;

/** Where a Tier 1 pull request stands, read from its review lock's markers. */
export function reviewStateOf(lock) {
  const last = lock?.markers.at(-1);
  if (!last || last.verb === "Fixed") return "needs-review";
  if (last.verb === "Review claim") return "in-review";
  if (last.verb === "Verdict") return last.verdict === "pass" ? "passed" : "needs-fix";
  if (last.verb === "Fix claim") return "fixing";
  return "needs-review";
}

/** The one thing the next agent should do. Order: red main, reviews and fixes, stalled claims, new work. */
export function pickNextTask({ tasks, mainCi, branches, openPrs, now, claimant }) {
  if (mainCi.state === "unknown") return { kind: "stop", reason: "cannot read main's CI runs from GitHub; nothing may be picked or pushed until it is known (D-082)" };
  if (mainCi.state === "running-after-red") return { kind: "wait", reason: "main's CI is running again after a failure; run this again when it finishes" };
  if (mainCi.state === "red") {
    const lock = fixMainLockOf(mainCi.sha);
    const held = branches.get(lock);
    if (held && now - held.tipMs <= STALE_MS) return { kind: "wait", reason: `main is red; ${held.markers[0]?.who ?? "another agent"} is fixing it on ${lock}` };
    return { kind: "fix-main", sha: mainCi.sha, url: mainCi.url, lock, parent: held ? lock : null };
  }
  const view = tasks.map(task => {
    const work = workBranchOf(task, branches);
    const info = work ? branches.get(work) : null;
    const owner = info ? lastBy(info.markers, ["Claim", "Takeover"])?.who ?? null : null;
    const done = task.status === "done" || (task.status === "todo" && Boolean(info?.merged));
    return { task, work, info, owner, done, open: task.status === "todo" && Boolean(info) && !info.merged };
  });
  const byId = new Map(view.map(v => [v.task.id, v]));
  const laneBusy = v => view.some(o => o !== v && o.task.lane === v.task.lane && (o.task.status === "in-review" || o.open));
  const skipped = [];

  for (const v of view) {
    if (!v.open || v.task.tier !== 1 || !openPrs.has(v.work)) continue;
    const lockName = reviewLockOf(v.task);
    const lock = branches.get(lockName) ?? null;
    const state = reviewStateOf(lock);
    const stale = lock ? now - lock.tipMs > STALE_MS : false;
    const reviewer = lock ? lastBy(lock.markers, ["Review claim"])?.who ?? null : null;
    const fixer = lock ? lastBy(lock.markers, ["Fix claim"])?.who ?? null : null;
    const pr = openPrs.get(v.work);
    if (state === "needs-review" || (state === "in-review" && stale)) {
      if (claimant && (claimant === v.owner || claimant === fixer)) { skipped.push({ id: v.task.id, reason: "needs a review, and you built or fixed it" }); continue; }
      return { kind: "review", task: v.task, work: v.work, pr, lock: lockName, lockExists: Boolean(lock), builder: v.owner };
    }
    if (state === "needs-fix" || (state === "fixing" && stale)) {
      if (claimant && claimant === reviewer) { skipped.push({ id: v.task.id, reason: "needs its review findings fixed, and you reviewed it" }); continue; }
      return { kind: "fix", task: v.task, work: v.work, pr, lock: lockName };
    }
    skipped.push({ id: v.task.id, reason: state === "passed" ? `review passed; ${reviewer} lands it` : `${state === "fixing" ? "findings being fixed by " + fixer : "under review by " + reviewer}` });
  }
  for (const v of view) {
    if (!v.open || now - v.info.tipMs <= STALE_MS) continue;
    if (v.task.tier === 1 && openPrs.has(v.work)) continue;
    return { kind: "takeover", task: v.task, work: v.work, from: v.owner, since: v.info.tipMs };
  }
  for (const v of view) {
    const id = v.task.id;
    if (v.done) { skipped.push({ id, reason: "done" }); continue; }
    if (v.task.status !== "todo") { skipped.push({ id, reason: { "in-review": "being landed by its reviewer", architect: "waits for Claude Code's packet", owner: "waits for the owner" }[v.task.status] }); continue; }
    if (v.open) { if (!skipped.some(s => s.id === id)) skipped.push({ id, reason: `in progress by ${v.owner ?? "another agent"} on ${v.work}` }); continue; }
    const unmet = v.task.dependsOn.filter(d => !byId.get(d)?.done);
    if (unmet.length) { skipped.push({ id, reason: `waits for ${unmet.join(", ")}` }); continue; }
    if (laneBusy(v)) { skipped.push({ id, reason: `lane ${v.task.lane} is busy` }); continue; }
    return { kind: "build", task: v.task, ciRunning: mainCi.state === "running" };
  }
  return { kind: "none", skipped };
}

// D-083: the queue picker's pure logic. `scripts/next-task.mjs` does the git
// and GitHub I/O and passes plain data in; everything here is deterministic,
// so `scripts/nextTask.test.ts` can pin each decision.
//
// A claim is a branch on origin. Every state change is one empty "marker"
// commit pushed as a fast-forward, so two agents racing for the same task
// cannot both win: the second push is rejected as non-fast-forward.
//
// D-085 (owner, Oct 20): `build`, `resume`, `continue` and `next` all run the
// picker. An agent gets its own unfinished work back first; after that the
// queue is walked once, top down, and the first task that needs anyone wins —
// a review, a fix, a red pull request, a landing, a half-built claim nobody
// has pushed to for 2 hours, or new work — so a lower task never runs while a
// higher one waits for hands.

export const IDLE_MS = 2 * 60 * 60 * 1000;
export const STATUSES = ["todo", "in-review", "done", "architect", "owner"];
const TASK_KEYS = ["id", "title", "row", "packet", "tier", "lane", "branch", "status", "dependsOn", "note"];
const DOC_KEYS = ["version", "repo", "decidedBy", "updated", "rules", "tasks"];
const MARKER = /^(Review claim|Fix claim|Land claim|Claim|Takeover|Verdict|Fixed|Heartbeat) (\S+): (.+)$/;
const RED = new Set(["failure", "timed_out", "startup_failure", "action_required"]);
const RESERVED = ["agent/review/", "agent/heartbeat/", "agent/architect/"];

export const slugOf = branch => branch.split("/").pop();
export const reviewLockOf = task => `agent/review/${slugOf(task.branch)}`;
export const architectLockOf = task => `agent/architect/${slugOf(task.branch)}`;
export const heartbeatOf = slug => `agent/heartbeat/${slug}`;
export const fixMainLockOf = sha => `agent/queue/fix-main-${sha.slice(0, 8)}`;
/** Claude Code sessions: the CEO and architect (D-074, D-085). Packets go only to them; building never does. */
export const isArchitect = who => /^Claude Code\b/.test(who ?? "");

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

/** Newest-first CI runs (main, or one pull request's branch) -> green | red | running | running-after-red | unknown. */
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
    else {
      const prefix = RESERVED.find(p => t.branch.startsWith(p));
      if (prefix) errors.push(`${at}: ${prefix} is reserved for review locks, heartbeats and architect claims`);
    }
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
    if (name.endsWith(`/${slug}`) && !RESERVED.some(p => name.startsWith(p))) return name;
  }
  return null;
}

const lastBy = (markers, verbs) => [...markers].reverse().find(m => verbs.includes(m.verb)) ?? null;
const holderOf = info => (info ? lastBy(info.markers, ["Claim", "Takeover"])?.who ?? null : null);

/** Where a Tier 1 pull request stands, read from its review lock's markers. */
export function reviewStateOf(lock) {
  const last = lock?.markers.at(-1);
  if (!last || last.verb === "Fixed") return "needs-review";
  if (last.verb === "Review claim") return "in-review";
  if (last.verb === "Verdict") return last.verdict === "pass" ? "passed" : "needs-fix";
  if (last.verb === "Fix claim") return "fixing";
  if (last.verb === "Land claim") return "landing";
  return "needs-review";
}

/**
 * D-085: local work that origin cannot see. local: [{ branch, ahead (commits
 * not on origin, null when the branch is not on origin), dirty, path }].
 * Your own claimed branch out of sync blocks new work; anything else is a note.
 */
export function localSyncIssues({ local, branches, claimant, mainBehind = 0 }) {
  const blocking = [], notes = [];
  for (const l of local) {
    if (RESERVED.some(p => l.branch.startsWith(p))) continue;
    const holder = holderOf(branches.get(l.branch));
    const mine = Boolean(claimant) && holder === claimant;
    if (l.ahead === null) {
      notes.push(`${l.branch} is not on origin (worktree ${l.path}): if it is yours, push it now (git -C ${l.path} push -u origin ${l.branch}); work only on your machine is invisible to every other agent`);
      continue;
    }
    if (l.ahead > 0) (mine ? blocking : notes).push(`${l.branch} has ${l.ahead} commit${l.ahead === 1 ? "" : "s"} not on origin${mine ? "" : ` (claimed by ${holder ?? "nobody"})`}: git -C ${l.path} push origin ${l.branch}`);
    if (l.dirty) (mine ? blocking : notes).push(`${l.branch} has uncommitted changes in ${l.path}${mine ? ": commit them (a WIP commit is fine) and push" : ` (claimed by ${holder ?? "nobody"})`}`);
  }
  if (mainBehind > 0) notes.push(`your main checkout is ${mainBehind} commits behind origin/main: git pull --ff-only before reading any doc`);
  return { blocking, notes };
}

/** The one thing the next agent should do (D-083, D-085). */
export function pickNextTask({ tasks, mainCi, branches, openPrs, prCi = new Map(), now, claimant }) {
  const tipOf = name => branches.get(name)?.tipMs ?? 0;
  const activeAt = (name, slug) => Math.max(tipOf(name), tipOf(heartbeatOf(slug)));
  const idle = (name, slug) => now - activeAt(name, slug) > IDLE_MS;

  if (mainCi.state === "unknown") return { kind: "stop", reason: "cannot read main's CI runs from GitHub; nothing may be picked or pushed until it is known (D-082)" };
  if (mainCi.state === "running-after-red") return { kind: "wait", reason: "main's CI is running again after a failure; run this again when it finishes" };
  if (mainCi.state === "red") {
    const lock = fixMainLockOf(mainCi.sha);
    const held = branches.get(lock);
    const holder = holderOf(held);
    if (held && claimant && holder === claimant) return { kind: "continue", of: "fix-main", sha: mainCi.sha, url: mainCi.url, lock };
    if (held && !idle(lock, slugOf(lock))) return { kind: "wait", reason: `main is red; ${holder ?? "another agent"} is fixing it on ${lock}` };
    return { kind: "fix-main", sha: mainCi.sha, url: mainCi.url, lock, parent: held ? lock : null };
  }

  const view = tasks.map(task => {
    const work = workBranchOf(task, branches);
    const info = work ? branches.get(work) : null;
    const lockName = reviewLockOf(task);
    const archName = architectLockOf(task);
    const arch = branches.get(archName) ?? null;
    const pr = work ? openPrs.get(work) ?? null : null;
    return {
      task, work, info, lockName, lock: branches.get(lockName) ?? null, archName, arch: arch && !arch.merged ? arch : null,
      slug: slugOf(task.branch), owner: holderOf(info), pr, ci: pr ? prCi.get(work)?.state ?? "unknown" : "unknown",
      done: task.status === "done" || (task.status === "todo" && Boolean(info?.merged)),
      open: task.status === "todo" && Boolean(info) && !info.merged,
    };
  });
  const byId = new Map(view.map(v => [v.task.id, v]));
  const laneBusy = v => view.some(o => o !== v && o.task.lane === v.task.lane && (o.task.status === "in-review" || o.open));

  if (claimant) {
    const mine = ownWork(view, claimant);
    if (mine) return mine;
  }

  const skipped = [];
  const skip = (v, reason) => { skipped.push({ id: v.task.id, reason }); return null; };
  const roles = v => ({
    reviewer: v.lock ? lastBy(v.lock.markers, ["Review claim"])?.who ?? null : null,
    fixer: v.lock ? lastBy(v.lock.markers, ["Fix claim"])?.who ?? null : null,
    lander: v.lock ? lastBy(v.lock.markers, ["Land claim"])?.who ?? null : null,
  });

  const actionFor = v => {
    if (v.done) return skip(v, "done");
    if (v.open) {
      const quiet = idle(v.work, v.slug);
      const { reviewer, fixer, lander } = roles(v);
      if (v.pr && v.ci === "red") {
        if (!quiet) return skip(v, `CI is red on ${v.pr}; ${v.owner ?? "its builder"} is on it`);
        if (claimant && claimant === reviewer) return skip(v, "CI is red, and you reviewed it");
        return { kind: "green", task: v.task, work: v.work, pr: v.pr, from: v.owner, since: activeAt(v.work, v.slug) };
      }
      if (v.pr && (v.ci === "running" || v.ci === "running-after-red")) return skip(v, `CI is running on ${v.pr}`);
      if (v.pr && v.task.tier === 1) {
        const state = reviewStateOf(v.lock);
        const lockQuiet = v.lock ? idle(v.lockName, v.slug) : false;
        if (state === "needs-review" || (state === "in-review" && lockQuiet)) {
          if (claimant && (claimant === v.owner || claimant === fixer)) return skip(v, "needs a review, and you built or fixed it");
          return { kind: "review", task: v.task, work: v.work, pr: v.pr, lock: v.lockName, lockExists: Boolean(v.lock), builder: v.owner };
        }
        if (state === "needs-fix" || (state === "fixing" && lockQuiet)) {
          if (claimant && claimant === reviewer) return skip(v, "needs its review findings fixed, and you reviewed it");
          return { kind: "fix", task: v.task, work: v.work, pr: v.pr, lock: v.lockName };
        }
        if ((state === "passed" || state === "landing") && lockQuiet) {
          if (claimant && (claimant === v.owner || claimant === fixer)) return skip(v, "its review passed, and you built or fixed it");
          return { kind: "land", task: v.task, work: v.work, pr: v.pr, lock: v.lockName, tier1: true, from: lander ?? reviewer };
        }
        return skip(v, { passed: `review passed; ${reviewer} lands it`, landing: `${lander} is landing it`, fixing: `findings being fixed by ${fixer}` }[state] ?? `under review by ${reviewer}`);
      }
      if (v.pr) {
        if (!quiet) return skip(v, `${v.owner ?? "its builder"} is landing ${v.pr}`);
        return { kind: "land", task: v.task, work: v.work, pr: v.pr, tier1: false, from: v.owner };
      }
      if (!quiet) return skip(v, `in progress by ${v.owner ?? "another agent"} on ${v.work}`);
      return { kind: "takeover", task: v.task, work: v.work, from: v.owner, since: activeAt(v.work, v.slug) };
    }
    if (v.task.status === "architect") {
      if (!isArchitect(claimant)) return skip(v, "waits for Claude Code's packet");
      if (v.arch && !idle(v.archName, v.slug)) return skip(v, `${holderOf(v.arch) ?? "a Claude Code session"} is writing its packet`);
      return { kind: "architect", task: v.task, lock: v.archName, lockExists: Boolean(v.arch), from: holderOf(v.arch) };
    }
    if (v.task.status !== "todo") return skip(v, { "in-review": "being landed by its reviewer", owner: "waits for the owner" }[v.task.status]);
    const unmet = v.task.dependsOn.filter(d => !byId.get(d)?.done);
    if (unmet.length) return skip(v, `waits for ${unmet.join(", ")}`);
    if (laneBusy(v)) return skip(v, `lane ${v.task.lane} is busy`);
    return { kind: "build", task: v.task, ciRunning: mainCi.state === "running" };
  };

  // D-085: Claude Code is the CEO; the open models build. A Claude Code session
  // is never handed development work, and with nothing at its level it runs
  // the CEO review instead of idling.
  const ceo = isArchitect(claimant);
  for (const v of view) {
    const action = actionFor(v);
    if (!action) continue;
    if (ceo && (DEV_KINDS.has(action.kind) || (action.kind === "land" && !action.tier1))) { skip(v, "development work: the open models build it (D-085)"); continue; }
    return action;
  }
  return ceo ? { kind: "ceo", skipped } : { kind: "none", skipped };
}

const DEV_KINDS = new Set(["build", "takeover", "green", "fix"]);

/** D-085: what this agent already holds, in queue order. A Tier 1 builder waiting for review holds nothing. */
function ownWork(view, claimant) {
  for (const v of view) {
    if (v.open && v.pr && v.lock) {
      const last = v.lock.markers.at(-1);
      if (last?.who === claimant) {
        const base = { kind: "continue", task: v.task, work: v.work, pr: v.pr, lock: v.lockName };
        if (last.verb === "Review claim") return { ...base, of: "review", builder: v.owner };
        if (last.verb === "Fix claim") return { ...base, of: "fix" };
        if (last.verb === "Land claim" || (last.verb === "Verdict" && last.verdict === "pass")) return { ...base, of: "land", tier1: true };
      }
    }
    if (v.open && v.owner === claimant) {
      if (v.pr && v.task.tier === 1 && v.ci !== "red") continue;
      return { kind: "continue", of: v.pr ? (v.ci === "red" ? "green" : "land") : "build", task: v.task, work: v.work, pr: v.pr, tier1: v.task.tier === 1 };
    }
    if (v.task.status === "architect" && v.arch && holderOf(v.arch) === claimant) {
      return { kind: "continue", of: "architect", task: v.task, lock: v.archName };
    }
  }
  return null;
}

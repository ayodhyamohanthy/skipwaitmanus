// D-083: the queue picker's pure logic. `scripts/next-task.mjs` does the git
// and GitHub I/O and passes plain data in; everything here is deterministic,
// so `scripts/nextTask.test.ts` can pin each decision.
//
// A claim is a branch on origin. Every state change is one empty "marker"
// commit pushed as a fast-forward, so two agents racing for the same task
// cannot both win: the second push is rejected as non-fast-forward. A holder
// that comes back to a quiet claim re-takes it on the same ref a takeover
// pushes to, so the holder and a taker race on one ref too (D-085).
//
// D-085 (owner, Oct 20): `build`, `resume`, `continue` and `next` all run the
// picker. Red main comes first. Then an agent's own unfinished work, unless
// pending work ranked above it has nobody on it; then pending work (a review,
// findings to fix, a red pull request, a landing, a half-built claim nobody has
// pushed to for 2 hours, a blocked priority for the CEO), top down; then new
// work, top down. A red or blocked priority holds its own lane and the tasks that depend on it; red `main` holds everything (D-109).

export const IDLE_MS = 2 * 60 * 60 * 1000;
/** A holder whose claim has been quiet this long re-takes it on the takeover ref instead of a side heartbeat. */
export const RECLAIM_MS = 90 * 60 * 1000;
export const STATUSES = ["todo", "in-review", "done", "architect", "owner"];
const TASK_KEYS = ["id", "title", "row", "packet", "tier", "lane", "branch", "status", "dependsOn", "note"];
const DOC_KEYS = ["version", "repo", "decidedBy", "updated", "rules", "tasks"];
const MARKER = /^(Review claim|Fix claim|Land claim|Claim|Takeover|Unblock|Verdict|Fixed|Heartbeat|Report) (\S+): (.+)$/;
/** What an agent reports to the CEO about its task (D-085). */
export const REPORT_STATUSES = ["green", "red", "blocked", "review", "landed"];
/** The executive who owns a lane; the open models play these roles (D-085). */
const ROLE_BY_LANE = { design: "CDO" };
const RED = new Set(["failure", "timed_out", "startup_failure", "action_required"]);
const RESERVED = ["agent/review/", "agent/heartbeat/", "agent/architect/", "agent/reports/"];
/** Marker-only refs nobody commits work to; local copies of them are never "your work". */
const MARKER_ONLY = ["agent/review/", "agent/heartbeat/", "agent/reports/"];

export const slugOf = branch => branch.split("/").pop();
export const reviewLockOf = task => `agent/review/${slugOf(task.branch)}`;
export const architectLockOf = task => `agent/architect/${slugOf(task.branch)}`;
/** The side heartbeat of a work branch or fix-main lock; marker-only locks take heartbeats directly. */
export const heartbeatOf = slug => `agent/heartbeat/${slug}`;
export const fixMainLockOf = sha => `agent/queue/fix-main-${sha.slice(0, 8)}`;
export const fixMainIdOf = sha => `fix-main-${sha.slice(0, 8)}`;
/** Claude Code sessions are the CEO and architect (D-074, D-085), known by the "Claude" name prefix. */
export const isArchitect = who => /^claude/i.test((who ?? "").trim());
const modelOf = who => (who ?? "").split(" · ")[0];

/** "Claim GO-LIVE-1: Qwen 3 · s1" -> { verb: "Claim", id: "GO-LIVE-1", who: "Qwen 3 · s1" }. */
export function parseMarker(subject) {
  const m = MARKER.exec(subject);
  if (!m) return null;
  if (m[1] === "Verdict") {
    const v = /^(pass|findings) — (.+)$/.exec(m[3]);
    return v ? { verb: "Verdict", id: m[2], verdict: v[1], who: sanitizeName(v[2]) } : null;
  }
  if (m[1] === "Report") {
    const r = /^(\S+) — (.+)$/.exec(m[3]);
    return r && REPORT_STATUSES.includes(r[1]) ? { verb: "Report", id: m[2], status: r[1], who: sanitizeName(r[2]) } : null;
  }
  // Names on origin are written by any agent: clean them on read too, so the board prints no control characters.
  return { verb: m[1], id: m[2], who: sanitizeName(m[3]) };
}

/** `extra` is the verdict (pass|findings) for a Verdict and the status for a Report. */
export function markerSubject(verb, id, who, extra) {
  return verb === "Verdict" || verb === "Report" ? `${verb} ${id}: ${extra} — ${who}` : `${verb} ${id}: ${who}`;
}

export const roleOf = task => ROLE_BY_LANE[task.lane] ?? "CTO";

const CONTROL = /[\p{Cc}\p{Cf}\u2028\u2029]+/gu;
const SECRETS = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g, /\bgithub_pat_[A-Za-z0-9_]{16,}/g, /x-access-token:[^@\s]+@?/gi, /\bBearer\s+\S+/gi,
  /\bsk-[A-Za-z0-9_-]{16,}/g, /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, /\/\/[^/\s:@]+:[^/\s@]+@/g, /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
];
/** A session name for markers: one line, no control characters, at most 60 characters. */
export const sanitizeName = raw => String(raw ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, 60);
/** A report note goes to a public repo (D-059): one line, tokens and email addresses redacted, at most 500 characters. */
export function sanitizeNote(raw) {
  let text = String(raw ?? "").replace(CONTROL, " ");
  for (const re of SECRETS) text = text.replace(re, "[redacted]");
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}
/** D-085: a name without a session part gets a unique tag, so two sessions of one model never share a claim. */
export function sessionName(raw, tag) {
  const name = sanitizeName(raw);
  // The tag must survive the 60-character cut every later read applies, or the name could never be reused.
  return name.includes(" · ") ? name : `${name.slice(0, 60 - 3 - tag.length).trimEnd()} · ${tag}`;
}
/** A refused marker push: lost to another agent ("race"), or anything else ("error", which must stop the run). */
export function classifyPushError(stderr) {
  const text = stderr ?? "";
  if (/GH013|denied|permission|authenticat|could not read|unable to access/i.test(text)) return "error";
  return /\[rejected\]|fetch first|non-fast-forward|stale info|cannot lock ref|failed to update ref/i.test(text) ? "race" : "error";
}

/** Newest-first CI runs (main, or one pull request's branch) -> green | red | running | running-after-red | unknown. */
export function ciStateFromRuns(runs) {
  const newest = runs[0];
  const done = runs.find(r => r.status === "completed" && r.conclusion !== "cancelled" && r.conclusion !== "skipped");
  if (!newest || !done) return { state: "unknown" };
  const red = RED.has(done.conclusion);
  const running = newest.status !== "completed";
  const state = running ? (red ? "running-after-red" : "running") : (red ? "red" : "green");
  const at = Date.parse(done.updated_at ?? "");
  return { state, sha: done.head_sha, url: done.html_url, ...(Number.isFinite(at) ? { at } : {}) };
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
      if (prefix) errors.push(`${at}: ${prefix} is reserved for review locks, heartbeats, reports and architect claims`);
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
 * branches: Map<name, { tipMs, tipSha?, merged, markers: parsed markers oldest first }>,
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

/** The markers that decide a stage: never heartbeats, and only those naming this task. */
const stageMarkers = (info, id) => (info?.markers ?? []).filter(m => m.verb !== "Heartbeat" && (id === undefined || m.id === id));
const lastBy = (markers, verbs) => [...markers].reverse().find(m => verbs.includes(m.verb)) ?? null;
const everyone = (markers, verbs) => [...new Set(markers.filter(m => verbs.includes(m.verb)).map(m => m.who))];
const holderOf = (info, id) => (info ? lastBy(stageMarkers(info, id), ["Claim", "Takeover"])?.who ?? null : null);

/** Where a Tier 1 pull request stands, read from its review lock's markers (heartbeats never count). */
export function reviewStateOf(lock, id) {
  const last = stageMarkers(lock, id).at(-1);
  if (!last || last.verb === "Fixed") return "needs-review";
  if (last.verb === "Review claim") return "in-review";
  if (last.verb === "Verdict") return last.verdict === "pass" ? "passed" : "needs-fix";
  if (last.verb === "Fix claim") return "fixing";
  if (last.verb === "Land claim") return "landing";
  return "needs-review";
}

/** Who holds a review lock's current stage (the reviewer, fixer or lander), or null. */
export const stageHolderOf = (lock, id) => stageMarkers(lock, id).at(-1)?.who ?? null;

/**
 * The report that stands for each task: the newest (reports arrive newest first, log order, never
 * sorted by an agent's clock), except that a blocked report stands until the CEO reports on the task.
 */
const latestReports = reports => {
  const latest = new Map(), settled = new Set();
  for (const r of reports) {
    if (settled.has(r.id)) continue;
    if (!latest.has(r.id)) latest.set(r.id, r);
    if (isArchitect(r.who)) settled.add(r.id);
    else if (r.status === "blocked") { latest.set(r.id, r); settled.add(r.id); }
  }
  return latest;
};

/** One row per task with everything every decision reads. */
function buildView({ tasks, branches, openPrs, prCi, mergedHeads, reports }) {
  const latest = latestReports(reports);
  return tasks.map((task, at) => {
    const id = task.id;
    const work = workBranchOf(task, branches);
    const info = work ? branches.get(work) : null;
    const lockName = reviewLockOf(task);
    const lock = branches.get(lockName) ?? null;
    const archName = architectLockOf(task);
    const arch = branches.get(archName) ?? null;
    const pr = work ? openPrs.get(work) ?? null : null;
    const ci = pr ? prCi.get(work) ?? { state: "unknown" } : { state: "unknown" };
    // A squash merge leaves the branch unmerged in git; GitHub's merged pull request says it landed.
    const landed = info ? Boolean(info.merged) || Boolean(info.tipSha && mergedHeads.get(work)?.has(info.tipSha)) : mergedHeads.has(task.branch);
    let said = latest.get(id) ?? null;
    // A red report older than a green CI run on the pull request no longer holds anything.
    if (said?.status === "red" && pr && ci.state === "green" && ci.at && ci.at > said.at) said = null;
    const lockMarkers = stageMarkers(lock, id);
    const archMarkers = stageMarkers(arch, id);
    return {
      task, at, work, info, lockName, lock, archName, arch: arch && !arch.merged ? arch : null,
      slug: slugOf(task.branch), owner: holderOf(info, id), pr, ci: ci.state, said,
      builders: everyone(stageMarkers(info, id), ["Claim", "Takeover"]),
      reviewers: everyone(lockMarkers, ["Review claim"]), fixers: everyone(lockMarkers, ["Fix claim"]),
      reviewer: lastBy(lockMarkers, ["Review claim"])?.who ?? null, fixer: lastBy(lockMarkers, ["Fix claim"])?.who ?? null,
      lander: lastBy(lockMarkers, ["Land claim"])?.who ?? null, review: reviewStateOf(lock, id), stageHolder: lockMarkers.at(-1)?.who ?? null,
      unblocker: archMarkers.at(-1)?.verb === "Unblock" ? archMarkers.at(-1).who : null,
      done: task.status === "done" || (task.status === "todo" && landed),
      open: task.status === "todo" && Boolean(info) && !landed,
    };
  });
}

/** When each held stage last moved. */
function clock(branches, now) {
  const tipOf = name => branches.get(name)?.tipMs ?? 0;
  // A side heartbeat counts only for the agent holding the branch it keeps alive.
  const beat = (slug, holder) => {
    const hb = branches.get(heartbeatOf(slug));
    return hb && holder && hb.markers.at(-1)?.who === holder ? hb.tipMs : 0;
  };
  const workAt = v => Math.max(tipOf(v.work), beat(v.slug, v.owner));
  // A fixer or lander works on the pull request's branch (a passed review's reviewer lands it), so its pushes keep the stage alive.
  const lockAt = v => Math.max(tipOf(v.lockName), ["fixing", "passed", "landing"].includes(v.review) ? tipOf(v.work) : 0);
  const archAt = v => tipOf(v.archName);
  const quiet = at => now - at > IDLE_MS;
  return { workAt, lockAt, archAt, quiet };
}

const PENDING_KINDS = new Set(["review", "fix", "green", "land", "takeover", "unblock"]);
const DEV_KINDS = new Set(["build", "takeover", "green", "fix"]);

/** D-085: the one thing the next agent should do (D-083). */
export function pickNextTask({ tasks, mainCi, branches, openPrs, prCi = new Map(), mergedHeads = new Map(), reports = [], now, claimant }) {
  if (mainCi.state === "unknown") return { kind: "stop", reason: "cannot read main's CI runs from GitHub; nothing may be picked or pushed until it is known (D-082)" };
  if (mainCi.state === "running-after-red") return { kind: "wait", mainRed: true, reason: "main's CI is running again after a failure; run this again when it finishes" };
  if (mainCi.state === "red") {
    // One fix-main lock at a time: a newer red commit while someone is fixing main does not open a second lock.
    const current = fixMainLockOf(mainCi.sha);
    const locks = fixMainLocks(branches, now);
    const mine = claimant ? locks.find(l => l.holder === claimant && (!l.quiet || l.lock === current)) : null;
    if (mine) return { kind: "continue", of: "fix-main", sha: mine.sha8, url: mainCi.url, lock: mine.lock };
    const busy = locks.find(l => !l.quiet);
    if (busy) return { kind: "wait", mainRed: true, reason: `main is red; ${busy.holder ?? "another agent"} is fixing it on ${busy.lock}` };
    const held = locks.find(l => l.lock === current);
    return { kind: "fix-main", sha: mainCi.sha, url: mainCi.url, lock: current, parent: held ? current : null, from: held ? held.holder : null };
  }
  if (openPrs === null) return { kind: "stop", reason: "cannot read the open pull requests from GitHub; a task under review would look abandoned, so nothing may be picked until they are known (D-085)" };
  if (mergedHeads === null) return { kind: "stop", reason: "cannot read the merged pull requests from GitHub; a landed task would look half-built, so nothing may be picked until they are known (D-085)" };

  const view = buildView({ tasks, branches, openPrs, prCi, mergedHeads, reports });
  const byId = new Map(view.map(v => [v.task.id, v]));
  const laneBusy = v => view.some(o => o !== v && o.task.lane === v.task.lane && (o.task.status === "in-review" || o.open));
  const { workAt, lockAt, archAt, quiet } = clock(branches, now);
  const ceo = isArchitect(claimant);

  const skipped = [];
  const skip = (v, reason) => { skipped.push({ id: v.task.id, reason }); return null; };
  // D-085, narrowed by D-109: a priority that is red (CI, or its team reported red or blocked) holds its own lane
  // and every task that depends on it, never unrelated lanes; red main (above) still holds everything.
  const gate = (reason, extra = {}) => ({ kind: "gate", reason, ...extra });
  const did = (v, roles) => Boolean(claimant) && roles.some(r => v[r].includes(claimant));
  const green = (v, why) => ({ kind: "green", task: v.task, work: v.work, pr: v.pr, from: v.owner, since: workAt(v), why });
  const reportWhy = said => `${said.who} reported it ${said.status}${said.note ? `: ${said.note}` : ""}`;

  // A Tier 1 pull request: its review lock decides; a reviewer's report never takes the fix away from the fix stage.
  const tier1 = v => {
    const state = v.review;
    const lockQuiet = v.lock ? quiet(lockAt(v)) : false;
    if (v.ci === "red") {
      if (state === "fixing" && !lockQuiet) return gate(`${v.task.id} is red (CI on ${v.pr}) and ${v.fixer} is on it`);
      // Red after a passed review: the change goes through a fix stage and is reviewed again, never landed as it is.
      const afterPass = state === "passed" || state === "landing";
      if (state === "needs-fix" || state === "fixing" || afterPass) {
        if (did(v, ["reviewers"]) || (v.lander && claimant === v.lander)) return gate(`${v.task.id} is red (CI on ${v.pr}) and you reviewed or are landing it, so someone else fixes it`);
        return { kind: "fix", task: v.task, work: v.work, pr: v.pr, lock: v.lockName, ...(afterPass ? { why: `CI on ${v.pr} turned red after its review passed; fix it red-first, then it is reviewed again` } : {}) };
      }
      if (!quiet(workAt(v))) return gate(`${v.task.id} is red (CI on ${v.pr}) and ${v.owner ?? "its builder"} is making it green`);
      if (did(v, ["reviewers"])) return gate(`${v.task.id} is red (CI on ${v.pr}); you reviewed it, so someone else makes it green`);
      return green(v, `Pull request ${v.pr} has red CI`);
    }
    if (v.ci === "running" || v.ci === "running-after-red") return skip(v, `CI is running on ${v.pr}`);
    if (state === "needs-review" || (state === "in-review" && lockQuiet)) {
      if (did(v, ["builders", "fixers"])) return skip(v, "needs a review, and you built or fixed it");
      return { kind: "review", task: v.task, work: v.work, pr: v.pr, lock: v.lockName, lockExists: Boolean(v.lock), builder: v.owner };
    }
    if (state === "needs-fix" || (state === "fixing" && lockQuiet)) {
      if (did(v, ["reviewers"])) return skip(v, "needs its review findings fixed, and you reviewed it");
      return { kind: "fix", task: v.task, work: v.work, pr: v.pr, lock: v.lockName };
    }
    if ((state === "passed" || state === "landing") && lockQuiet) {
      if (did(v, ["builders", "fixers"])) return skip(v, "its review passed, and you built or fixed it");
      return { kind: "land", task: v.task, work: v.work, pr: v.pr, lock: v.lockName, tier1: true, from: v.lander ?? v.reviewer };
    }
    return skip(v, { passed: `review passed; ${v.reviewer} lands it`, landing: `${v.lander} is landing it`, fixing: `findings being fixed by ${v.fixer}` }[state] ?? `under review by ${v.reviewer}`);
  };

  const actionFor = v => {
    if (v.done) return skip(v, "done");
    if (v.open) {
      const said = v.said;
      if (said?.status === "blocked") {
        if (!ceo) return gate(`${v.task.id} is blocked (${reportWhy(said)}); only the CEO (a Claude Code session) or the owner can clear it`, { blocked: true });
        if (v.unblocker && v.unblocker !== claimant && !quiet(archAt(v))) return gate(`${v.unblocker} is unblocking ${v.task.id}`);
        return { kind: "unblock", task: v.task, report: said, lock: v.archName, lockExists: Boolean(v.arch), from: v.unblocker };
      }
      // D-109: one pull request whose CI cannot be read is skipped, never a stop for everyone (GitHub refuses a red landing anyway, D-082).
      if (v.pr && v.ci === "error") return skip(v, `cannot read CI for ${v.pr}; skipped until it can be read`);
      if (v.pr && v.task.tier === 1) return tier1(v);
      const idle = quiet(workAt(v));
      if (v.pr && v.ci === "red") {
        if (!idle) return gate(`${v.task.id} is red (CI on ${v.pr}) and ${v.owner ?? "its builder"} is making it green`);
        return green(v, `Pull request ${v.pr} has red CI`);
      }
      if (said?.status === "red") {
        if (!idle) return gate(`${v.task.id} is red (${reportWhy(said)}) and ${v.owner ?? "its builder"} is on it`);
        return v.pr ? green(v, reportWhy(said)) : { kind: "takeover", task: v.task, work: v.work, from: v.owner, since: workAt(v), why: reportWhy(said) };
      }
      if (v.pr && (v.ci === "running" || v.ci === "running-after-red")) return skip(v, `CI is running on ${v.pr}`);
      if (v.pr) {
        if (!idle) return skip(v, `${v.owner ?? "its builder"} is landing ${v.pr}`);
        return { kind: "land", task: v.task, work: v.work, pr: v.pr, tier1: false, from: v.owner };
      }
      if (!idle) return skip(v, `in progress by ${v.owner ?? "another agent"} on ${v.work}`);
      return { kind: "takeover", task: v.task, work: v.work, from: v.owner, since: workAt(v) };
    }
    if (v.task.status === "architect") {
      const writer = holderOf(v.arch, v.task.id);
      if (writer && !quiet(archAt(v))) return skip(v, `${writer} is writing its packet`);
      return { kind: "architect", task: v.task, lock: v.archName, lockExists: Boolean(v.arch), from: writer };
    }
    if (v.task.status !== "todo") return skip(v, { "in-review": "being landed by its reviewer", owner: "waits for the owner" }[v.task.status]);
    const unmet = v.task.dependsOn.filter(d => !byId.get(d)?.done);
    if (unmet.length) return skip(v, `waits for ${unmet.join(", ")}`);
    if (laneBusy(v)) return skip(v, `lane ${v.task.lane} is busy`);
    return { kind: "build", task: v.task, ciRunning: mainCi.state === "running" };
  };

  const mine = claimant ? ownWork(view, claimant) : null;

  // Claude Code is the CEO: never development work. Pass 1: pending work top down,
  // stopping at your own work; pass 2: new work. A red or blocked priority holds
  // only its lane and its dependents (D-109).
  const actions = [];
  let gateAt = -1, gateAction = null;
  const heldLanes = new Map(), heldIds = new Map();
  const heldBy = v => heldLanes.get(v.task.lane) ?? v.task.dependsOn.map(d => heldIds.get(d)).find(Boolean);
  for (let i = 0; i < view.length; i++) {
    if (mine && i >= mine.at) break;
    const holder = heldBy(view[i]);
    if (holder && !view[i].done) { heldIds.set(view[i].task.id, holder); skip(view[i], `waits for red or blocked ${holder} (same lane or depends on it)`); continue; }
    const action = actions[i] = actionFor(view[i]);
    if (!action) continue;
    if (action.kind === "gate") {
      if (gateAt < 0) { gateAt = i; gateAction = action; }
      heldLanes.set(view[i].task.lane, view[i].task.id); heldIds.set(view[i].task.id, view[i].task.id);
      skip(view[i], action.reason);
      continue;
    }
    if (!PENDING_KINDS.has(action.kind)) continue;
    if (ceo && (DEV_KINDS.has(action.kind) || (action.kind === "land" && !action.tier1))) { skip(view[i], "development work: the open models build it (D-085)"); continue; }
    // D-085: pending work ranked above your own comes first; your own claim waits, pushed.
    return mine ? { ...action, holds: { id: mine.task.id, branch: mine.work ?? mine.lock } } : action;
  }
  // Your own work: a red priority above it whose owner is on it does not stop you (your hands cannot help it).
  if (mine) { const { at, ...pick } = mine; return pick; }
  for (let i = 0; i < view.length; i++) {
    const action = actions[i];
    if (!action || action.kind === "gate" || PENDING_KINDS.has(action.kind)) continue;
    if (ceo && action.kind !== "architect") { skip(view[i], "development work: the open models build it (D-085)"); continue; }
    return action;
  }
  if (gateAt >= 0 && !ceo) return { kind: "wait", gate: view[gateAt].task.id, blocked: Boolean(gateAction.blocked), reason: gateAction.reason };
  return ceo ? { kind: "ceo", skipped } : { kind: "none", skipped };
}

/** D-085: what this agent already holds, in queue order. A Tier 1 builder waiting for review holds nothing. */
function ownWork(view, claimant) {
  let blockedOwn = null;
  for (const v of view) {
    if (v.open && v.pr && v.task.tier === 1 && v.lock) {
      const last = stageMarkers(v.lock, v.task.id).at(-1);
      if (last?.who === claimant) {
        const base = { kind: "continue", task: v.task, work: v.work, pr: v.pr, lock: v.lockName, at: v.at };
        if (last.verb === "Review claim") return { ...base, of: "review", builder: v.owner };
        if (last.verb === "Fix claim") return { ...base, of: "fix" };
        // A passed review whose CI went red is not landed: it goes to a fix stage (pickNextTask), never back to its lander.
        if ((last.verb === "Land claim" || (last.verb === "Verdict" && last.verdict === "pass")) && v.ci !== "red") return { ...base, of: "land", tier1: true };
      }
    }
    if (v.open && v.owner === claimant) {
      // A blocked task waits for the CEO or the owner; its holder keeps going on anything else it holds (D-085 (3)).
      if (v.said?.status === "blocked") {
        blockedOwn ??= { kind: "wait", gate: v.task.id, blocked: true, own: true, at: v.at, task: v.task, work: v.work, reason: `your task ${v.task.id} is blocked (${v.said.who} reported it blocked${v.said.note ? `: ${v.said.note}` : ""}); only the CEO (a Claude Code session) or the owner can clear it` };
        continue;
      }
      // The builder side holds a Tier 1 pull request only while its CI is red before any review passed or any fix stage owns it.
      if (v.pr && v.task.tier === 1 && !(v.ci === "red" && ["needs-review", "in-review"].includes(v.review))) continue;
      return { kind: "continue", of: v.pr ? (v.ci === "red" ? "green" : "land") : "build", task: v.task, work: v.work, pr: v.pr, tier1: v.task.tier === 1, at: v.at };
    }
    if (v.task.status === "architect" && v.arch && holderOf(v.arch, v.task.id) === claimant) {
      return { kind: "continue", of: "architect", task: v.task, lock: v.archName, at: v.at };
    }
    if (v.open && v.said?.status === "blocked" && v.unblocker === claimant) {
      return { kind: "continue", of: "unblock", task: v.task, report: v.said, lock: v.archName, at: v.at };
    }
  }
  return blockedOwn;
}

/** Every fix-main lock not yet merged, newest activity first. */
function fixMainLocks(branches, now) {
  const { workAt, quiet } = clock(branches, now);
  return [...branches]
    .filter(([name, info]) => /^agent\/queue\/fix-main-[0-9a-f]{8}$/.test(name) && !info.merged)
    .map(([lock, info]) => {
      const id = lock.slice("agent/queue/".length);
      const holder = holderOf(info, id);
      const at = workAt({ work: lock, slug: slugOf(lock), owner: holder });
      return { lock, id, sha8: id.slice("fix-main-".length), holder, at, quiet: quiet(at) };
    })
    .sort((a, b) => b.at - a.at);
}

/** D-085: what `--heartbeat` keeps alive, whatever main's CI says. mainSha: main's red commit, if any. */
export function heldBy({ tasks, branches, openPrs, prCi = new Map(), mergedHeads = new Map(), reports = [], claimant, mainSha = null, now = 0 }) {
  if (mainSha) {
    const current = fixMainLockOf(mainSha);
    const mine = fixMainLocks(branches, now).find(l => l.holder === claimant && (!l.quiet || l.lock === current));
    if (mine) return { kind: "continue", of: "fix-main", sha: mine.sha8, lock: mine.lock };
  }
  const view = buildView({ tasks, branches, openPrs: openPrs ?? new Map(), prCi, mergedHeads: mergedHeads ?? new Map(), reports });
  const own = ownWork(view, claimant);
  if (!own || own.kind !== "continue") return null;
  const { at, ...pick } = own;
  return pick;
}

/**
 * D-085: where a holder records that it is still on its work. A quiet claim
 * (90 minutes or more) is re-taken on the ref a takeover pushes to, so the
 * holder and a taker race on one ref and the first push wins; a fresh one
 * gets a side heartbeat (work branches) or a heartbeat on its lock.
 */
export function leaseFor(pick, branches, now) {
  const workLike = (ref, slug, id) => {
    const info = branches.get(ref);
    const hb = branches.get(heartbeatOf(slug));
    const holder = holderOf(info, id);
    const at = Math.max(info?.tipMs ?? 0, hb && hb.markers.at(-1)?.who === holder ? hb.tipMs : 0);
    return now - at >= RECLAIM_MS ? { ref, verb: "Claim", id, reclaim: true, retry: false } : { ref: heartbeatOf(slug), verb: "Heartbeat", id, reclaim: false, retry: true };
  };
  // A heartbeat on a shared lock is never retried: a refused push there means another agent took the stage.
  const onLock = { ref: pick.lock, verb: "Heartbeat", id: pick.task?.id, reclaim: false, retry: false };
  switch (pick.of) {
    case "fix-main": return workLike(pick.lock, slugOf(pick.lock), fixMainIdOf(pick.sha));
    case "build": case "green": return workLike(pick.work, slugOf(pick.task.branch), pick.task.id);
    case "land": return pick.tier1 ? onLock : workLike(pick.work, slugOf(pick.task.branch), pick.task.id);
    case "review": case "fix": case "architect": case "unblock": return onLock;
    default: throw new Error(`no lease for ${pick.of}`);
  }
}

/**
 * D-085: local work that origin cannot see. local: [{ branch, ahead (commits
 * not on origin, null when the branch is not on origin), dirty, path }].
 * Your own held work out of sync blocks new work; anything else is a note.
 * unpushed: your own branches with commits origin does not have.
 */
export function localSyncIssues({ local, branches, claimant, mainBehind = 0, tasks = [] }) {
  const blocking = [], notes = [], unpushed = [];
  const owners = new Map();
  for (const t of tasks) {
    const work = workBranchOf(t, branches) ?? t.branch;
    const last = stageMarkers(branches.get(reviewLockOf(t)), t.id).at(-1);
    // Only a fixer or lander pushes to the builder's branch; a reviewer who returned findings never does.
    const pushes = last && (last.verb === "Fix claim" || last.verb === "Land claim" || (last.verb === "Verdict" && last.verdict === "pass"));
    owners.set(work, { holder: holderOf(branches.get(work), t.id), stage: pushes ? last.who : null, names: [holderOf(branches.get(work), t.id), last?.who].filter(Boolean) });
    const arch = architectLockOf(t);
    const archHolder = lastBy(stageMarkers(branches.get(arch), t.id), ["Claim", "Takeover", "Unblock"])?.who ?? null;
    owners.set(arch, { holder: archHolder, stage: null, names: archHolder ? [archHolder] : [] });
  }
  for (const l of local) {
    if (MARKER_ONLY.some(p => l.branch.startsWith(p))) continue;
    const fixMain = /^agent\/queue\/(fix-main-[0-9a-f]{8})$/.exec(l.branch)?.[1];
    const fallback = holderOf(branches.get(l.branch), fixMain);
    const known = owners.get(l.branch) ?? { holder: fallback, stage: null, names: fallback ? [fallback] : [] };
    // A fixer or lander pushes to the builder's branch, so that branch is theirs to keep in sync too.
    const mine = Boolean(claimant) && (known.holder === claimant || known.stage === claimant);
    const label = known.holder ?? known.stage ?? known.names[0] ?? null;
    if (l.ahead === null) {
      notes.push(`${l.branch} is not on origin (worktree ${l.path}): if it is yours, push it now (git -C ${l.path} push -u origin ${l.branch}); work only on your machine is invisible to every other agent`);
      continue;
    }
    const someoneElse = Boolean(label) && !mine;
    if (l.ahead > 0) {
      const count = `${l.ahead} commit${l.ahead === 1 ? "" : "s"}`;
      if (mine) { blocking.push(`${l.branch} has ${count} not on origin: git -C ${l.path} push origin ${l.branch}`); unpushed.push(l.branch); }
      else if (someoneElse) notes.push(`${l.branch} has ${count} only on this machine but is held by ${label}: never push or force-push to it; save them on a side branch (git -C ${l.path} push origin ${l.branch}:${l.branch}-salvage) and tell ${label} or the CEO`);
      else notes.push(`${l.branch} has ${count} not on origin and nobody holds it: git -C ${l.path} push origin ${l.branch}`);
    }
    if (l.dirty) {
      if (mine) blocking.push(`${l.branch} has uncommitted changes in ${l.path}: commit the files your task names (a WIP commit is fine) and push; never commit .env files, screenshots or other files your packet does not name`);
      else notes.push(`${l.branch} has uncommitted changes in ${l.path}${label ? ` (held by ${label})` : ""}`);
    }
    // D-085: a restarted session must reuse its name, or its own half-built work sits idle. Name every
    // same-model holder of the branch or its review stage, since the stage holder is often the one that left.
    const sameModel = claimant && !mine && (l.ahead > 0 || l.dirty) ? known.names.filter(n => n !== claimant && modelOf(n) === modelOf(claimant)) : [];
    for (const name of [...new Set(sameModel)]) {
      notes.push(`${l.branch} is held by "${name}", the same model as you: if that was your earlier session, run again as --claim "${name}" so your own work comes back first`);
    }
  }
  if (mainBehind > 0) notes.push(`your main checkout is ${mainBehind} commits behind origin/main: git pull --ff-only before reading any doc`);
  return { blocking, notes, unpushed };
}

/** D-085: who may report on a task: anyone who holds it or one of its stages, and the CEO. */
export function mayReport({ task, branches, claimant }) {
  if (!claimant) return false;
  if (isArchitect(claimant)) return true;
  const work = workBranchOf(task, branches);
  const names = [
    holderOf(work ? branches.get(work) : null, task.id),
    stageHolderOf(branches.get(reviewLockOf(task)), task.id),
    lastBy(stageMarkers(branches.get(architectLockOf(task)), task.id), ["Claim", "Takeover", "Unblock"])?.who ?? null,
  ];
  return names.includes(claimant);
}

/**
 * D-085: the board the CEO reads — every task in priority order with its
 * state, holder, quiet time and the latest report its team sent.
 * reports: [{ id, status, who, at, note }] from agent/reports/log, newest first.
 */
export function statusBoard({ tasks, branches, openPrs, prCi = new Map(), mergedHeads = new Map(), reports = [], now }) {
  const HOUR = 60 * 60 * 1000;
  const view = buildView({ tasks, branches, openPrs: openPrs ?? new Map(), prCi, mergedHeads: mergedHeads ?? new Map(), reports });
  const latest = latestReports(reports);
  const { workAt, archAt } = clock(branches, now);
  const doneIds = new Set(view.filter(v => v.done).map(v => v.task.id));
  return view.map(v => {
    const { task, pr } = v;
    const archHeld = task.status === "architect" && Boolean(v.arch);
    const activeAt = archHeld ? archAt(v) : v.open ? workAt(v) : null;
    const quiet = activeAt !== null && now - activeAt > IDLE_MS;
    const review = pr && task.tier === 1 ? v.review : null;
    let state;
    if (v.done) state = "done";
    else if (task.status === "owner") state = "owner";
    else if (task.status === "in-review") state = "in-review";
    else if (task.status === "architect") state = archHeld ? (quiet ? "quiet" : "packet") : "architect";
    else if (!v.open) state = task.dependsOn.some(d => !doneIds.has(d)) ? "waiting" : "todo";
    else if (pr) state = { red: "pr-red", green: "pr-green", running: "pr-running", "running-after-red": "pr-running" }[v.ci] ?? "pr-open";
    else state = quiet ? "quiet" : "building";
    // Reports gate only open tasks, so only they colour the board; a Tier 1 pull request is green only once its review passed.
    // The picker lets a Tier 1 pull request's review lock decide over red reports, so the board does too.
    const said = !v.open ? null : review && v.said?.status === "red" ? null : v.said;
    const health = state === "done" ? "done"
      : state === "owner" ? "owner"
      : state === "pr-red" || state === "quiet" || said?.status === "red" || said?.status === "blocked" ? "red"
      : state === "pr-green" ? (!review || review === "passed" || review === "landing" ? "green" : "progress")
      : ["todo", "waiting", "architect"].includes(state) ? "open" : "progress";
    return {
      id: task.id, title: task.title, tier: task.tier, lane: task.lane, role: roleOf(task), state, health,
      holder: archHeld ? holderOf(v.arch, task.id) : v.open ? v.owner : null,
      quietHours: activeAt === null || state === "done" ? null : Math.floor((now - activeAt) / HOUR),
      pr, review, report: state === "done" ? null : latest.get(task.id) ?? null,
      // Who holds the current review stage (reviewer, fixer or lander) or the unblock: a restarted session reads its name here.
      stage: review ? v.stageHolder : v.open && v.unblocker ? v.unblocker : null,
    };
  });
}

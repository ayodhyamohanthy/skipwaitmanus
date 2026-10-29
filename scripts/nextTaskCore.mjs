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
// pushed to for 2 hours, a blocked priority any other session clears), top down; then new
// work, top down. A red or blocked priority holds its own lane and the tasks that depend on it; red `main` holds everything (D-109).
// D-200 (owner, Oct 24): no step waits for one model or session; Claude Code sessions build too.

export const IDLE_MS = 2 * 60 * 60 * 1000;
/** A holder whose claim has been quiet this long re-takes it on the takeover ref instead of a side heartbeat. */
export const RECLAIM_MS = 90 * 60 * 1000;
export const STATUSES = ["todo", "in-review", "done", "architect", "owner"];
const TASK_KEYS = ["id", "title", "row", "packet", "tier", "lane", "branch", "status", "dependsOn", "note", "epic", "owns", "syncedTo"];

/** D-134 / PICKER-owns-scope: a task may declare the files it will touch, so two lanes cannot edit the same file unseen. */
const SWITCH_ONLY_SUFFIX = " (switch only)";

/**
 * PICKER-owns-scope: parse one `owns` entry. An entry is a repository path, a folder
 * prefix ending in "/", a glob using "*" or "**", and may carry " (switch only)" to say
 * the task may only flip a switch there (the scope check bounds how many lines it edits).
 */
export function ownsEntry(raw) {
  const text = String(raw ?? "").trim();
  const switchOnly = text.endsWith(SWITCH_ONLY_SUFFIX);
  const bare = (switchOnly ? text.slice(0, -SWITCH_ONLY_SUFFIX.length) : text).trim();
  return { pattern: bare.replace(/^\.\//, ""), switchOnly };
}

const GLOB_SPECIALS = "\\^$.|?+()[]{}";

/** Translate one pattern to a regular expression: "**" spans folders, "*" stays inside one. */
function ownsRegExp(pattern) {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") { out += ".*"; i += 1; if (pattern[i + 1] === "/") i += 1; }
      else out += "[^/]*";
    } else if (GLOB_SPECIALS.includes(char)) out += `\\${char}`;
    else out += char;
  }
  return new RegExp(`${out}$`);
}

/** Does one `owns` entry cover this repository path? */
export function ownsMatches(entry, path) {
  const { pattern } = ownsEntry(entry);
  const target = String(path ?? "").replace(/^\.\//, "");
  if (!pattern) return false;
  if (pattern.endsWith("/")) return target === pattern.slice(0, -1) || target.startsWith(pattern);
  if (pattern.includes("*")) return ownsRegExp(pattern).test(target);
  return target === pattern;
}

/** The part of a pattern before its first wildcard — what it can possibly touch. */
export function ownsPrefix(entry) {
  const { pattern } = ownsEntry(entry);
  const cut = pattern.indexOf("*");
  return (cut === -1 ? pattern : pattern.slice(0, cut)).replace(/\/$/, "");
}

const under = (child, parent) => !parent || child === parent || child.startsWith(`${parent}/`);

/**
 * Do two `owns` lists overlap? Compared by the literal part of each pattern, so exact
 * paths, folder prefixes and globs that share a folder are caught. Two globs with
 * unrelated prefixes are treated as disjoint: the runtime guards (filesBusy and
 * scripts/scope-check.mjs) are the backstop, this is the cheap static check.
 */
export function ownsOverlap(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  // Two switch-only claims on one file are a few wiring lines each (scope-check caps every
  // switch-only change at SWITCH_ONLY_LINE_LIMIT lines), which git merges, so neither waits (D-200).
  const bothSwitches = (x, y) => ownsEntry(x).switchOnly && ownsEntry(y).switchOnly;
  return left.some(x => right.some(y => !bothSwitches(x, y) && (under(ownsPrefix(x), ownsPrefix(y)) || under(ownsPrefix(y), ownsPrefix(x)))));
}

const DOC_KEYS = ["version", "repo", "decidedBy", "updated", "rules", "tasks"];
const MARKER = /^(Review claim|Fix claim|Land claim|Claim|Takeover|Unblock|Verdict|Fixed|Heartbeat|Report|Landed) (\S+): (.+)$/;
/** What an agent reports to the CEO about its task (D-085). */
export const REPORT_STATUSES = ["green", "red", "blocked", "review", "landed"];
/** The executive who owns a lane; the open models play these roles (D-085). */
const ROLE_BY_LANE = { design: "CDO", "d048-": "CDO" };
const RED = new Set(["failure", "timed_out", "startup_failure", "action_required"]);
export const LAND_SLOT = "agent/queue/landing";
export const LAND_IDLE_MS = 30 * 60 * 1000;
const RESERVED = ["agent/review/", "agent/heartbeat/", "agent/architect/", "agent/reports/", LAND_SLOT];
/** Marker-only refs nobody commits work to; local copies of them are never "your work". */
const MARKER_ONLY = ["agent/review/", "agent/heartbeat/", "agent/reports/", LAND_SLOT];

export const slugOf = branch => branch.split("/").pop();
export const reviewLockOf = task => `agent/review/${slugOf(task.branch)}`;
export const architectLockOf = task => `agent/architect/${slugOf(task.branch)}`;
/** The side heartbeat of a work branch or fix-main lock; marker-only locks take heartbeats directly. */
export const heartbeatOf = slug => `agent/heartbeat/${slug}`;
export const fixMainLockOf = sha => `agent/queue/fix-main-${sha.slice(0, 8)}`;
export const fixMainIdOf = sha => `fix-main-${sha.slice(0, 8)}`;
/** Claude Code sessions take the CEO review when nothing else waits (D-085), known by the "Claude" name prefix; D-200: no other step is theirs alone. */
export const isArchitect = who => /^claude/i.test((who ?? "").trim());
export const modelOf = who => (who ?? "").split(" · ")[0];

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

export const roleOf = task => Object.entries(ROLE_BY_LANE).find(([prefix]) => task.lane?.startsWith(prefix))?.[1] ?? "CTO";

export function landingSlot(branches, now = 0) {
  const branch = branches?.get?.(LAND_SLOT);
  if (!branch) return { holder: null, task: null, quiet: true, at: 0 };
  const last = branch.markers?.at?.(-1);
  if (!last || last.verb === "Landed") return { holder: null, task: null, quiet: true, at: branch.tipMs ?? 0 };
  const at = branch.tipMs ?? 0;
  const quiet = now > 0 && at > 0 ? (now - at) >= LAND_IDLE_MS : false;
  return { holder: last.who, task: last.id, quiet, at, verb: last.verb };
}

export function releaseLandingSlotError({ branches, task, claimant, now = 0 }) {
  const slot = landingSlot(branches, now);
  if (!slot.holder) return `landing slot ${LAND_SLOT} is not held by anyone`;
  if (slot.holder !== claimant) return `only the lander holding ${LAND_SLOT} releases it (held by ${slot.holder})`;
  if (task && slot.task !== task.id) return `landing slot ${LAND_SLOT} is held for ${slot.task}, not ${task.id}`;
  return null;
}

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

// D-202: the decision register is data too. A row is `| D-nnn | date | decision | ...`;
// its title is the first bold span (or the cell, cut to 160), and `Affects tasks:` names
// the tasks a decision changes. The last trailer wins: a decision's own prose may quote
// the rule. Parenthetical glosses and trailing sentences never become ids.
const REGISTER_ROW = /^\s*\|\s*D-/;
const REGISTER_DATE = /^\d{4}-\d{2}(?:-\d{2})?$/;
const AFFECTS_TRAILER = "Affects tasks:";
const TITLE_MAX = 160;

/** Keep the text outside balanced parentheses; a gloss carries names, never task ids. */
function withoutGlosses(text) {
  let depth = 0, out = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += char;
  }
  return out;
}

function stripInlineMarkdown(text) {
  return String(text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The ids after the last `Affects tasks:` trailer: null when there is none, [] for "none". */
function parseAffects(row) {
  const at = row.lastIndexOf(AFFECTS_TRAILER);
  if (at < 0) return null;
  let text = withoutGlosses(row.slice(at + AFFECTS_TRAILER.length)).replace(/`/g, "");
  if (/^\s*none\b/i.test(text)) return [];
  // One plain sentence is the trailer; a period followed by a space (or the end) stops it,
  // while a dot inside an id (D-100.csp-report) does not.
  const stop = text.search(/\.(?=\s|$)/);
  if (stop >= 0) text = text.slice(0, stop);
  const ids = [];
  for (const segment of text.split(",")) {
    const token = (segment.trim().split(/\s+/)[0] ?? "").replace(/^[([*\]]+/, "").replace(/[.,;:`)\]]+$/, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)) continue;
    // An id carries an uppercase letter or a digit; a dotted file name never is one.
    if (!/[A-Z0-9]/.test(token) || /\.(md|markdown|json|ya?ml|ts|tsx|mjs|js|css|sh)$/i.test(token)) continue;
    ids.push(token);
  }
  return ids;
}

/**
 * D-202: read `docs/DECISIONS.md` into [{ id, number, date, title, affects }] in register order.
 * A malformed row or a duplicate id throws with the line number: the picker must stop,
 * never guess which entry is real.
 */
export function parseDecisionRegister(markdown) {
  const entries = [], seen = new Set();
  String(markdown ?? "").split(/\r?\n/).forEach((row, i) => {
    if (!REGISTER_ROW.test(row)) return;
    const line = i + 1;
    const cells = row.split(/(?<!\\)\|/).slice(1).map(c => c.trim());
    // D-024 is a real row that lost its trailing pipe and some cells; read what is there.
    if (cells.at(-1) === "") cells.pop();
    const id = cells[0] ?? "";
    if (!/^D-\d{3}$/.test(id)) throw new Error(`DECISIONS.md:${line}: row id "${id}" is not D-nnn`);
    if (seen.has(id)) throw new Error(`DECISIONS.md:${line}: duplicate ${id}`);
    const date = cells[1] ?? "";
    if (!REGISTER_DATE.test(date)) throw new Error(`DECISIONS.md:${line}: date "${date}" is not YYYY-MM or YYYY-MM-DD`);
    const cell = cells[2] ?? "";
    const bold = /\*\*([\s\S]+?)\*\*/.exec(cell)?.[1];
    const title = stripInlineMarkdown(bold ?? cell).slice(0, TITLE_MAX);
    if (!title) throw new Error(`DECISIONS.md:${line}: ${id} has no title`);
    seen.add(id);
    entries.push({ id, number: Number(id.slice(2)), date, title, affects: parseAffects(row) });
  });
  if (!entries.length) throw new Error("DECISIONS.md: no decision rows found");
  return entries;
}

/** Every problem with the task list, or [] when it is valid. register: parseDecisionRegister output. */
export function validateAssignments(doc, packetExists, register = null) {
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
    // D-202: every task that is not done names the newest decision its packet was checked against;
    // done rows keep the stamp they landed under (and may omit it). An unknown entry is a defect.
    if (t.syncedTo !== undefined && (typeof t.syncedTo !== "string" || !/^D-\d{3}$/.test(t.syncedTo))) errors.push(`${at}: syncedTo must be D-nnn`);
    else if (register) {
      if (t.syncedTo === undefined) {
        if (t.status !== "done") errors.push(`${at}: syncedTo is required (the newest decision its packet was checked against)`);
      } else if (!register.some(e => e.id === t.syncedTo)) errors.push(`${at}: syncedTo ${t.syncedTo} is not an entry in docs/DECISIONS.md`);
    }
    if (!/^agent\/[a-z0-9-]+\/[a-z0-9.-]+$/.test(t.branch ?? "")) errors.push(`${at}: branch must be agent/<owner>/<slug>`);
    else {
      const prefix = RESERVED.find(p => t.branch.startsWith(p));
      if (prefix) errors.push(`${at}: ${prefix} is reserved for review locks, heartbeats, reports, landing slot and architect claims`);
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
    if (t.epic !== undefined && (typeof t.epic !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(t.epic))) errors.push(`${at}: epic must be a non-empty identifier (letters, digits, dots or dashes)`);
    if (t.owns !== undefined) {
      if (!Array.isArray(t.owns) || t.owns.length === 0) errors.push(`${at}: owns must be a non-empty array of paths`);
      else if (t.owns.some(o => typeof o !== "string" || !o.trim())) errors.push(`${at}: owns must hold path strings`);
    }
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
  // PICKER-owns-scope: two tasks that are not done may not own the same files unless one
  // waits for the other (a dependent runs after its dependency has landed, so it may edit
  // the same file). Checked on the literal part of each pattern (ownsOverlap).
  const waitsFor = (from, target, seenIds = new Set()) => (from.dependsOn ?? []).some(d => d === target || (!seenIds.has(d) && seenIds.add(d) && byId.has(d) && waitsFor(byId.get(d), target, seenIds)));
  const owning = doc.tasks.filter(t => t.status !== "done" && Array.isArray(t.owns) && t.owns.length);
  for (let i = 0; i < owning.length; i += 1) for (let j = i + 1; j < owning.length; j += 1) {
    const a = owning[i], b = owning[j];
    if (!ownsOverlap(a.owns, b.owns)) continue;
    if (waitsFor(a, b.id) || waitsFor(b, a.id)) continue;
    errors.push(`tasks ${a.id} and ${b.id} own overlapping paths and neither waits for the other`);
  }
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

/** One task's reports, newest first as they arrive (log order, never sorted by an agent's clock). */
const reportsByTask = reports => {
  const byTask = new Map();
  for (const r of reports) {
    if (!byTask.has(r.id)) byTask.set(r.id, []);
    byTask.get(r.id).push(r);
  }
  return byTask;
};

/**
 * The report that stands for one task: the newest, except that a block stands until a newer report clears
 * it (D-200). A green or landed report clears it from anyone; any other report clears it only from a session
 * that neither raised a block still open on the task nor holds the task, so nobody rules on their own
 * question or their own work. A standing block carries `blockers` (every session whose block is still open)
 * and `newer`: the reports after it that did not clear it, oldest first, for the board and the unblock step (D-162).
 */
const standingReport = (reports, holder) => {
  let latest = null, block = null, blockers = [], newer = [];
  for (let i = reports.length - 1; i >= 0; i--) {
    const r = reports[i];
    if (r.status === "blocked") {
      block = r;
      newer = [];
      if (!blockers.includes(r.who)) blockers.push(r.who);
      continue;
    }
    if (block && r.status !== "green" && r.status !== "landed" && (blockers.includes(r.who) || r.who === holder)) {
      newer.push(r);
      continue;
    }
    block = null;
    blockers = [];
    newer = [];
    latest = r;
  }
  return block ? { ...block, blockers, newer } : latest && { ...latest, newer: [] };
};

/** One row per task with everything every decision reads. */
function buildView({ tasks, branches, openPrs, prCi, mergedHeads, reports }) {
  const byTask = reportsByTask(reports);
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
    const owner = holderOf(info, id);
    let said = standingReport(byTask.get(id) ?? [], owner);
    // A red report older than a green CI run on the pull request no longer holds anything.
    if (said?.status === "red" && pr && ci.state === "green" && ci.at && ci.at > said.at) said = null;
    const lockMarkers = stageMarkers(lock, id);
    const archMarkers = stageMarkers(arch, id);
    return {
      task, at, work, info, lockName, lock, archName, arch: arch && !arch.merged ? arch : null,
      slug: slugOf(task.branch), owner, pr, ci: ci.state, said,
      builders: everyone(stageMarkers(info, id), ["Claim", "Takeover"]),
      reviewers: everyone(lockMarkers, ["Review claim"]), fixers: everyone(lockMarkers, ["Fix claim", "Fixed"]),
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

/**
 * D-202: the newest register entry that names this task and sits after its `syncedTo`, or null.
 * Such a task is out of sync: it is handed as a re-sync, never as a build, takeover, review,
 * landing or packet, and it holds no lane or file (the work waits, the queue goes on).
 */
export function outOfSyncOf(v, register) {
  if (!register?.length || !v?.task?.syncedTo) return null;
  const at = register.findIndex(e => e.id === v.task.syncedTo);
  if (at < 0) return null;
  for (let i = register.length - 1; i > at; i -= 1) {
    if (register[i].affects?.includes(v.task.id)) return register[i].id;
  }
  return null;
}

/** The ids of every entry after this task's stamp (all of them when the stamp is unknown). */
export function decisionsSince(register, syncedTo) {
  const at = register.findIndex(e => e.id === syncedTo);
  return (at < 0 ? register : register.slice(at + 1)).map(e => e.id);
}

/** D-085: the one thing the next agent should do (D-083). */
export function pickNextTask({ tasks, mainCi, branches, openPrs, prCi = new Map(), mergedHeads = new Map(), reports = [], now, claimant, avoid = new Set(), register = null }) {
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
  // D-134: dependsOn holds every kind of work on a task, not only a new build.
  const unmetOf = v => v.task.dependsOn.filter(d => !byId.get(d)?.done);
  // D-202: an out-of-sync task is handed as a re-sync and holds no lane or file.
  const staleOf = v => (v.done ? null : outOfSyncOf(v, register));
  // D-134: a lane-mate that depends on v (directly or through others) cannot land before v, so it never makes v's lane busy;
  // neither does a lane-mate that waits for a dependency: nobody can work on it, so holding its lane could deadlock two lanes.
  const dependsOnTask = (o, id, seen = new Set()) => o.task.dependsOn.some(d => d === id || (!seen.has(d) && seen.add(d) && byId.has(d) && dependsOnTask(byId.get(d), id, seen)));
  const { workAt, lockAt, archAt, quiet } = clock(branches, now);
  // PICKER-lane-busy: waiting PRs release a lane only with explicit disjoint ownership.
  // Unknown CI or missing ownership never proves that concurrent work is safe.
  const disjoint = (a, b) => Boolean(a.task.owns?.length && b.task.owns?.length) && !ownsOverlap(a.task.owns, b.task.owns);
  const building = o => !o.pr || !["green", "red", "running", "running-after-red"].includes(o.ci)
    || (o.ci !== "green" && !quiet(workAt(o)));
  const laneBusy = v => view.some(o => o !== v && o.task.lane === v.task.lane && (o.task.status === "in-review" || o.open) && !dependsOnTask(o, v.task.id) && !unmetOf(o).length && !staleOf(o) && (building(o) || !disjoint(o, v)));
  // PICKER-owns-scope: lanes are labels, so two lanes could edit one file unseen. A build also
  // waits while an open task — being built or waiting for review — owns an overlapping path,
  // unless it waits for that task (a dependent may edit the same file after its dependency lands).
  const filesBusy = v => Boolean(v.task.owns?.length) && view.some(o => o !== v && Boolean(o.task.owns?.length) && (o.task.status === "in-review" || o.open) && !dependsOnTask(o, v.task.id) && !unmetOf(o).length && !staleOf(o) && ownsOverlap(v.task.owns, o.task.owns));
  const ceo = isArchitect(claimant);

  const skipped = [];
  const skip = (v, reason) => { skipped.push({ id: v.task.id, reason }); return null; };
  // D-085, narrowed by D-109: a priority that is red (CI, or its team reported red or blocked) holds its own lane
  // and every task that depends on it, never unrelated lanes; red main (above) still holds everything.
  const gate = (reason, extra = {}) => ({ kind: "gate", reason, ...extra });
  const did = (v, roles) => Boolean(claimant) && roles.some(r => v[r].some(who => modelOf(who) === modelOf(claimant)));
  const green = (v, why) => ({ kind: "green", task: v.task, work: v.work, pr: v.pr, from: v.owner, since: workAt(v), why });
  // D-202: updating the packet is a docs job on the architect lock; any capable session may take it (D-200).
  const resync = v => ({ kind: "resync", task: v.task, lock: v.archName, lockExists: Boolean(v.arch), from: v.arch ? holderOf(v.arch, v.task.id) : null, decisions: decisionsSince(register, v.task.syncedTo) });
  const reportWhy = said => `${said.who} reported it ${said.status}${said.note ? `: ${said.note}` : ""}`;
  const slot = landingSlot(branches, now);
  const slotBusyFor = cl => Boolean(slot.holder && slot.holder !== cl && !slot.quiet);
  const waitLanding = () => ({ kind: "wait", landing: true, holder: slot.holder, task: slot.task, reason: `landing slot ${LAND_SLOT} is held by ${slot.holder} (landing ${slot.task})` });

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
      // A branch built outside the picker has no claim naming its builder: its review waits until nobody has pushed for 2 hours.
      // After a picker fix round whose Fixed marker came after the last push, those pushes were the fixer's: the review is not held back.
      const fixerPushedLast = v.fixers.length > 0 && lockAt(v) >= workAt(v);
      if (!v.builders.length && !fixerPushedLast && !quiet(workAt(v))) return skip(v, `built outside the picker and still being pushed; its review waits until ${v.work} is quiet for 2 hours`);
      return { kind: "review", task: v.task, work: v.work, pr: v.pr, lock: v.lockName, lockExists: Boolean(v.lock), builder: v.owner };
    }
    if (state === "needs-fix" || (state === "fixing" && lockQuiet)) {
      if (did(v, ["reviewers"])) return skip(v, "needs its review findings fixed, and you reviewed it");
      return { kind: "fix", task: v.task, work: v.work, pr: v.pr, lock: v.lockName };
    }
    if ((state === "passed" || state === "landing") && lockQuiet) {
      if (did(v, ["builders", "fixers"])) return skip(v, "its review passed, and you built or fixed it");
      if (slotBusyFor(claimant)) return waitLanding();
      return { kind: "land", task: v.task, work: v.work, pr: v.pr, lock: v.lockName, tier1: true, from: v.lander ?? v.reviewer };
    }
    return skip(v, { passed: `review passed; ${v.reviewer} lands it`, landing: `${v.lander} is landing it`, fixing: `findings being fixed by ${v.fixer}` }[state] ?? `under review by ${v.reviewer}`);
  };

  const actionFor = v => {
    if (v.done) return skip(v, "done");
    // D-134: while a dependency is not done, nobody is handed any work on the task: no build, takeover, make-green,
    // review, fix, packet or landing. It is reworked or continued once the dependency is live.
    if (unmetOf(v).length) return skip(v, `waits for ${unmetOf(v).join(", ")}`);
    if (v.open) {
      const said = v.said;
      if (said?.status === "blocked") {
        // D-200: a session that raised the block, or holds the task, never clears it; any other session may.
        const blockers = said.blockers ?? [said.who];
        if (claimant && (blockers.includes(claimant) || v.owner === claimant)) return gate(`${v.task.id} is blocked (${reportWhy(said)}); a session that neither raised the block nor holds the task, or the owner, clears it`, { blocked: true });
        // An unblocker that reported the block itself has handed it on: its lock no longer holds anyone off.
        if (v.unblocker && v.unblocker !== claimant && !blockers.includes(v.unblocker) && !quiet(archAt(v))) return gate(`${v.unblocker} is unblocking ${v.task.id}`);
        return { kind: "unblock", task: v.task, report: said, lock: v.archName, lockExists: Boolean(v.arch), from: v.unblocker };
      }
      // D-202: a decision newer than the packet's stamp names this task: re-sync the packet first.
      const stale = staleOf(v);
      if (stale) return resync(v);
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
        if (slotBusyFor(claimant)) return waitLanding();
        return { kind: "land", task: v.task, work: v.work, pr: v.pr, tier1: false, from: v.owner };
      }
      if (!idle) return skip(v, `in progress by ${v.owner ?? "another agent"} on ${v.work}`);
      return { kind: "takeover", task: v.task, work: v.work, from: v.owner, since: workAt(v) };
    }
    // D-202: no packet, review, fix, landing or build until the packet is re-synced; a task
    // that waits for the owner stays with the owner.
    const stale = staleOf(v);
    if (stale && v.task.status !== "owner") return resync(v);
    if (v.task.status === "architect") {
      const writer = holderOf(v.arch, v.task.id);
      if (writer && !quiet(archAt(v))) return skip(v, `${writer} is writing its packet`);
      return { kind: "architect", task: v.task, lock: v.archName, lockExists: Boolean(v.arch), from: writer };
    }
    if (v.task.status !== "todo") return skip(v, { "in-review": "being landed by its reviewer", owner: "waits for the owner" }[v.task.status]);
    const unmet = unmetOf(v);
    if (unmet.length) return skip(v, `waits for ${unmet.join(", ")}`);
    if (laneBusy(v)) return skip(v, `lane ${v.task.lane} is busy`);
    if (filesBusy(v)) return skip(v, "an open task owns the same files");
    return { kind: "build", task: v.task, ciRunning: mainCi.state === "running" };
  };

  let mine = claimant ? ownWork(view, claimant) : null;
  // D-202: a holder continuing an out-of-sync task is handed the re-sync first, not its build
  // (a blocked wait still comes first: the block is cleared before the packet moves).
  if (mine && mine.kind !== "wait" && mine.task) {
    const own = byId.get(mine.task.id);
    if (own && staleOf(own)) mine = { ...resync(own), at: mine.at };
  }
  // D-134: whether a pick's plan row is shared by several tasks (their status then goes in their packet's Status section).
  const sharedRows = new Set(view.map(v => v.task.row).filter((r, k, all) => all.indexOf(r) !== k));
  const withHold = pick => (pick?.task && sharedRows.has(pick.task.row) ? { ...pick, task: { ...pick.task, sharedRow: true } } : pick);

  // Pass 1: pending work top down, stopping at your own work; pass 2: new work. A red or
  // blocked priority holds only its lane and its dependents (D-109). D-200: Claude Code builds too.
  const actions = [];
  let gateAt = -1, gateAction = null;
  const heldLanes = new Map(), heldIds = new Map();
  // A red or blocked holder never holds a task it depends on itself: that task is what it waits for (D-134).
  // Packets do not change code: architect tasks bypass lane holds, not explicit dependencies in actionFor.
  const heldBy = v => { if (v.task.status === "architect") return undefined; const lh = heldLanes.get(v.task.lane); return (lh && !dependsOnTask(byId.get(lh), v.task.id) ? lh : undefined) ?? v.task.dependsOn.map(d => heldIds.get(d)).find(Boolean); };
  for (let i = 0; i < view.length; i++) {
    if (mine && i >= mine.at) break;
    const holder = heldBy(view[i]);
    if (holder && !view[i].done) { heldIds.set(view[i].task.id, holder); skip(view[i], `waits for red or blocked ${holder} (same lane or depends on it)`); continue; }
    // --avoid: a session that may not take a task (its own instruction or a missing tool) is handed something else;
    // the task is never reported blocked for that reason, and a red or blocked one still holds its lane (gate).
    let action = actionFor(view[i]);
    if (action && action.kind !== "gate" && avoid.has(view[i].task.id)) action = skip(view[i], "you asked to avoid it (--avoid)");
    actions[i] = action;
    if (!action) continue;
    if (action.kind === "gate") {
      if (gateAt < 0) { gateAt = i; gateAction = action; }
      heldLanes.set(view[i].task.lane, view[i].task.id); heldIds.set(view[i].task.id, view[i].task.id);
      skip(view[i], action.reason);
      continue;
    }
    if (action.kind === "wait") return action;
    if (!PENDING_KINDS.has(action.kind)) continue;
    // D-085: pending work ranked above your own comes first; your own claim waits, pushed.
    return withHold(mine ? { ...action, holds: { id: mine.task.id, branch: mine.work ?? mine.lock } } : action);
  }
  // Your own work: a red priority above it whose owner is on it does not stop you (your hands cannot help it).
  if (mine) {
    if (mine.of === "land" && slotBusyFor(claimant)) return waitLanding();
    const { at, ...pick } = mine;
    return withHold(pick);
  }
  for (let i = 0; i < view.length; i++) {
    const action = actions[i];
    if (!action || action.kind === "gate" || PENDING_KINDS.has(action.kind)) continue;
    return withHold(action);
  }
  // A Claude Code session that raised a block waits like anyone else; it never gets the CEO review telling it to clear its own block.
  if (gateAt >= 0 && (!ceo || gateAction.blocked)) return { kind: "wait", gate: view[gateAt].task.id, blocked: Boolean(gateAction.blocked), reason: gateAction.reason };
  return ceo ? { kind: "ceo", skipped } : { kind: "none", skipped };
}

/** D-085: one task's stage that this agent holds, if any: a continue, a blocked wait, or null. */
function ownStage(v, claimant) {
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
    // A blocked task waits for another session or the owner; its holder keeps going on anything else it holds (D-085 (3), D-200).
    if (v.said?.status === "blocked") return { kind: "wait", gate: v.task.id, blocked: true, own: true, at: v.at, task: v.task, work: v.work, reason: `your task ${v.task.id} is blocked (${v.said.who} reported it blocked${v.said.note ? `: ${v.said.note}` : ""}); a session that neither raised the block nor holds the task, or the owner, clears it (D-200)` };
    // The builder side holds a Tier 1 pull request only while its CI is red before any review passed or any fix stage owns it.
    if (v.pr && v.task.tier === 1 && !(v.ci === "red" && ["needs-review", "in-review"].includes(v.review))) return null;
    return { kind: "continue", of: v.pr ? (v.ci === "red" ? "green" : "land") : "build", task: v.task, work: v.work, pr: v.pr, tier1: v.task.tier === 1, at: v.at };
  }
  if (v.task.status === "architect" && v.arch && holderOf(v.arch, v.task.id) === claimant) return { kind: "continue", of: "architect", task: v.task, lock: v.archName, at: v.at };
  if (v.open && v.said?.status === "blocked" && v.unblocker === claimant && !(v.said.blockers ?? [v.said.who]).includes(claimant)) return { kind: "continue", of: "unblock", task: v.task, report: v.said, lock: v.archName, at: v.at };
  return null;
}

/**
 * D-085: everything this agent holds, in queue order, and its first blocked task. A Tier 1 builder waiting for
 * review holds nothing; a task whose dependency is not done is nobody's work yet (D-134).
 */
function ownWorkList(view, claimant, { includeWaiting = false } = {}) {
  const doneIds = new Set(view.filter(x => x.done).map(x => x.task.id));
  const found = [];
  let blockedOwn = null;
  for (const v of view) {
    if (!includeWaiting && v.task.dependsOn.some(d => !doneIds.has(d))) continue;
    const hit = ownStage(v, claimant);
    if (hit?.kind === "wait") blockedOwn ??= hit;
    else if (hit) found.push(hit);
  }
  return { found, blockedOwn };
}

/** D-085: what this agent already holds, first in queue order (a blocked task only when nothing else). */
function ownWork(view, claimant) {
  const { found, blockedOwn } = ownWorkList(view, claimant);
  return found[0] ?? blockedOwn;
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
 * D-134: every claim this agent holds (the fix-main lock first), so a heartbeat keeps all of them alive, not only
 * the first; that includes a claim on a task that waits for a dependency, which is nobody's work yet but stays its holder's.
 */
export function heldAllBy({ tasks, branches, openPrs, prCi = new Map(), mergedHeads = new Map(), reports = [], claimant, mainSha = null, now = 0 }) {
  const out = [];
  if (mainSha) {
    const current = fixMainLockOf(mainSha);
    const mine = fixMainLocks(branches, now).find(l => l.holder === claimant && (!l.quiet || l.lock === current));
    if (mine) out.push({ kind: "continue", of: "fix-main", sha: mine.sha8, lock: mine.lock });
  }
  const view = buildView({ tasks, branches, openPrs: openPrs ?? new Map(), prCi, mergedHeads: mergedHeads ?? new Map(), reports });
  for (const { at, ...pick } of ownWorkList(view, claimant, { includeWaiting: true }).found) out.push(pick);
  const slot = landingSlot(branches, now);
  if (slot.holder === claimant && !slot.quiet) {
    out.push({ kind: "continue", of: "landing-slot", task: { id: slot.task }, lock: LAND_SLOT });
  }
  return out;
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
    case "landing-slot": return { ref: LAND_SLOT, verb: "Heartbeat", id: pick.task?.id, reclaim: false, retry: false };
    case "review": case "fix": case "architect": case "resync": case "unblock": return onLock;
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

/** D-085: who may report on a task: anyone who holds it or one of its stages, and a Claude Code session. */
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
export function statusBoard({ tasks, branches, openPrs, prCi = new Map(), prBehind = new Map(), mergedHeads = new Map(), reports = [], now, register = null }) {
  const HOUR = 60 * 60 * 1000;
  const view = buildView({ tasks, branches, openPrs: openPrs ?? new Map(), prCi, mergedHeads: mergedHeads ?? new Map(), reports });
  const byTask = reportsByTask(reports);
  const { workAt, archAt } = clock(branches, now);
  const doneIds = new Set(view.filter(v => v.done).map(v => v.task.id));
  return view.map(v => {
    const { task, pr } = v;
    const archHeld = task.status === "architect" && Boolean(v.arch);
    const activeAt = archHeld ? archAt(v) : v.open ? workAt(v) : null;
    const quiet = activeAt !== null && now - activeAt > IDLE_MS;
    const review = pr && task.tier === 1 ? v.review : null;
    // D-202: an out-of-sync task shows the decision that holds it, not its old state.
    const stale = outOfSyncOf(v, register);
    let state;
    if (v.done) state = "done";
    else if (stale) state = `re-sync (${stale})`;
    else if (task.status === "owner") state = "owner";
    else if (task.status === "in-review") state = "in-review";
    else if (task.dependsOn.some(d => !doneIds.has(d))) state = "waiting";
    else if (task.status === "architect") state = archHeld ? (quiet ? "quiet" : "packet") : "architect";
    else if (!v.open) state = task.dependsOn.some(d => !doneIds.has(d)) ? "waiting" : "todo";
    else if (pr) state = { red: "pr-red", green: "pr-green", running: "pr-running", "running-after-red": "pr-running" }[v.ci] ?? "pr-open";
    else state = quiet ? "quiet" : "building";
    // Reports gate only open tasks, so only they colour the board; a Tier 1 pull request is green only once its review passed.
    // The picker lets a Tier 1 pull request's review lock decide over red reports, so the board does too.
    const said = !v.open ? null : review && v.said?.status === "red" ? null : v.said;
    // A built task (or a held packet) that waits for a dependency keeps its colour: red when its CI or team says so, else in progress.
    const waitingBuilt = state === "waiting" && (v.open || archHeld);
    const health = state === "done" ? "done"
      : state === "owner" ? "owner"
      : waitingBuilt ? ((pr && v.ci === "red") || said?.status === "red" || said?.status === "blocked" ? "red" : "progress")
      : state === "pr-red" || state === "quiet" || said?.status === "red" || said?.status === "blocked" ? "red"
      : state === "pr-green" ? (!review || review === "passed" || review === "landing" ? "green" : "progress")
      : ["todo", "waiting", "architect"].includes(state) ? "open" : "progress";
    const behind = prBehind.get(v.work);
    return {
      id: task.id, title: task.title, tier: task.tier, lane: task.lane, role: roleOf(task), state, health,
      ...(task.epic ? { epic: task.epic } : {}),
      ...(pr && state !== "done" ? { behindMain: Number.isSafeInteger(behind) && behind >= 0 ? behind : null } : {}),
      holder: archHeld ? holderOf(v.arch, task.id) : v.open ? v.owner : null,
      quietHours: activeAt === null || state === "done" ? null : Math.floor((now - activeAt) / HOUR),
      pr, review, report: state === "done" ? null : standingReport(byTask.get(task.id) ?? [], v.owner),
      // Who holds the current review stage (reviewer, fixer or lander) or the unblock: a restarted session reads its name here.
      stage: review ? v.stageHolder : v.open && v.unblocker ? v.unblocker : null,
    };
  });
}

/** Read-only goal roll-ups; completion means the board says done, never merely green CI. */
export function epicSummaries(rows) {
  const epics = new Map();
  for (const row of rows) {
    if (!row.epic) continue;
    if (!epics.has(row.epic)) epics.set(row.epic, { epic: row.epic, total: 0, done: 0, prs: 0, red: 0, released: [] });
    const summary = epics.get(row.epic);
    summary.total++;
    if (row.state === "done") { summary.done++; summary.released.push(row.id); }
    else if (row.pr) summary.prs++;
    if (row.health === "red") summary.red++;
  }
  return [...epics.values()];
}

/** D-311. Public execution provenance, not a model authenticator.
 * Trust comes from separate review before records reach origin/main. Digests
 * bind observed bytes; neither a label, digest nor candidate copy creates trust.
 * I/O is injected so both real loaders and local fixture tests use one resolver.
 */
import { createHash } from "node:crypto";
export const PROVENANCE_PATH = "docs/model-provenance.json";
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const text = x => typeof x === "string" && x.length > 0 && x.length <= 16 * 1024 * 1024 && !/[\x00-\x08\x0b-\x1f]/.test(x);
export const digest = value => createHash("sha256").update(value).digest("hex");
const bad = reason => ({ ok: false, reason });
export function markerReferences(body = "") {
  const lines = String(body).split("\n");
  const refs = key => lines.filter(l => l === key || l.startsWith(key + " "));
  const routes = refs("provenance"), executions = refs("execution");
  const route = routes[0]?.slice(11), execution = executions[0]?.slice(10);
  return { route: route ?? null, execution: execution ?? null, external: routes.length > 0 || executions.length > 0,
    invalid: routes.length > 1 || executions.length > 1 || (routes.length > 0 && !ID.test(route ?? "")) || (executions.length > 0 && (!ID.test(execution ?? "") || !route)) };
}
export const routeReference = body => markerReferences(body).route;
/** Shared marker transport. The SHA is retained; file-changing commits cannot be markers. */
export function parseProvenanceLog(raw) {
  return String(raw ?? "").split("\x1e").filter(Boolean).map(record => {
    const [header, rest = ""] = record.split("\x1f");
    const [body = "", files = ""] = rest.split("\x1d");
    const at = header.indexOf("\x1c");
    return { sha: at >= 0 ? header.slice(0, at).trim() : null, subject: (at >= 0 ? header.slice(at + 1) : header).trim(), body: body.trim(), files: files.split("\n").map(x => x.trim()).filter(Boolean) };
  });
}
export const PROVENANCE_LOG_FORMAT = "%x1e%H%x1c%s%x1f%b%x1d";
export function registryOf(raw) {
  try {
    const r = JSON.parse(raw);
    if (!r || r.version !== 1 || !Array.isArray(r.routes) || !Array.isArray(r.executions)) return bad("invalid provenance registry");
    for (const entries of [r.routes, r.executions]) {
      const ids = entries.map(e => e?.id);
      if (ids.some(id => !ID.test(id ?? "")) || new Set(ids).size !== ids.length) return bad("ambiguous provenance IDs");
    }
    return { ok: true, registry: r };
  } catch { return bad("unreadable provenance registry"); }
}
const one = (list, id) => { const xs = list?.filter(x => x?.id === id) ?? []; return xs.length === 1 ? xs[0] : null; };
export function routeIdentity(registry, id, operator, taskId, role) {
  const r = one(registry?.routes, id);
  if (!r || !Array.isArray(r.roles) || !r.roles.length || r.roles.some(role => !["build", "fix", "review", "land"].includes(role)) || r.revoked !== false || r.operator !== operator || r.taskId !== taskId || !r.roles?.includes(role)) return bad("no qualified route for this operator/task/role");
  if (![r.modelId, r.providerUrl, r.selectedModel, r.observation, r.qualificationReview].every(text)) return bad("route lacks observed provider/model evidence and separate qualification review");
  try { if (new URL(r.providerUrl).protocol !== "https:" || new URL(r.qualificationReview).protocol !== "https:") return bad("unsupported provenance URL"); } catch { return bad("unsupported provenance URL"); }
  if (!HASH.test(r.observationSha256 ?? "") || digest(r.observation) !== r.observationSha256) return bad("route observation bytes changed");
  // modelId is the reviewed canonical identity, not a free caller-chosen alias.
  return { ok: true, model: r.modelId, route: r };
}
const roles = { Claim: "build", Takeover: "build", "Fix claim": "fix", Fixed: "fix", "Review claim": "review", Verdict: "review", "Land claim": "land" };
export const roleOfMarker = verb => roles[verb] ?? null;
export function executionIdentity({ registry, marker, taskId, role, head, git }) {
  const refs = markerReferences(marker.body);
  if (refs.invalid || !refs.route) return bad("missing or malformed external marker provenance");
  const route = routeIdentity(registry, refs.route, marker.who, taskId, role);
  if (!route.ok) return route;
  // Claims refer to a completed execution via its claim SHA; Verdict/Fixed can also name it explicitly.
  const matches = registry.executions.filter(e => e?.taskId === taskId && e.routeId === refs.route && e.role === role && (refs.execution ? e.id === refs.execution : e.claimSha === marker.sha));
  if (matches.length !== 1) return bad("missing or ambiguous completed execution");
  const e = matches[0];
  if (e.operator !== marker.who || !SHA.test(e.claimSha ?? "") || !SHA.test(e.inputSha ?? "") || !SHA.test(e.outputSha ?? "") || !text(e.input) || !text(e.output) || !text(e.observation) || !text(e.reviewUrl)) return bad("incomplete executed evidence");
  if (!["input", "output", "observation"].every(k => HASH.test(e[k + "Sha256"] ?? "") && digest(e[k]) === e[k + "Sha256"])) return bad("execution artifact bytes changed");
  try { if (new URL(e.reviewUrl).protocol !== "https:") return bad("unsupported execution review URL"); } catch { return bad("unsupported execution review URL"); }
  if (e.semanticEdits !== false) return bad("operator semantic contributions are unresolved");
  if (!git || git("cat-file", "-e", `${e.claimSha}^{commit}`) === null || (role === "build" && git("merge-base", "--is-ancestor", e.claimSha, head) === null)) return bad("execution claim is outside this history");
  if (role === "review") {
    if (e.inputSha !== e.outputSha || (marker.verb === "Verdict" && (e.inputSha !== head || marker.reviewed !== head)) || (marker.verb !== "Verdict" && git("merge-base", "--is-ancestor", e.inputSha, head) === null) || !["pass", "findings"].includes(e.verdict)) return bad("review execution is not for this exact head");
    if (marker.verdict && marker.verdict !== e.verdict) return bad("verdict differs from actual execution");
  } else {
    if (git("merge-base", "--is-ancestor", e.inputSha, e.outputSha) === null || git("merge-base", "--is-ancestor", e.outputSha, head) === null) return bad("execution history does not bind this head");
    const patch = git("diff", "--binary", "--no-ext-diff", e.inputSha, e.outputSha, "--");
    if (patch === null || digest(patch) !== e.patchSha256 || patch !== e.output) return bad("generated output differs from applied patch");
  }
  return { ok: true, model: route.model, execution: e };
}
/** A missing execution may be abandoned only when the retained first-parent
 * interval through the next qualified build claim is entirely empty. Equal
 * endpoints alone would hide edits followed by reverts. Never infer this for
 * fix locks: their ancestry is separate from the code branch.
 */
function emptyAbandonedBuild({ marker, workMarkers, registry, taskId, head, git }) {
  if (!["Claim", "Takeover"].includes(marker.verb) || !SHA.test(marker.sha ?? "")) return false;
  const refs = markerReferences(marker.body);
  if (refs.invalid || refs.execution || !routeIdentity(registry, refs.route, marker.who, taskId, "build").ok) return false;
  if (registry.executions.some(e => e.taskId === taskId && e.routeId === refs.route && e.role === "build" && e.claimSha === marker.sha)) return false;
  const at = workMarkers.indexOf(marker);
  const next = at >= 0 && workMarkers.slice(at + 1).find(m => m.id === taskId && ["Claim", "Takeover"].includes(m.verb));
  if (!next || !SHA.test(next.sha ?? "")) return false;
  const nextRefs = markerReferences(next.body);
  if (nextRefs.invalid || !routeIdentity(registry, nextRefs.route, next.who, taskId, "build").ok) return false;
  if (git("merge-base", "--is-ancestor", next.sha, head) === null) return false;
  let sha = next.sha;
  const seen = new Set();
  while (sha && !seen.has(sha)) {
    seen.add(sha);
    const parents = git("show", "-s", "--format=%P", sha)?.split(" ");
    if (parents?.length !== 1 || !SHA.test(parents[0])) return false;
    const delta = git("diff", "--binary", "--no-ext-diff", parents[0], sha, "--");
    if (delta !== "") return false;
    if (sha === marker.sha) return true;
    sha = parents[0];
  }
  return false;
}
/** Resolve a complete external task once, preserving unknowns. Legacy-only tasks return inactive. */
export function resolveTaskProvenance({ taskId, head, workMarkers = [], lockMarkers = [], registry, registryError, git, claimant, routeId, candidateRole = "review", isStatusCommit }) {
  const markers = [...workMarkers, ...lockMarkers].filter(m => m.id === taskId);
  const active = Boolean(routeId) || registry?.routes?.some(r => r.taskId === taskId) || markers.some(m => markerReferences(m.body).external);
  if (!active) return { active: false, ok: true };
  if (registryError || !registry) return { active: true, ...bad(registryError || "missing trusted-main provenance registry") };
  const builders = new Set(), fixers = new Set(), reviewers = new Map();
  const resolved = [];
  for (const m of markers) {
    const role = roleOfMarker(m.verb);
    if (!role || role === "land") continue;
    if (!markerReferences(m.body).external) {
      // D-184: review/findings-only history is not a code contribution. An
      // unqualified latest verdict still cannot become an external pass.
      if (role === "review") continue;
      return { active: true, ...bad("unresolved historical contributor; no legacy alias fallback") };
    }
    // A review claim qualifies the operator route, not a completed verdict.
    // Its eventual PASS/Findings still requires an exact execution receipt.
    if (m.verb === "Review claim") {
      const refs = markerReferences(m.body);
      const route = !refs.invalid && routeIdentity(registry, refs.route, m.who, taskId, "review");
      if (!route?.ok) return { active: true, ...bad("unqualified external review claim") };
      reviewers.set(m.who, route.model);
      continue;
    }
    if (role === "build" && emptyAbandonedBuild({ marker: m, workMarkers, registry, taskId, head, git })) continue;
    const result = executionIdentity({ registry, marker: m, taskId, role, head: role === "review" ? (m.reviewed || head) : head, git });
    if (!result.ok) return { active: true, ...result };
    const expected = role === "build" ? ["Claim", "Takeover"] : role === "fix" ? ["Fix claim"] : ["Review claim"];
    if (!markers.some(c => c.sha === result.execution.claimSha && expected.includes(c.verb) && c.who === m.who && markerReferences(c.body).route === markerReferences(m.body).route)) return { active: true, ...bad("execution is not bound to its actual role claim") };
    resolved.push(result);
    if (role === "build") builders.add(result.model);
    if (role === "fix") fixers.add(result.model);
    if (role === "review") reviewers.set(m.who, result.model);
  }
  // Every branch-owned file-changing commit must be accounted for by reviewed execution ranges.
  const owned = git?.("rev-list", "--no-merges", head, "--not", "origin/main");
  if (owned === null || owned === undefined) return { active: true, ...bad("cannot establish complete contribution history") };
  const merges = git("rev-list", "--min-parents=2", head, "--not", "origin/main");
  if (merges === null) return { active: true, ...bad("cannot establish merge contribution history") };
  for (const sha of merges.split("\n").filter(Boolean)) {
    const parents = git("show", "-s", "--format=%P", sha)?.split(" ");
    // Only clean, ordinary main merges retain an external execution binding.
    // A merge commit can contain semantic edits too; --no-merges alone hides them.
    if (parents?.length !== 2 || git("merge-base", "--is-ancestor", parents[1], "origin/main") === null) return { active: true, ...bad("unattributed merge contribution; only clean main merges are transport") };
    const base = git("merge-base", ...parents);
    const mainDelta = base && git("diff", "--binary", "--no-ext-diff", base, parents[1], "--");
    const appliedDelta = git("diff", "--binary", "--no-ext-diff", parents[0], sha, "--");
    // Exact main-only delta works on older Git too. Newer Git additionally
    // proves a clean content merge via remerge-diff. Unsupported overlap holds.
    if (!(mainDelta !== null && mainDelta === appliedDelta) && git("show", "--remerge-diff", "--format=", sha, "--") !== "") return { active: true, ...bad("unattributed merge contribution; only clean main merges are transport") };
  }
  const covered = new Set();
  for (const r of resolved.filter(r => ["build", "fix"].includes(r.execution.role))) {
    const commits = git("rev-list", "--no-merges", `${r.execution.inputSha}..${r.execution.outputSha}`);
    if (commits === null) return { active: true, ...bad("cannot read executed contribution range") };
    commits.split("\n").filter(Boolean).forEach(c => covered.add(c));
  }
  for (const sha of owned.split("\n").filter(Boolean)) {
    const files = git("diff-tree", "--no-commit-id", "--name-only", "-r", sha);
    if (files === null || files.trim() && !covered.has(sha) && !(typeof isStatusCommit === "function" ? isStatusCommit(sha) : isStatusCommitWithGit(git, sha))) return { active: true, ...bad("unattributed file-changing contribution in branch history") };
  }
  let candidate = null;
  if (claimant) {
    if (!routeId) return { active: true, ...bad("external task requires an explicit qualified operator route") };
    const route = routeIdentity(registry, routeId, claimant, taskId, candidateRole);
    if (!route.ok) return { active: true, ...route };
    candidate = route.model;
  }
  return { active: true, ok: true, builders: [...builders], fixers: [...fixers], reviewers, candidate };
}
/** Only the named main ref is trusted. Candidate/local overrides are deliberately unsupported. */
export function loadTrustedProvenance(git) {
  const exists = git("cat-file", "-e", `origin/main:${PROVENANCE_PATH}`);
  if (exists === null) return { registry: null, registryError: "no trusted-main provenance registry" };
  const parsed = registryOf(git("show", `origin/main:${PROVENANCE_PATH}`));
  return parsed.ok ? { registry: parsed.registry } : { registry: null, registryError: parsed.reason };
}

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

const ASSIGNMENTS = "docs/plans/assignments.json";
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


/** Same status-only predicate in picker and gate; unreadable history holds. */
export function isStatusCommitWithGit(git, sha) {
  const paths = git("diff-tree", "--no-commit-id", "--no-renames", "-r", "--name-only", sha);
  if (!paths) return false;
  const files = [];
  for (const path of paths.split("\n").filter(Boolean)) {
    const before = git("show", `${sha}^:${path}`), after = git("show", `${sha}:${path}`);
    const patch = git("diff", "-U0", "--no-renames", `${sha}^`, sha, "--", path);
    if (before === null || after === null || patch === null) return false;
    const removed = [], added = [];
    for (const m of patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      for (let n = 0; n < Number(m[2] ?? 1); n++) removed.push(Number(m[1]) + n);
      for (let n = 0; n < Number(m[4] ?? 1); n++) added.push(Number(m[3]) + n);
    }
    files.push({ path, before, after, removed, added });
  }
  return isStatusOnlyChange(files);
}

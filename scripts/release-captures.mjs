#!/usr/bin/env node
// GATE-release-captures (D-346 (6), docs/plans/D-344-unblock.md row 4): which
// goal surfaces a pull request's CI captures, and which routes each one owns.
//
//   node scripts/release-captures.mjs plan     CI planner: writes `capture`, `ids`
//                                              and `matrix` to $GITHUB_OUTPUT
//   node scripts/release-captures.mjs routes <id>[,<id>]   prints the shots
//
// The routes come from client/src/lib/goalSurfaces.ts itself, parsed here, never
// a hand-kept copy; scripts/releaseCaptures.test.ts compares the parse with the
// real module. A release row's surface is found through docs/plans/assignments.json
// (the D-048-R-<id> row whose branch is the pull request's head), never from the
// branch text alone. A pull request also captures every id it adds to RELEASED
// (a build row going live in its own PR, D-349), and the canary surfaces when it
// changes this tooling, so the tooling proves itself in its own CI.
//
// Node built-ins only: the planner job runs before any dependency install.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SURFACES_FILE = "client/src/lib/goalSurfaces.ts";
export const ASSIGNMENTS_FILE = "docs/plans/assignments.json";

/** The two capture sizes (AGENTS.md rule 8): desktop, and a phone at scale 2. */
export const VIEWPORTS = Object.freeze([
  Object.freeze({ name: "desktop", width: 1280, height: 900, deviceScaleFactor: 1 }),
  Object.freeze({ name: "mobile", width: 390, height: 844, deviceScaleFactor: 2 }),
]);

/** A change to either file captures the canaries, so the tooling is tested in its own CI. */
export const SELF_TEST_FILES = Object.freeze(["scripts/release-captures.mjs", "e2e/release-captures.e2e.ts"]);

/** Released surfaces, one per persona, that a tooling change captures. */
export const CANARY_IDS = Object.freeze(["home", "settings", "referrer-home", "admin"]);

/** Synthetic values for every route parameter in the surface map. An unknown one fails loudly. */
const PARAMS = Object.freeze({
  slug: "acme-example",
  companySlug: "acme-example",
  vanityAlias: "release-capture",
  requestId: "1",
  linkToken: "release-capture-token",
  linkCode: "release-capture",
  token: "release-capture-token",
  kind: "company",
  id: "1",
  handle: "release-capture",
});

const VISITOR = new Set(["home", "sign-in", "pricing", "policy", "for-companies", "links", "public-profile"]);
const REFERRER = new Set(["referrer", "referrer-home", "queue", "post-opportunity", "email-review"]);

// ---- parsing the surface map ----------------------------------------------

/**
 * Drops `//` comments outside string literals. A comment ends at a newline, or
 * at the next double quote when the source was joined onto one line; a comment
 * that quotes something then leaves text behind and the strict parse below
 * fails loudly instead of guessing.
 */
function stripComments(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) return out + text.slice(i);
      out += text.slice(i, end + 1);
      i = end + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n" && text[i] !== '"') i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function parseSurfaceMap(source) {
  const head = /export\s+const\s+GOAL_SURFACES\s*=\s*\{/.exec(source);
  if (!head) throw new Error(`GOAL_SURFACES: no "export const GOAL_SURFACES = {" in ${SURFACES_FILE}`);
  const start = head.index + head[0].length;
  const body = stripComments(source.slice(start));
  const close = body.indexOf("}");
  if (close < 0 || !/^\}\s*as\s+const\s*;/.test(body.slice(close))) throw new Error("GOAL_SURFACES: the map does not end with `} as const;`");
  const entries = body.slice(0, close);
  const entry = /\s*"([a-z0-9-]+)"\s*:\s*\[((?:\s*"[^"\\]*"\s*,?)*)\s*\](?:\s*as\s+(?:const|string\[\]))?\s*(?:,|$)/y;
  const surfaces = {};
  let at = 0;
  while (at < entries.length && entries.slice(at).trim() !== "") {
    entry.lastIndex = at;
    const match = entry.exec(entries);
    if (!match) throw new Error(`GOAL_SURFACES: cannot read the entry at "${entries.slice(at).trim().slice(0, 60)}"`);
    const [, id, list] = match;
    if (Object.prototype.hasOwnProperty.call(surfaces, id)) throw new Error(`GOAL_SURFACES: "${id}" is declared twice`);
    surfaces[id] = [...list.matchAll(/"([^"\\]*)"/g)].map(m => m[1]);
    at = entry.lastIndex;
  }
  if (Object.keys(surfaces).length === 0) throw new Error("GOAL_SURFACES: the map is empty");
  return surfaces;
}

function parseReleased(source, surfaces) {
  const head = /\bconst\s+RELEASED\b[^=]*=\s*\[/.exec(source);
  if (!head) throw new Error(`RELEASED: no "const RELEASED ... = [" in ${SURFACES_FILE}`);
  const rest = stripComments(source.slice(head.index + head[0].length));
  const close = rest.indexOf("]");
  if (close < 0 || !/^\]\s*;/.test(rest.slice(close))) throw new Error("RELEASED: the list does not end with `];`");
  const items = rest.slice(0, close);
  const item = /\s*"([a-z0-9-]+)"\s*(?:,|$)/y;
  const released = [];
  let at = 0;
  while (at < items.length && items.slice(at).trim() !== "") {
    item.lastIndex = at;
    const match = item.exec(items);
    if (!match) throw new Error(`RELEASED: cannot read the item at "${items.slice(at).trim().slice(0, 60)}"`);
    const id = match[1];
    if (!Object.prototype.hasOwnProperty.call(surfaces, id)) throw new Error(`RELEASED: "${id}" is not declared in GOAL_SURFACES`);
    if (released.includes(id)) throw new Error(`RELEASED: "${id}" is listed twice`);
    released.push(id);
    at = item.lastIndex;
  }
  return released;
}

/** Reads GOAL_SURFACES and RELEASED from goalSurfaces.ts source text; throws on anything it cannot read exactly. */
export function parseGoalSurfaces(source) {
  const surfaces = parseSurfaceMap(source);
  return { surfaces, released: parseReleased(source, surfaces) };
}

let cachedSurfaces = null;
function defaultSurfaces() {
  cachedSurfaces ??= parseGoalSurfaces(readFileSync(join(root, SURFACES_FILE), "utf8")).surfaces;
  return cachedSurfaces;
}

function assertDeclared(id, surfaces) {
  if (!Object.prototype.hasOwnProperty.call(surfaces, id)) throw new Error(`"${id}" is not a goal surface declared in ${SURFACES_FILE}`);
}

// ---- routes, personas, shots -----------------------------------------------

/** A route pattern with every `:param` replaced by its synthetic value. */
export function fillRoute(pattern) {
  return pattern.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(PARAMS, name)) throw new Error(`fillRoute: no synthetic value for :${name} in ${pattern}`);
    return PARAMS[name];
  });
}

/** The routes one surface owns, as { pattern, path }. A `-signed-in` variant with no route of its own uses its base surface's. */
export function routesOf(id, surfaces = defaultSurfaces()) {
  assertDeclared(id, surfaces);
  let patterns = surfaces[id];
  if (patterns.length === 0) {
    const base = id.replace(/-signed-in$/, "");
    if (base !== id && Object.prototype.hasOwnProperty.call(surfaces, base)) patterns = surfaces[base];
  }
  if (patterns.length === 0) throw new Error(`"${id}" owns no route to capture`);
  return patterns.map(pattern => ({ pattern, path: fillRoute(pattern) }));
}

/** Who the surface is captured as: the person who meets it. */
export function personaOf(id, surfaces = defaultSurfaces()) {
  assertDeclared(id, surfaces);
  if (id.endsWith("-signed-in")) return "seeker";
  if (id === "admin" || id.startsWith("admin-")) return "admin";
  if (REFERRER.has(id)) return "referrer";
  if (VISITOR.has(id)) return "visitor";
  return "seeker";
}

/** The capture file stem for a path: "/" is "root", slashes become dashes. */
export function shotFile(path) {
  const stem = path.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return stem === "" ? "root" : stem;
}

/** One shot per route of each id, in the order given. */
export function capturePlan(ids, surfaces = defaultSurfaces()) {
  const shots = [];
  for (const id of ids) {
    const persona = personaOf(id, surfaces);
    for (const route of routesOf(id, surfaces)) shots.push({ id, persona, pattern: route.pattern, path: route.path, file: shotFile(route.path) });
  }
  return shots;
}

// ---- which surfaces a pull request captures --------------------------------

/** "D-048-R-<id>" -> "<id>" when that id is declared, else null. */
export function releaseIdOfTask(taskId, surfaces = defaultSurfaces()) {
  const match = /^D-048-R-([a-z0-9-]+)$/.exec(String(taskId ?? ""));
  if (!match || !Object.prototype.hasOwnProperty.call(surfaces, match[1])) return null;
  return match[1];
}

/** The surface of the D-048-R row whose queue branch is `branch`, else null. */
export function releaseIdOfBranch(branch, tasks, surfaces = defaultSurfaces()) {
  if (!branch) return null;
  const task = tasks.find(t => t.branch === branch && /^D-048-R-/.test(t.id));
  return task ? releaseIdOfTask(task.id, surfaces) : null;
}

/** The ids `head` lists in RELEASED that `base` does not, in head's order. */
export function newlyReleased(baseReleased, headReleased) {
  const before = new Set(baseReleased);
  return headReleased.filter(id => !before.has(id));
}

/** Every id this pull request captures, once each, in surface-map order. */
export function captureIds({ surfaces, tasks, branch, baseReleased, headReleased, changedFiles }) {
  const ids = new Set(newlyReleased(baseReleased, headReleased));
  const releaseId = releaseIdOfBranch(branch, tasks, surfaces);
  if (releaseId) ids.add(releaseId);
  if (changedFiles.some(file => SELF_TEST_FILES.includes(file))) for (const id of CANARY_IDS) ids.add(id);
  for (const id of ids) assertDeclared(id, surfaces);
  const order = Object.keys(surfaces);
  return [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

// ---- CLI ---------------------------------------------------------------------

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * The CI planner. The checkout is the pull request's merge commit (fetch depth
 * 2), so HEAD^1 is the base it merges into and `git diff HEAD^1 HEAD` is the
 * pull request's change. An unreadable base warns and plans from the branch
 * alone: this job is not a required check and never blocks a merge.
 */
function plan(env) {
  const headSource = readFileSync(join(root, SURFACES_FILE), "utf8");
  const head = parseGoalSurfaces(headSource);
  const tasks = JSON.parse(readFileSync(join(root, ASSIGNMENTS_FILE), "utf8")).tasks;
  const baseRef = env.CAPTURE_BASE_REF || "HEAD^1";
  let baseReleased = head.released;
  let changedFiles = [];
  try {
    baseReleased = parseGoalSurfaces(git(["show", `${baseRef}:${SURFACES_FILE}`])).released;
    changedFiles = git(["diff", "--no-renames", "--name-only", baseRef, "HEAD"]).split("\n").filter(Boolean);
  } catch (error) {
    console.log(`::warning title=Release captures::cannot read the base ${baseRef} (${String(error?.message ?? error).split("\n")[0]}); planning from the branch alone.`);
  }
  const branch = env.CAPTURE_BRANCH || "";
  const ids = captureIds({ surfaces: head.surfaces, tasks, branch, baseReleased, headReleased: head.released, changedFiles });
  for (const id of ids) if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`refusing an id that is not a plain surface id: ${id}`);
  const shots = capturePlan(ids, head.surfaces);
  const lines = [`capture=${ids.length > 0}`, `ids=${ids.join(",")}`, `matrix=${JSON.stringify(ids)}`];
  console.log(`branch: ${branch || "(none)"}`);
  console.log(ids.length ? `captures ${ids.length} surface(s), ${shots.length} route(s) x ${VIEWPORTS.length} viewports:` : "captures nothing: this pull request releases no goal surface.");
  for (const shot of shots) console.log(`  ${shot.id} (${shot.persona}) ${shot.path}`);
  for (const line of lines) console.log(line);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    const summary = ids.length
      ? [`### Release captures`, ``, ...ids.map(id => `- \`${id}\`: ${routesOf(id, head.surfaces).map(r => `\`${r.path}\``).join(", ")} -> artifact \`release-captures-${id}\``)]
      : [`### Release captures`, ``, `Nothing to capture: this pull request releases no goal surface.`];
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
  }
  return ids;
}

function main(argv, env) {
  const [command, arg] = argv;
  if (command === "plan") { plan(env); return 0; }
  if (command === "routes" && arg) {
    for (const shot of capturePlan(arg.split(",").map(s => s.trim()).filter(Boolean))) console.log(JSON.stringify(shot));
    return 0;
  }
  console.error("usage: node scripts/release-captures.mjs plan | routes <id>[,<id>]");
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.exitCode = main(process.argv.slice(2), process.env); } catch (error) {
    console.error(`release-captures: ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}

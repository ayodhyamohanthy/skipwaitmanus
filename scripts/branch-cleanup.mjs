#!/usr/bin/env node
// BRANCH-HYGIENE-1 (D-205): delete branches that are done and merged, online and offline.
//
//   node scripts/branch-cleanup.mjs                          # dry run: every origin branch's verdict and the counts; writes nothing
//   node scripts/branch-cleanup.mjs --apply                  # delete the "delete" rows on origin (batches of 20), then prune
//   node scripts/branch-cleanup.mjs --apply --only <task id> # only that task's branches (the landing step, BRANCH-HYGIENE-2)
//   node scripts/branch-cleanup.mjs --apply --max <n>        # allow more than 150 deletions in one run (default refuses)
//   node scripts/branch-cleanup.mjs --local                  # ruling 5 for this clone: git branch -d merged branches whose upstream is gone
//
// The verdicts come from scripts/branchHygieneCore.mjs. GitHub reads use GH_TOKEN or GITHUB_TOKEN when
// set; GITHUB_API_URL points the reads at another host (tests). Running it is a separate, authorized step:
// landing this script deletes nothing. It fails closed:
// - --apply refuses unless docs/plans/branch-retention.json (the explicit evidence holds) is on origin/main;
//   a held branch is never deleted, and without the list the dry run's delete rows are candidates only;
// - it stops, deleting nothing, when origin is not the repository the task list names, when a task status
//   is unknown, or when the open or merged pull requests cannot be read exactly;
// - a marker branch carrying anything besides empty picker markers is kept;
// - before each batch it reads everything again and deletes only the rows still "delete" at the same SHA,
//   each with a lease on that SHA; batches are atomic and the count comes from origin, not exit codes.
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { RETENTION_LIST, classifyBranches, classifyLocal, markerOnlyCommits, markerPrefixOf, parseRetention, relatedTo, render, repoOfRemote, summarize } from "./branchHygieneCore.mjs";
import { ciStateFromRuns } from "./nextTaskCore.mjs";

const LIST = "docs/plans/assignments.json";
const BATCH = 20;
const DEFAULT_MAX = 150;
const FULL_SHA = /^[0-9a-f]{40}$/;

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
/** A refusal: main prints it with its exit code, never a stack trace. */
class Stop extends Error { constructor(message, code = 1) { super(message); this.code = code; } }
const stop = (message, code = 1) => { throw new Stop(message, code); };
const NOTHING = "nothing was classified or deleted";

function parseArgs(argv) {
  const out = { apply: false, local: false, only: null, max: DEFAULT_MAX };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--local") out.local = true;
    else if (a === "--only" || a === "--max") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) stop(`${a} needs a value`);
      if (a === "--only") out.only = v;
      else if (!/^\d+$/.test(v)) stop("--max needs a whole number");
      else out.max = Number(v);
    } else stop(`unknown argument ${a}`);
  }
  if (out.local && (out.apply || out.only)) stop("--local runs on its own");
  return out;
}

async function github(repo, path) {
  const base = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const headers = { accept: "application/vnd.github+json", "user-agent": "skipwait-branch-cleanup", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`${base}/repos/${repo}${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`GitHub ${path.split("?")[0]} answered ${res.status}`);
  return res.json();
}

/** Every pull request in a state, page by page; a short page ends it. */
async function allPulls(repo, state) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const batch = await github(repo, `/pulls?state=${state}&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error(`GitHub /pulls?state=${state} did not return a list`);
    all.push(...batch);
    if (batch.length < 100) return all;
  }
  throw new Error(`more than 10000 ${state} pull requests; refusing to guess`);
}

/** A pull request's head, exactly, or a throw: a head that cannot be read could be a branch someone needs. */
function headOf(p) {
  const h = p?.head;
  if (!h || typeof h !== "object" || typeof h.ref !== "string" || h.ref === "" || !FULL_SHA.test(h.sha ?? "")) throw new Error(`a pull request has no readable head (${JSON.stringify(h ?? null).slice(0, 160)})`);
  return { ref: h.ref, sha: h.sha, repo: typeof h.repo?.full_name === "string" ? h.repo.full_name : null };
}

/** The marker branches whose commits outside main are all empty picker markers; anything unreadable is left out (kept). */
function markerOnlyBranches(branches) {
  const out = new Set();
  for (const { name, sha } of branches) {
    if (!markerPrefixOf(name)) continue;
    const log = tryGit("log", "--format=%H%x09%P%x09%T%x09%s", `refs/remotes/origin/main..${sha}`);
    if (log === null) continue;
    const commits = log.split("\n").filter(Boolean).map(line => {
      const [, parents, tree, ...subject] = line.split("\t");
      return { parents: parents ? parents.split(" ") : [], tree, subject: subject.join("\t") };
    });
    const firstParents = [...new Set(commits.filter(c => c.parents.length === 1).map(c => c.parents[0]))];
    const trees = firstParents.length ? tryGit("rev-parse", ...firstParents.map(p => `${p}^{tree}`)) : "";
    if (trees === null) continue;
    const treeOf = new Map(firstParents.map((p, i) => [p, trees.split("\n")[i]]));
    if (markerOnlyCommits(commits.map(c => ({ ...c, parentTree: c.parents.length === 1 ? treeOf.get(c.parents[0]) ?? null : null })))) out.add(name);
  }
  return out;
}

/** Everything the verdicts rest on, read fresh from origin and GitHub, and the verdicts. */
async function snapshot() {
  if (tryGit("fetch", "-q", "--prune", "origin") === null) stop("git fetch origin failed", 2);
  const raw = tryGit("show", `origin/main:${LIST}`);
  if (raw === null) stop(`${LIST} is missing on origin/main`, 2);
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { stop(`${LIST} is not valid JSON: ${e.message}`, 2); }
  if (!/^[\w.-]+\/[\w.-]+$/.test(doc?.repo ?? "") || !Array.isArray(doc.tasks)) stop(`${LIST} needs repo and tasks`, 2);
  // Every GitHub answer below describes doc.repo: act on them only for an origin that is that repository.
  const originRepo = repoOfRemote(tryGit("remote", "get-url", "origin"));
  if (!originRepo || originRepo.toLowerCase() !== doc.repo.toLowerCase()) stop(`origin is ${originRepo ?? "unreadable"}, but ${LIST} names ${doc.repo}; ${NOTHING}`, 2);
  let retained = null;
  const holds = tryGit("show", `origin/main:${RETENTION_LIST}`);
  if (holds !== null) {
    try { retained = parseRetention(JSON.parse(holds)); } catch (e) { stop(`invalid retention list: ${RETENTION_LIST}: ${e.message.replace(/^branch hygiene: invalid retention list: /, "")}; ${NOTHING}`, 2); }
  }
  const branches = git("for-each-ref", "--format=%(refname:strip=3)%09%(objectname)", "refs/remotes/origin").split("\n").filter(Boolean)
    .map(line => line.split("\t")).filter(([name]) => name !== "HEAD").map(([name, sha]) => ({ name, sha }));
  const mainTipAncestry = new Set(git("for-each-ref", "--merged", "refs/remotes/origin/main", "--format=%(refname:strip=3)", "refs/remotes/origin").split("\n").filter(Boolean));
  let open, merged;
  try { open = (await allPulls(doc.repo, "open")).map(headOf); } catch (e) { stop(`cannot read the open pull requests (${e.message}); ${NOTHING}`, 2); }
  try { merged = (await allPulls(doc.repo, "closed")).filter(p => p?.merged_at).map(headOf); } catch (e) { stop(`cannot read the merged pull requests (${e.message}); ${NOTHING}`, 2); }
  // Any open pull request keeps a branch of that name, a fork's included: which one it means is never guessed.
  const openPrHeads = new Set(open.map(h => h.ref));
  const mergedPrHeads = new Map();
  for (const h of merged.filter(h => h.repo === doc.repo)) {
    if (!mergedPrHeads.has(h.ref)) mergedPrHeads.set(h.ref, new Set());
    mergedPrHeads.get(h.ref).add(h.sha);
  }
  // A red main keeps its fix-main lock; when main's CI cannot be read, every fix-main lock stays.
  let mainRed = "unknown";
  try {
    const ci = ciStateFromRuns((await github(doc.repo, "/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10")).workflow_runs ?? []);
    if (ci.state === "green" || ci.state === "running") mainRed = null;
    else if (ci.state === "red" || ci.state === "running-after-red") mainRed = { sha: ci.sha };
  } catch (e) { console.error(`branch-cleanup: main CI unknown (${e.message}); every fix-main lock is kept`); }
  try {
    const rows = classifyBranches({ branches, mainTipAncestry, mergedPrHeads, openPrHeads, tasks: doc.tasks, mainRed, retained: retained ?? new Map(), markerOnly: markerOnlyBranches(branches) });
    return { doc, retained, rows };
  } catch (e) { stop(`${e.message}; ${NOTHING}`, 2); }
}

function printCounts(label, rows) {
  const counts = summarize(rows);
  const total = action => Object.values(counts[action]).reduce((a, b) => a + b, 0);
  const list = action => Object.entries(counts[action]).map(([reason, n]) => `${reason} ${n}`).join(", ") || "none";
  console.log(`\n${label}: ${total("delete")} to delete, ${total("keep")} to keep`);
  console.log(`  delete: ${list("delete")}`);
  console.log(`  keep:   ${list("keep")}`);
}

// --atomic: a batch deletes all of its branches or none, so the one-by-one retry starts from a known state.
const push = list => spawnSync("git", ["push", "--atomic", "--quiet", "origin", ...list.map(r => `--force-with-lease=refs/heads/${r.name}:${r.sha}`), "--delete", ...list.map(r => r.name)], { encoding: "utf8" });

async function applyDeletions(doomed, scope) {
  const attempted = [], skipped = [], why = new Map();
  let stopped = null;
  for (let i = 0; i < doomed.length; i += BATCH) {
    // Read everything again just before each batch: a pull request opened, a task reopened, a hold added or
    // a push since the first read keeps that branch.
    let fresh;
    try { fresh = await snapshot(); } catch (e) { if (!(e instanceof Stop)) throw e; stopped = e; break; }
    if (fresh.retained === null) { stopped = new Stop(`${RETENTION_LIST} is no longer on origin/main`, 2); break; }
    const now = new Map(scope(fresh.rows).map(r => [r.name, r]));
    const batch = [];
    for (const r of doomed.slice(i, i + BATCH)) {
      const f = now.get(r.name);
      if (f?.action === "delete" && f.sha === r.sha) batch.push(r);
      else skipped.push(`${r.name}: ${!f ? "no longer on origin" : f.sha !== r.sha ? `now at ${f.sha.slice(0, 8)}` : `now ${f.action} ${f.reason}`}`);
    }
    attempted.push(...batch);
    if (!batch.length || push(batch).status === 0) continue;
    for (const r of batch) {
      const one = push([r]);
      if (one.status !== 0) why.set(r.name, (one.stderr || one.stdout || "push failed").trim().split("\n").at(-1));
    }
  }
  for (const s of skipped) console.log(`skipped ${s}`);
  // The count comes from origin itself, never from push exit codes.
  tryGit("fetch", "-q", "--prune", "origin");
  const listing = tryGit("ls-remote", "--heads", "origin");
  if (listing === null) {
    console.error(`branch-cleanup: cannot list origin's branches, so the ${attempted.length} attempted deletions are unverified`);
    return 1;
  }
  const left = new Set(listing.split("\n").filter(Boolean).map(line => (line.split("\t")[1] ?? "").replace(/^refs\/heads\//, "")));
  const failed = attempted.filter(r => left.has(r.name));
  console.log(`\ndeleted ${attempted.length - failed.length} of ${attempted.length} (checked on origin)`);
  for (const r of failed) console.error(`branch-cleanup: not deleted: ${r.name}${why.has(r.name) ? ` (${why.get(r.name)})` : ""}`);
  if (stopped) {
    console.error(`branch-cleanup: stopped before the remaining batches: ${stopped.message}`);
    return stopped.code;
  }
  return failed.length ? 1 : 0;
}

function local() {
  if (tryGit("fetch", "-q", "--prune", "origin") === null) stop("git fetch origin failed", 2);
  // Which branches a worktree has checked out decides what is safe; if that cannot be read, nothing is deleted.
  const listed = tryGit("worktree", "list", "--porcelain");
  if (listed === null) stop("cannot list the worktrees of this clone (git worktree list failed); nothing was deleted", 2);
  const worktrees = new Map();
  for (const block of listed.split("\n\n")) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    if (path && branch) worktrees.set(branch, path);
  }
  const branches = git("for-each-ref", "--format=%(refname:strip=2)%09%(objectname)%09%(upstream:track)", "refs/heads").split("\n").filter(Boolean).map(line => {
    const [name, sha, track = ""] = line.split("\t");
    return { name, sha, upstreamGone: track.includes("gone"), inMain: tryGit("merge-base", "--is-ancestor", sha, "refs/remotes/origin/main") !== null, worktree: worktrees.get(name) ?? null };
  });
  const rows = classifyLocal({ local: branches });
  for (const line of render(rows)) console.log(line);
  const doomed = rows.filter(r => r.action === "delete");
  const failed = doomed.flatMap(r => (tryGit("branch", "-d", r.name) === null ? [`${r.name}: git branch -d refused`] : []));
  console.log(`\nLOCAL: deleted ${doomed.length - failed.length} of ${doomed.length} merged local branches whose upstream is gone`);
  for (const f of failed) console.error(`branch-cleanup: ${f}`);
  return failed.length ? 1 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.local) return local();
  const first = await snapshot();
  if (args.apply && first.retained === null) stop(`--apply needs ${RETENTION_LIST} on origin/main (the explicit evidence holds; {"version":1,"holds":[]} holds nothing); nothing was deleted`, 2);
  let scope = rows => rows;
  if (args.only) {
    const task = first.doc.tasks.find(t => t.id === args.only);
    if (!task) stop(`no task ${args.only} in ${LIST} on origin/main`);
    scope = rows => rows.filter(r => relatedTo(task, r.name));
  }
  const rows = scope(first.rows);
  for (const line of render(rows)) console.log(line);
  printCounts(args.apply ? "APPLY" : "DRY RUN", rows);
  if (first.retained === null) console.log(`\nRETENTION LIST MISSING: ${RETENTION_LIST} is not on origin/main, so the evidence holds are unknown. The delete rows above are candidates only, and --apply refuses to run.`);
  if (!args.apply) return 0;
  const doomed = rows.filter(r => r.action === "delete");
  if (doomed.length > args.max) stop(`${doomed.length} deletions is more than ${args.max}; nothing was deleted. Have the CEO read the dry run, then run again with --max ${doomed.length}`);
  return applyDeletions(doomed, scope);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // Cloud sandboxes reach GitHub only through HTTPS_PROXY, which Node's fetch ignores unless NODE_USE_ENV_PROXY=1 (as next-task.mjs).
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== "1") {
    const rerun = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
    process.exit(rerun.status ?? 1);
  }
  main().then(code => process.exit(code), e => {
    if (e instanceof Stop) { console.error(`branch-cleanup: ${e.message}`); process.exit(e.code); }
    console.error(`branch-cleanup: ${e.stack ?? String(e)}`);
    process.exit(1);
  });
}

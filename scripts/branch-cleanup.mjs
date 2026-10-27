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
// set; GITHUB_API_URL points the reads at another host (tests). It stops, deleting nothing, when the open
// or merged pull requests cannot be read. Each origin delete carries a lease on the classified tip, so a
// branch someone pushed to after the classification is refused, not deleted.
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { classifyBranches, classifyLocal, relatedTo, render, summarize } from "./branchHygieneCore.mjs";
import { ciStateFromRuns } from "./nextTaskCore.mjs";

const LIST = "docs/plans/assignments.json";
const BATCH = 20;
const DEFAULT_MAX = 150;

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
const fail = (message, code = 1) => { console.error(`branch-cleanup: ${message}`); process.exit(code); };

function parseArgs(argv) {
  const out = { apply: false, local: false, only: null, max: DEFAULT_MAX };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--local") out.local = true;
    else if (a === "--only" || a === "--max") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`${a} needs a value`);
      if (a === "--only") out.only = v;
      else if (!/^\d+$/.test(v)) fail("--max needs a whole number");
      else out.max = Number(v);
    } else fail(`unknown argument ${a}`);
  }
  if (out.local && (out.apply || out.only)) fail("--local runs on its own");
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

async function readOrigin() {
  if (tryGit("fetch", "-q", "--prune", "origin") === null) fail("git fetch origin failed");
  const raw = tryGit("show", `origin/main:${LIST}`);
  if (raw === null) fail(`${LIST} is missing on origin/main`);
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { fail(`${LIST} is not valid JSON: ${e.message}`); }
  if (!/^[\w.-]+\/[\w.-]+$/.test(doc?.repo ?? "") || !Array.isArray(doc.tasks)) fail(`${LIST} needs repo and tasks`);
  const branches = git("for-each-ref", "--format=%(refname:strip=3)%09%(objectname)", "refs/remotes/origin").split("\n").filter(Boolean)
    .map(line => line.split("\t")).filter(([name]) => name !== "HEAD").map(([name, sha]) => ({ name, sha }));
  const mainTipAncestry = new Set(git("for-each-ref", "--merged", "refs/remotes/origin/main", "--format=%(refname:strip=3)", "refs/remotes/origin").split("\n").filter(Boolean));
  let open, closed;
  try { open = await allPulls(doc.repo, "open"); } catch (e) { fail(`cannot read the open pull requests (${e.message}); nothing was classified or deleted`, 2); }
  try { closed = await allPulls(doc.repo, "closed"); } catch (e) { fail(`cannot read the merged pull requests (${e.message}); nothing was classified or deleted`, 2); }
  const own = p => p?.head?.repo?.full_name === doc.repo && typeof p.head.ref === "string";
  const openPrHeads = new Set(open.filter(own).map(p => p.head.ref));
  const mergedPrHeads = new Map();
  for (const p of closed.filter(p => own(p) && p.merged_at)) {
    if (!mergedPrHeads.has(p.head.ref)) mergedPrHeads.set(p.head.ref, new Set());
    mergedPrHeads.get(p.head.ref).add(p.head.sha);
  }
  // A red main keeps its fix-main lock; when main's CI cannot be read, every fix-main lock stays.
  let mainRed = "unknown";
  try {
    const ci = ciStateFromRuns((await github(doc.repo, "/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10")).workflow_runs ?? []);
    if (ci.state === "green" || ci.state === "running") mainRed = null;
    else if (ci.state === "red" || ci.state === "running-after-red") mainRed = { sha: ci.sha };
  } catch (e) { console.error(`branch-cleanup: main CI unknown (${e.message}); every fix-main lock is kept`); }
  return { doc, rows: classifyBranches({ branches, mainTipAncestry, mergedPrHeads, openPrHeads, tasks: doc.tasks, mainRed }) };
}

function printCounts(label, rows) {
  const counts = summarize(rows);
  const total = action => Object.values(counts[action]).reduce((a, b) => a + b, 0);
  const list = action => Object.entries(counts[action]).map(([reason, n]) => `${reason} ${n}`).join(", ") || "none";
  console.log(`\n${label}: ${total("delete")} to delete, ${total("keep")} to keep`);
  console.log(`  delete: ${list("delete")}`);
  console.log(`  keep:   ${list("keep")}`);
}

function deleteOnOrigin(rows) {
  const failed = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const push = list => spawnSync("git", ["push", "--quiet", "origin", ...list.map(r => `--force-with-lease=refs/heads/${r.name}:${r.sha}`), "--delete", ...list.map(r => r.name)], { encoding: "utf8" });
    if (push(batch).status === 0) continue;
    // One refusal fails the whole batch: retry one by one so each failure is reported and the rest still go.
    for (const r of batch) {
      const one = push([r]);
      if (one.status !== 0) failed.push(`${r.name}: ${(one.stderr || one.stdout || "push failed").trim().split("\n").at(-1)}`);
    }
  }
  tryGit("fetch", "-q", "--prune", "origin");
  return failed;
}

function local() {
  if (tryGit("fetch", "-q", "--prune", "origin") === null) fail("git fetch origin failed");
  const worktrees = new Map();
  for (const block of (tryGit("worktree", "list", "--porcelain") ?? "").split("\n\n")) {
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
  const { doc, rows: all } = await readOrigin();
  let rows = all;
  if (args.only) {
    const task = doc.tasks.find(t => t.id === args.only);
    if (!task) fail(`no task ${args.only} in ${LIST} on origin/main`);
    rows = all.filter(r => relatedTo(task, r.name));
  }
  for (const line of render(rows)) console.log(line);
  printCounts(args.apply ? "APPLY" : "DRY RUN", rows);
  if (!args.apply) return 0;
  const doomed = rows.filter(r => r.action === "delete");
  if (doomed.length > args.max) fail(`${doomed.length} deletions is more than ${args.max}; nothing was deleted. Have the CEO read the dry run, then run again with --max ${doomed.length}`);
  const failed = deleteOnOrigin(doomed);
  console.log(`\ndeleted ${doomed.length - failed.length} of ${doomed.length} on origin`);
  for (const f of failed) console.error(`branch-cleanup: not deleted: ${f}`);
  return failed.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // Cloud sandboxes reach GitHub only through HTTPS_PROXY, which Node's fetch ignores unless NODE_USE_ENV_PROXY=1 (as next-task.mjs).
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== "1") {
    const rerun = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
    process.exit(rerun.status ?? 1);
  }
  main().then(code => process.exit(code), e => fail(e.stack ?? String(e)));
}

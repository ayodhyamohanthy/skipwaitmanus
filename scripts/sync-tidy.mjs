#!/usr/bin/env node
// SYNC-tidy (owner, Nov 27 2026): remove leftover worktrees and local branches that hold nothing unsaved.
//
//   node scripts/sync-tidy.mjs                    # list what can go and what stays (and why); changes nothing
//   node scripts/sync-tidy.mjs --apply            # remove exactly what the list says, re-checking each item first
//   node scripts/sync-tidy.mjs --idle-hours 48    # only touch things unused for at least this long (default 24)
//
// A worktree goes only when it has no uncommitted or untracked file, every commit is on GitHub, it is not locked,
// and it has been idle; `git worktree remove` runs without --force, so git itself refuses anything dirty. A branch
// goes only when every commit is on GitHub, nothing that stays has it checked out, and it has been idle; it is
// deleted with a checked ref update, so a branch that moved meanwhile stays. Nothing on GitHub changes.
// Exit 0: done (or nothing to do). 2: it could not run.
import { execFileSync, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { DEFAULT_IDLE_HOURS, idleHoursOf, parseIdleHours, parseWorktrees, planLocalBranch, planWorktree } from "./syncTidyCore.mjs";

class Stop extends Error {}
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
delete ENV.GIT_INDEX_FILE;
const git = (args, cwd) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const tryGit = (args, cwd) => { try { return git(args, cwd); } catch { return null; } };
const mtime = file => { try { return statSync(file).mtimeMs; } catch { return NaN; } };

function parseArgs(argv) {
  const out = { apply: false, idleHours: DEFAULT_IDLE_HOURS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--idle-hours") { try { out.idleHours = parseIdleHours(argv[++i]); } catch (e) { throw new Stop(e.message); } }
    else throw new Stop(`unknown argument ${a}`);
  }
  return out;
}

/** Commits reachable from `sha` that no origin/* ref has; null when git cannot say. */
const unpushedOf = (sha, top) => {
  const n = tryGit(["rev-list", "--count", sha, "--not", "--remotes=origin"], top);
  return n === null ? null : Number.parseInt(n, 10);
};

/** Facts for one worktree. Its age comes from HEAD and its reflog only: `git status` may rewrite the index. */
function worktreeFacts(w, { mainPath, top, now }) {
  const gitDir = tryGit(["rev-parse", "--absolute-git-dir"], w.path);
  const idleHours = gitDir ? idleHoursOf([mtime(path.join(gitDir, "HEAD")), mtime(path.join(gitDir, "logs", "HEAD"))], now) : 0;
  const status = tryGit(["status", "--porcelain", "--untracked-files=normal"], w.path);
  return {
    path: w.path, branch: w.branch,
    isMain: path.resolve(w.path) === path.resolve(mainPath),
    isCurrent: path.resolve(w.path) === path.resolve(top),
    locked: w.locked,
    files: status === null ? null : status.split("\n").filter(Boolean).length,
    unpushed: w.head ? unpushedOf(w.head, top) : null,
    idleHours,
  };
}

function branchFacts(name, sha, { commonDir, checkedOut, top, now }) {
  const reflog = mtime(path.join(commonDir, "logs", "refs", "heads", ...name.split("/")));
  const committed = Number.parseInt(tryGit(["log", "-1", "--format=%ct", sha], top) ?? "", 10) * 1000;
  return { name, sha, checkedOut: checkedOut.has(name), unpushed: unpushedOf(sha, top), idleHours: idleHoursOf([reflog, Number.isFinite(reflog) ? NaN : committed], now) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const say = line => console.log(line);
  const top = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
  if (!top) throw new Stop("run this inside a git clone");
  const commonDir = path.resolve(top, git(["rev-parse", "--git-common-dir"], top));
  // Fail closed: "on GitHub" is only trustworthy right after a pruning fetch.
  const fetched = spawnSync("git", ["fetch", "-q", "--prune", "origin"], { cwd: top, env: ENV, encoding: "utf8" });
  if (fetched.status !== 0) throw new Stop(`git fetch --prune origin failed, so nothing can be judged safe: ${(fetched.stderr || "").trim().split("\n").at(-1) || `exit ${fetched.status}`}`);
  tryGit(["worktree", "prune"], top);

  const now = Date.now();
  const listed = parseWorktrees(git(["worktree", "list", "--porcelain"], top)).filter(w => !w.bare && !w.prunable);
  const mainPath = listed[0]?.path ?? top;
  const ctx = { mainPath, top, now };
  const trees = listed.map(w => ({ w, facts: worktreeFacts(w, ctx) })).map(t => ({ ...t, plan: planWorktree(t.facts, { minIdleHours: args.idleHours }) }));
  const removable = trees.filter(t => t.plan.action === "remove");
  const kept = trees.filter(t => t.plan.action === "keep");

  const removedPaths = new Set();
  if (args.apply) {
    for (const t of removable) {
      // Re-check right before: an agent may have started using it since the list was made.
      const again = planWorktree(worktreeFacts(t.w, { ...ctx, now: Date.now() }), { minIdleHours: args.idleHours });
      if (again.action !== "remove") { say(`kept worktree ${t.w.path}: ${again.reason}`); continue; }
      const r = spawnSync("git", ["worktree", "remove", t.w.path], { cwd: top, env: ENV, encoding: "utf8" });
      if (r.status === 0) { removedPaths.add(t.w.path); say(`removed worktree ${t.w.path}${t.w.branch ? ` (${t.w.branch})` : ""}`); }
      else say(`kept worktree ${t.w.path}: git refused (${(r.stderr || "").trim().split("\n").at(-1)})`);
    }
  } else for (const t of removable) say(`would remove worktree ${t.w.path}${t.w.branch ? ` (${t.w.branch})` : ""}: ${t.plan.reason}`);

  // A branch checked out in a worktree that stays is kept; one whose worktree goes (or would go) is judged on its own.
  const going = args.apply ? removedPaths : new Set(removable.map(t => t.w.path));
  const checkedOut = new Set(trees.filter(t => !going.has(t.w.path) && t.w.branch).map(t => t.w.branch));
  const refs = git(["for-each-ref", "--format=%(refname:strip=2)%09%(objectname)", "refs/heads"], top).split("\n").filter(Boolean).map(l => l.split("\t"));
  const branches = refs.map(([name, sha]) => {
    const facts = branchFacts(name, sha, { commonDir, checkedOut, top, now });
    return { facts, plan: planLocalBranch(facts, { minIdleHours: args.idleHours }) };
  });
  let deleted = 0;
  for (const b of branches.filter(x => x.plan.action === "delete")) {
    if (!args.apply) { say(`would delete branch ${b.facts.name}: ${b.plan.reason}`); continue; }
    const again = planLocalBranch(branchFacts(b.facts.name, b.facts.sha, { commonDir, checkedOut, top, now: Date.now() }), { minIdleHours: args.idleHours });
    if (again.action !== "delete") { say(`kept branch ${b.facts.name}: ${again.reason}`); continue; }
    if (tryGit(["update-ref", "-d", `refs/heads/${b.facts.name}`, b.facts.sha], top) !== null) { deleted++; say(`deleted branch ${b.facts.name} (it is on GitHub)`); }
    else say(`kept branch ${b.facts.name}: it moved meanwhile`);
  }

  // What stays, unsaved work that looks abandoned first.
  const order = (a, b) => Number(Boolean(b.plan.abandoned)) - Number(Boolean(a.plan.abandoned)) || b.facts.idleHours - a.facts.idleHours;
  for (const t of [...kept].sort(order)) if (!t.facts.isMain && !t.facts.isCurrent) say(`keep worktree ${t.w.path}${t.w.branch ? ` (${t.w.branch})` : " (detached)"}: ${t.plan.reason}`);
  const keptBranches = branches.filter(x => x.plan.action === "keep" && x.plan.reason !== "checked out in a worktree that stays" && x.plan.reason !== "never deleted");
  for (const b of keptBranches) say(`keep branch ${b.facts.name}: ${b.plan.reason}`);

  const deletable = branches.filter(x => x.plan.action === "delete").length;
  if (args.apply) say(`done: removed ${removedPaths.size} worktree(s) and deleted ${deleted} branch(es); nothing on GitHub changed`);
  else if (removable.length || deletable) say(`${removable.length} worktree(s) and ${deletable} branch(es) can go. To remove exactly these, run: node scripts/sync-tidy.mjs --apply${args.idleHours !== DEFAULT_IDLE_HOURS ? ` --idle-hours ${args.idleHours}` : ""}`);
  else say("nothing to remove");
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`sync-tidy: ${error instanceof Stop ? error.message : error?.stack ?? String(error)}`);
  process.exitCode = 2;
}

#!/usr/bin/env node
// SYNC-clone-guard (D-373 (5), D-205) and SYNC-auto-push (D-375): this clone and GitHub stay in sync without
// anyone pushing by hand.
//
//   node scripts/sync-clone.mjs                   # fetch, fast-forward main and branches that are behind, push committed branch work, delete merged branches
//   node scripts/sync-clone.mjs --watch           # SYNC-auto-pull: check GitHub every ~30 s and run that sync whenever something moved
//   node scripts/sync-clone.mjs --dry-run         # print what it would do; only the fetch runs
//   node scripts/sync-clone.mjs --no-publish-new  # report, never publish, a branch that was never pushed
//   node scripts/sync-clone.mjs --current         # push only the checked-out branch (what the post-commit hook runs)
//   node scripts/sync-clone.mjs --install-hook    # push every commit right after it is made (--uninstall-hook removes it)
//   node scripts/sync-clone.mjs --install-timer   # the hook, plus --watch as a service that restarts itself (macOS LaunchAgent,
//                                                 #   Linux systemd user unit or an @reboot crontab line, Windows: printed instructions)
//   node scripts/sync-clone.mjs --uninstall-timer # remove both
//   node scripts/sync-clone.mjs --auto-setup      # what the picker runs on --claim: install whichever is missing (scripts/syncCloneSetup.mjs)
//
// A branch strictly behind its origin branch is fast-forwarded (in its clean worktree, or by a checked ref update
// when no worktree has it); a diverged branch or a dirty worktree is reported and left alone.
// It never pushes main, never force-pushes, never rebases or resets, never commits, stashes, resets or deletes uncommitted work,
// and never publishes a branch named local/*, private/* or wip/*. Local main's own commits are saved to a
// sync/main-<sha> branch instead, for a session to bring in through a queue row (D-166). A branch whose new
// commits add a sensitive file or a likely secret is reported instead of pushed (D-059: this repository is public).
// Exit 0: in sync. 1: something is left for a person (each item is listed). 2: it could not run.
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addedLines, exitCodeOf, findSensitive, planBranch, planMain, pullMethod, sideBranchForMain, watchInterval, watchLoop } from "./syncCloneCore.mjs";
import { autoSetup, hook, selfUpgrade, timer } from "./syncCloneSetup.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLEANUP = path.join(HERE, "branch-cleanup.mjs");
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const LOCK_WAIT_MS = 120_000, LOCK_STALE_MS = 600_000;

class Stop extends Error {}
/** git's own last error lines (never a URL's credentials), so a failed fetch says why instead of guessing "offline". */
const gitError = r => {
  const lines = String(r.stderr || "").split("\n").map(l => l.replace(/\/\/[^/@\s]+@/g, "//").trim()).filter(Boolean);
  return lines.length ? lines.slice(-3).join(" | ") : r.error ? String(r.error.message) : `exit ${r.status}`;
};
// A background run must never wait on a credential prompt: it fails and reports instead.
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
delete ENV.GIT_INDEX_FILE;
const git = (args, cwd) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const tryGit = (args, cwd) => { try { return git(args, cwd); } catch { return null; } };
const isAncestor = (a, b, cwd) => spawnSync("git", ["merge-base", "--is-ancestor", a, b], { cwd, env: ENV, stdio: "ignore" }).status === 0;
const haveCommit = (sha, cwd) => spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd, env: ENV, stdio: "ignore" }).status === 0;

const MODES = { "--watch": "watch", "--install-timer": "install", "--uninstall-timer": "uninstall", "--install-hook": "hook", "--uninstall-hook": "unhook", "--auto-setup": "auto", "--current": "current" };
function parseArgs(argv) {
  const out = { dryRun: false, publishNew: true, timestamps: false, mode: "sync" };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-publish-new") out.publishNew = false;
    else if (a === "--timestamps") out.timestamps = true;
    else if (MODES[a]) {
      if (out.mode !== "sync" && out.mode !== MODES[a]) throw new Stop(`${a} cannot be combined with another mode`);
      out.mode = MODES[a];
    } else throw new Stop(`unknown argument ${a}`);
  }
  return out;
}

/** One sync run at a time per clone: the post-commit hook and the timer may fire together. */
function withLock(top, fn) {
  const lock = path.join(path.resolve(top, git(["rev-parse", "--git-common-dir"], top)), "skipwait-sync-clone.lock");
  const until = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try { closeSync(openSync(lock, "wx")); break; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      let age = 0;
      try { age = Date.now() - statSync(lock).mtimeMs; } catch { continue; }
      if (age > LOCK_STALE_MS) { rmSync(lock, { force: true }); continue; }
      if (Date.now() > until) throw new Stop("another sync run still holds this clone's lock; the next commit or timer run retries");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  try { return fn(); } finally { rmSync(lock, { force: true }); }
}

/** Every worktree of this clone: its path, its branch (null when detached) and whether it has uncommitted changes. */
function worktrees(top) {
  const listed = tryGit(["worktree", "list", "--porcelain"], top);
  if (listed === null) throw new Stop("cannot list this clone's worktrees (git worktree list failed)");
  return listed.split("\n\n").flatMap(block => {
    const where = /^worktree (.+)$/m.exec(block)?.[1];
    if (!where || /^prunable/m.test(block)) return [];
    try { statSync(where); } catch { return []; }
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
    const status = tryGit(["status", "--porcelain"], where);
    const files = status === null ? null : status.split("\n").filter(Boolean).length;
    return [{ path: where, branch, files }];
  });
}

/** What a push of `tip` would send, judged for secrets: the commits since `base`. */
function sensitiveFor(base, tip, top) {
  const files = (tryGit(["diff", "--name-only", base, tip], top) ?? "").split("\n").filter(Boolean);
  const diff = tryGit(["diff", "-U0", "--no-color", base, tip], top) ?? "";
  return findSensitive({ files, added: addedLines(diff) });
}

const branchLine = line => {
  const [name, sha, upstream = "", track = ""] = line.split("\t");
  return { name, sha, upstream: upstream || null, upstreamGone: track.includes("gone") };
};
const BRANCH_FORMAT = "--format=%(refname:strip=2)%09%(objectname)%09%(upstream:short)%09%(upstream:track)";

function facts(top) {
  const originMain = tryGit(["rev-parse", "--verify", "refs/remotes/origin/main"], top);
  if (!originMain) throw new Stop("this clone has no origin/main after the fetch");
  const remotes = new Map(git(["for-each-ref", "--format=%(refname:strip=3)%09%(objectname)", "refs/remotes/origin"], top)
    .split("\n").filter(Boolean).map(line => line.split("\t")).filter(([name]) => name && name !== "HEAD"));
  const branches = git(["for-each-ref", BRANCH_FORMAT, "refs/heads"], top).split("\n").filter(Boolean).map(branchLine)
    .map(b => ({ ...b, remoteSha: remotes.get(b.name) ?? null }));
  return { originMain, remotes, trees: worktrees(top), branches };
}

/** Plan one branch and push it when the rules allow. `src` is what the push sends (a ref or a SHA). */
function pushBranch(top, b, { src, setUpstream, base, inMain, tree = null }, args, say, out) {
  const remoteIsAncestor = b.remoteSha ? isAncestor(b.remoteSha, b.sha, top) : false;
  const localIsAncestor = b.remoteSha && b.remoteSha !== b.sha && !remoteIsAncestor ? isAncestor(b.sha, b.remoteSha, top) : false;
  const wouldSend = b.remoteSha !== b.sha && !inMain && (!b.remoteSha || remoteIsAncestor);
  const plan = planBranch({ ...b, inMain, remoteIsAncestor, localIsAncestor, sensitive: wouldSend ? sensitiveFor(b.remoteSha ?? base, b.sha, top) : [] }, { publishNew: args.publishNew });
  if (plan.action === "report") out.reports.push(`${b.name}: ${plan.reason}`);
  if (plan.action === "pull") return pullBranch(top, b, tree, args, say, out, plan);
  if (plan.action !== "push") return plan;
  if (args.dryRun) { say(`would push ${b.name} (${plan.reason})`); return plan; }
  const pushed = spawnSync("git", ["push", "-q", ...(setUpstream ? ["-u"] : []), "origin", `${src}:refs/heads/${b.name}`], { cwd: top, env: ENV, encoding: "utf8" });
  if (pushed.status === 0) say(`pushed ${b.name} (${plan.reason})`);
  else out.failures.push(`${b.name}: push refused (${(pushed.stderr || "").trim().split("\n").at(-1) || `exit ${pushed.status}`}); nothing was forced`);
  return plan;
}

/**
 * SYNC-auto-pull: a branch strictly behind origin moves to origin's tip the way main does. Never a rebase, reset,
 * force or merge commit; a dirty worktree is reported and untouched.
 */
function pullBranch(top, b, tree, args, say, out, plan) {
  const how = pullMethod({ worktree: tree?.path ?? null, worktreeDirty: Boolean(tree && (tree.files === null || tree.files > 0)) });
  if (how.action === "report") { out.reports.push(`${b.name}: ${how.reason}`); return { action: "report", reason: how.reason }; }
  const step = `${b.name}: ${b.sha.slice(0, 8)} -> ${b.remoteSha.slice(0, 8)}`;
  if (args.dryRun) { say(`would fast-forward ${step} (behind origin)`); return plan; }
  const ok = how.action === "merge"
    ? tryGit(["merge", "-q", "--ff-only", b.remoteSha], tree.path) !== null
    : tryGit(["update-ref", `refs/heads/${b.name}`, b.remoteSha, b.sha], top) !== null;
  if (ok) say(`fast-forwarded ${step} (behind origin)`);
  else out.failures.push(`${b.name}: the fast-forward was refused; nothing was forced`);
  return plan;
}

/** A local branch other than main: pushed to its own name on origin, or fast-forwarded when it is behind; never forced. */
function syncBranch(top, b, originMain, args, say, out, tree = null) {
  const base = (originMain && tryGit(["merge-base", originMain, b.sha], top)) ?? originMain ?? EMPTY_TREE;
  const inMain = originMain ? isAncestor(b.sha, originMain, top) : false;
  return pushBranch(top, b, { src: `refs/heads/${b.name}`, setUpstream: !b.upstream, base, inMain, tree }, args, say, out);
}

/** SYNC-auto-push (D-375): local main's own commits are saved on origin as sync/main-<sha>; main itself never is. */
function saveMain(top, local, originMain, remoteOf, args, say, out) {
  const own = (tryGit(["rev-list", "--reverse", local, `^${originMain}`], top) ?? "").split("\n").filter(Boolean);
  if (!own.length) return;
  const name = sideBranchForMain(own[0]);
  const b = { name, sha: local, upstream: null, upstreamGone: false, remoteSha: remoteOf(name) };
  const before = out.failures.length;
  const plan = pushBranch(top, b, { src: local, setUpstream: false, base: originMain, inMain: false }, args, say, out);
  const saved = plan.action === "none" ? "already saved" : plan.action === "push" && out.failures.length === before ? (args.dryRun ? "would be saved" : "saved") : null;
  if (saved) out.reports.push(`main: its ${own.length} local commit(s) are ${saved} on origin as ${name}; main itself is never pushed. Ask a session to bring them in through a queue row and pull request (D-166).`);
}

function sync(top, args, say) {
  const fetched = spawnSync("git", ["fetch", "-q", "--prune", "origin"], { cwd: top, env: ENV, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (fetched.status !== 0) throw new Stop(`git fetch --prune origin failed: ${gitError(fetched)}`);
  say("fetched origin (gone branches pruned)");
  const { originMain, remotes, trees, branches } = facts(top);
  const out = { reports: [], failures: [] };
  const dirty = trees.filter(t => t.files === null || t.files > 0);

  const localMain = branches.find(b => b.name === "main") ?? null;
  const mainTree = trees.find(t => t.branch === "main") ?? null;
  const localIsAncestor = localMain ? isAncestor(localMain.sha, originMain, top) : false;
  const main = planMain({
    local: localMain?.sha ?? null, origin: originMain, localIsAncestor,
    worktree: mainTree?.path ?? null, worktreeDirty: Boolean(mainTree && (mainTree.files === null || mainTree.files > 0)),
  });
  if (main.action === "report") {
    out.reports.push(`main: ${main.reason}`);
    if (!localIsAncestor) saveMain(top, localMain.sha, originMain, name => remotes.get(name) ?? null, args, say, out);
  } else if (main.action !== "none") {
    if (args.dryRun) say(`main: would fast-forward ${localMain.sha.slice(0, 8)} -> ${originMain.slice(0, 8)}`);
    else {
      const ok = main.action === "merge"
        ? tryGit(["merge", "-q", "--ff-only", "refs/remotes/origin/main"], mainTree.path) !== null
        : tryGit(["update-ref", "refs/heads/main", originMain, localMain.sha], top) !== null;
      if (ok) say(`main: fast-forwarded ${localMain.sha.slice(0, 8)} -> ${originMain.slice(0, 8)}`);
      else out.failures.push("main: the fast-forward was refused");
    }
  } else say(`main: ${main.reason}`);

  for (const b of branches.filter(x => x.name !== "main")) syncBranch(top, b, originMain, args, say, out, trees.find(t => t.branch === b.name) ?? null);

  if (!args.dryRun) {
    tryGit(["worktree", "prune"], top);
    const cleanup = spawnSync(process.execPath, [CLEANUP, "--local"], { cwd: top, env: ENV, encoding: "utf8" });
    const line = (cleanup.stdout || "").split("\n").find(l => l.startsWith("LOCAL:"));
    if (cleanup.status === 0) say(line ? `cleanup: ${line.replace(/^LOCAL:\s*/, "")}` : "cleanup: nothing to delete");
    else out.failures.push(`cleanup: branch-cleanup --local exited ${cleanup.status}${line ? ` (${line})` : ""}`);
  } else say("would run: git worktree prune; node scripts/branch-cleanup.mjs --local");

  for (const t of dirty) out.reports.push(`uncommitted: ${t.path} (${t.branch ?? "detached"}): ${t.files === null ? "status unreadable" : `${t.files} file(s)`}, left untouched`);
  return finish(out, say);
}

function finish(out, say) {
  for (const r of out.reports) say(`left for you: ${r}`);
  for (const f of out.failures) say(`failed: ${f}`);
  const code = exitCodeOf({ reports: out.reports, dirty: [], failures: out.failures });
  say(code === 0 ? "in sync" : "not fully in sync: see the lines above");
  return code;
}

/** origin's tip of one branch, fetched when this clone lacks it; null when origin has no such branch. */
function remoteTipOf(top, name) {
  const listed = tryGit(["ls-remote", "--heads", "origin", `refs/heads/${name}`], top);
  if (listed === null) throw new Stop("origin is unreachable (offline?); the next commit or the timer retries");
  const tip = /^([0-9a-f]{40})\s/.exec(listed)?.[1] ?? null;
  if (tip && !haveCommit(tip, top)) tryGit(["fetch", "-q", "origin", `+refs/heads/${name}:refs/remotes/origin/${name}`], top);
  return tip;
}

/** --current (the post-commit hook): push only the checked-out branch, by the same rules as a full run. */
function current(top, args, say) {
  const name = tryGit(["symbolic-ref", "-q", "--short", "HEAD"], top);
  if (!name) { say("current: detached HEAD, nothing to push"); return 0; }
  const out = { reports: [], failures: [] };
  if (name === "main") {
    if (tryGit(["fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main"], top) === null) throw new Stop("git fetch origin main failed (offline?); the next commit or the timer retries");
    const local = git(["rev-parse", "refs/heads/main"], top), originMain = git(["rev-parse", "refs/remotes/origin/main"], top);
    if (isAncestor(local, originMain, top)) say("main: nothing of its own to save");
    else saveMain(top, local, originMain, n => remoteTipOf(top, n), args, say, out);
    return finish(out, say);
  }
  const b = branchLine(git(["for-each-ref", BRANCH_FORMAT, `refs/heads/${name}`], top));
  const remoteSha = remoteTipOf(top, name);
  // A configured upstream that origin no longer has: its pull request probably merged and the branch was deleted.
  const branch = { ...b, remoteSha, upstreamGone: b.upstreamGone || (b.upstream === `origin/${name}` && remoteSha === null) };
  const tree = worktrees(top).find(t => t.branch === name) ?? null;
  const plan = syncBranch(top, branch, tryGit(["rev-parse", "--verify", "-q", "refs/remotes/origin/main"], top), args, say, out, tree);
  if (plan.action === "none") say(`${name}: ${plan.reason}`);
  return finish(out, say);
}

/** Lines a watched sync always logs; "left for you" lines only when they differ from the previous sync's. */
const QUIET = [/^fetched origin/, /^main: up to date$/, /^cleanup: nothing to delete$/, /^cleanup: deleted 0 of /, /^in sync$/, /^not fully in sync/];

/** --watch (SYNC-auto-pull): poll origin and run the full sync whenever something this clone cares about moved. */
async function watch(top, args, say) {
  const optedOut = () => process.env.SKIPWAIT_AUTO_SYNC === "off" || tryGit(["config", "--bool", "--get", "skipwait.autoSync"], top) === "false";
  if (optedOut()) { say("watch: off (git config skipwait.autoSync false or SKIPWAIT_AUTO_SYNC=off)"); return 0; }
  // One watcher per clone: a second one (a reinstall, an @reboot line plus a manual start) exits quietly.
  const pidFile = path.join(path.resolve(top, git(["rev-parse", "--git-common-dir"], top)), "skipwait-sync-watch.pid");
  try {
    const other = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
    if (other && other !== process.pid) { process.kill(other, 0); say(`watch: already running for this clone (pid ${other})`); return 0; }
  } catch { /* no pid file, or that process is gone */ }
  writeFileSync(pidFile, String(process.pid));
  const interval = watchInterval(tryGit(["config", "--get", "skipwait.syncInterval"], top));
  const refsOf = prefix => git(["for-each-ref", "--format=%(refname:strip=" + (prefix === "refs/heads" ? 2 : 3) + ")%09%(objectname)", prefix], top)
    .split("\n").filter(Boolean).map(line => line.split("\t"));
  let lastReports = "";
  say(`watch: checking origin every ${interval} s (git config skipwait.syncInterval <seconds> changes it)`);
  // SKIPWAIT_WATCH_ROUNDS bounds the loop (tests and one-off checks); unset, it runs until stopped.
  const bound = Number.parseInt(process.env.SKIPWAIT_WATCH_ROUNDS ?? "", 10);
  const result = await watchLoop({
    interval,
    ...(bound > 0 ? { rounds: bound } : {}),
    lsRemote: () => {
      const r = spawnSync("git", ["ls-remote", "--heads", "origin"], { cwd: top, env: ENV, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
      return r.status === 0 ? r.stdout : null;
    },
    readClone: () => {
      const heads = refsOf("refs/heads");
      return {
        trackingRefs: new Map(refsOf("refs/remotes/origin").filter(([name]) => name !== "HEAD")),
        localBranches: heads.map(([name]) => name),
        localStamp: heads.map(row => row.join(" ")).join("\n"),
      };
    },
    sync: () => {
      const lines = [];
      let code;
      try { code = withLock(top, () => sync(top, args, line => lines.push(line))); }
      catch (error) { lines.push(`sync could not run: ${error instanceof Stop ? error.message : String(error?.message ?? error)}`); code = 2; }
      const reports = lines.filter(l => l.startsWith("left for you:")).join("\n");
      for (const l of lines) {
        if (QUIET.some(re => re.test(l))) continue;
        if (l.startsWith("left for you:") && reports === lastReports) continue;
        say(l);
      }
      lastReports = reports;
      say(code === 0 ? "in sync" : code === 2 ? "sync failed; retrying with backoff" : "in sync except what is left for you above");
      return code;
    },
    sleep: seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000)),
    now: () => Date.now(),
    log: say,
    stopped: optedOut,
  });
  try { if (readFileSync(pidFile, "utf8") === String(process.pid)) rmSync(pidFile, { force: true }); } catch { /* already gone */ }
  say(`watch: stopped after ${result.rounds} checks and ${result.syncs} syncs`);
  return 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const say = line => console.log(args.timestamps ? `${new Date().toISOString()} ${line}` : line);
  const top = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
  if (!top) throw new Stop("run this inside a git clone");
  switch (args.mode) {
    case "install": case "uninstall": return timer(top, args.mode === "install", say);
    case "hook": case "unhook": return hook(top, args.mode === "hook", say);
    case "auto": return autoSetup(top, say);
    case "current": return withLock(top, () => current(top, args, say));
    case "watch": return watch(top, args, say);
    default: {
      const code = withLock(top, () => sync(top, args, say));
      if (!args.dryRun && selfUpgrade(top)) say("automatic sync: upgrading the 15-minute timer to the ~30 s watcher");
      return code;
    }
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`sync-clone: ${error instanceof Stop ? error.message : error?.stack ?? String(error)}`);
  process.exitCode = 2;
}

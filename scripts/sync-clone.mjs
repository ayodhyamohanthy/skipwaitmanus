#!/usr/bin/env node
// SYNC-clone-guard (D-373 (5), D-205): one command keeps this clone and GitHub in sync.
//
//   node scripts/sync-clone.mjs                   # fetch, fast-forward main, push committed branch work, delete merged branches
//   node scripts/sync-clone.mjs --dry-run         # print what it would do; only the fetch runs
//   node scripts/sync-clone.mjs --no-publish-new  # report, never publish, a branch that was never pushed
//   node scripts/sync-clone.mjs --install-timer   # macOS: run it every 15 minutes (a user LaunchAgent); elsewhere prints a cron line
//   node scripts/sync-clone.mjs --uninstall-timer # remove that LaunchAgent
//
// It never pushes main, never force-pushes, never commits, stashes, resets or deletes uncommitted work,
// and never publishes a branch named local/*, private/* or wip/*. A branch whose new commits add a
// sensitive file or a likely secret is reported instead of pushed (D-059: this repository is public).
// Exit 0: in sync. 1: something is left for a person (each item is listed). 2: it could not run.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addedLines, exitCodeOf, findSensitive, planBranch, planMain } from "./syncCloneCore.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLEANUP = path.join(HERE, "branch-cleanup.mjs");
const LABEL = "me.skipwait.sync-clone";
const INTERVAL_SECONDS = 900;

class Stop extends Error {}
// A background run must never wait on a credential prompt: it fails and reports instead.
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
const git = (args, cwd) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const tryGit = (args, cwd) => { try { return git(args, cwd); } catch { return null; } };
const isAncestor = (a, b, cwd) => spawnSync("git", ["merge-base", "--is-ancestor", a, b], { cwd, env: ENV, stdio: "ignore" }).status === 0;

function parseArgs(argv) {
  const out = { dryRun: false, publishNew: true, timestamps: false, install: false, uninstall: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-publish-new") out.publishNew = false;
    else if (a === "--timestamps") out.timestamps = true;
    else if (a === "--install-timer") out.install = true;
    else if (a === "--uninstall-timer") out.uninstall = true;
    else throw new Stop(`unknown argument ${a}`);
  }
  if (out.install && out.uninstall) throw new Stop("--install-timer and --uninstall-timer run on their own");
  return out;
}

/** Every worktree of this clone: its path, its branch (null when detached) and whether it has uncommitted changes. */
function worktrees(top) {
  const listed = tryGit(["worktree", "list", "--porcelain"], top);
  if (listed === null) throw new Stop("cannot list this clone's worktrees (git worktree list failed)");
  return listed.split("\n\n").flatMap(block => {
    const where = /^worktree (.+)$/m.exec(block)?.[1];
    if (!where || /^prunable/m.test(block) || !existsSync(where)) return [];
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

function facts(top) {
  const originMain = tryGit(["rev-parse", "--verify", "refs/remotes/origin/main"], top);
  if (!originMain) throw new Stop("this clone has no origin/main after the fetch");
  const remotes = new Map(git(["for-each-ref", "--format=%(refname:strip=3)%09%(objectname)", "refs/remotes/origin"], top)
    .split("\n").filter(Boolean).map(line => line.split("\t")).filter(([name]) => name && name !== "HEAD"));
  const trees = worktrees(top);
  const branches = git(["for-each-ref", "--format=%(refname:strip=2)%09%(objectname)%09%(upstream:short)%09%(upstream:track)", "refs/heads"], top)
    .split("\n").filter(Boolean).map(line => {
      const [name, sha, upstream = "", track = ""] = line.split("\t");
      return { name, sha, upstream: upstream || null, upstreamGone: track.includes("gone"), remoteSha: remotes.get(name) ?? null };
    });
  return { originMain, trees, branches };
}

function sync(top, args, say) {
  if (tryGit(["fetch", "-q", "--prune", "origin"], top) === null) throw new Stop("git fetch origin failed (offline, or origin is unreachable)");
  say("fetched origin (gone branches pruned)");
  const { originMain, trees, branches } = facts(top);
  const reports = [], failures = [];
  const dirty = trees.filter(t => t.files === null || t.files > 0);

  const localMain = branches.find(b => b.name === "main") ?? null;
  const mainTree = trees.find(t => t.branch === "main") ?? null;
  const main = planMain({
    local: localMain?.sha ?? null, origin: originMain,
    localIsAncestor: localMain ? isAncestor(localMain.sha, originMain, top) : false,
    worktree: mainTree?.path ?? null, worktreeDirty: Boolean(mainTree && (mainTree.files === null || mainTree.files > 0)),
  });
  if (main.action === "report") reports.push(`main: ${main.reason}`);
  else if (main.action !== "none") {
    if (args.dryRun) say(`main: would fast-forward ${localMain.sha.slice(0, 8)} -> ${originMain.slice(0, 8)}`);
    else {
      const ok = main.action === "merge"
        ? tryGit(["merge", "-q", "--ff-only", "refs/remotes/origin/main"], mainTree.path) !== null
        : tryGit(["update-ref", "refs/heads/main", originMain, localMain.sha], top) !== null;
      if (ok) say(`main: fast-forwarded ${localMain.sha.slice(0, 8)} -> ${originMain.slice(0, 8)}`);
      else failures.push("main: the fast-forward was refused");
    }
  } else say(`main: ${main.reason}`);

  for (const b of branches.filter(x => x.name !== "main")) {
    const base = b.remoteSha ?? tryGit(["merge-base", originMain, b.sha], top) ?? originMain;
    const inMain = isAncestor(b.sha, originMain, top);
    const remoteIsAncestor = b.remoteSha ? isAncestor(b.remoteSha, b.sha, top) : false;
    const wouldSend = b.remoteSha !== b.sha && !inMain && (!b.remoteSha || remoteIsAncestor);
    const plan = planBranch({ ...b, inMain, remoteIsAncestor, sensitive: wouldSend ? sensitiveFor(base, b.sha, top) : [] }, { publishNew: args.publishNew });
    if (plan.action === "report") reports.push(`${b.name}: ${plan.reason}`);
    if (plan.action !== "push") continue;
    if (args.dryRun) { say(`would push ${b.name} (${plan.reason})`); continue; }
    const pushArgs = ["push", "-q", ...(b.upstream ? [] : ["-u"]), "origin", `refs/heads/${b.name}:refs/heads/${b.name}`];
    const pushed = spawnSync("git", pushArgs, { cwd: top, env: ENV, encoding: "utf8" });
    if (pushed.status === 0) say(`pushed ${b.name} (${plan.reason})`);
    else failures.push(`${b.name}: push refused (${(pushed.stderr || "").trim().split("\n").at(-1) || `exit ${pushed.status}`}); nothing was forced`);
  }

  if (!args.dryRun) {
    tryGit(["worktree", "prune"], top);
    const cleanup = spawnSync(process.execPath, [CLEANUP, "--local"], { cwd: top, env: ENV, encoding: "utf8" });
    const line = (cleanup.stdout || "").split("\n").find(l => l.startsWith("LOCAL:"));
    if (cleanup.status === 0) say(line ? `cleanup: ${line.replace(/^LOCAL:\s*/, "")}` : "cleanup: nothing to delete");
    else failures.push(`cleanup: branch-cleanup --local exited ${cleanup.status}${line ? ` (${line})` : ""}`);
  } else say("would run: git worktree prune; node scripts/branch-cleanup.mjs --local");

  for (const t of dirty) reports.push(`uncommitted: ${t.path} (${t.branch ?? "detached"}): ${t.files === null ? "status unreadable" : `${t.files} file(s)`}, left untouched`);
  for (const r of reports) say(`left for you: ${r}`);
  for (const f of failures) say(`failed: ${f}`);
  const code = exitCodeOf({ reports, dirty: [], failures });
  say(code === 0 ? "in sync" : "not fully in sync: see the lines above");
  return code;
}

const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function timer(top, install, say) {
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
  const log = path.join(os.homedir(), "Library", "Logs", "skipwait-sync-clone.log");
  const script = path.join(HERE, "sync-clone.mjs");
  if (process.platform !== "darwin") {
    say(install ? "automatic sync on this system: add this line with `crontab -e`:" : "remove the sync line with `crontab -e`.");
    if (install) say(`*/15 * * * * cd ${JSON.stringify(top)} && ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} --timestamps >> "$HOME/.skipwait-sync-clone.log" 2>&1`);
    return 0;
  }
  spawnSync("launchctl", ["unload", plist], { stdio: "ignore" });
  if (!install) {
    rmSync(plist, { force: true });
    say(`automatic sync removed (${plist})`);
    return 0;
  }
  mkdirSync(path.dirname(plist), { recursive: true });
  mkdirSync(path.dirname(log), { recursive: true });
  const pathEnv = [path.dirname(process.execPath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":");
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(script)}</string><string>--timestamps</string></array>
  <key>WorkingDirectory</key><string>${xml(top)}</string>
  <key>StartInterval</key><integer>${INTERVAL_SECONDS}</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(pathEnv)}</string></dict>
</dict>
</plist>
`);
  const loaded = spawnSync("launchctl", ["load", "-w", plist], { encoding: "utf8" });
  if (loaded.status !== 0) { say(`wrote ${plist}, but launchctl load failed: ${(loaded.stderr || "").trim()}`); return 1; }
  say(`automatic sync on: every ${INTERVAL_SECONDS / 60} minutes for ${top}; log ${log}; remove with --uninstall-timer`);
  return 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const say = line => console.log(args.timestamps ? `${new Date().toISOString()} ${line}` : line);
  const top = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
  if (!top) throw new Stop("run this inside a git clone");
  if (args.install || args.uninstall) return timer(top, args.install, say);
  return sync(top, args, say);
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`sync-clone: ${error instanceof Stop ? error.message : error?.stack ?? String(error)}`);
  process.exitCode = 2;
}

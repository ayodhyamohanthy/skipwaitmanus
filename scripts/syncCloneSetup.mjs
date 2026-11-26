// SYNC-auto-push (D-375): what makes a clone push on its own, installed once and then left alone.
//   - the post-commit hook (any OS): every commit is pushed to its own branch right after it is made;
//   - the 15-minute timer (macOS LaunchAgent; elsewhere a cron line to add): the full two-way sync;
//   - --auto-setup, run by the picker on every --claim: installs whichever of the two is missing, never in CI,
//     a test run or a cloud session container, never over another tool's hook, and never once a person opted out
//     (`git config skipwait.autoSync false` in the clone, or SKIPWAIT_AUTO_SYNC=off).
// The sync rules themselves live in scripts/syncCloneCore.mjs; the runs in scripts/sync-clone.mjs.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_MARKER, autoSetupAllowed, hookScript, planHook } from "./syncCloneCore.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABEL = "me.skipwait.sync-clone";
const INTERVAL_SECONDS = 900;
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
const tryGit = (args, cwd) => {
  try { return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { return null; }
};
const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plistPath = () => path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

/** The clone's main worktree (the first one git lists): a linked worktree may be removed, the main one stays. */
function mainWorktree(top) {
  const first = /^worktree (.+)$/m.exec(tryGit(["worktree", "list", "--porcelain"], top) ?? "")?.[1];
  return first && existsSync(first) ? first : top;
}

/** The sync script a hook or timer should run: the main worktree's copy when it has one, else this one. */
function stableScript(top) {
  const inMain = path.join(mainWorktree(top), "scripts", "sync-clone.mjs");
  return existsSync(inMain) ? inMain : path.join(HERE, "sync-clone.mjs");
}

function hookState(top) {
  const common = tryGit(["rev-parse", "--git-common-dir"], top);
  if (!common) return null;
  const file = path.join(path.resolve(top, common), "hooks", "post-commit");
  return { file, existing: existsSync(file) ? readFileSync(file, "utf8") : null, hooksPathSet: tryGit(["config", "--get", "core.hooksPath"], top) !== null };
}

/** --install-hook / --uninstall-hook. Exit 0 when done or nothing to do, 1 when another tool's hook is in the way. */
export function hook(top, install, say) {
  const state = hookState(top);
  if (!state) { say("cannot find this clone's git folder"); return 1; }
  const plan = planHook({ ...state, install });
  if (plan.action === "report") { say(`auto-push hook not installed: ${plan.reason}`); return 1; }
  if (plan.action === "remove") { rmSync(state.file, { force: true }); say(`auto-push hook removed (${state.file})`); return 0; }
  if (plan.action === "none") { say(`auto-push hook: ${plan.reason}`); return 0; }
  const text = hookScript({ node: process.execPath, scripts: [path.join(HERE, "sync-clone.mjs"), stableScript(top)] });
  mkdirSync(path.dirname(state.file), { recursive: true });
  writeFileSync(state.file, text);
  chmodSync(state.file, 0o755);
  say(`auto-push on: every commit in this clone is pushed to its own branch right after it is made (never main, never force); log <git dir>/skipwait-sync-clone.log; remove with --uninstall-hook`);
  return 0;
}

/** --install-timer / --uninstall-timer: the 15-minute full sync, plus the hook (one command turns both on or off). */
export function timer(top, install, say) {
  const hookCode = hook(top, install, say);
  return Math.max(hookCode, launchAgent(top, install, say));
}

/** The 15-minute full sync alone: a user LaunchAgent on macOS, a printed cron line elsewhere. */
function launchAgent(top, install, say) {
  const runIn = mainWorktree(top);
  const script = stableScript(top);
  if (process.platform !== "darwin") {
    say(install ? "automatic full sync on this system: add this line with `crontab -e`:" : "remove the sync line with `crontab -e`.");
    if (install) say(`*/15 * * * * cd ${JSON.stringify(runIn)} && ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} --timestamps >> "$HOME/.skipwait-sync-clone.log" 2>&1`);
    return 0;
  }
  const plist = plistPath();
  const log = path.join(os.homedir(), "Library", "Logs", "skipwait-sync-clone.log");
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
  <key>WorkingDirectory</key><string>${xml(runIn)}</string>
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
  say(`automatic sync on: every ${INTERVAL_SECONDS / 60} minutes for ${runIn}; log ${log}; remove with --uninstall-timer`);
  return 0;
}

/**
 * --auto-setup: the picker runs this on every --claim. Silent when everything is already in place or setup is
 * not allowed here; one line per thing it installs. An existing hook of ours is left as it is (only an explicit
 * --install-hook refreshes it), and a timer already installed for any clone is never re-pointed.
 */
export function autoSetup(top, say, env = process.env) {
  const optedOut = tryGit(["config", "--bool", "--get", "skipwait.autoSync"], top) === "false";
  if (!autoSetupAllowed({ env, optedOut }).allowed) return 0;
  const state = hookState(top);
  let code = 0;
  if (state && !(state.existing ?? "").includes(HOOK_MARKER)) {
    code = hook(top, true, say);
    if (code !== 0) say("turn this message off with: git config skipwait.autoSync false");
  }
  if (process.platform === "darwin" && !existsSync(plistPath())) code = Math.max(code, launchAgent(top, true, say));
  return code;
}

// SYNC-auto-push (D-375): what makes a clone push on its own, installed once and then left alone.
//   - the post-commit hook (any OS): every commit is pushed to its own branch right after it is made;
//   - the watcher (SYNC-auto-pull): `sync-clone.mjs --watch` as a service that restarts itself, so the clone pulls
//     within about 30 seconds of a change on GitHub (macOS LaunchAgent; Linux systemd user unit, else an @reboot
//     crontab line; Windows prints what to run). It replaces the old 15-minute timer, which is upgraded in place;
//   - --auto-setup, run by the picker on every --claim: installs whichever of the two is missing (the watcher only on
//     macOS; on Linux --install-timer installs it, so a test run never touches the machine's services), never in CI,
//     a test run or a cloud session container, never over another tool's hook, and never once a person opted out
//     (`git config skipwait.autoSync false` in the clone, or SKIPWAIT_AUTO_SYNC=off).
// The sync rules themselves live in scripts/syncCloneCore.mjs; the runs in scripts/sync-clone.mjs.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_MARKER, autoSetupAllowed, hookScript, planHook } from "./syncCloneCore.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABEL = "me.skipwait.sync-clone";
const UNIT = "skipwait-sync-clone.service";
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

/** --install-timer / --uninstall-timer: the watcher service, plus the hook (one command turns both on or off). */
export function timer(top, install, say) {
  const hookCode = hook(top, install, say);
  if (process.platform === "darwin") return Math.max(hookCode, launchAgent(top, install, say));
  if (process.platform === "linux") return Math.max(hookCode, linuxService(top, install, say));
  say(install ? `automatic pull on this system: start this at sign-in (for example with Task Scheduler) and keep it running: cd ${JSON.stringify(mainWorktree(top))} && ${JSON.stringify(process.execPath)} ${JSON.stringify(stableScript(top))} --watch --timestamps` : "remove the sign-in task that runs sync-clone.mjs --watch.");
  return hookCode;
}

const ok = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", timeout: 30_000 });

/** Linux: a systemd user unit when the user session has systemd, else an @reboot crontab line started now too. */
function linuxService(top, install, say) {
  const runIn = mainWorktree(top), script = stableScript(top);
  const unitDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "systemd", "user");
  const unitFile = path.join(unitDir, UNIT);
  const systemd = ok("systemctl", ["--user", "show-environment"]).status === 0;
  if (!install) {
    if (systemd) ok("systemctl", ["--user", "disable", "--now", UNIT]);
    rmSync(unitFile, { force: true });
    const table = ok("crontab", ["-l"]);
    const without = table.status === 0 ? crontabWithout(table.stdout) : null;
    if (without !== null) spawnSync("crontab", ["-"], { input: without, encoding: "utf8" });
    say("automatic pull removed (systemd user unit and crontab line); a watcher already running stops at its next check once skipwait.autoSync is false, or at the next restart");
    return 0;
  }
  const log = path.join(os.homedir(), ".skipwait-sync-clone.log");
  if (systemd) {
    mkdirSync(unitDir, { recursive: true });
    writeFileSync(unitFile, `[Unit]\nDescription=SkipWait clone sync watcher (sync-clone.mjs --watch)\n\n[Service]\nWorkingDirectory=${runIn}\nExecStart=${process.execPath} ${script} --watch --timestamps\nRestart=on-failure\nRestartSec=30\nStandardOutput=append:${log}\nStandardError=append:${log}\n\n[Install]\nWantedBy=default.target\n`);
    const started = ok("systemctl", ["--user", "daemon-reload"]).status === 0 && ok("systemctl", ["--user", "enable", "--now", UNIT]).status === 0;
    if (!started) { say(`wrote ${unitFile}, but systemctl --user could not start it`); return 1; }
    say(`automatic pull on: ${UNIT} checks GitHub every ~30 s for ${runIn}; log ${log}; remove with --uninstall-timer`);
    return 0;
  }
  const line = `@reboot cd ${JSON.stringify(runIn)} && ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} --watch --timestamps >> "$HOME/.skipwait-sync-clone.log" 2>&1`;
  const table = ok("crontab", ["-l"]);
  const next = crontabWith(table.status === 0 ? table.stdout : null, line);
  if (next !== null && spawnSync("crontab", ["-"], { input: next, encoding: "utf8" }).status !== 0) { say("could not write the crontab; add this line with `crontab -e`:"); say(line); return 1; }
  const child = spawn(process.execPath, [script, "--watch", "--timestamps"], { cwd: runIn, detached: true, stdio: ["ignore", openSync(log, "a"), openSync(log, "a")] });
  child.unref();
  say(`automatic pull on: a watcher checks GitHub every ~30 s for ${runIn} (started now and at every reboot); log ${log}; remove with --uninstall-timer`);
  return 0;
}

/** The working folder and script an installed LaunchAgent already points at, so an upgrade never re-points it. */
function existingTarget(text) {
  const dir = /<key>WorkingDirectory<\/key><string>([^<]+)<\/string>/.exec(text)?.[1];
  const args = [...text.matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1]);
  const script = args.find(a => a.endsWith("sync-clone.mjs"));
  const unxml = v => v?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return dir && script ? { runIn: unxml(dir), script: unxml(script) } : null;
}

/** The watcher as a user LaunchAgent on macOS: started at login and restarted whenever it stops on an error. */
function launchAgent(top, install, say, target = null) {
  const runIn = target?.runIn ?? mainWorktree(top);
  const script = target?.script ?? stableScript(top);
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
  <key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(script)}</string><string>--watch</string><string>--timestamps</string></array>
  <key>WorkingDirectory</key><string>${xml(runIn)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(pathEnv)}</string></dict>
</dict>
</plist>
`);
  const loaded = spawnSync("launchctl", ["load", "-w", plist], { encoding: "utf8" });
  if (loaded.status !== 0) { say(`wrote ${plist}, but launchctl load failed: ${(loaded.stderr || "").trim()}`); return 1; }
  say(`automatic pull on: checks GitHub every ~30 s for ${runIn} and syncs when anything moved; log ${log}; remove with --uninstall-timer`);
  return 0;
}

/**
 * --auto-setup: the picker runs this on every --claim. Silent when everything is already in place or setup is
 * not allowed here; one line per thing it installs. An existing hook of ours is left as it is (only an explicit
 * --install-hook refreshes it), and a timer already installed for any clone is never re-pointed: an old 15-minute
 * agent is upgraded to the watcher for the same folder and script (SYNC-auto-pull).
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
  if (process.platform === "darwin") {
    const plist = plistPath();
    if (!existsSync(plist)) code = Math.max(code, launchAgent(top, true, say));
    else {
      const text = readFileSync(plist, "utf8");
      const target = text.includes("<string>--watch</string>") ? null : existingTarget(text);
      if (target) code = Math.max(code, launchAgent(top, true, say, target));
    }
  }
  return code;
}

/**
 * SYNC-auto-pull on Linux without a systemd user session: the crontab with the watcher's @reboot line added once.
 * Every other line is kept as it is; an older line of ours (the 15-minute sync or a watcher for another path) is replaced.
 * @param {string|null} existing the current table (`crontab -l`), null when there is none
 * @param {string} line the full @reboot line to keep
 * @returns {string|null} the new table, or null when it already has exactly that line
 */
export function crontabWith(existing, line) {
  if (!line.includes("sync-clone.mjs")) throw new Error("crontabWith: the line must run sync-clone.mjs");
  const lines = String(existing ?? "").split("\n").filter((l, i, all) => l !== "" || i < all.length - 1);
  if (lines.includes(line)) return null;
  const kept = lines.filter(l => !(l.includes("sync-clone.mjs") && !l.trimStart().startsWith("#")));
  return `${[...kept, line].join("\n")}\n`;
}

/**
 * The same table with every line of ours removed (--uninstall-timer); null when there was nothing to remove.
 * @param {string|null} existing
 */
export function crontabWithout(existing) {
  const lines = String(existing ?? "").split("\n");
  const kept = lines.filter(l => !(l.includes("sync-clone.mjs") && !l.trimStart().startsWith("#")));
  return kept.length === lines.length ? null : kept.join("\n");
}

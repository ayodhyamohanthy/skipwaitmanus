/**
 * SYNC-clone-guard (D-373 (5), D-205): what one sync run does to a clone, decided from plain facts.
 *
 * Offline to online: committed branch work goes to its own branch on origin, never `main`, never with force.
 * Online to offline: `main` fast-forwards to `origin/main`; merged branches are deleted by
 * `scripts/branch-cleanup.mjs --local` (BRANCH-HYGIENE-1). Uncommitted work is reported and never touched.
 *
 * Everything here is pure so every rule is testable; the git I/O lives in `scripts/sync-clone.mjs`.
 */

/** Never pushed by a sync run: nobody pushes `main` (D-082); the picker owns the report log and the landing slot. */
export const NEVER_PUSH = Object.freeze(["main", "agent/reports/log", "agent/queue/landing"]);

/** Branch-name prefixes a person keeps local on purpose; a sync run never publishes them. */
export const PRIVATE_PREFIXES = Object.freeze(["local/", "private/", "wip/"]);

const FULL_SHA = /^[0-9a-f]{40}$/;
const sha = (value, what) => {
  if (!FULL_SHA.test(value ?? "")) throw new Error(`${what} must be a full 40-character SHA`);
  return value;
};

/**
 * What to do with the local `main`.
 * @param {{ local: string|null, origin: string, localIsAncestor: boolean, worktree: string|null, worktreeDirty: boolean }} facts
 *   `localIsAncestor`: the local `main` is an ancestor of `origin/main`. `worktree`: the worktree that has `main` checked out.
 * @returns {{ action: "none"|"merge"|"update-ref"|"report", reason: string }}
 */
export function planMain({ local, origin, localIsAncestor, worktree, worktreeDirty }) {
  sha(origin, "origin/main");
  if (local === null) return { action: "none", reason: "no local main" };
  sha(local, "local main");
  if (local === origin) return { action: "none", reason: "up to date" };
  if (!localIsAncestor) return { action: "report", reason: "local main has commits that are not on origin/main; move them to a branch and open a pull request" };
  if (worktree && worktreeDirty) return { action: "report", reason: `the worktree with main checked out (${worktree}) has uncommitted changes, so main was not moved` };
  return worktree ? { action: "merge", reason: "fast-forwarded in its worktree" } : { action: "update-ref", reason: "fast-forwarded" };
}

/**
 * What to do with one local branch other than the checked-out detached heads.
 * @param {{ name: string, sha: string, upstream: string|null, upstreamGone: boolean, remoteSha: string|null,
 *           remoteIsAncestor: boolean, localIsAncestor?: boolean, inMain: boolean, sensitive: string[] }} b
 *   `upstream`: the configured upstream (for example `origin/agent/queue/x`) or null. `remoteSha`: the tip of
 *   `origin/<name>` or null. `remoteIsAncestor`: that tip is an ancestor of `sha`. `localIsAncestor`: `sha` is an
 *   ancestor of that tip, so the branch is strictly behind and a fast-forward loses nothing (SYNC-auto-pull).
 *   `inMain`: `sha` is in `origin/main`. `sensitive`: findings from `findSensitive` for the commits a push would send.
 * @param {{ publishNew?: boolean }} [opts] publishNew: push a branch that was never pushed (default true).
 * @returns {{ action: "push"|"pull"|"none"|"report", reason: string }}
 */
export function planBranch(b, { publishNew = true } = {}) {
  if (typeof b?.name !== "string" || !b.name) throw new Error("planBranch: a branch needs a name");
  sha(b.sha, `branch ${b.name}`);
  if (b.remoteSha !== null) sha(b.remoteSha, `origin/${b.name}`);
  if (!Array.isArray(b.sensitive)) throw new Error(`planBranch: ${b.name} needs a sensitive list`);
  if (NEVER_PUSH.includes(b.name)) return { action: "none", reason: "never pushed by a sync run" };
  if (PRIVATE_PREFIXES.some(prefix => b.name.startsWith(prefix))) return { action: "none", reason: "kept local by its name" };
  if (b.upstream && b.upstream !== `origin/${b.name}`) return { action: "report", reason: `tracks ${b.upstream}, not origin/${b.name}; push it yourself` };
  if (b.remoteSha === b.sha) return { action: "none", reason: "in sync" };
  if (b.remoteSha) {
    if (!b.remoteIsAncestor && b.localIsAncestor === true) return { action: "pull", reason: "behind origin; fast-forwarded" };
    if (!b.remoteIsAncestor) return { action: "report", reason: "origin has commits this branch lacks and the branch has its own (diverged); merge in its worktree, never force" };
  } else {
    if (b.inMain) return { action: "none", reason: "already in main" };
    if (b.upstreamGone) return { action: "report", reason: "its origin branch was deleted (its pull request probably merged) and it has commits main lacks; open a new pull request if they matter" };
    if (!publishNew) return { action: "report", reason: "never pushed; run without --no-publish-new to publish it" };
  }
  if (b.sensitive.length) return { action: "report", reason: `not pushed, possible secret: ${b.sensitive.slice(0, 3).join("; ")}` };
  return { action: "push", reason: b.remoteSha ? "ahead of origin" : "never pushed" };
}

const SENSITIVE_FILES = [
  /(^|\/)\.env(\.[^/]+)?$/,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)credentials[^/]*\.json$/i,
  /(^|\/)\.claude\/settings\.local\.json$/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
];
const ALLOWED_FILES = [/(^|\/)\.env\.example$/];
const SECRET_TEXT = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Stripe live key", /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}/],
];

/**
 * Findings that stop a branch from being pushed to this public repository (D-059).
 * @param {{ files: string[], added: { file: string, line: string }[] }} change the files a push would change and its added lines
 * @returns {string[]} one finding per file, never the matched text itself
 */
export function findSensitive({ files, added }) {
  if (!Array.isArray(files) || !Array.isArray(added)) throw new Error("findSensitive: files and added must be arrays");
  const out = new Set();
  for (const file of files) {
    if (ALLOWED_FILES.some(re => re.test(file))) continue;
    if (SENSITIVE_FILES.some(re => re.test(file))) out.add(`${file} (sensitive file name)`);
  }
  for (const { file, line } of added) {
    const hit = SECRET_TEXT.find(([, re]) => re.test(line));
    if (hit) out.add(`${file} (${hit[0]})`);
  }
  return [...out];
}

/**
 * The added lines of a `git diff -U0 --no-color` output, with their files.
 * @param {string} diff
 * @returns {{ file: string, line: string }[]}
 */
export function addedLines(diff) {
  const out = [];
  let file = null;
  for (const raw of String(diff).split("\n")) {
    if (raw.startsWith("+++ ")) { file = raw === "+++ /dev/null" ? null : raw.replace(/^\+\+\+ b\//, ""); continue; }
    if (file && raw.startsWith("+")) out.push({ file, line: raw.slice(1) });
  }
  return out;
}

/** The exit code of a run: 0 when nothing is left to do by hand, 1 when something is. */
export function exitCodeOf({ reports, dirty, failures }) {
  return reports.length || dirty.length || failures.length ? 1 : 0;
}

/**
 * SYNC-auto-push (D-375): where local `main`'s own commits are saved on origin. `main` itself is never pushed
 * (D-082); the commits go to a branch named after the first commit origin/main lacks, so later commits on the
 * same local `main` fast-forward the same branch.
 * @param {string} firstLocalSha the oldest commit of `origin/main..main`
 */
export function sideBranchForMain(firstLocalSha) {
  return `sync/main-${sha(firstLocalSha, "first local main commit").slice(0, 8)}`;
}

/** The line that marks the post-commit hook this tool writes; a hook without it belongs to someone else. */
export const HOOK_MARKER = "# skipwait sync-clone post-commit hook (SYNC-auto-push, D-375)";

/**
 * What --install-hook / --uninstall-hook does with the clone's post-commit hook.
 * @param {{ existing: string|null, hooksPathSet: boolean, install: boolean }} facts
 *   `existing`: the current hook file's text or null. `hooksPathSet`: `core.hooksPath` is configured, so another
 *   tool owns the hooks folder (it may be a tracked folder; this tool never writes into it).
 * @returns {{ action: "write"|"remove"|"none"|"report", reason: string }}
 */
export function planHook({ existing, hooksPathSet, install }) {
  const ours = typeof existing === "string" && existing.includes(HOOK_MARKER);
  if (!install) {
    if (existing === null) return { action: "none", reason: "no post-commit hook" };
    return ours ? { action: "remove", reason: "removed" } : { action: "none", reason: "the post-commit hook belongs to another tool and was left in place" };
  }
  if (hooksPathSet) return { action: "report", reason: "core.hooksPath is set, so another tool owns this clone's hooks; add `node scripts/sync-clone.mjs --current` to its post-commit hook" };
  if (existing === null) return { action: "write", reason: "installed" };
  if (ours) return { action: "write", reason: "refreshed" };
  return { action: "report", reason: "a post-commit hook from another tool exists and was left in place; add `node scripts/sync-clone.mjs --current &` to it" };
}

const shq = text => `'${String(text).replace(/'/g, `'\\''`)}'`;

/**
 * The post-commit hook. It pushes the commit just made with `sync-clone.mjs --current` in the background, so a
 * commit never waits on the network, and skips the commits a rebase or a multi-commit cherry-pick replays.
 * @param {{ node: string, scripts: string[] }} where the node binary and candidate sync-clone.mjs paths, first that exists wins
 */
export function hookScript({ node, scripts }) {
  if (typeof node !== "string" || !node || !Array.isArray(scripts) || !scripts.length) throw new Error("hookScript: node and at least one script path are required");
  return `#!/bin/sh
${HOOK_MARKER}
# Pushes the commit just made to its own branch on origin: never main, never force, never a likely secret.
# Local main's own commits go to a sync/main-<sha> branch instead. Off for one commit: SKIPWAIT_AUTO_SYNC=off.
# Remove: node scripts/sync-clone.mjs --uninstall-hook. Log: <git dir>/skipwait-sync-clone.log.
[ "\${SKIPWAIT_AUTO_SYNC:-on}" = "off" ] && exit 0
unset GIT_INDEX_FILE
here=$(git rev-parse --git-dir 2>/dev/null) || exit 0
for busy in rebase-merge rebase-apply sequencer; do [ -e "$here/$busy" ] && exit 0; done
script=
for candidate in ${scripts.map(shq).join(" ")} "$(git rev-parse --show-toplevel)/scripts/sync-clone.mjs"; do
  [ -f "$candidate" ] && { script=$candidate; break; }
done
[ -n "$script" ] || exit 0
node=${shq(node)}
[ -x "$node" ] || node=$(command -v node) || exit 0
log="$(git rev-parse --git-common-dir)/skipwait-sync-clone.log"
if [ "\${SKIPWAIT_SYNC_FOREGROUND:-}" = "1" ]; then "$node" "$script" --current --timestamps >>"$log" 2>&1; exit 0; fi
nohup "$node" "$script" --current --timestamps >>"$log" 2>&1 </dev/null &
exit 0
`;
}

/**
 * Whether --auto-setup (run by the picker on every --claim) may install the hook and timer in this clone.
 * Never in CI, a test run or a Claude Code cloud container (discarded after the session; it pushes its own
 * branch), and never once a person opted out.
 * @param {{ env: Record<string, string|undefined>, optedOut: boolean }} facts `optedOut`: `git config skipwait.autoSync false`
 * @returns {{ allowed: boolean, reason: string }}
 */
export function autoSetupAllowed({ env, optedOut }) {
  const on = name => Boolean(env[name]) && env[name] !== "false" && env[name] !== "0";
  if (on("CI") || on("GITHUB_ACTIONS")) return { allowed: false, reason: "CI" };
  if (on("VITEST")) return { allowed: false, reason: "a test run" };
  if (env.CLAUDE_CODE_REMOTE === "true") return { allowed: false, reason: "a cloud session container" };
  if (env.SKIPWAIT_AUTO_SYNC === "off" || optedOut) return { allowed: false, reason: "opted out" };
  return { allowed: true, reason: "local clone" };
}


/**
 * SYNC-auto-pull: how a branch that is strictly behind origin is fast-forwarded, the same way `main` is.
 * @param {{ worktree: string|null, worktreeDirty: boolean }} facts the worktree that has the branch checked out
 * @returns {{ action: "merge"|"update-ref"|"report", reason: string }}
 */
export function pullMethod({ worktree, worktreeDirty }) {
  if (worktree && worktreeDirty) return { action: "report", reason: `behind origin, but its worktree (${worktree}) has uncommitted changes, so it was not moved; commit them and the next sync pulls` };
  return worktree ? { action: "merge", reason: "fast-forwarded in its worktree" } : { action: "update-ref", reason: "fast-forwarded" };
}

// SYNC-auto-pull: `sync-clone.mjs --watch` polls `git ls-remote --heads origin` (one small request, no objects) and
// runs the full sync only when something this clone cares about moved; no webhook into anyone's computer.

/**
 * `git ls-remote --heads origin` output as branch name -> tip.
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function parseRemoteHeads(text) {
  const out = new Map();
  for (const line of String(text).split("\n")) {
    const m = /^([0-9a-f]{40})\trefs\/heads\/(.+)$/.exec(line.trim());
    if (m) out.set(m[2], m[1]);
  }
  return out;
}

/**
 * SYNC-auto-pull: whether origin moved in a way this clone cares about, so a full sync is worth running.
 * Only `main` and the branches this clone has locally count: other sessions' heartbeat, review and report
 * markers move all the time and would otherwise start a full sync every poll. A branch new on origin that this
 * clone does not have shows up at the next full sync, which also runs at least every `fullEvery` seconds.
 * @param {{ remoteHeads: Map<string,string>, trackingRefs: Map<string,string>, localBranches: string[] }} facts
 *   `remoteHeads`: from `parseRemoteHeads`. `trackingRefs`: this clone's `refs/remotes/origin/*` as name -> tip.
 * @returns {string[]} one line per change ("main moved", "x is new", "x is gone"); empty when nothing moved
 */
export function remoteMoved({ remoteHeads, trackingRefs, localBranches }) {
  const names = new Set(["main", ...localBranches]);
  const changes = [];
  for (const name of [...names].sort()) {
    const remote = remoteHeads.get(name) ?? null, tracked = trackingRefs.get(name) ?? null;
    if (remote === tracked) continue;
    changes.push(remote === null ? `${name} is gone` : tracked === null ? `${name} is new` : `${name} moved`);
  }
  return changes;
}

/** SYNC-auto-pull watch defaults: poll origin every 30 s (at least 10), and run a full sync at least every 15 min. */
export const WATCH_DEFAULT_SECONDS = 30;
export const WATCH_MIN_SECONDS = 10;
export const WATCH_FULL_EVERY_SECONDS = 900;
const BACKOFF_SECONDS = [30, 60, 120, 300];

/**
 * The poll interval from `git config skipwait.syncInterval`: the default when unset or not a number, never below the minimum.
 * @param {string|null} configured
 */
export function watchInterval(configured) {
  const n = Number.parseInt(String(configured ?? ""), 10);
  if (!Number.isFinite(n) || String(n) !== String(configured ?? "").trim()) return WATCH_DEFAULT_SECONDS;
  return Math.max(WATCH_MIN_SECONDS, n);
}

/**
 * Seconds to wait before the next poll: the interval after a success, then 30 s, 1, 2 and 5 minutes after
 * consecutive network failures, staying at 5 minutes until one succeeds.
 * @param {number} failures consecutive failed polls or syncs
 * @param {number} interval the normal poll interval in seconds
 */
export function nextDelay(failures, interval) {
  if (!Number.isInteger(failures) || failures < 0) throw new Error("nextDelay: failures must be a non-negative integer");
  return failures === 0 ? interval : BACKOFF_SECONDS[Math.min(failures, BACKOFF_SECONDS.length) - 1];
}

/**
 * The --watch loop with every effect injected, so its timing and its "one sync per change" rule are testable.
 * Each round reads origin's heads and this clone's refs; it runs one full sync when origin moved (`remoteMoved`),
 * when the clone's own branches changed since the last sync (a hand pull, merge, commit or checkout), or when
 * `fullEvery` seconds passed since the last one. Rounds never overlap: each awaits its sync before sleeping.
 * @param {{ interval: number, fullEvery?: number, rounds?: number,
 *   lsRemote: () => Promise<string|null>|string|null,
 *   readClone: () => Promise<{ trackingRefs: Map<string,string>, localBranches: string[], localStamp: string }>|{ trackingRefs: Map<string,string>, localBranches: string[], localStamp: string },
 *   sync: () => Promise<number>|number, sleep: (seconds: number) => Promise<void>|void, now: () => number,
 *   log: (line: string) => void, stopped?: () => boolean }} deps
 *   `lsRemote` returns null when origin is unreachable. `sync` returns the sync run's exit code (2: it could not run).
 *   `now` is in milliseconds. `rounds` bounds the loop (tests); omitted, it runs until `stopped()` says so.
 * @returns {Promise<{ rounds: number, syncs: number }>}
 */
export async function watchLoop(deps) {
  const fullEvery = deps.fullEvery ?? WATCH_FULL_EVERY_SECONDS;
  let failures = 0, rounds = 0, syncs = 0, lastSync = -Infinity, lastStamp = null;
  while (deps.rounds === undefined || rounds < deps.rounds) {
    if (deps.stopped?.()) break;
    rounds++;
    const listed = await deps.lsRemote();
    if (listed === null) {
      failures++;
      if (failures === 1) deps.log("origin is unreachable; backing off");
    } else {
      const clone = await deps.readClone();
      const moved = remoteMoved({ remoteHeads: parseRemoteHeads(listed), trackingRefs: clone.trackingRefs, localBranches: clone.localBranches });
      const why = moved.length ? `origin: ${moved.slice(0, 5).join(", ")}${moved.length > 5 ? ` and ${moved.length - 5} more` : ""}`
        : lastStamp !== null && clone.localStamp !== lastStamp ? "this clone's branches changed"
        : deps.now() - lastSync >= fullEvery * 1000 ? (lastStamp === null ? "first run" : "periodic full sync")
        : null;
      if (why) {
        deps.log(`sync (${why})`);
        const code = await deps.sync();
        syncs++;
        lastSync = deps.now();
        lastStamp = (await deps.readClone()).localStamp;
        failures = code === 2 ? failures + 1 : 0;
      } else failures = 0;
    }
    if (deps.rounds !== undefined && rounds >= deps.rounds) break;
    await deps.sleep(nextDelay(failures, deps.interval));
  }
  return { rounds, syncs };
}

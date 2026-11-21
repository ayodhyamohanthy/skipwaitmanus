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
 *           remoteIsAncestor: boolean, inMain: boolean, sensitive: string[] }} b
 *   `upstream`: the configured upstream (for example `origin/agent/queue/x`) or null. `remoteSha`: the tip of
 *   `origin/<name>` or null. `remoteIsAncestor`: that tip is an ancestor of `sha`. `inMain`: `sha` is in `origin/main`.
 *   `sensitive`: findings from `findSensitive` for the commits a push would send.
 * @param {{ publishNew?: boolean }} [opts] publishNew: push a branch that was never pushed (default true).
 * @returns {{ action: "push"|"none"|"report", reason: string }}
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
    if (!b.remoteIsAncestor) return { action: "report", reason: "origin has commits this branch lacks (it moved or diverged); pull in its worktree, never force" };
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

/**
 * SYNC-tidy (owner, Nov 27 2026): which leftover worktrees and local branches can go, decided from plain facts.
 *
 * Something is removed only when nothing is lost: no uncommitted or untracked file, every commit already on GitHub
 * (reachable from an origin/* ref after a pruning fetch), not locked, not the clone's own folder, and idle for a while
 * so a live agent session is never cut off. Everything else is kept with its reason. Pure, so every rule is testable;
 * the git I/O lives in `scripts/sync-tidy.mjs`.
 */

/** Branches a tidy never deletes: main and the picker's own. */
export const NEVER_DELETE = Object.freeze(["main", "agent/reports/log", "agent/queue/landing"]);
/** Branch-name prefixes a person keeps local on purpose. */
export const PRIVATE_PREFIXES = Object.freeze(["local/", "private/", "wip/"]);
export const DEFAULT_IDLE_HOURS = 24;
/** Unsaved work idle this long is listed first, as "looks abandoned", for a person to decide. Never deleted. */
export const ABANDONED_DAYS = 7;

const days = hours => Math.floor(hours / 24);
const idleText = hours => (hours >= 48 ? `idle ${days(hours)} days` : `idle ${Math.floor(hours)} h`);

/**
 * @param {{ path: string, branch: string|null, isMain: boolean, isCurrent: boolean, locked: boolean,
 *   files: number|null, unpushed: number|null, idleHours: number }} w
 *   `files`: uncommitted and untracked files (`git status --porcelain`), null when unreadable. `unpushed`: commits
 *   reachable from HEAD that no origin/* ref has, null when unknown.
 * @param {{ minIdleHours?: number }} [opts]
 * @returns {{ action: "remove"|"keep", reason: string, abandoned?: boolean }}
 */
export function planWorktree(w, { minIdleHours = DEFAULT_IDLE_HOURS } = {}) {
  if (typeof w?.path !== "string" || !w.path) throw new Error("planWorktree: a worktree needs a path");
  if (w.isMain) return { action: "keep", reason: "the clone's main folder" };
  if (w.isCurrent) return { action: "keep", reason: "the folder this command runs in" };
  if (w.locked) return { action: "keep", reason: "locked (git worktree lock)" };
  if (w.files === null) return { action: "keep", reason: "its status could not be read" };
  if (w.files > 0) {
    const abandoned = w.idleHours >= ABANDONED_DAYS * 24;
    return { action: "keep", reason: `${w.files} unsaved file(s), ${idleText(w.idleHours)}${abandoned ? "; looks abandoned: commit and push it, or delete it yourself" : ""}`, abandoned };
  }
  if (w.unpushed === null) return { action: "keep", reason: "could not check whether its commits are on GitHub" };
  if (w.unpushed > 0) return { action: "keep", reason: `${w.unpushed} commit(s) not on GitHub; push them first` };
  if (w.idleHours < minIdleHours) return { action: "keep", reason: `used in the last ${minIdleHours} h (${idleText(w.idleHours)})` };
  return { action: "remove", reason: `clean, everything on GitHub, ${idleText(w.idleHours)}` };
}

/**
 * @param {{ name: string, checkedOut: boolean, unpushed: number|null, idleHours: number }} b
 *   `checkedOut`: a worktree that stays has it checked out.
 * @param {{ minIdleHours?: number }} [opts]
 * @returns {{ action: "delete"|"keep", reason: string }}
 */
export function planLocalBranch(b, { minIdleHours = DEFAULT_IDLE_HOURS } = {}) {
  if (typeof b?.name !== "string" || !b.name) throw new Error("planLocalBranch: a branch needs a name");
  if (NEVER_DELETE.includes(b.name)) return { action: "keep", reason: "never deleted" };
  if (PRIVATE_PREFIXES.some(prefix => b.name.startsWith(prefix))) return { action: "keep", reason: "kept local by its name" };
  if (b.checkedOut) return { action: "keep", reason: "checked out in a worktree that stays" };
  if (b.unpushed === null) return { action: "keep", reason: "could not check whether its commits are on GitHub" };
  if (b.unpushed > 0) return { action: "keep", reason: `${b.unpushed} commit(s) not on GitHub` };
  if (b.idleHours < minIdleHours) return { action: "keep", reason: `changed in the last ${minIdleHours} h` };
  return { action: "delete", reason: `everything on GitHub, ${idleText(b.idleHours)}` };
}

/**
 * `git worktree list --porcelain` as records.
 * @param {string} text
 * @returns {{ path: string, head: string|null, branch: string|null, locked: boolean, prunable: boolean, bare: boolean }[]}
 */
export function parseWorktrees(text) {
  return String(text).split(/\n\n+/).map(block => block.trim()).filter(Boolean).flatMap(block => {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path) return [];
    return [{
      path,
      head: /^HEAD ([0-9a-f]{40})$/m.exec(block)?.[1] ?? null,
      branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null,
      locked: /^locked\b/m.test(block),
      prunable: /^prunable\b/m.test(block),
      bare: /^bare$/m.test(block),
    }];
  });
}

/**
 * The idle period from candidate timestamps (ms): the newest one counts. No timestamp means "just now", so an
 * unreadable age always keeps.
 * @param {number[]} stamps
 * @param {number} now
 */
export function idleHoursOf(stamps, now) {
  const known = stamps.filter(n => Number.isFinite(n) && n > 0);
  if (!known.length) return 0;
  return Math.max(0, (now - Math.max(...known)) / 3_600_000);
}

/** `--idle-hours <n>`: a whole number of hours, at least 1. */
export function parseIdleHours(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || String(n) !== String(value ?? "").trim() || n < 1) throw new Error("--idle-hours needs a whole number of at least 1");
  return n;
}

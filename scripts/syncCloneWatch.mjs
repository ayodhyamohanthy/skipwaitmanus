// SYNC-auto-pull: the clone pulls within about 30 seconds of a change on GitHub, without a webhook into anyone's
// computer. `node scripts/sync-clone.mjs --watch` polls `git ls-remote --heads origin` (one small request, no objects)
// and runs the existing full sync only when something this clone cares about moved. Everything here is I/O-free so
// every rule is testable; the git calls live in `scripts/sync-clone.mjs`, the service install in `scripts/syncCloneSetup.mjs`.
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
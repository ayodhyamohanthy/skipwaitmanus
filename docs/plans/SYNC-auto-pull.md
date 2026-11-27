# SYNC-auto-pull: a clone pulls within about 30 seconds of any change on GitHub, and pushes the moment it commits

Tier 2 · lane `sync-auto-pull` · branch `agent/queue/sync-auto-pull` · epic D-212 · no dependencies

## Why

Owner, Nov 25 2026: "automatically pull ,push the comits to local so that the local and remote stays in sync". D-373 (5)
and D-375 already push: a post-commit hook pushes every commit, and a 15-minute full sync fast-forwards `main` and
deletes merged branches. Two gaps remain.

1. **A branch behind origin is only reported.** `planBranch` (`scripts/syncCloneCore.mjs:59`) answers "origin has commits
   this branch lacks ... pull in its worktree" even when the local branch is a strict ancestor of `origin/<name>` and
   nothing would be lost. That happens every time another session or a takeover pushes to a branch this clone has.
2. **Pulling waits up to 15 minutes.** The full sync runs on a 15-minute timer (`INTERVAL_SECONDS = 900`,
   `scripts/syncCloneSetup.mjs`), and it installs itself only on macOS: elsewhere `launchAgent`
   (`scripts/syncCloneSetup.mjs:71`) prints a cron line for a person to add. Owner, Nov 25: "the local pull requests are
   set for a timing cant it be as soon as a commmit or pull is available".

## The build

1. **Fast-forward a branch that is strictly behind.** In `planBranch`, when `remoteSha` exists, `remoteIsAncestor` is
   false and the local `sha` is an ancestor of `remoteSha` (a new input, `localIsAncestor`), return
   `{ action: "pull", reason: "behind origin; fast-forwarded" }`. A diverged branch keeps the existing report. The runner
   (`scripts/sync-clone.mjs`) fast-forwards it the way `main` already is:
   - in the worktree that has it checked out, only when that worktree is clean, with `git merge --ff-only`;
   - with `git update-ref` (old value checked) when no worktree has it checked out;
   - a dirty worktree is reported, never touched.
   Never a rebase, reset, force or merge commit.
2. **Watch instead of a timer: pull within about 30 seconds.** Git has no way to tell a clone that GitHub moved, and a
   webhook into a person's computer would need a public endpoint (rejected: cost and attack surface). So add
   `node scripts/sync-clone.mjs --watch`, a long-running loop:
   - every interval (default 30 s; `git config skipwait.syncInterval <seconds>`, minimum 10) run
     `git ls-remote --heads origin`, one small request that downloads no objects;
   - compare the answer with the clone's `refs/remotes/origin/*` in a pure function (`remoteMoved(remoteHeads,
     trackingRefs)`); only when a head differs, is new or is gone, run the existing full sync once (fetch, push, the
     fast-forwards in rule 1, merged-branch cleanup);
   - also run it once when the clone's own refs change (the post-commit hook already pushes; this catches a pull, a
     merge or a checkout done by hand);
   - never two syncs at once (reuse the picker's single-flight lock pattern); on a network error back off 30 s, 1, 2,
     then 5 min, and return to the interval after one success; log one line per sync, not per poll.
   Install it as a service that restarts itself, replacing the 15-minute timer: on macOS the existing LaunchAgent label
   with `KeepAlive` and `RunAtLoad` running `--watch` (unload the old `StartInterval` agent first); on Linux a
   `systemd --user` unit when `systemctl --user` works, else an `@reboot` crontab line (read the table, append once,
   never replace other lines); Windows keeps the printed instruction. Keep every existing guard of `--auto-setup`: never
   in CI, a test run or a cloud session container, never once a person opted out (`git config skipwait.autoSync false`
   or `SKIPWAIT_AUTO_SYNC=off`). `--uninstall-timer` removes the watcher too.
3. **Docs.** `AGENTS.md` (the `sync-check.sh` line under Commands) and `scripts/sync-check.sh`'s comment say it pulls
   behind branches and watches GitHub every ~30 s instead of every 15 minutes.

## Hard limits

No force push, no rebase, no reset, no deletion of unmerged work, no change to any branch that has diverged or to a dirty
worktree. Main's existing rules are unchanged.

## Tests (red first, `scripts/syncClone.test.ts`)

`planBranch`: behind (pull), diverged (report, as today), ahead (push, as today), equal (none). Runner fixture with
local Git origins: a clean behind worktree fast-forwards; a dirty one is reported and unchanged; a branch checked out
nowhere moves by `update-ref`; a diverged branch is unchanged. Watch: `remoteMoved` for equal, moved, new and deleted
heads; one sync per change, none while nothing moved (count the sync calls with an injected clock and runner); the
backoff schedule; no second sync while one runs. Setup: the macOS agent becomes `KeepAlive` and the old interval agent
is unloaded; the Linux unit or `@reboot` line is added once and never duplicated, other crontab lines are kept; nothing
is installed under `SKIPWAIT_AUTO_SYNC=off`, in CI or in a cloud container. A local proof: a commit pushed to the
fixture origin is fast-forwarded into a clean clone within two intervals.

## Status

- SYNC-auto-pull: in progress — GPT-6.1 Sol · 27cf — 2026-11-25 — branch `agent/queue/sync-auto-pull`, base `30d2f6ebe`. Preflight read `docs/BRIEF.md`, `AGENTS.md`, `COLLABORATION.md`, `docs/PRD.md`, `docs/BUILD_CONTINUITY.md`, the latest decision-register entries through D-400 and this packet. PR #1604 registered and expanded this packet; commit `457d9672a` changed only the packet and registry, so implementation acceptance remains open. Inspecting the existing sync runner, setup and tests before implementing the fast-forwards and watcher; no price, login, money, provider or product switch changes.
- SYNC-auto-pull: built — Claude Code, 2026-11-27 — PR #1610 changed only this Status line, yet its landing from the task branch made the board read `done` with no code; this build adds `pullMethod` and the `pull` plan (`scripts/syncCloneCore.mjs`), `remoteMoved`, `watchLoop` and the backoff (also `scripts/syncCloneCore.mjs`), the crontab helpers (`scripts/syncCloneSetup.mjs`), `--watch` with a one-per-clone pid file, and the self-restarting LaunchAgent / systemd unit / `@reboot` line; 39 tests in `scripts/syncClone.test.ts` pass. Two deliberate narrowings: the watcher counts only `main` and the clone's own branches as moved (heartbeat/review markers would otherwise sync every poll) and still runs a full sync every 15 min; on Linux only an explicit `--install-timer` installs the service, so `--auto-setup` in a test run never touches the machine. `docs/plans/BRANCH-HYGIENE.md` still describes the 15-minute timer as history; this packet supersedes it. Unverified: a real Mac LaunchAgent run and GitHub Desktop showing the pull.

# SYNC-auto-pull: a clone pulls as well as pushes, so local and GitHub stay the same without anyone typing git

Tier 2 · lane `sync-auto-pull` · branch `agent/queue/sync-auto-pull` · epic D-212 · no dependencies

## Why

Owner, Nov 25 2026: "automatically pull ,push the comits to local so that the local and remote stays in sync". D-373 (5)
and D-375 already push: a post-commit hook pushes every commit, and a 15-minute full sync fast-forwards `main` and
deletes merged branches. Two gaps remain.

1. **A branch behind origin is only reported.** `planBranch` (`scripts/syncCloneCore.mjs:59`) answers "origin has commits
   this branch lacks ... pull in its worktree" even when the local branch is a strict ancestor of `origin/<name>` and
   nothing would be lost. That happens every time another session or a takeover pushes to a branch this clone has.
2. **The timer installs itself only on macOS.** Elsewhere `launchAgent` (`scripts/syncCloneSetup.mjs:71`) prints a cron
   line for a person to add.

## The build

1. **Fast-forward a branch that is strictly behind.** In `planBranch`, when `remoteSha` exists, `remoteIsAncestor` is
   false and the local `sha` is an ancestor of `remoteSha` (a new input, `localIsAncestor`), return
   `{ action: "pull", reason: "behind origin; fast-forwarded" }`. A diverged branch keeps the existing report. The runner
   (`scripts/sync-clone.mjs`) fast-forwards it the way `main` already is:
   - in the worktree that has it checked out, only when that worktree is clean, with `git merge --ff-only`;
   - with `git update-ref` (old value checked) when no worktree has it checked out;
   - a dirty worktree is reported, never touched.
   Never a rebase, reset, force or merge commit.
2. **Install the timer on Linux too.** Where `crontab` exists and no `skipwait` sync line is present, add the same
   15-minute line with `crontab -` (read the current table first and append; never replace other lines). Keep every
   existing guard of `--auto-setup`: never in CI, a test run or a cloud session container, never once a person opted out
   (`git config skipwait.autoSync false` or `SKIPWAIT_AUTO_SYNC=off`). Windows keeps the printed instruction.
3. **Docs.** `AGENTS.md` (the `sync-check.sh` line under Commands) and `scripts/sync-check.sh`'s comment say it pulls
   behind branches too.

## Hard limits

No force push, no rebase, no reset, no deletion of unmerged work, no change to any branch that has diverged or to a dirty
worktree. Main's existing rules are unchanged.

## Tests (red first, `scripts/syncClone.test.ts`)

`planBranch`: behind (pull), diverged (report, as today), ahead (push, as today), equal (none). Runner fixture with
local Git origins: a clean behind worktree fast-forwards; a dirty one is reported and unchanged; a branch checked out
nowhere moves by `update-ref`; a diverged branch is unchanged. Setup: a Linux crontab is appended once and never
duplicated, other lines are kept, and nothing is installed under `SKIPWAIT_AUTO_SYNC=off` or in CI.

## Status

- SYNC-auto-pull: todo — registered Nov 25 2026 by Claude Code · 43c8 from the owner's request.

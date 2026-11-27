# SYNC-tidy: remove the leftover worktrees and branches that hold nothing unsaved, after the owner confirms

Tier 2 · lane `sync-tidy` · branch `agent/queue/sync-tidy` · epic D-212 · no dependencies

## Why

Owner, Nov 27 2026, after the first full `node scripts/sync-clone.mjs` run on his Mac listed about 60 worktrees and
over 100 branches under "left for you": he approved ("sure") a safe clean-up command that lists what is fully merged
and holds nothing unsaved, and deletes it only after he confirms. Agent sessions leave worktrees under
`skipwaitmanus-wt/`, `/tmp` and `.task-worktrees/` and local branches behind; the noise hides the few that matter (for
example an unpushed `D-048-K-admin-money` worktree that blocks its task). D-205 already wants merged branches gone
online and offline; `branch-cleanup.mjs --local` only deletes merged branches whose upstream is gone and never
touches worktrees.

## The build

`node scripts/sync-tidy.mjs` lists, `node scripts/sync-tidy.mjs --apply` deletes exactly what the list showed.
Pure rules in `scripts/syncTidyCore.mjs`, git I/O in `scripts/sync-tidy.mjs`, tests in `scripts/syncTidy.test.ts`.

1. **A worktree is removed only when all hold:** it is not the clone's main worktree or the one the command runs in;
   it is not locked; `git status --porcelain` reads cleanly and lists nothing (ignored files such as `node_modules`
   do not count); its HEAD is reachable from an `origin/*` ref (nothing unpushed); and nothing in it changed for
   at least 24 hours (`--idle-hours <n>`, minimum 1), so a live agent session is never cut off.
   Removal is `git worktree remove` without `--force`, so git itself refuses anything dirty.
2. **A local branch is deleted only when all hold:** it is not `main`, a picker branch (`agent/reports/log`,
   `agent/queue/landing`) or a `local/`, `private/`, `wip/` branch; no remaining worktree has it checked out; its tip
   is reachable from an `origin/*` ref (deleting it loses nothing: it can be checked out again from GitHub); and its
   reflog shows no change for the idle period. Deletion is `git update-ref -d` with the expected tip, so a branch
   that moved meanwhile is kept.
3. **Everything else is listed as kept, with the reason:** unsaved changes (path, branch, file count, idle days),
   commits that are not on GitHub (count), locked, recently used. Worktrees whose files look abandoned (unsaved
   work idle for 7 days or more) are listed first so the owner can decide; they are never deleted by this tool.
4. **Dry run by default.** Without `--apply` nothing changes; the output ends with the counts and the exact
   `--apply` command. `--apply` re-checks every rule immediately before each deletion.

## Hard limits

Never `--force`, never a reset, stash, commit or checkout, never a deletion of a worktree with any uncommitted or
untracked file, never a branch or commit that GitHub does not have. Nothing on GitHub is changed.

## Tests (red first, `scripts/syncTidy.test.ts`)

Rules: each keep reason and the delete case for worktrees and branches. Fixture with a bare origin: a clean, pushed,
idle worktree is removed on `--apply` and kept in the dry run; a dirty one, one with an untracked file, one with an
unpushed commit, a locked one and a recently used one are kept with their reasons; a pushed idle branch is deleted,
an unpushed one and `main` are kept.

## Status

- SYNC-tidy: registered — Claude Code, 2026-11-27 — owner approval in session ("sure"); build follows on `agent/queue/sync-tidy`.
- SYNC-tidy: built — Claude Code, 2026-11-27 — `scripts/syncTidyCore.mjs`, `scripts/sync-tidy.mjs`, 12 tests in `scripts/syncTidy.test.ts` (rules, a fixture where `--apply` removes only the clean pushed idle worktrees and branches, fail-closed when GitHub is unreachable). Unverified: a run on the owner's Mac.

# PICKER-session-worktree: two sessions on one machine never share a working folder (D-388)

Tier 2 · lane `picker-session-worktree` · branch `agent/queue/picker-session-worktree` · epic D-212

## The defect, observed on Nov 24 2026

`scripts/nextTaskText.mjs` prints the same folder for every session on a machine:
`git worktree add ../skipwaitmanus-wt/<slug>` (build, line 32), `.../<slug>-fix` (fix),
`.../architect-<slug>` (packet, unblock) and `.../<slug>` (lock work). `D-178.read` stopped
because Qoder · 2b1b found "another active session ... writing four uncommitted files in the
assigned d178-read worktree" and, correctly, would not overwrite them. The next session handed the
same task on that machine meets the same folder.

## The fix

1. Every printed worktree path ends with the claiming session's tag: `<slug>-<tag>` (for example
   `d178-read-2b1b`), and likewise for the `-fix` and `architect-` forms. One helper builds the path
   so the forms cannot drift.
2. The printed step says: if that folder already exists and holds uncommitted changes, stop and
   report instead of using it. The picker itself does not touch any folder.
3. No change to branches, claims, markers or locks: only the printed local folder name.

## Tests (red first)

`scripts/nextTaskWorktree.test.ts`: two session names for the same build, fix, architect and lock
picks print different folders; each folder contains the session tag; the existing-folder warning is
present in each hand-out. Update any existing `scripts/nextTask*.test.ts` expectation that pins the
old path text, without weakening what it asserts.

## Acceptance

Focused tests, `scripts/nextTask.test.ts` and `pnpm check` green; required CI green.

## Status

- PICKER-session-worktree: todo

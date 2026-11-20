# PICKER-auto-land: green task pull requests land on their own (D-371)

Status: in review (PR open). Row `PICKER-auto-land`, branch `agent/queue/picker-auto-land`, decision D-371 (3). The owner said "auto land" on Nov 20, 2026.

## 1. Why

D-370 removed review as a merge condition, but green work still waited. On Nov 20 about 30 task pull requests were green yet sat as drafts or without auto-merge, because the session that opened each one went quiet. Merges made with the Actions `GITHUB_TOKEN` do not trigger the deploy workflows, so landing has to run with a session's own GitHub credentials. Sessions run the picker all the time, so the picker does it.

## 2. What changes

- `scripts/autoLand.mjs` (new):
  - `autoLandCandidates(rows)` is pure. It returns the board rows whose state is `pr-green` and whose health is `green`, each with its pull-request number.
  - The status board already excludes everything that must not land: rows that are out of sync, parked (`owner`), waiting for a dependency, reported red or blocked, or whose PR is red or still running.
  - `runAutoLand` does the I/O through injected functions. For each candidate it:
    1. reads the PR;
    2. skips it if closed, conflicting, or no longer at the board's head;
    3. marks a draft ready;
    4. merges main into a branch that is behind (REST `update-branch`, a merge, never a rebase);
    5. turns auto-merge on with a merge commit.
  - Each step that fails is reported on its own line, and the next candidate still runs.
- `scripts/next-task.mjs`:
  - `--claim` runs auto-land once, before picking. Auto-land is skipped while main is red or unknown (D-082), and when the pull-request list could not be read.
  - `--auto-land` runs only auto-land.
  - `--status` stays read-only.

## 3. Unchanged

Required CI, the queue gate, the scope check, the test-integrity gate, migration-first, exact-SHA deploy and readiness. Auto-merge still waits for every required check on the merge result. A held, superseded or parked row never qualifies.

## 4. Done means

Tests cover the candidate filter and every runner path: draft, behind, conflict, closed, head moved, an API failure, and red main. The PR's CI is green. A real `--auto-land` run on main shows at least one green task PR set to auto-merge.

## 5. Proof

- `scripts/autoLand.test.ts`: 8 tests covering the candidate filter (green, red, out-of-sync, parked, CI moved, no sha, unknown task, review-pending), the hold (red, running-after-red, unknown main, unreadable PRs) and every runner path (draft+behind, already queued, conflict, closed, merged, head moved, foreign branch, API failure then next candidate, none).
- Full `scripts/` suite: 1655/1655 pass; `pnpm check` exits 0.

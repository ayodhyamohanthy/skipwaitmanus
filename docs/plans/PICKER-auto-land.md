# PICKER-auto-land: green task pull requests land on their own (D-371)

Status: `PICKER-auto-land` landed through PRs #1403 and #1406 (report `8021964cb`); branch `agent/queue/picker-auto-land`, decision D-371 (3). The owner said "auto land" on Nov 20, 2026. Follow-up row `PICKER-auto-land-cloud` (section 7, D-373 (4)) is registered and not built yet.

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

## 6. Follow-up after the first live run (Nov 20)

The first real `--auto-land` run on main `b8d3c592` produced two results:
- It merged main into #1404 over REST.
- Its GraphQL calls returned 403 for four PRs, because some sandboxes cannot reach GraphQL.

It also showed a design gap: a draft can mean the holder isn't finished. #710 is titled "browser acceptance pending".

Two fixes follow:
- **Drafts:** a draft lands only once its holder has been quiet for 2 hours, the point at which D-085 frees a claim. A draft whose holder is still active is skipped.
- **REST fallback:** when auto-merge cannot be enabled, a ready PR that is already clean against main merges at once over REST, at the same SHA and with the same checks. A behind or draft PR is never merged this way.

Tests: 3 new ones failed on the earlier code, and now 11/11 pass. The `scripts/` suite passes 1658/1658.

## 7. Follow-up: `PICKER-auto-land-cloud` (D-373 (4))

**Why.** Claude Code cloud sessions cannot reach GitHub GraphQL. Their proxy answers 403 with "GitHub GraphQL is not available from Claude Code sessions" and names REST routes for the same actions. So from those sessions, `markPullRequestReadyForReview` and `enablePullRequestAutoMerge` always fail. A quiet draft is never marked ready, and a PR that was behind is updated but never queued; it lands only if a later run happens to find it clean. The owner wants green work on `main` without anyone syncing by hand (D-373 (1)), from every session.

**Change** (`scripts/next-task.mjs`, `scripts/autoLand.mjs`):
- `runAutoLand` passes the pull-request number with the node id to `markReady` and `enableAutoMerge`, so the I/O layer can choose a route.
- In `scripts/next-task.mjs`, when the GraphQL call fails with HTTP 403 (the proxy refusal), the same step uses the session's REST route once:
  - mark ready: `POST /repos/{owner}/{repo}/pulls/{number}/ccr/ready_for_review`;
  - auto-merge: `PUT /repos/{owner}/{repo}/pulls/{number}/ccr/auto_merge` with the merge-commit method (never squash or rebase).
- Any other GraphQL error, or a failed REST route, is reported on that PR's line, and the next candidate still runs (section 2). The existing clean-and-ready REST merge fallback (section 6) stays as the last resort.
- Nothing else changes: the same candidates, the same holds (red main, unreadable PRs), the same draft quiet time.
- **Release hold (D-376).** `autoLandHold` also takes the live release that `state({ withRelease: true })` reads. While `releaseLandingHold(release)` returns a hold (a red light 4 to 7 on the exact released SHA), auto-land touches no pull request except one whose row is a registered release fix: the `Fixes release: <sha>` / `Fixes incident: #<n>` note that `releaseFixTasks` reads. An unreadable release adds no hold, as in the picker. `--claim` and `--auto-land` both read the release before auto-land runs.

**Tests** (red first, `scripts/autoLand.test.ts`, injected I/O): a red live release holds every candidate except a registered release fix, and an unreadable or green release adds no hold; GraphQL 403 then the REST route succeeds, for both ready and auto-merge; GraphQL 403 then the REST route fails, which gives an error line and the next candidate still runs; a non-403 GraphQL error does not try the REST route; the merge method is always a merge commit.

**Done means:** green required CI on the pull request; one real `node scripts/next-task.mjs --auto-land` run from a Claude Code cloud session that turns auto-merge on, or marks a quiet draft ready, on a real green task PR, with its output pasted in the pull request.

## Status
One line per task (D-134).
- PICKER-auto-land-cloud: in progress — Claude Code · e969 — 2026-11-21 — branch agent/queue/picker-auto-land-cloud

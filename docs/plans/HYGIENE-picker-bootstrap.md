# HYGIENE-picker-bootstrap: a fresh clone runs the picker first time, and finished work stops cluttering GitHub (D-387, D-205)

Tier 2 · lane `picker-bootstrap` · branch `agent/queue/hygiene-picker-bootstrap` · epic D-212

## The defects, observed on Nov 24 2026

1. In a fresh cloud session, `node scripts/next-task.mjs --status` died with a Node stack trace,
   `ERR_MODULE_NOT_FOUND: Cannot find package 'zod' imported from scripts/review-gate.mjs`, because
   dependencies were not installed. The next run stopped with `STOP: complete history is required;
   run git fetch --unshallow origin` (`scripts/next-task.mjs`, the `--is-shallow-repository` check).
   Every new cloud session pays both before it can be handed work.
2. 61 pull requests were open; 17 belonged to tasks already `done` (mostly old `agent/review/*` and
   `agent/heartbeat/*` marker PRs) and about 25 more were orphaned or superseded records. Lock
   branches `agent/queue/fix-main-*` from four weeks ago remain on origin.

## The fix

1. **Missing packages:** the picker's entry checks that its dependencies resolve before importing
   modules that need them, and on failure prints one line: run `pnpm install --frozen-lockfile`
   (allowed in every session, D-200 (5)), then exits non-zero. No stack trace.
2. **Shallow clone:** instead of stopping, the picker runs `git fetch --unshallow origin` once and
   re-checks. If that fails, the existing STOP message stands unchanged. Never fetch or modify
   anything else.
3. **Clean-up (operational, in this row's report, no code):** close each open PR whose head branch
   belongs to a `done` task or whose marker/record is superseded, with a one-line comment naming the
   task and the landed PR. Never close or delete `agent/reports/log` (#455), the landing slot (#625),
   unmerged work, or any branch of a task that is not done (`docs/plans/BRANCH-HYGIENE.md`). Delete
   `agent/queue/fix-main-<sha8>` lock branches only when their fix commit is in `main`. List every
   closed PR and deleted branch in the Status section.

## Tests (red first)

`scripts/nextTaskBootstrap.test.ts`: a missing dependency yields the install instruction and a
non-zero exit with no stack trace; a shallow repository triggers exactly one unshallow fetch and then
proceeds; a failing unshallow keeps the existing STOP text.

## Acceptance

Focused tests plus `scripts/nextTask.test.ts` and `pnpm check` green; required CI green; a fresh
shallow clone without `node_modules` prints the install line, and after install runs `--status`.

## Status

- HYGIENE-picker-bootstrap: review — Claude Code · 0889 — 2026-11-24 — branch agent/queue/hygiene-picker-bootstrap — PR #1535
- Clean-up, Nov 24 2026 (66 open PRs read against `docs/plans/assignments.json` on main):
  - **Closed (12), each with a comment naming its task:** #1313 (heartbeat, D-048-K-profile), #1049 (review,
    D-100.otp-hmac), #1047 (architect re-sync, D-048-p3-admin-approvals), #1036 (review, D-048-p3-for-companies),
    #1035 (review, D-048-p3-admin-money), #1034 (review, CONV-report-entry), #1033 (review, D-048-R4), #1031
    (heartbeat, D-048-p3-admin-approvals), #1029 (heartbeat, PICKER-land-exact-head), #872 (review,
    D-048-p3-conversation), #823 (review, D-048-p3-inbox), #806 (review, D-090-BYOR). Every task is `done`; 11 of
    the 12 changed no file. No branch was deleted.
  - **Skipped, task done but content not on main:** #1207 carries register entry D-339, absent from main; #1429
    carries the D-048-R-support release captures. A session should land or deliberately retire each.
  - **Skipped, no task or not done:** 52 PRs, including #455 and #625 (never closed), every PR updated in the last
    24 hours, the parked `D-048-K-*` drafts, and about 25 orphaned registry/docs PRs with no matching task. Those
    need a per-PR read, not a bulk rule.
  - **Lock branches:** none deleted. All 7 `agent/queue/fix-main-*` tips (20adbd8e, 38264e0d, 80123a43, affed40a,
    d6685c97, e6b785a0, eb0c78cd) are claim markers on top of main, not commits in main, and `fix-main-d6685c97`
    still backs open PR #1039.

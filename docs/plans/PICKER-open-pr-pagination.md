# Packet PICKER-open-pr-pagination: the picker reads every open pull request

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Qoder · eb18 on Nov 9 2026 against `main` `41e80352`.

## Why

`docs/plans/BRANCH-HYGIENE.md` already requires it: "**See every pull request.** `scripts/next-task.mjs` reads open pull requests with one `per_page=100` call (138 were open on Oct 26, so the oldest 38 were invisible) ... Read open pull requests page by page until a page returns fewer than 100." That bullet sits inside `BRANCH-HYGIENE-2`, which is parked at `owner` under D-232 because its *other* bullets run the branch-cleanup script. So the read-only requirement has had no buildable carrier, and the defect grew.

Measured on Nov 9 2026, 17:24Z:

- `GET /repos/ayodhyamohanthy/skipwaitmanus/pulls?state=open&per_page=100` returns 100; page 2 returns 86. **186 open pull requests, 86 invisible to the picker.**
- PR #632 (`agent/claude/d090-byor`, draft, open) is on page 2.
- `node scripts/next-task.mjs --status` printed row 164 `D-090-BYOR` with **no pull request link**, although the branch's own §3b row already says `review — ... independent review of this exact head required`.
- `--claim "Qoder"` therefore handed **TAKEOVER D-090-BYOR** on finished work ("Half-built and quiet"). A takeover on a complete row pushes commits onto a branch that is waiting for review, and its REVIEW/LAND stage can never be handed out because `v.pr` is null.

The same truncation hides the REVIEW and LAND stages of every row whose pull request is older than the newest 100, which is the "old work" the owner asked to be rid of (Nov 8: "make sure the queue doesnt have old work, but only updated work").

## Scope

Read-only picker correctness. No branch deletion, no `--apply`, no `--local`, no cleanup run: nothing in D-232's retention hold is touched, and this is not BRANCH-HYGIENE-2 shipped in halves.

- `scripts/nextTaskCore.mjs`: new pure `collectOpenPulls({ firstPage, fetchPage, maxPages })` and `OPEN_PR_PAGE_SIZE`. Pages are read until one is shorter than 100. An unreadable later page, a page that is not a list, a non-list first page, or a still-full page at `maxPages` returns `{ complete: false, reason }` — unknown, never "no pull request" (D-085).
- `scripts/next-task.mjs`: the open-pull-request read uses it; an incomplete read throws into the existing `openPrs = null` path, so the picker stops with "cannot read the open pull requests" instead of picking from a truncated view.
- `scripts/nextTaskOpenPrPagination.test.ts`: red-first, injected pages only.

**Not in scope.** The closed-pull-request window (`mergedHeads`, newest 100 by `updated`) and the branch-gone head lookup stay as they are: `collectLandedEvidence` already pages and caches that case (PICKER-landed-marker-continuity). They remain BRANCH-HYGIENE-2's bullets.

**No `owns`.** `scripts/next-task.mjs` and `scripts/nextTaskCore.mjs` are already owned by `PICKER-fullstack-lights` and `PICKER-qa-stage` (both `todo`, both blocked), and `validateAssignments` refuses two non-done rows that own one path without a dependency. As with D-286/D-294/D-307, the row declares no `owns`; the exact three-path scope is enforced by manual diff at review.

## Evidence

- Red first: the new test's first case reproduces the defect (a one-page read cannot see a pull request on page 2); the remaining cases fail on `collectOpenPulls` being absent.
- Green: `pnpm vitest run scripts/nextTaskOpenPrPagination.test.ts` plus the whole `scripts/` suite.
- End to end: `node scripts/next-task.mjs --status` on the fixed script shows the PR link on row `D-090-BYOR` where the old script showed none, and `--claim` on a completed row then hands its REVIEW stage (to a session whose model did not build it) instead of a takeover.

## Status

`PICKER-open-pr-pagination: in progress — Qoder · eb18 — 2026-11-09 — branch agent/queue/picker-open-pr-pagination`

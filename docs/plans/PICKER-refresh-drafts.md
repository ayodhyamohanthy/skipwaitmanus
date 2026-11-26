# PICKER-refresh-drafts (D-407 (4))

Tier 2 · lane `picker-refresh-drafts` · branch `agent/queue/picker-refresh-drafts` · epic D-212

## Why

Owner, Nov 26: "agents are still getting wait instructions which i told they should not get when we so many todos and tasks pending". Reproduced on main `c6c63a627`: a fresh preview returned `WAIT` (blocked `OPS-live-qa-journeys`) with 46 rows unfinished. 39 of them already carry a draft pull request built ahead (D-315/D-399), and `aheadPick()` in `scripts/nextTaskCore.mjs` passes over every row with a pull request, so it finds nothing and the final `WAIT` is returned. Those drafts sit 13 to 266 commits behind main and several are red, so the useful work left is keeping them current, so they land quickly once their dependency or owner call clears.

This is separate from `PICKER-blocked-wait-fallthrough` (an early-return path while scanning); it touches only the end of `aheadPick()`.

## Contract

1. After the D-399 owner/blocked pass finds nothing, consider rows that are not done, have an open pull request and a work branch, are not avoided and not out of sync (D-202), whose work branch and heartbeat are quiet for 2 h (`IDLE_MS`), and whose required CI is red or which are at least 20 commits behind main (`prBehind`, passed into the pick from `scripts/next-task.mjs`).
2. Hand out the first such row in queue order as a `takeover` with `refresh` set to the reason. The printed steps say: merge origin/main into the branch, keep both sides of any conflict, make required CI green on the draft, push, report `review`; never land, never mark done, never clear a block, never make an owner call.
3. Nothing else changes: rows whose dependencies are done still get their normal stages; red main, landing-slot waits, `--task`, `--avoid`, blocks and reviews are unchanged; a row's landing is still withheld until its dependencies are done or it returns from `owner`.
4. WAIT remains only when this pass is empty too.

## Tests

`scripts/nextTaskRefreshDrafts.test.ts`, red first: a registry whose only unfinished rows are a blocked gate and a quiet, 40-behind draft waiting on a dependency returns the refresh takeover (not WAIT); a fresh (active) draft, a draft 5 behind with green CI, an out-of-sync draft and an avoided draft are not handed out; with none eligible the original WAIT returns; the printed text says never land.

## Status

- PICKER-refresh-drafts: in progress — Claude Code · 530c — 2026-11-26 — branch agent/queue/picker-refresh-drafts. Built red-first: `scripts/nextTaskRefreshDrafts.test.ts` (9 cases); all 41 picker suites (665 tests) pass; a live preview on main `c6c63a627` that returned WAIT now hands out TAKE OVER LAUNCH-live-qa to refresh its draft (168 behind). `nextTask.test.ts` D-134 case updated for the D-407 (4) amendment (active holder still gets nothing).

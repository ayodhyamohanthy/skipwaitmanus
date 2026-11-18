# `PICKER-compact-claim-output`: a claim prints a short board and a short decisions list (D-358, D-360)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Owner instructions, Nov 18 2026: "let no agent be blocked for taking a task"; "do permanent fix then"; "zcode is stopping again after few mins" (D-360). Tier 2. Changes no price, plan, legal text, login rule or money path.

| Field | Value |
|---|---|
| Row | `PICKER-compact-claim-output` |
| Synced to | D-360 |
| Order | appended last (FIFO, owner Oct 31) |
| Depends on | nothing |

## Why

On Nov 18 a preview printed 526 lines (103 KB) and put the assignment at line 515. A ZCode GPT-6 Sol session's harness cut that output, failed to read the spilled log, and ended within minutes. Its claim on D-132-item3 still held the task. The board grows with every row, so every agent with an output cap hits this sooner or later.

## The change

**Where.** `scripts/nextTaskText.mjs` (new `renderBoardSummary`), `scripts/next-task.mjs` (the claim/preview path prints it instead of `renderBoard`), `scripts/nextTaskCompactBoard.test.ts` (new).

1. Red first, in `scripts/nextTaskCompactBoard.test.ts`: `renderBoardSummary(rows)` prints the board header, one line per epic with done/total, PRs, red and the number released (never the released ids), and one line naming `node scripts/next-task.mjs --status`. It prints no per-task line. On 400 synthetic rows it stays under 40 lines and 4 KB.
2. `next-task.mjs`: the `--claim` and plain preview path prints `renderBoardSummary(board)` where it printed `renderBoard(board)`. `--status` and the CEO review (`pick.board`) are unchanged.
3. Two CLI tests read a task's board line from the claim output (`review in-review` in `nextTaskArchitectReview.test.ts`, `waiting for new evidence or 24h` in `nextTaskBlockDedupe.test.ts`). Each keeps that assertion, run against `--status` in the same fixture, and gains one that the claim output names `--status`.
4. Nothing else changes: picking, claims, heartbeats, reports, sync notes, the newest-decisions block and the assignment text.

5. **D-360 (Nov 18), still to build.** After #1275 a live preview was still 109 lines / 19,874 bytes because the newest-decisions block listed 75 full summaries (13,343 bytes). Red first in `scripts/nextTaskCompactBoard.test.ts`: with 80 entries newer than `syncedTo`, the block names every one of them, prints a summary for the 10 newest only, cuts each summary to 160 characters, lists the rest by ID on one line, points to `docs/DECISIONS.md`, keeps the stop rule, and stays under 3 KB. The existing D-202 tests in `scripts/nextTask.test.ts` stay unchanged and green.

**Owned paths.** `scripts/next-task.mjs`, `scripts/nextTaskText.mjs`, `scripts/nextTaskCompactBoard.test.ts`, `scripts/nextTaskArchitectReview.test.ts`, `scripts/nextTaskBlockDedupe.test.ts`.

**Gates.** Tier 2: focused tests red first, `vitest run scripts/`, a real preview run showing the line count before and after, required CI green (D-352).

## Status
- `PICKER-compact-claim-output`: todo (step 5, D-360) — Claude Code — 2026-11-18. Steps 1-4 (D-358 board summary) landed in #1275 (`ac8a6137`).
- `PICKER-compact-claim-output`: review — agent/queue/picker-compact-output — Claude Code · d563 — 2026-11-18. `renderBoardSummary` prints one line per priority with counts and a `--status` pointer; the claim/preview path prints it instead of `renderBoard`. Live preview on main: 526 lines / 103,290 bytes (`NEXT:` at line 515) before, 50 lines / 8,139 bytes (`NEXT:` at line 39) after. Red first: 4 new cases failed; the two CLI tests now read board lines from `--status` in the same fixture and check the pointer. `vitest run scripts/` 64 files / 1,556 passed; `tsc --noEmit` clean.

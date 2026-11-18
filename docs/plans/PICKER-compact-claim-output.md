# `PICKER-compact-claim-output`: a claim prints a short board (D-358)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Owner instructions, Nov 18 2026: "let no agent be blocked for taking a task"; "do permanent fix then". Tier 2. Changes no price, plan, legal text, login rule or money path.

| Field | Value |
|---|---|
| Row | `PICKER-compact-claim-output` |
| Synced to | D-358 |
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

**Owned paths.** `scripts/next-task.mjs`, `scripts/nextTaskText.mjs`, `scripts/nextTaskCompactBoard.test.ts`, `scripts/nextTaskArchitectReview.test.ts`, `scripts/nextTaskBlockDedupe.test.ts`.

**Gates.** Tier 2: focused tests red first, `vitest run scripts/`, a real preview run showing the line count before and after, required CI green (D-352).

## Status
- `PICKER-compact-claim-output`: todo — Claude Code — 2026-11-18.

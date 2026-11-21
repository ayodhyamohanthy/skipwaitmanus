# Packet PICKER-unblock-report-clears: the unblocker's own report clears the block (D-378)

| Field | Value |
|---|---|
| Queue row | `PICKER-unblock-report-clears` in `docs/plans/assignments.json` (status lives there) |
| Tier | 2 (picker logic; no product, money, sign-in or data change) |
| Lane | `picker-unblock` |
| Decision | D-378 (owner, Nov 21 2026: "Opencode sessions are ending. Fix the blockers"; technical ruling under D-200 and D-321 (11)) |

## 1. The dead end

The UNBLOCK hand-out (`unblockSteps` in `scripts/nextTaskText.mjs`) tells its holder: "Report before you land the ruling's pull request ... `--report review` ... That newer report releases every priority below it."

Since D-346 (5) (`PICKER-block-dedupe`, commit `3e6bbcb77`), every blocked report carries `block-evidence`. In `standingReport` in `scripts/nextTaskCore.mjs`, a block with evidence is cleared only by a `green` or `landed` report. The unblocker's `review` goes into `newer` and the block stands. So:

- The unblocker is handed `CONTINUE: UNBLOCK <task>` on every run (the `v.unblocker === claimant` continuation), the same task on every retry. That is the dead end D-321 (11) names. Reproduced Nov 21: `Claude Code · 435a` reported `review` on `LAUNCH-live-qa` and was handed `CONTINUE: UNBLOCK LAUNCH-live-qa` again.
- Once the unblock lock has been quiet for 2 hours, the next session is handed the same UNBLOCK. `D-048-R-admin-money` went through four unblock locks (7a05, 8817, 2286, 6151) with its ruling unlanded. `D-100.hsts-preload` was still handed out after its ruling #1426 merged at `e8b1bc83`, because the 6f6c `review` report could not clear it.

Weaker sessions (free-model OpenCode) end when the picker hands them the same task again.

## 2. The change

1. `standingReport(reports, holder, unblockers)`: a later report from a session in `unblockers` clears an evidence-backed block, as D-200 lets any non-blocker, non-holder clear a plain block. Sessions that raised a block still open on the task, and the task's holder, still cannot clear it with their own report.
2. `unblockers` = every session with an `Unblock` marker for the task on its architect lock (`agent/architect/<slug>`), so a later packet or re-sync claim on the same lock does not bring the block back. Markers carry no time, so every unblocker of the task counts, not only the last.
3. The same unblockers are passed at all three call sites: `blockedReportError` (a cleared block is no longer a duplicate), `buildView` (picks) and `statusBoard` (the board's `report`).
4. Unchanged: an unrelated session's report cannot replace missing evidence (D-346 test "an unrelated follow-up report cannot replace missing evidence"); `green` and `landed` still clear from anyone; a new block after the ruling stands again; the 24-hour and new-evidence rules for re-handing an unchanged block.

## 3. Tests

`scripts/nextTaskUnblockClears.test.ts`, red first (`a002a3cc7`: 4 failed, 6 passed), then 10/10, with `scripts/nextTaskBlockDedupe.test.ts` 15/15 unchanged.

## 4. Owns

`scripts/nextTaskCore.mjs`, `scripts/nextTaskUnblockClears.test.ts`, this packet.

## Status

- PICKER-unblock-report-clears: review — Claude Code · 435a — 2026-11-21 — branch agent/queue/picker-unblock-report-clears, claim `a5bee23ec` on main `2d302b877` (D-378 registered by #1460). Red-first `a002a3cc7` (4 failed, 6 passed), fix `6ace99b1e`, AGENTS.md system-map note `4e0892217`. `nextTaskUnblockClears` 10/10 and `nextTaskBlockDedupe` 15/15. `pnpm vitest run scripts/` gives 1712 passed; two suites (`nextTaskClaimTask`, `provenanceGitOutput`) cannot start a worker in the cloud container and fail the same way on unmodified main. `pnpm check` exits 0. Lands on green required CI (D-370).

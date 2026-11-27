# Packet PICKER-speed-fixes: no empty work, no stale blocks, an honest board

Row `PICKER-speed-fixes` (Tier 2, picker only). Ruling: D-412 (3) and (4).

## Changes
1. **Refresh only what can land (D-412 (3)).** The D-407 (4) pass hands out keeping a withheld draft current only when its row waits solely on dependencies that each have an open pull request with green required CI. Owner-parked, blocked and unbuilt-dependency drafts are left alone.
2. **A landed ruling's unblocker still counts (D-412 (4)(a)).** A session with an `Unblock <id>` marker on the task's architect lock clears an evidence-backed block with its report even after the ruling merged and the lock's earlier commits are in main.
3. **A docs-only pull request is unbuilt (D-412 (4)(b)).** When every changed path of a row's open pull request is documentation and the row owns source files, the picker hands out a build, never review, landing or auto-land.
4. **Quiet claims read as free on the board (D-412 (4)(c)).** A holder quiet for the 2 h lease prints as `free (last: <holder>, quiet Nh)`.

## Owns
`scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs`, `scripts/next-task.mjs`, `scripts/nextTaskSpeedFixes.test.ts`, this packet; and `scripts/nextTask.test.ts` plus `scripts/nextTaskRefreshDrafts.test.ts`, whose D-407 (4) fixtures gain a green open pull request on the unmet dependency (assertions unchanged).

## Done when
Each change has a test that fails before and passes after, every existing `scripts/nextTask*.test.ts` stays green, `pnpm check` passes and required CI is green.

## Status

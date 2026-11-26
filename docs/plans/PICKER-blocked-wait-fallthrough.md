# PICKER-blocked-wait-fallthrough

Tier 2 · lane `picker-blocked-wait` · branch `agent/queue/picker-blocked-wait-fallthrough-build-902e` · epic D-212

## Why

D-399 requires a BUILD ahead on the oldest in-sync owner-parked row with a packet, then on an evidence-blocked row, after ordinary work is exhausted. The implementation in `scripts/nextTaskCore.mjs` currently returns immediately when the main task scan encounters a non-landing `wait` (lines 1342-1345), before the D-399 `aheadPick()` at lines 1363-1370.

Reproduced on main `8951b1518faa6089a86c29a2eaae78bb93d47951`: both `node scripts/next-task.mjs --claim "GPT-6.1 Sol"` and `node scripts/next-task.mjs --as "GPT-6.1 Sol · b6ea"` returned `WAIT` at blocked `D-089.ui`. That row has open draft PR #1585 and must be passed over under D-399. Earlier in the task order, `BANDED-release` is owner-parked, has a packet, is stamped through D-392, and has no open PR; it is a valid D-399 build-ahead candidate. The early return makes that eligible work unreachable.

This is a follow-up to the completed `PICKER-never-wait` task, not a reopening of its merged branch. The separate `PICKER-landing-wait-fallthrough` packet is limited to landing-slot waits; this task does not expand that packet or change landing behavior.

## Decisions and constraints

- D-399: build ahead on packet-backed owner rows, then evidence-blocked rows; never land or mark those builds done from the hold.
- D-109: a red or blocked row continues to hold its own lane and dependents.
- D-315: after other eligible work is exhausted, an honest WAIT is valid when no build-ahead row is eligible.
- D-202: stale rows are not built; report/decision sync holds remain intact.
- D-370: every PR lands on green required CI, with no independent-review dependency.

No product behavior, money, auth, release switch, owner decision, external service, or dependency changes.

## Scope

- `scripts/nextTaskCore.mjs`: defer a blocked non-landing WAIT while scanning, but preserve its lane/dependency hold and return it if no ordinary or build-ahead work is eligible.
- `scripts/nextTaskBlockedWaitFallthrough.test.ts`: red-first picker contract tests for build-ahead, lane/dependency holds, and the final honest WAIT.
- This packet and its row in `docs/plans/assignments.json`.

No `nextTaskText.mjs` changes unless a focused test proves the existing output is inaccurate; no landing-slot, red-main, review, report, or claim rules are relaxed.

## Acceptance

1. Red-first: with a packet-backed owner row and a later task whose block is still waiting for evidence, the default picker hands out the owner row's D-399 BUILD instead of returning the blocked WAIT.
2. The blocked row still holds its lane and dependent tasks; an unrelated eligible task can proceed.
3. When every owner/blocked candidate is stale, already has an open PR, or is otherwise ineligible, the picker returns the original truthful WAIT with the blocked task and reason.
4. Normal priority, claimant continuation, `--task`, `--avoid`, red-main precedence, landing-slot waits, and the existing exact CI/landing gates remain unchanged.
5. A CLI-level preview against the captured synthetic registry returns the build-ahead task; no real task refs or report markers are written by tests.

## Verification

Run the new focused suite, related picker suites (`scripts/nextTask.test.ts`, `scripts/nextTaskParallelEligibility.test.ts`, `scripts/nextTaskClaimTaskCli.test.ts`, and `scripts/nextTaskLandingWaitFallthrough.test.ts`), `pnpm check`, assignment validation, and `git diff --check`. Required CI on the exact PR head is the landing gate. No production verification or deployment is applicable to the picker-only change.

## Status

PICKER-blocked-wait-fallthrough: requeued for implementation — PR #1663 merged as `bf5d91a46` after adding packet status notes only; source fix and tests remain owed. Fresh implementation branch `agent/queue/picker-blocked-wait-fallthrough-build-902e`.

Preflight receipt: current main `bf5d91a467ee12daa92004f4593fed895db3b1ee`; session `GPT-6.1 Sol · 902e`. Read `AGENTS.md`, `docs/BRIEF.md`, `docs/PRD.md`, `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, this packet, and decisions D-400–D-403, D-405 and D-406. D-406 affects auth tasks only; D-370 keeps required CI without a review/model gate. Previous repo-only outcome: PR #1663 merged the prior branch with packet status notes only; PR #1661 registered this implementation task. Both the official `--claim` and read-only `--as` reproduced WAIT at blocked `D-048-K-admin-money` before `aheadPick()`. The implementation and focused regression proof remain owed.

Registration history (PR #1661):

Registered as a D-399 follow-up after a real current-main `--claim` and `--as` reproduction. Registration base: `8951b1518faa6089a86c29a2eaae78bb93d47951`; decisions read through D-405. No picker source or test code has been changed in the registration PR. The normal picker claim must assign the implementation row after this registration lands.

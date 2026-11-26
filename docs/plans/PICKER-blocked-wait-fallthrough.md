# PICKER-blocked-wait-fallthrough

Tier 2 · lane `picker-blocked-wait-fallthrough` · branch `agent/queue/picker-blocked-wait-fallthrough-build-902e` · epic D-212

## Why

D-399 requires build-ahead on the oldest eligible in-sync owner row with a packet, then on evidence-blocked rows, after ordinary and dependency-held work is exhausted. This task protects that contract with characterization tests; inspection has not demonstrated a current source defect.

At recovery HEAD `0c14c9be8233ee50e80bc2aa365a51ea090d75d8`, `actionFor()` returns a `gate` for `blockWaitingForEvidence` (`scripts/nextTaskCore.mjs:1115`). The scan records the lane/dependency hold and continues (`1330–1334`), reaching `aheadPick()` (`1368–1370`) before the final blocked WAIT (`1377`). The earlier attribution to the non-landing WAIT return (`1342–1345`) did not establish a reachable blocked-evidence path. This follows the completed `PICKER-never-wait` task and preserves the separate landing-wait contract.

## Decisions and constraints

- D-399: build ahead on packet-backed owner rows, then evidence-blocked rows; never land or mark those builds done from the hold.
- D-109: a red or blocked row continues to hold its lane and dependents.
- D-315: preserve ordinary/dependency-held priority and an honest WAIT when nothing is eligible.
- D-202: preserve decision-sync and evidence holds.
- D-370: required CI remains the landing gate without a review/model dependency.

No product, runtime, money, auth, migration, configuration, dependency or production changes.

## Scope

- `scripts/nextTaskBlockedWaitFallthrough.test.ts`: production-default characterizations of build-ahead, lane/dependency holds and honest WAITs.
- `scripts/nextTaskClaimTaskCli.test.ts`: one production-default preview against a synthetic registry and disposable local origin; assert unchanged local/remote refs and native `--status` block text. Its previous owning rows, `PICKER-claim-task` and `PICKER-never-wait`, are done.
- This packet and only this task's row in `docs/plans/assignments.json`.
- `scripts/nextTaskCore.mjs` is read-only unless a real failing current-default case establishes a defect. No source or export change is currently indicated.

## Acceptance

1. With an eligible packet-backed owner row and a task waiting for block evidence, the production-default picker selects the owner's D-399 BUILD in either row order. Characterize existing behavior; any source repair requires a real failing case first.
2. The blocked row keeps its lane/dependency hold; unrelated ordinary work proceeds first, and D-315 dependency-held build-ahead remains distinct.
3. Ineligible owner/blocked candidates (stale, active other holder, avoided, missing packet or already having a PR) preserve the original truthful WAIT and block reason.
4. Preserve claimant continuation, `--task`, `--avoid`, normal priority, red-main precedence, landing waits and exact CI/landing gates.
5. An actual production-default CLI preview selects build-ahead using a synthetic registry and disposable local origin, without changing refs or installing a hook. Network responses are mocked; prior completed failed CI supports the running-CI fixture, without fabricating green CI.

## Verification

Run `LANG=en_US.UTF-8 pnpm vitest run scripts/nextTaskBlockedWaitFallthrough.test.ts scripts/nextTask.test.ts scripts/nextTaskParallelEligibility.test.ts scripts/nextTaskClaimTaskCli.test.ts scripts/nextTaskLandingWaitFallthrough.test.ts --no-cache --configLoader runner`, `pnpm check`, `validateAssignments` against the register and packet paths, and `git diff --check`. Required CI on the final PR remains necessary. No deployment or production verification applies to this behavior-preserving change.

## Status

PICKER-blocked-wait-fallthrough: implementation complete on branch — regression coverage verified; protected PR/CI pending — GPT-6.1 Sol · 4e55 — 2026-11-26. Registry status stays `todo` for the primary's PR handling; no landing or deployment is claimed.

Recovery receipt: clean worktree `picker-blocked-wait-recovery-4e55`, takeover HEAD `0c14c9be8233ee50e80bc2aa365a51ea090d75d8`; fetched main `c6c63a6274ee4f6b43195320e1d9961340c2d110`. Read `AGENTS.md`, `docs/BRIEF.md`, `docs/PRD.md`, `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, `docs/DELEGATION.md` §4, this packet, the production policy/source path, and D-399–D-403, D-405 and D-406; none of the newer entries changes this task. The interrupted predecessor clone remains untouched. Both test files were ported byte-for-byte; earlier test/typecheck assertions are not used as current proof. No runtime defect or source repair is claimed.

Current validation (unchanged runtime source, assertions and timeout settings):

- `pnpm install --frozen-lockfile --offline`: exit 0, 1,129 packages added, zero downloaded, 3m 50.5s; isolated `node_modules`, manifests/lockfile unchanged. An initial test invocation using `pnpm --dir … vitest` exited 243 with `EACCES` before Vitest launched; the command above was then run from the recovery worktree.
- The exact five-suite command in Verification exited 1 after 114.71s: **225 passed / 1 timeout / 226 total**. Blocked fallthrough **14/14**, CLI **10/10** (including the new production-default preview), parallel eligibility **6/6**, landing fallthrough **13/13**, core **182/183**. The only failure was the existing branch-scan case at `scripts/nextTask.test.ts:2254`, timed out at 20,000ms; no assertion mismatch was reported.
- Isolated retry, after typecheck completed: `LANG=en_US.UTF-8 pnpm vitest run scripts/nextTask.test.ts --no-cache --configLoader runner` exited 0: **183/183 passed**, 33.09s; the previously timed-out case completed in 8.219s. Every requested suite has a passing current result across these runs; the initial combined run remains a recorded failure.
- `pnpm check`: exit 0 (`tsc --noEmit`), no diagnostics. `validateAssignments` with `parseDecisionRegister` and actual packet existence: **464 tasks, 377 decisions through D-406, errors `[]`**. `git diff --check`: exit 0. Scope comparison confirms only this registry row changed and no runtime, policy, config or dependency file changed.

Historical receipts, with the diagnosis qualified by the source inspection above:

- PR #1661 registered the task at main `8951b1518faa6089a86c29a2eaae78bb93d47951`, with decisions through D-405 and no source/test changes. It recorded WAIT at blocked `D-089.ui` (draft #1585) while considering owner-parked `BANDED-release` eligible; that observation did not prove eligibility through every gate.
- PR #1663 merged as `bf5d91a46` with packet status notes only. Its later WAIT observation at blocked `D-048-K-admin-money` did not isolate an early-return defect.
- PR #1671 requeued the unfinished work on this branch and merged as `c6c63a6`; predecessor claim `ba3532f081fe76dc4a09bec6925ab1026d98947f`. This recovery supplies regression proof on unchanged source; the primary's commit/push, protected PR and required CI remain pending.

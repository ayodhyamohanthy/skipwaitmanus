# PICKER-blocked-wait-fallthrough

Tier 2 · lane `picker-blocked-wait-fallthrough` · branch `agent/queue/picker-blocked-wait-fallthrough-build-902e` · epic D-212

## Why

D-399 requires build-ahead on the oldest eligible in-sync owner row with a packet, then on evidence-blocked rows, after ordinary and dependency-held work is exhausted. This task protects that contract with characterization tests; no current source defect has been demonstrated.

At recovery HEAD `0c14c9be8233ee50e80bc2aa365a51ea090d75d8`, `actionFor()` returns a `gate` for `blockWaitingForEvidence` (`scripts/nextTaskCore.mjs:1115`). The scan records the lane/dependency hold and continues (`1330–1334`), reaching `aheadPick()` (`1368–1370`) before the final blocked WAIT (`1377`). The earlier attribution to the non-landing WAIT return (`1342–1345`) did not establish a reachable blocked-evidence path. This follows the completed `PICKER-never-wait` task and preserves the separate landing-wait contract.

Main `d9c69998fed07f1fa619726ba545c2b2e337ba17` integrates D-407 and PR #1675's draft-refresh fallback. With nothing left to build, a quiet withheld draft qualifies for refresh if required CI is red or it is at least 20 commits behind main. The existing characterizations use running CI without qualifying drift, so their honest WAIT and D-399 build-ahead expectations remain accurate. The integrated six-suite run below verifies both contracts without a task-specific source repair.

## Decisions and constraints

- D-399: build ahead on packet-backed owner rows, then evidence-blocked rows; never land or mark those builds done from the hold.
- D-109: a red or blocked row continues to hold its lane and dependents.
- D-315: preserve ordinary/dependency-held priority.
- D-407: after build-ahead is exhausted, refresh quiet withheld drafts with red CI or at least 20 commits of drift; retain their holds and never land them. WAIT remains when no eligible work or refresh exists.
- D-202: preserve decision-sync and evidence holds. This packet is checked through D-409. D-408's login changes and D-409's automated-QA/bug-picking rows do not change this characterization scope or its acceptance.
- D-370: required CI remains the landing gate without a review/model dependency.

This task adds no runtime, product, money, auth, migration, configuration, dependency or production changes; every integrated main change is preserved.

## Scope

- `scripts/nextTaskBlockedWaitFallthrough.test.ts`: 14 production-default characterizations of build-ahead, lane/dependency holds and honest WAITs.
- `scripts/nextTaskClaimTaskCli.test.ts`: one production-default preview against a synthetic registry and disposable local origin; assert unchanged local/remote refs and native `--status` block text. Its previous owning rows, `PICKER-claim-task` and `PICKER-never-wait`, are done.
- This packet and only this task's row in `docs/plans/assignments.json`.
- `scripts/nextTaskCore.mjs` remains read-only for this task. `scripts/nextTaskRefreshDrafts.test.ts` is a read-only related regression from integrated main.

## Acceptance

1. With an eligible packet-backed owner row and a task waiting for block evidence, the production-default picker selects the owner's D-399 BUILD in either row order. Characterize existing behavior; any source repair requires a real failing case first.
2. The blocked row keeps its lane/dependency hold; unrelated ordinary work proceeds first, and D-315 dependency-held build-ahead remains distinct.
3. Ineligible owner/blocked candidates (stale, active other holder, avoided, missing packet or already having a PR) preserve the original truthful WAIT and block reason when no D-407 draft refresh qualifies.
4. Preserve claimant continuation, `--task`, `--avoid`, normal priority, red-main precedence, landing waits and exact CI/landing gates.
5. An actual production-default CLI preview selects build-ahead using a synthetic registry and disposable local origin, without changing refs or installing a hook. Network responses are mocked; prior completed failed CI supports the running-CI fixture, without fabricating green CI.

## Verification

Run `LANG=en_US.UTF-8 pnpm vitest run scripts/nextTaskBlockedWaitFallthrough.test.ts scripts/nextTask.test.ts scripts/nextTaskParallelEligibility.test.ts scripts/nextTaskClaimTaskCli.test.ts scripts/nextTaskLandingWaitFallthrough.test.ts scripts/nextTaskRefreshDrafts.test.ts --no-cache --configLoader runner --maxWorkers 1 --no-file-parallelism`, `pnpm check`, `validateAssignments` against the actual register and packet paths, `node scripts/scope-check.mjs PICKER-blocked-wait-fallthrough`, and `git diff --check`. Required CI on the final PR remains necessary. No deployment or production verification applies to this task's regression-only change.

## Status

PICKER-blocked-wait-fallthrough: locally validated, ready for protected PR; required CI pending — GPT-6.1 Sol · 8cdf — 2026-11-26. Existing characterization tests are preserved. Registry status remains the branch-prepared `done`, reaching main only after final protected CI/PR; no landing or deployment is claimed.

Validation-time read/integration receipt: takeover `eb098e93be827310ccf3b2d276ce78f39ba5b4ae` (GPT-6.1 Sol · 8cdf) preserves published tests `a7043ffa849d44fc282b067fbc47250d3d2a8e40` and the predecessor's main merges. Fetched main `eac7b8e4c544aef10ef7857a3369dea1e7cac50d` and merged it automatically with `--no-commit --no-ff`, without conflicts, in `picker-blocked-wait-fallthrough-build-902e-8cdf`. Read `AGENTS.md`, `docs/BRIEF.md`, `docs/PRD.md`, `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, `docs/DELEGATION.md` §4, this packet/row and full D-399/D-407–D-409 entries. D-407's integrated fallback is preserved; D-408/D-409 leave this task's contract unchanged. This regression proof protects continued eligible product work without releasing holds. Only this packet and this task's registry row are edited in this step; source, tests, assertions, timeouts, policies and dependencies are unchanged.

Earlier recovery receipt: takeover `0c14c9be8233ee50e80bc2aa365a51ea090d75d8` on main `c6c63a6274ee4f6b43195320e1d9961340c2d110`; primary committed/pushed the first validated step as `a7043ffa849d44fc282b067fbc47250d3d2a8e40`. The predecessor validated that head with main `d9c69998fed07f1fa619726ba545c2b2e337ba17` in `picker-blocked-wait-recovery-4e55`, before the integration was committed. Earlier reads also covered policy/source and D-400–D-403, D-405–D-406. Interrupted predecessor worktrees remain untouched.

Latest integrated validation used `eb098e93b` plus main `eac7b8e4c`; the merge was uncommitted at validation time:

- The exact six-suite serial command in Verification exited 0: **235/235 tests across 6/6 suites**, **120.95s** Vitest duration (**104.70s** tests; **139.10s** shell wall time), zero failures or timeouts. The preserved core, CLI, parallel-eligibility, landing-fallthrough, blocked-fallthrough and draft-refresh suites all passed.
- `pnpm check`: exit 0 (`tsc --noEmit`), no diagnostics, **181.84s** shell wall time.
- `validateAssignments` with the actual register and packet paths exited 0: **472 tasks, 380 decisions through D-409, errors `[]`**. This task remains branch-prepared `done`, `syncedTo: D-409`; every other task row matches merged main.
- `node scripts/scope-check.mjs PICKER-blocked-wait-fallthrough`: exit 0, **2.714s**. The unchanged gate emitted its existing full-edit-rights notice for `scripts/nextTaskClaimTaskCli.test.ts`, absent from origin/main's owns but included in this branch's packet/own row. The pending difference from main is exactly the two test files, this packet and this task's registry row; no gate or policy was changed.
- `pnpm install --offline --frozen-lockfile`: exit 0, **529.82s** shell wall time, 1,129 locked packages and no downloads. Manifests and build-script approval settings are unchanged.
- Final `git diff --check` and `git diff --cached --check`: exit 0. Only the two authorized records were manually edited; at validation time the main merge was conflict-free and uncommitted, and the existing tests and core source were unchanged.

Earlier integrated validation on `a7043ffa8` plus main `d9c69998f`:

- The six-suite serial command in Verification exited 0: **235/235 passed across 6 suites**, **46.37s**, zero failures or timeouts. Core **183/183**, CLI **10/10**, parallel eligibility **6/6**, landing fallthrough **13/13**, blocked fallthrough **14/14**, draft refresh **9/9**. The existing branch-scan case that previously timed out completed in **5.546s**.
- `pnpm check`: exit 0 (`tsc --noEmit`), no diagnostics.
- `validateAssignments` with `parseDecisionRegister` and actual packet existence: **465 tasks, 378 decisions through D-407, errors `[]`**. This task is `done`, `syncedTo: D-407`. `git diff --check`: exit 0.

Earlier recovery evidence, distinct from the integrated result: at `0c14c9be8`/main `c6c63a627`, the five-suite parallel run exited 1 after 114.71s with **225 passed / 1 timeout / 226 total**. The existing branch-scan case at `scripts/nextTask.test.ts:2254` exceeded 20,000ms; no assertion mismatch was reported. Its isolated core retry passed **183/183** in 33.09s, with that case at 8.219s. The first-step typecheck and registry checks passed. Locked dependencies were installed offline in this isolated worktree; no manifests or approval settings changed. These earlier outcomes do not substitute for the latest integrated proof.

Historical receipts, with the diagnosis qualified by the source inspection above:

- PR #1661 registered the task at main `8951b1518faa6089a86c29a2eaae78bb93d47951`, with decisions through D-405 and no source/test changes. It recorded WAIT at blocked `D-089.ui` (draft #1585) while considering owner-parked `BANDED-release` eligible; that observation did not prove eligibility through every gate.
- PR #1663 merged as `bf5d91a46` with packet status notes only. Its later WAIT observation at blocked `D-048-K-admin-money` did not isolate an early-return defect.
- PR #1671 requeued the unfinished work on this branch and merged as `c6c63a6`; predecessor claim `ba3532f081fe76dc4a09bec6925ab1026d98947f`. This recovery supplies regression proof. The primary owns the protected PR and required CI.

# Packet PICKER-PARALLEL: let many agents work on one goal safely

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-109, D-134) on Oct 21 2026 from a read-only study of `scripts/nextTaskCore.mjs`, `scripts/next-task.mjs` and the D-048 rollout. The picker hands out one task from this packet at a time; do only the task it prints. The register wins any conflict.

All tasks here are Tier 2 (PICKER-board-epic is Tier 3) and live in lane `picker` (they edit the same files, so they run one after another). Every task: red-first tests in `scripts/nextTask.test.ts`, no new dependency, `scripts/briefContract.test.ts` and the full gate green, every affected doc updated in the same pull request (D-068), landed under D-082. Keep `scripts/nextTaskCore.mjs` pure (no I/O): GitHub and git reads stay in `scripts/next-task.mjs`.

## PICKER-landing-slot: one landing at a time, without discipline
**Why.** D-082 says one landing at a time, but nothing enforces it. With eight or more lanes, landers who merged the same `main` race each other: each loser re-merges and re-runs CI (about 4.4 minutes), and six simultaneous CI runs use 18 of GitHub Free's 20 concurrent jobs, which delays `main`'s own CI.
**What.** A marker ref `agent/queue/landing` (add it to `RESERVED` and `MARKER_ONLY` beside `agent/review/`), with the verbs `Land claim` and `Landed`. A lander takes the slot with an empty marker commit (first push wins, like every claim), keeps it alive with `--heartbeat` (a deploy can run 25 minutes), and releases it with `--landed --task <id> --as "<name>"` after main's CI and deploys finish. Only a slot nobody pushed to for 30 minutes is free. Every `land` step and `continue land` step tells the agent to take the slot first; an agent that cannot take it gets `WAIT` naming the holder.
**Tests.** Two landers: the second waits and names the first; a quiet slot is taken over; `--landed` by someone else is refused; red `main` still beats everything.

## PICKER-owns-scope: file ownership, checked
**Why.** Lanes are labels, not file locks: two lanes can edit the same file and nothing notices until a merge conflict or a regression. `TASK_KEYS` rejects unknown keys, so ownership cannot even be written into `docs/plans/assignments.json` yet. Needed before D-048 wave 2 fans out to about eight lanes.
**What.**
1. An optional `owns` key on a task: an array of repository paths, folder prefixes ending in `/`, or globs with `*` and `**`, matched by a small built-in matcher (no dependency).
2. `validateAssignments` refuses two tasks that are not done whose `owns` overlap, unless one depends on the other.
3. A `filesBusy` check beside `laneBusy`: a new build waits while an open task owns an overlapping path.
4. `scripts/scope-check.mjs <task-id>`: reads `owns` from `origin/main`'s task list and `git diff --name-only origin/main...HEAD`, and fails on any changed path outside `owns` (the task's own packet file and its own status in `docs/plans/assignments.json` are always allowed, because the picker's steps write them), any edited or deleted existing `*.test.ts(x)` that is not in the task's `owns` (a retirement row may delete kit tests together with the code they cover), any path under `shared/` or `server/` for a task whose `owns` has none, and more than 12 changed lines in a file the task owns as `(switch only)`. It fails open (exit 0 with a warning) only on its own internal error, never on a definite violation.
5. The `land` and review steps print `node scripts/scope-check.mjs <id>` and the pairwise conflict probe against every other open branch of the same goal: `git merge-tree $(git merge-base origin/main origin/<a>) origin/<a> origin/<b> | grep -c '^+<<<<<<<'` must be 0.
6. Add it as a step in the required typecheck job in `.github/workflows/ci.yml`: this packet authorizes that one edit (DELEGATION never-do 9; CEO ruling, D-134). It reads the task from the branch name.
**Tests.** Overlap refused by the validator; overlap allowed with a dependency; `filesBusy` holds a build; the scope check passes inside `owns`, fails outside it, fails on a deleted test, and fails open on a crash.

## PICKER-status-rows: no two tasks rewrite the same status line (done by D-134: printed steps send tasks that share a row to their packet's Status section)
**Why.** All D-048 rows carry the §3b row `D-048`, and each task's first commit rewrites that same plan line. With about 60 surface tasks that guarantees conflicts, and one landing can overwrite another's status.
**What.** Either `validateAssignments` requires a unique `row` among tasks that are not done, or tasks that share a row write their status in their packet's own section and the printed steps say so (`scripts/nextTaskText.mjs`, every place that tells an agent to set the §3b row). Prefer the second: a goal like D-048 keeps one plan row whose cell points to `docs/plans/D-048-phase-3-split.md`.
**Tests.** Two tasks with one row print the packet-section instruction; a unique row prints the plan-row instruction.

## PICKER-lane-busy: a green pull request waiting for review no longer blocks its lane (after owns-scope)
**Why.** A cluster lane idles while a Tier 1 review waits, even when the next task touches different files.
**What.** `laneBusy` counts only tasks being built (claimed and no pull request, or a pull request that is red or running with an active builder). A green pull request waiting for review or landing stops blocking the next build in its lane, but only when the two tasks' `owns` do not overlap. Also: an architect task is never held by the D-109 hold loop (packets do not change code). A task that waits for a dependency already no longer holds its lane (D-134, done).
**Tests.** A green PR waiting for review lets the next lane task build when `owns` are disjoint, and holds it when they overlap.

## PICKER-board-epic: the board shows a goal at a glance
**Why.** `roleOf` maps only the exact lane `design` to CDO, so every `d048-*` lane shows CTO; the board lists 76 rows with no roll-up; and it shows a pull request as mergeable while it is many commits behind `main`.
**What.** `ROLE_BY_LANE` becomes a prefix match (`design*` and `d048-*` map to CDO). An optional `epic` key groups rows, and `--status` prints one roll-up line per epic (for example `D-048-p3: 12/76 done, 6 PR, 1 red, released: inbox`). Each open pull request shows `behind main N` from `git rev-list --count` (no GitHub read).
**Tests.** Prefix roles; the epic roll-up counts; `behind main` from a fixture.

## PICKER-review-independence: a Tier 1 review never goes to the model that built or fixed the work (D-151)
**Why.** D-151: a Tier 1 review is independent only when its model (the part of the name before " · ", `modelOf` in `scripts/nextTaskCore.mjs`) neither built nor fixed the work. `did(v, roles)` compares exact session names, so another session of the builder's or a fixer's model is handed the review: on Oct 22 Qoder · a236 was handed #382 minutes after Qoder · 31dd fixed it, and blocked it rather than pass its own model's fixes. The `Fixed` marker a fixer pushes with `--fixed` is not counted as a fix either: `fixers` reads only `Fix claim`.
**What.**
1. `did()` in `scripts/nextTaskCore.mjs` matches by model: a claimant counts as having built or fixed a task when `modelOf(claimant)` equals `modelOf` of any name in the roles asked for. This covers both places that call it: the review hand-out ("needs a review, and you built or fixed it") and the landing after a passed review ("its review passed, and you built or fixed it"). Exact-name checks elsewhere (your own claim, heartbeats, takeovers) stay as they are.
2. `fixers` also counts the `who` of every `Fixed` marker on the review lock, beside `Fix claim`.
3. The printed review step (`case "review"` in `scripts/nextTaskText.mjs`, now "You must not have built or fixed this") names the rule: no session of your model may have built or fixed it (D-151); for a pull request built or fixed outside the picker, check its comments and the task's reports on the board for your model, and if you find it, post no verdict and report it blocked to the CEO.
4. `docs/DELEGATION.md` §6 already states the rule (D-151); the living system map in `AGENTS.md` (the agent work queue row) says the picker matches reviewers by model.
**Tests** (red first, in `scripts/nextTask.test.ts`). A session of the builder's model is not handed the review, while a session of another model is; a session of a fixer's model is not handed the re-review, counting a fixer known only from a `Fixed` marker; a session of the builder's model is not handed the landing after a pass; the reviewer who returned findings is handed the re-review; the CEO, whose model built nothing, is handed it.

## Status
The PICKER rows share the plan row "D-134", so each writes its status here, one line per task, never in the shared §3b row (D-134).
- PICKER-lane-busy: in progress — GPT · 51d5 — 2026-10-23 — branch agent/queue/picker-lane-busy.
- PICKER-review-independence: in progress — Forge · fd06 — scoped owner exception recorded and published first as 911b6ca2; atomic manual claim 1ad873a4; red-first model exclusion repair, reviews and holds unchanged.
- PICKER-landing-slot: done — 1e9ba07f (PR #497) — Gemini 3.8 Flash · 8f37
- PICKER-board-epic: implementation in review — Cue — `agent/cue/picker-board-epic-dbht`. Owner-scoped work adds design-team roles, grouped progress, and behind-main counts; presentation-only `epic: "D-048-p3"` metadata preserves task order and dependencies. Roll-ups count board done states, open PRs, and red health; `released` lists done task IDs. Behind-main means commits reachable from `origin/main` but not the PR branch (`origin/<head>..origin/main`); missing refs show unknown, never zero. Merge is authorized only after required protections and checks pass; development continues pending those gates.
- PICKER-board-epic validation: after integrating PR #548 from main, focused picker tests passed 130/130. Full local gate passed: typecheck, design-token audit, migration lint, deploy-trigger audit, 4,369 tests passed / 17 skipped (506 files passed / 4 skipped), production build and diff check. External credential tests were disabled with `RUN_EXTERNAL_CREDENTIAL_TESTS=false`; no production writes or deploys were run. Independent code review found no blocking regression. PR #549 carries the task's done status for landing; required GitHub checks and protections still gate the merge.
- PICKER-owns-scope: done — workbuddy · b0eb — 2026-10-23 — PR #548. owns + the overlap rule + filesBusy (red-first, 4 of 5 failed on the old core); scripts/scope-check.mjs fails open only on its own error; the typecheck job runs it per pull request. Limitation recorded: the check reads owns from origin/main, so this task (which introduces owns) is skipped until it lands.


## Scoped founder manual-claim exception, Oct 23, 2026

> Approved under Ayu’s standing owner approval: one-task manual-claim exception for PICKER-review-independence, record it in the repo first. Reviews and holds unchanged.

Source: Ayu's explicit instruction, Oct 23, 2026. This exception permits only Forge · fd06 to record one manual claim for the already approved PICKER-review-independence task on agent/queue/picker-review-independence, after this attestation is committed and published in the repository. It does not amend queue order, confer reviewer eligibility, authorize any other manual claim, or bypass checks or reviews. The task remains Tier 2 with the existing PICKER-PARALLEL packet and minimal scope. All other D-083/D-085 claim rules remain binding. D-035 rejection, phone hold, #508 owner-only merge, and #526/#529 review and landing holds remain unchanged. No production or feature activation is authorized.

Implementation plan for PICKER-review-independence: change scripts/nextTaskCore.mjs model-level role exclusion and Fixed-marker tracking, scripts/nextTaskText.mjs review wording, scripts/nextTask.test.ts red-first regressions, AGENTS.md living system map and this task's Status line. Preserve exact-session claim ownership. No I/O, schema, runtime product, dependency, queue-order or provider changes. Validate same-model builder and Fixed-only fixer skip review and select next eligible build, independent controls, landing exclusion, focused picker/brief contracts, typecheck, build and full gate before publication.

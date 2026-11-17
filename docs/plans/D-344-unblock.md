# D-344: remove the landing bottlenecks (owner, Nov 16 2026)

Owner, verbatim: "let gpt 6.1 sol review it is poerful model too. rem bottlenecks we should go to production bug free fast" and "remove whats causing slowness or bottlenecks". On the four options Claude put to the owner, the owner chose to allow same-model review now and approved all four bottleneck removals. The ruling is in `docs/DECISIONS.md` D-344. This packet holds the two rows it adds.

## Why (measured Nov 16, main `0de8feb6`, CI green)

- Only two pull requests merged since midnight IST, and both were docs (#1202, #1211). The last product release was D-048-R-conversation (#1199, 03:46 IST). More than 40 CEO reports went to about 8 pull requests going round review, findings and block.
- Every page release row owned only its `RELEASED` switch. Each review finding on the page itself therefore needed its own register ruling first (D-338, D-340, D-342, D-343 on PR #1212), and that ruling then needed its own review. That is two pull requests and two reviews per finding.
- `D-048-R-inbox` (#1196) and `D-048-R-profile` (#1201) both wait on one shell wording finding. Its owner row, `D-222-referral-count-shell`, waits on `PRICING-banded-oct25` (#666), which is itself blocked.
- Re-reviews kept finding new, older issues outside the fix, so a pull request never converged.

## Row 1: `PROCESS-session-review-independence` (Tier 2, lane `picker`)

Make the picker, the CI review gate and scope-check apply D-344 (1), (7) and (8). Independence is per session, not per model; a fix lands without a re-review; and any row may take an unowned file it needs.

1. `scripts/nextTaskCore.mjs`: the review and Tier 1 landing exclusion (`did()` and the builder/fixer lists, D-151) compares the full session name (`modelOf` stays for display and provenance only). A session that wrote a `Claim`, `Takeover`, `Fix claim` or `Fixed` marker on the task never gets its review or landing. Another session of the same model does.
2. `scripts/review-gate.mjs` (lines 111-126 on `0de8feb6`): a pass verdict fails only when its author **session** built or fixed the work. The external-route provenance checks of D-311/D-312 stay exactly as they are: a route that cannot prove who built is still refused.
3. `scripts/nextTaskText.mjs`: the review step says (a) another session of your own model may review, never your own session's work; (b) the one-pass rule of D-344 (3).
4. Tests first, red then green: a same-model different-session review is handed out and passes the gate; a same-session one is refused at hand-out and at the gate; the external-route refusal is unchanged. Update the existing D-151 tests in `scripts/nextTask.test.ts` and `scripts/reviewGate.test.ts` to the new rule. Do not delete them.
5. **No re-review (D-344 (7)):** after a findings verdict and a later `Fixed` marker by a session other than the reviewer, the review gate passes the pull request's exact head and the picker hands out the landing, not a re-review. A `Fixed` marker must name the head it fixed. A head pushed after that marker needs a new `Fixed` marker.
6. **Fix-in-place for every row (D-344 (8)):** `scripts/scope-check.mjs` also accepts a changed file that the pull request's own `docs/plans/assignments.json` adds to this task's `owns`, provided no other open row on `origin/main` owns it. Add red-first cases to `scripts/scopeCheck.test.ts`: the file is accepted, and it is refused when another open row owns it.
7. Docs in the same pull request: the "Agent work queue" row of `AGENTS.md`'s living system map.

Proof: the focused picker and review-gate test output, plus one `node scripts/next-task.mjs --status` run on the branch. No product runtime change.

Until this row lands, CI's review gate still refuses a pass by the builder's or fixer's model. Sessions keep routing such reviews to another model until then.

## Row 2: `D-344-shell-referral-words` (Tier 2, lane `design-shell-words`)

This is the wording slice of `D-222-referral-count-shell`. The shell count is the remaining-referral count (D-173, D-180, D-222), so it never says "credits".

1. `client/src/components/goal/GoalShell.tsx` (the `goal-credits-pill`, lines 53-63 on `0de8feb6`):
   - Visible text: `{n} referrals left` (`1 referral left`).
   - Compact (phone) pill: keeps a unit, `{n} referrals` (`1 referral`). It is never a bare number.
   - `aria-label`: `{n} referrals left. Open plan details`.
   - The loading, error ("Balance didn't load" + Retry) and never-show-0-on-failure behaviour, the link target, the hook and the count source stay unchanged. The `data-testid` stays the same so nothing else moves.
2. Update the tests that pin the old words: `client/src/components/goal/goalComposites.test.tsx`, `client/src/components/appShell.test.tsx`, `client/src/pages/myRequests.goal.test.tsx`. Add one assertion that no shell text says "credit". Two more files pin the old aria-label and are added to this row's owns under D-344 (8), both owned by no open row: `client/src/test/goalShellHarness.test.tsx` and `e2e/fixtures.ts` (`readBalance` finds the pill by its label; the e2e journeys would otherwise fail).
3. Captures at 1280 and 390 of the shell on a seeker route, in `design/goal-ui/captures/shell/`.

Out of scope, staying with `D-222-referral-count-shell`: showing the count on referrer routes, `AppShell.tsx`, and the zero-state and ledger semantics.

Once this lands, PR #1196 (`D-048-R-inbox`) and PR #1201 (`D-048-R-profile`) merge main and are re-reviewed on their new heads.

## Row 3: `PICKER-block-dedupe` (Tier 2, lane `picker-blocks`; D-346 (5))

On Nov 16, `PRICING-banded-oct25` was reported blocked five times for the same reason. Stop that loop:

1. Once a session reports `blocked` on a task stage, the picker hands that stage to no session until new evidence exists: a new commit on the task branch or its pull request head, a new register entry naming the task, a dependency becoming done, or 24 hours passing.
2. The reporting session gets that task auto-avoided, as if it passed `--avoid`, and is handed its next eligible work.
3. A `--report blocked` on a task whose standing block has no new evidence is refused with "already reported; nothing changed since <time>".
4. Red-first tests in `scripts/nextTaskBlockDedupe.test.ts`. `--status` shows the standing block and its age.

## Row 4: `GATE-release-captures` (Tier 2, lane `gate-captures`; D-346 (6))

1. For a pull request on a `D-048-R-<id>` branch, CI builds with `VITE_GOAL_SURFACES=<id>` and captures every route that id owns, at 1280x900 and at 390x844 at scale 2. It signs in through the existing e2e harness fixtures and uses synthetic data only.
2. The route list comes from the existing surface map (`client/src/lib/goalSurfaces.ts` and `docs/plans/GOAL_UI_COVERAGE.md`), never a hand-kept copy.
3. Upload the images as the workflow artifact `release-captures-<id>`. A release row cites that artifact as its capture proof (AGENTS.md rule 8).
4. Tests: `scripts/releaseCaptures.test.ts` checks the route resolution for every open release id.
5. `scripts/ciMarkerSkip.test.ts` owns the exact CI job/dependency inventory. Its existing assertions must be ported to include the non-required capture planner and matrix, preserving every required-job start, classifier and shard-aggregate check. This test path is added to the row under D-344 (8), with no other open owner; the registry amendment lands first because scope-check reads owns from `origin/main`. This changes no capture acceptance or required check.

## Row 5: `GATE-merge-queue` (Tier 2, lane `gate-merge-queue`; D-346 (3))

1. Add a `merge_group` trigger to `.github/workflows/ci.yml` so every required check reports on merge-queue runs.
2. Make `scripts/review-gate.mjs` evaluate the pull request inside a merge-group run, read from the `gh-readonly-queue/main/pr-<n>-<sha>` ref. Its verdict must equal the one on the pull request's own head, with tests.
3. Record the switch-on step in `docs/plans/PICKER-PARALLEL.md`. After this lands, the owner turns on the merge queue in the `main` ruleset, using the merge-commit method (never squash or rebase, D-134 (6)). From then on a green pull request is queued, re-tested against current main and merged without a session holding the landing slot.

Until then, the owner enables "Allow auto-merge" in the repository settings, and each session turns on auto-merge with the merge-commit method for its own pull request once it is ready.

## D-347 and D-352 amendments to row 1 (owner, Nov 16)

D-347 removed the review requirement; D-352 then restored it for Tier 1 paths only. Row 1 therefore:

1. `scripts/review-gate.mjs` asks for one independent pass only when `scripts/tierClassifyCore.mjs` computes Tier 1 from the changed paths (money, sign-in, privacy, migrations, secrets). A row's declared tier alone no longer forces a review. Independence is per session (D-344 (1)): the building or fixing session itself never passes the work, another session of the same model may. A findings verdict followed by a `Fixed` marker from a session other than the reviewer passes with no re-review (D-344 (7)); `--fixed` records `fixed <sha>`, and a later own commit needs a new `Fixed` marker.
2. `scripts/nextTaskCore.mjs`: the picker's builder/fixer exclusion compares sessions, not models. Every pull request lands through auto-merge on green required CI, with no landing slot needed (D-347 (2)). Follow-up, not required for this row: hand out a review only for Tier 1 paths, and the landing rather than a re-review after a `Fixed` marker.
3. `scripts/nextTaskText.mjs`: the land step says to turn on auto-merge with the merge-commit method for your own pull request and to press "update branch" when `main` moves.
4. Update the tests that pinned the old rules. Port any assertion you remove (GATE-test-integrity), and list it in the PR's "Ported assertions" table.
5. Unchanged: every required CI check, test-integrity, and the pinned login and money tests.

## Row 6: `OPS-reviewer-qa-passwords` (Tier 2, lane `ops-reviewer`; D-347 (3))

1. New manual workflow `.github/workflows/reviewer-qa-passwords.yml`. It takes `workflow_dispatch` inputs `seeker_hash`, `referrer_hash` and `confirm` (must equal `reset`).
2. Validate each hash as `scrypt$<hex salt>$<64 hex>`, the format of `hashReviewerPassword` in `server/_core/reviewerLogin.ts`. Refuse anything else.
3. Set exactly `REVIEWER_SEEKER_PASSWORD_HASH` and `REVIEWER_REFERRER_PASSWORD_HASH` as Worker secrets through the Cloudflare API, the way `db-cutover-secret.yml` sets `DATABASE_URL`. Never print a value. Never touch the admin or employer hashes, `REVIEWER_ALLOW_ADMIN` or `REVIEWER_LOGIN_ENABLED`.
4. Secrets reach the container on its next start (AGENTS.md, Deploy), so say in the run summary that the next deploy applies them.
5. Proof: one dry run that refuses a malformed hash, shown in the PR. Passwords are generated outside the workflow, and only their hashes are inputs.

## Row 7: `GATE-unit-shards` (Tier 2, lane `gate-unit-shards`; D-351)

On Nov 16 the unit-test job took 7 min 20 s on PR #1215, while every other required check took about a minute. It was the slowest step before every merge.

1. In `.github/workflows/ci.yml`, split the Vitest step into a matrix of 3 shard jobs, each running `pnpm vitest run --shard=<n>/3`. Keep each job's install and classify steps, so a marker-only change still skips them.
2. **Keep the required check name.** Add a final job named exactly `unit + component + route tests` that `needs:` the three shards. It fails unless every shard succeeded (or was skipped as marker-only), and runs with `if: always()`. Name the shard jobs differently, for example `unit tests (shard 1/3)`, so the required check still reports exactly once.
3. The shards together run the full suite with no exclusions; keep the comment above the Vitest step that forbids `--exclude`. Prove it with a run whose three shard test counts sum to the old single-job count, quoted in the PR.
4. Shares `ci.yml` with `GATE-merge-queue` and `GATE-release-captures` under D-314: the second to land merges `main` and keeps both changes.
5. Proof: the PR's own CI showing the three shards and the aggregate check, and the wall-clock time against the 7 min 20 s baseline.

## Row 8: `PICKER-path-tier-review` (Tier 2; D-353 (1))

1. `scripts/next-task.mjs` computes, for each open PR of a non-done task, its changed paths against `origin/main` (reuse `changedPathsOf` from `scripts/review-gate.mjs`) and passes the result into the core.
2. `scripts/nextTaskCore.mjs` adds one `needsReview(v)` helper, applying the same rule as the CI gate: the paths compute Tier 1, or the row is declared Tier 1 and the diff touches `server/`, `shared/`, `drizzle/`, `functions/` or `src/worker.ts`. Use it everywhere the stage logic now reads `v.task.tier === 1`. A PR that needs no review follows the Tier 2 path: land on green CI.
3. After a findings verdict and a `Fixed` marker bound to the current head by a session other than the reviewer, hand out no re-review. The PR lands through auto-merge on green CI.
4. Red-first tests in `scripts/nextTaskPathTier.test.ts`: a declared Tier 1, client-only PR gets no review stage; a server-side one does; a bound Fixed marker gets no re-review.

## Row 9: `PICKER-claim-task` (Tier 2; D-353 (2))

`node scripts/next-task.mjs --claim "<name>" --task <id>` runs the normal pick restricted to that one task, with the same red-main, ownership, dependency, lane and independence rules. When the task is not eligible for this session, it prints the reason the picker recorded (waits for X, held by Y, you built it) and claims nothing. Tests in `scripts/nextTaskClaimTask.test.ts`.

## Row 10: `GATE-tier-classifier-gaps` (Tier 2; D-353 (3))

1. `tierReasonPaths` evaluates every `server/db.ts` hunk before deduplicating the path.
2. Add `server/creditCycles.ts` and `server/planCreditCycleJob.ts` to `TIER1_MONEY`.
3. Red-first regressions in `scripts/tierClassify.test.ts`.

## Status

- GATE-merge-queue: landing — GPT-6.1 Sol · 12fe — 2026-11-17 — [PR #1233](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1233), validated source `8d0ba631`, current main `a550136f` integrated (docs-only). Full sequential `pnpm quality:gate` exited 0: TypeScript, 720 files passed / 5 skipped, 7,404 tests passed / 18 skipped / 0 failed, production build and postbuild; token/migration/deploy/scope audits passed. [CI 43933102159](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/43933102159) passed every required job and 7/7 E2E journeys; independent review found no defects. Historical local failures are superseded by the fresh full gate. Original red-first: 4 failed / 40 passed. Final-head CI and protected auto-merge remain required; registry completion takes effect with this PR's merge. Owner ruleset activation and real merge-group proof remain UNVERIFIED (`PICKER-PARALLEL.md`); no runtime/provider/settings change. Original build `1df0b6c3` by GPT-6.1 Sol · 2321; takeover `f02e1b2e`; landing claim `0e8f7e61`.
- GATE-merge-queue unblock: validation cleared — GPT-6.1 Sol · 12fe — 2026-11-17. Independently checked [PR #1233](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1233) head `8d0ba631` against main `bd2f87da`, decisions through D-355 and the prior handoff. Fresh `pnpm quality:gate` exited 0: TypeScript, 720 test files passed / 5 skipped, 7,404 tests passed / 18 skipped / 0 failed (1,262.47 s), production build and postbuild. Token audit, migration lint, deploy-trigger audit, scope and diff checks passed; no tests changed. [Exact-head CI 43933102159](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/43933102159) passed all required jobs, the same 7,404 tests and 7/7 E2E journeys; current main CI is green. Read-only independent review found no implementation defects. The historical API 403 and local failures do not reproduce on this head. The draft validation hold is cleared; the implementation proceeds through normal ready/auto-merge gates. D-346 (3) still places owner-only ruleset activation after implementation landing; a real merge-group run remains UNVERIFIED. This docs-only handoff changes no decision, ownership, runtime or settings and does not claim the implementation landed.

- PICKER-block-dedupe: landing candidate — GPT-6.1 Sol · edc8 — 2026-11-16 — PR #1229, tested source `1e2696f1`, latest main `88494eba` integrated (docs/status only). D-353 path-tier facts, evidence/timestamps and repeated `--avoid` handling preserved. Decisions checked through D-355. CI [43923100680](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/43923100680): all checks green; 7,373 tests passed / 18 existing skips, typecheck, production builds, e2e, test-integrity and scope passed. Local 99/99 focused, typecheck/build/audits/scope and real status passed. Local full suite stopped after an unchanged classifier fixture timed out (also in isolation); earlier reviewer timeout passed unchanged in the full run. No test weakened. Registry status becomes done only on this PR's merge; final-head CI/merge still pending. Original red-first: 8 failed / 5 passed. No product/runtime deployment, provider or migration change.
- PICKER-path-tier-review: in progress — Claude Code · 9d90 — 2026-11-16 — branch agent/queue/picker-path-tier-review.
- GATE-unit-shards: done — `1495334b` (PR #1224, Claude Code · 9d90, 2026-11-16). `ci.yml` runs the unit suite as the matrix job `unit tests (shard n/3)` (`pnpm vitest run --shard=n/3`, fail-fast off, same fetch/classify/install steps), and the required check `unit + component + route tests` is an aggregate that `needs:` the shards, runs with `if: ${{ always() }}` and exits 1 unless their result is `success`. `scripts/ciMarkerSkip.test.ts` ports the single-job and no-`needs:` assertions to that shape (38 to 57 assertion lines, 28 to 34 tests), taken under D-344 (8) through registry PR #1223. **Proof, CI run 43886619326 on `d54f7f89`:** shards 2,401 + 2,417 + 2,508 = 7,326 passed, 12 + 6 + 0 = 18 skipped, files 241 + 240 + 240 = 721 (716 passed, 5 skipped). The single-job run 43885114982 on the same base (#1223) gave 7,320 passed / 18 skipped over the same 721 files; the difference is exactly the 6 tests this PR added. Whole run 3 min 26 s (shard jobs 3:18, 3:16, 2:55; aggregate 3 s) against 7 min 01 s for the single unit job on that base (Vitest step 6:15) and the 7 min 20 s baseline on #1215.
- PROCESS-session-review-independence: done — Claude Code · ff5a — 2026-11-16 — branch agent/queue/process-session-review. The CI review gate needs a review only for Tier 1 paths (D-352), counts independence per session (D-344 (1)), and lands findings plus a Fixed marker without a re-review (D-344 (7)). `--fixed` records `fixed <sha>`, and the picker's did() compares sessions. Follow-up, not built here: after a Fixed marker the picker still hands out a re-review rather than the landing, which wastes time but blocks nothing, because auto-merge lands the PR when CI is green. The landing slot is still in picker code; sessions land through auto-merge regardless.
- D-344-shell-referral-words: in progress — Claude Code · 5660 — 2026-11-16 — branch agent/queue/d344-shell-referral-words. The shell pill says "N referrals left" ("1 referral left"), "N referrals" on phones, aria "N referrals left. Open plan details"; loading, error, link, hook and count source unchanged. Two files outside the original owns pinned the old label (`client/src/test/goalShellHarness.test.tsx`, `e2e/fixtures.ts`, both owned only by done rows); they are added to this row's owns under D-344 (8). Captures in `design/goal-ui/captures/shell/`.

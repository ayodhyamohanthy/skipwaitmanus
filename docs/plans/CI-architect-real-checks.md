# CI-architect-real-checks

## State and scope boundary

Tier 1, lane `ci-gate`, status todo from the handoff registry PR onward. Build only on the task branch `agent/queue/ci-architect-real-checks`, whose pull request runs all three required jobs. Never use an `agent/architect/*` branch for this row or its registry PRs: required jobs skip there until this lands. Incident #748 and audit #741 stay open. This row changes no deploy workflow, production system, database, setting or ruleset. It does not lift the API deployment hold, and neither deploy workflow's path filter matches its owned files.

Objective: real required checks before landing. Splitting the work does not permit skipped checks.

## Proven defect and evidence

- PR #752 (`agent/architect/d100-security-audit`, head `36842c00567de8327077e9b6c0d22f7159646b98`, five docs/registry files): run 40506287399 concluded `skipped`, with all three required jobs `skipped`. It merged at 2026-10-27T12:48:12Z as `02eb6c95c0c18d2cb80bd9911c8ec845fe7e43cc`. Main CI 40506662910 succeeded afterwards; that is post-merge evidence, not a test of the PR.
- The defect recurred after this packet reached main (`9746ec9a2b28e24e114d4c965a8c07ff9f59f537`, #753, 2026-10-27T14:59:44Z). PR #764 (`agent/architect/d048-dark-mode`, head `17d46aeed719265ad3916abaf4d0f5f7e47c233c`, three docs/registry files including D-224) had run 40564131171 `skipped`. It merged at 2026-10-27T18:54:20Z as `f5a23dedcb968ade151030e74c8c82d54213e4f8`.
- Cause: the job-level `if:` from LAUNCH-marker-ci-skip (`06e20175e5782fc9706e22a8e8a165a3118956c5`, #658) skips `agent/architect/*` along with the true marker refs. The picker's architect steps (`scripts/nextTaskText.mjs:108-114`) open packet PRs on that same prefix. Ruleset 25433342 requires `typecheck`, `unit + component + route tests` and `production build` (strict), and GitHub counts a skipped required job as passed.
- The fast path also keeps true markers working: run with full steps, the typecheck job's queue gate fails PR #455 (`agent/reports/log`) and the landing slot with "no queue row" on an empty diff.
- Window baseline, measured 2026-10-28T07:55Z: 36 of the newest 100 CI runs were skipped marker-prefix PR runs (34 from PR #455, 2 architect). Skipped jobs still create runs, so make no window or minutes claim without re-measuring.
- Evidence is kept in audit #741 comment 6442763129. No history rewrite and no incident closure.

## Ownership (resolved by handoff)

Holder's acknowledgment for PRICING-banded-oct25: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/666#issuecomment-6464335154. `.github/workflows/ci.yml` moved from that row to this one. Owns: `.github/workflows/ci.yml`, `scripts/ciMarkerSkip.test.ts`, `scripts/classifyCiChange.mjs`, `scripts/classifyCiChange.test.ts` and this packet. No `dependsOn`: not on pricing, and not on P1 (P1-deploy-green-gate owns the deploy workflows, `rollback.yml` and its gate files, all disjoint).

Carry #666's only ci.yml delta byte for byte: the typecheck step lines from `c9572fcfdc9cceb55d55c5d55edf4675d1eaa382`. That commit also edits `client/src/pages/PlansV2.tsx`, so copy the hunk and never cherry-pick the commit.

```yaml
      - name: Typecheck
        # tsc needs more than the default old-space on this tree; OOM exits 1
        # with no diagnostics (verified: 8GB local run passes with zero errors).
        run: NODE_OPTIONS=--max-old-space-size=6144 pnpm check
```

Main's ci.yml (blob `2e6a964d`) plus exactly this hunk is blob `14ea8a25`, which is #666's tip. Add nothing between `- name: Typecheck` and the next step: an `if:` there conflicts with #666 under `git merge-file`, while job-level `if:` edits and new steps elsewhere merge cleanly. After this row lands, #666 merges main, and its ci.yml diff must be empty.

Other ci.yml writers stay outside this row. PR #523 (D-132-v2-checkout, no `owns`) adds an `outbox-mysql` job and must register ci.yml before any ci.yml change of its lands. The main `cancel-in-progress` liveness item from #748 registers as its own row with `dependsOn` this one.

## Acceptance (fail closed)

- Decide from the complete diff between SHAs pinned by the event (base, head and merge ref). Never decide from a branch name, title, commit message, label or any other PR-authored output. Only exactly zero changed files may take the marker fast path. Every other case runs the full required steps, including unknown, failed, missing, truncated or malformed reads.
- No required job `needs:` a classifier job, and no aggregate success may hide a skipped required job. A skip or fast path on a non-empty diff must turn a required job red through its own independent check.
- Keep the three required job names, the path `.github/workflows/ci.yml` (`CI_WORKFLOW` in `scripts/require-green-release.mjs`), the triggers, push-to-main and dispatch behaviour, and the P1 release-gate inputs. Weaken no test. Rewrite the obsolete prefix pins in `scripts/ciMarkerSkip.test.ts` red-first to the new contract.
- Proof: red-first unit tests, plus real linked throwaway draft PRs that are never merged. An architect-branch docs/registry PR runs all three jobs, and an invalid `assignments.json` there fails the tests job. A runtime change on a marker prefix runs all three jobs. A genuinely empty marker PR takes only the fast path. YAML or source pins alone are not proof.
- Independent Tier 1 review by a model that neither built nor fixed it (D-151), exact-head required CI success, and a merge commit, never a squash.

Implementation must independently prove the acceptance contract; this registration does not prescribe an untested workflow expression.

## Test matrix (input -> required outcome)

- A, pinned diff. A1 head tree equals base tree -> fast path. A2 any one changed file on any prefix -> full. A3 base moved, or a re-run of the same run -> same verdict from the same pinned SHAs. A4 a new head -> its own run decides, and the old verdict never carries. A5 change then revert, net empty -> fast path. A6 rename-only, mode-only, symlink, submodule, binary or delete-only -> full. A7 more than 300 or 3000 files -> full.
- B, empty markers. B1 a marker pushed to `agent/reports/log` (#455) -> fast path, never red. B2 review, heartbeat, landing and architect-claim markers with no file change -> fast path. B3 an empty diff on a non-marker branch -> the pinned choice (fast path or full), never red. B4 re-measure the newest-100 window and report the numbers, with no promise.
- C, substantive docs/registry. C1 #752's shape on an architect branch -> all three jobs run and pass. C2 #764's shape -> same. C3 invalid `assignments.json` on an architect branch -> tests job fails. C4 docs-only on each marker prefix -> full.
- D, disguised runtime. D1 a `server/`, `client/` or `shared/` change under each marker prefix -> full, and a planted failing test fails. D2 a change to ci.yml, the classifier or its test, `package.json`, the lockfile or tsconfig -> full, and the fast path is unreachable. D3 "docs-only", "marker" or "[skip ci]" in a title, message, label or branch -> ignored; a `[skip ci]` head leaves the required checks missing, so merge stays blocked. D4 a runtime file renamed into `docs/` -> full, with both paths counted.
- E, missing, truncated or failed data. E1 a shallow checkout or a failed fetch of a pinned SHA -> full. E2 a missing, null or malformed SHA or event payload -> full. E3 a changed-file count that is missing, null, the string "0", negative or NaN -> full. E4 an API 403, 404, 422 or 5xx, a rate limit, a timeout, non-JSON, a missing page or a capped list -> full, never empty. E5 a non-zero exit, crash or garbage from git or the classifier -> full or red. E6 classifier output absent, or anything but the exact success token -> full. E7 a push to main, a dispatch on main or another ref, re-run attempt N, or re-running failed jobs -> never the fast path.
- F, failed CI dependencies. F1 a required job with `needs:` on a classifier -> rejected by a YAML structure test. F2 a classifier step that fails inside a required job -> full steps or red, never success without real steps. F3 a checkout, pnpm, node or install failure -> red, never skipped. F4 a cancelled run -> not mergeable, and the P1 gate still refuses it. F5 a job-level expression error -> a real run shows it does not conclude `skipped`.
- G, preservation. G1 job names unchanged (`REQUIRED_JOBS`). G2 the heap line byte-identical, and `git merge-file` of #666's ci.yml against the candidate is clean and yields the candidate. G3 no condition names main or push, and a push to main runs all three jobs. G4 triggers and concurrency unchanged. G5 `scripts/requireGreenRelease.test.ts` and `node scripts/check-deploy-triggers.mjs` green.

Out of scope: deploy workflows, rollback, production, DB, protection or ruleset settings, picker files (`scripts/nextTask*.mjs`), spending, branch or history deletion, and feature activation. Registration is not implementation, review, landing or incident acceptance.

## Status

- CI-architect-real-checks: fix — agent/queue/ci-architect-real-checks — c632d7e9

Evidence — CI-architect-real-checks — Deepseek-V4.1-Flash · 4352 — 2026-10-28

**The rule now (corrected for H1, M1 and L1 below).** No required job carries a job-level `if:` any more: all three always start, on every event. Each one runs `node scripts/classifyCiChange.mjs` first, as its own step, and that verdict is the only thing that may skip steps: exactly zero changed files between the pinned base and head, read from a real merge base, on a pull request against the default branch. `toJSON()` still separates the number `0` from the string `"0"`, but only as the classifier's input (`EVENT_CLAIMED_EMPTY`), never as a skip rule. A count that claims empty next to a diff that is not empty is a contradiction and fails the job red. No branch, title, message or label is an input. Every push, dispatch and re-run runs the full steps. Nothing uses `needs:`, so no classifier can fail and leave a required job skipped, and there is no aggregate job to hide one.

**Red first.** `scripts/ciMarkerSkip.test.ts` fails 11 of its 22 pins against main's `ci.yml` (all three "carries the shared empty-diff condition", all three "never decides from a branch", "no branch prefix survives", and the #666 hunk pin), and `scripts/classifyCiChange.test.ts` cannot load before the module exists.

**Live proof.** Throwaway draft pull requests, never merged, every one closed and its branch deleted after the run was recorded; the runs remain.

| Proof | Branch → base | PR | Files | Run | Result |
| --- | --- | --- | --- | --- | --- |
| A genuinely empty marker takes only the fast path | `agent/architect/ci-proof-empty` → task branch | #782 | 0 | 40680384978 | run `skipped`; typecheck, unit + component + route tests and production build all `skipped` |
| #752's shape: architect docs | `agent/architect/ci-proof-docs` → main | #779 | 6 | 40680358368 | all three ran; unit tests and build passed; typecheck red at the queue gate only (see the finding) |
| #752's shape: architect docs, base = task branch | `agent/architect/ci-proof-docs-pass` → task branch | #783 | 1 | 40681605165 | all three ran; same queue-gate red, nothing else |
| A runtime change on a marker prefix | `agent/architect/ci-proof-runtime` → main | #781 | 6 | 40680379580 | all three ran; unit tests and build passed; typecheck red at the queue gate only |
| An invalid `assignments.json` on an architect branch | `agent/architect/ci-proof-invalid` → main | #780 | 6 | 40680373766 | all three ran; **unit + component + route tests failed** (`validateAssignments`); build passed |
| A retired marker prefix, registered slug: all three run **and pass** | `agent/review/ci-architect-real-checks` → main | #784 | 5 | 40682684632 | **typecheck, unit + component + route tests and production build all `success`** |

The classifier's own log line on the green run: `classify-ci-change: substantive - 5 file(s) changed between the pinned base and head`.

**Finding for the CEO — not fixable inside this row's owns.** An architect-prefixed pull request that carries `ci.yml` cannot pass the typecheck job before this lands. `scripts/scope-check.mjs` runs `scripts/queue-gate.mjs`, which reads `git diff --name-only --no-renames origin/main...HEAD`; a pull request's merge ref always contains its base branch's commits, so any branch carrying `ci.yml` is not docs-only and must match a queue row. The three architect proof branches therefore fail with "This branch matches no queue row" while typecheck, design tokens, deploy triggers, unit tests and build all pass — #784 shows the identical change green once the slug matches a row. Two consequences follow, both outside this row:

1. After this lands, an existing architect packet pull request that changes a file outside its row's `owns` goes red on the scope check, and that is the gate telling the truth. #662 (`agent/architect/signin-loading-click`) changes `docs/DECISIONS.md`, `docs/plans/LEGACY-BRANCHES-oct24.md` and `docs/plans/assignments.json` while `D-048-fix-signin-click-loading` owns two client files. The remedy is a registry `owns` widening or a docs-only allowance, which belongs to another row; nothing here weakens either gate.
2. The queue gate's docs-only allowance (D-200) and the scope check disagree for a docs-only architect pull request whose slug matches a row: the queue gate admits it and the scope check rejects it for files outside `owns`.

**Window, re-measured 2026-10-28T12:04Z (B4), no claim attached.** The newest 100 `ci.yml` runs span 2026-10-27T17:38Z to 12:04Z: 30 from `agent/reports/log`, 9 architect (5 of them my proofs), 1 review (mine), 14 main, 46 other; 35 concluded `skipped`. Skipping job steps never removed a run from the picker's window: `scripts/next-task.mjs:239` reads `/actions/workflows/ci.yml/runs?per_page=100` repo-wide and `ciStateFromRuns` ignores `skipped` conclusions. The fast path still saves the compute of 30 empty-diff runs in this window; it saves no window slot, and no minutes claim is made for a public repository.

**#666 merge (G2).** `git merge-file` of `agent/pricing/banded-plans-oct25`'s `ci.yml` against this candidate, with main's blob as the base, exits 0 and yields this candidate byte for byte, so #666's `ci.yml` diff is empty after this lands.

**For the reviewer.** Check the six pull-request runs above, the pins in `scripts/ciMarkerSkip.test.ts` that no required job carries a job-level `if:`, and the H1/M1/L1 section below. `scripts/classifyCiChange.mjs` can never return an empty list from a failed, shallow or contradictory read, and since the correction it can no longer return one from a comparison that has no merge base (L1) or from a pull request whose base is not `main` (M1). A wrong count now fails the job red instead of skipping it (H1). An unreadable diff still stays green and runs the full steps, which is the only direction packet E1 allows.

## Owner source-review correction (H1 blocking, M1 and L1 bounded)

Owner source review on head `8b6eccb3` (comment `#787`, 2026-10-28T13:17:49Z) rejected the first correction. The three findings, what was wrong, and what the fix is:

- **H1, blocking - the job-level skip moved the same hole one level up.** The old rule skipped all three jobs from `changed_files`/`additions`/`deletions` in the event. If those counts said zero for a non-empty diff, no classifier step ran at all, and the `--expect-substantive` guard only checked the reverse direction, so it could not be the packet's independent backstop. **Fix:** the job-level `if:` is gone from all three jobs; they always start. The classifier runs inside each one and is the only skip authority; a count that claims empty next to a non-empty pinned diff is a `contradiction`, which exits `1` and fails the job red. `EVENT_CLAIMED_EMPTY` is evaluated in the workflow with `toJSON()` so the number `0` and the string `"0"` stay distinct, and it reaches the classifier only as an input.
- **M1 - a non-default base.** A head that is empty against a twin non-`main` base can be substantive against the default branch. **Fix:** `BASE_IS_DEFAULT_BRANCH` (event `base.ref == repository.default_branch`) is required for a fast path; a false or missing value is substantive. A retarget to `main` is then a fresh `pull_request` run that decides again from its own pinned pair, and `strict_required_status_checks_policy` refuses a stale head anyway.
- **L1 - the pinned-pair fallback could report fewer files.** The comment that the fallback "can only report more changed files, never fewer" was wrong: when the base and the head each made the same change, the direct pair is empty while the merge-base diff is not. **Fix:** `readGitDiff` returns its `mode`, and only `merge-base` may answer empty; a `pinned-pair` empty read is substantive. The fetch step deepens (`--deepen=100`) when `git merge-base` fails, so a genuine marker still reaches a merge base. **Chosen comparison mode, recorded:** the merge base of the two pinned commits, `--no-renames --no-textconv --no-ext-diff`, `merge-base..head`; the direct pair is still read for diagnostics and for the two-read agreement check, but it can never grant the fast path. The fixture the owner asked for is `classifyCiChange.test.ts > L1: base and head each made the same change`.

**What this costs, stated plainly.** #666's heap hunk occupies the only safe insertion point in the `Typecheck` step (G2), so the typecheck job cannot fast-path its own `pnpm install` and `pnpm check`: it runs both on a verified empty diff and skips only the scope check that would otherwise fail a marker branch with "This branch matches no queue row". The tests and build jobs keep the full fast path. Packet B1/B2 still hold in the sense that matters - a marker pull request is never red and never runs `vitest` or `pnpm build` - but the typecheck job is no longer cheap on markers. That is the price of H1 with G2 intact; the alternative (keep the job-level skip on typecheck and let the other two jobs carry the backstop) leaves a tsc-only change unverified whenever the counts lie and the diff cannot be read, which is not fail-closed.


Evidence — CI-architect-real-checks — Qoder · 07fc (independent Tier 1 review, D-151) — 2026-10-28

**Read receipt.** `origin/main` `e0c7e3ad`; `docs/BRIEF.md`, `AGENTS.md`, `docs/BUILD_CONTINUITY.md`, `docs/DELEGATION.md` §6 and the register D-224 to D-229 read before the code. D-228 and D-229 change nothing here (D-229 is `Affects tasks: none` and covers only the #789/#790/#795 registration carriers), so the row is re-stamped `syncedTo: D-229`. Prior repo outcome: the builder's report on the board plus this packet's evidence sections; the six throwaway pull requests are closed and their branches deleted, their runs remain and are re-read below.

**Reviewed head:** `8b6eccb335162665520b049eb7f1a03b8d28e8b3` (`--verdict pass` recorded on `agent/review/ci-architect-real-checks`). Between that head and review time nothing but clean merges of main (no non-merge commits, `git log --merges --cc` empty since the head). Scope: `git diff --stat origin/main...` is exactly the five owned paths.

**Reproduced, not accepted:**
- Red first at `1849eb72` (its `ci.yml` blob equals `origin/main`'s `2e6a964d`, so it is the tests without the fix): `scripts/ciMarkerSkip.test.ts` 11 of 22 fail, `scripts/classifyCiChange.test.ts` cannot load (`Cannot find module './classifyCiChange.mjs'`). At the head, both files pass: 58 tests.
- Removed pins are only the retired prefix rule and its `${job} carries a job-level skip condition` block; no other assertion, no `.skip`, no `.only`, and the "no condition may name main/push" pin survives.
- The classifier driven for real, not through an injected reader: `pull_request` with this branch's pinned merge base prints `changed_files=5` exit 0; a same-tree marker commit (`git commit-tree`) prints `marker_only=true` and exits 1 under `--expect-substantive`; a `push` event, a non-existent 40-hex base and `BASE_SHA=main` each print substantive and exit 0, so an unreadable diff never fails a running job.
- The six proof runs re-read from the API: `40680384978` (0 files) all three `skipped`; `40680358368`, `40681605165`, `40680379580`, `40680373766` all three jobs ran real steps (15/12/13), and `40682684632` (5 files, `agent/review/` prefix) all three `success`. The failing step in the first four is `Scope check (declared file ownership)` with "This branch matches no queue row" - `Typecheck`, `Design tokens` and `Deploy trigger coverage` are `success` above it, so the new classifier steps run and pass and the red is the pre-existing D-166 gate, as the finding says. `40680373766` additionally fails `scripts/nextTask.test.ts > validateAssignments`, which is packet C3.
- G2: `git merge-file -p <candidate> <main blob> <#666 blob>` exits 0 and reproduces the candidate byte for byte (candidate `7095cd06`, main `2e6a964d`, #666 `14ea8a25`). After the merge of `e0c7e3ad`, `HEAD:.github/workflows/ci.yml` is still `7095cd06`.
- Preserved gates: `node scripts/scope-check.mjs --branch` (5 owned paths, nothing outside), `node scripts/check-deploy-triggers.mjs`, `node scripts/queue-gate.mjs` and `scripts/requireGreenRelease.test.ts` + `scripts/queueGate.test.ts` (90 tests) green on the merged tree.

**Judged and answered.** `needs:` is absent from the workflow (packet F1). The three required job names, the triggers, the concurrency group and the `ubuntu-latest` runners are pinned unchanged. `execFileSync` with an argument array and quoted env means no shell interpolation of a SHA; the only text reaching `$GITHUB_OUTPUT` is a whitespace-collapsed one-line reason built from validated hex commits or a fixed string, so no output injection. A `closed` event does not trigger a `pull_request` run (verified against #794: head `c3c88652`, merged 14:52:51Z, no run for that head after the merge), so a merged branch cannot produce a post-merge red from the `--expect-substantive` guard.

**Residual, accepted as fail-closed.** The skip decision trusts GitHub's own `changed_files`/`additions`/`deletions` for the pinned pair; if GitHub ever reported all three as the number 0 for a PR that really changed files, the jobs would skip and nothing inside the job could say otherwise - the same payload GitHub uses to gate the merge. In the shallow fallback the classifier compares the two pinned trees directly, which can only report more changed files than the merge-base diff, so it can waste compute but never grant a skip. A PR whose head tree already equals its base tree while its merge-base diff is non-empty therefore runs and turns red rather than passing unread. The first push-to-main run after this lands is the one path no throwaway pull request could exercise; it is watched per D-082 and any red there is reverted.

**Superseded by the owner's correction.** Both paragraphs above describe the reviewed head `8b6eccb3` and are kept as history. The first sentence of "Residual" is exactly H1 and is no longer true: the jobs always start now, so a wrong count fails a job red. The second sentence is exactly L1 and was also wrong in one direction - the direct pair *can* be empty for a pull request that is not - so the fast path no longer accepts an empty answer from it. Qoder's `pass` verdict on `8b6eccb3` is superseded for the same reason and the work needs a fresh independent pass on the new head.

Evidence — CI-architect-real-checks — Deepseek-V4.1-Flash · 6c91 — 2026-10-28 (fix round for H1, M1, L1)

Branch `agent/queue/ci-architect-real-checks` @ `c632d7e9`, merged with `origin/main` `72265110`.

**Red first, measured on this branch.** `git stash push` of only `.github/workflows/ci.yml` and `scripts/classifyCiChange.mjs` (the tests kept), then the two focused files: **28 of 76 fail**. Restored: **76 pass, 0 fail** (`classifyCiChange.test.ts` 51, `ciMarkerSkip.test.ts` 25). The failing set is the new contract itself: every "no job-level `if:`" pin, every "classifies its own pinned diff first" pin, every `marker_only` step gate, the H1 contradiction cases, the M1 default-base cases and the L1 merge-base cases.

**Gate on the merged tree.** `tsc --noEmit` 0 · `design-token-audit` OK (379 files) · `lint-deploy-migrations.sh` 0 · `check-deploy-triggers` OK · focused `vitest` 76/76. The full suite is left to the exact-head CI run, which is the authority on this Intel machine.

**The three findings, closed one at a time.**
- H1: `grep -c "if: \${{\s*!(" .github/workflows/ci.yml` is 0 - no required job carries a job-level condition. Each job's `Classify the change from the pinned diff` step has `id: classify` and runs `node scripts/classifyCiChange.mjs >> "$GITHUB_OUTPUT"`; `runCli` exits `1` on `contradiction=true`. The only lines mentioning `changed_files`/`additions`/`deletions` are the three `EVENT_CLAIMED_EMPTY:` inputs, pinned by a test that counts them.
- M1: `BASE_IS_DEFAULT_BRANCH` is `github.event.pull_request.base.ref == github.event.repository.default_branch`; a false, missing, `"TRUE "` or non-boolean value is substantive (`M1: a missing or non-boolean base value is never a yes`).
- L1: `readGitDiff` returns `mode`; `decide` refuses `markerOnly` unless `mode === "merge-base"`. The fixture builds the exact case - `main` adds `docs/note.md`, the branch adds the identical file from the common ancestor, `git diff --name-only <base> <head>` is empty while the merge-base read reports `["docs/note.md"]` - and asserts the verdict is substantive with `changedFiles: 1`.

**G2 re-proved after the change.** `git merge-file -p <candidate> <main blob> <#666 blob>` on the new `ci.yml` exits 0 and reproduces the candidate byte for byte; the `Typecheck` step's four lines are unchanged and nothing was added inside them.

**Left out.** No deploy workflow, ruleset, protection or picker file is touched. The throwaway pull requests from the first round are not re-run: their runs still prove the classifier's behaviour on a real event, and the new contract is proven by the pins above plus the exact-head CI run on this branch. The first push-to-main run after landing is still the one path no pull request can exercise.

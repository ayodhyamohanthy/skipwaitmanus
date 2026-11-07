# Packet REVIEW-GATE-fetch-parity: the named review-gate step evaluates instead of failing open

> The `typecheck` job's step "Review gate (independent Tier 1 pass)" runs before anything has fetched `origin/main`, so on every pull request it prints "could not run … not failing the branch" and exits 0. The real enforcement is the duplicate call inside the next step, "Scope check (declared file ownership)". So a review-only red always surfaces under the Scope check step. The D-286/D-291 picker classifier (`gateOnlyRedFromJobs`, keyed on the named review-gate step) can never fire on a real run. This row makes the named step fetch what it reads, so it evaluates and becomes the step that fails. It changes no gate rule, no required check, no branch protection and no product behaviour.

| Field | Value |
|---|---|
| Row | `REVIEW-GATE-fetch-parity` (Tier 2, lane `process`) |
| Branch | `agent/queue/review-gate-fetch-parity` |
| Registered by | D-292 (2026-11-07), docs-only, on the architect lock `agent/architect/review-gate-fetch-parity` |
| Decisions | D-286 (the review route and its named step), D-291 (the picker wiring that reads that step), D-166 (PROCESS-review-gate), D-151 (independent review), D-212 (GATE-tier-floor), D-200 (any session registers rows and records rulings), D-032 (better approach with evidence; the owner decides), D-074 (packets) |
| Synced to | D-292 |

## 1. Goal

When a Tier 1 pull request is red only because its independent review is missing, the failed step in CI must be "Review gate (independent Tier 1 pass)" alone, so that `gateOnlyRedFromJobs` is true and `node scripts/next-task.mjs` hands out REVIEW instead of MAKE GREEN. Today that never happens, so the D-254 deadlock that D-286 set out to cure is still in place on every live Tier 1 head.

## 2. Binding rules (quoted)

- D-286 (4)/(6): "No gate waived, downgraded, reordered, bypassed or skipped … no new required status check, which stays branch-protection state the owner controls."
- D-291 (2): the classifier "fails closed: any fetch or parse error, a missing run id or a run not on the branch tip leaves `gateOnly` false (today's MAKE GREEN)."
- `docs/plans/PICKER-gate-red-review-route.md` (Change): "The gate is not touched. `review-gate.mjs` still requires an independent `Verdict pass` naming the exact head … Nothing is waived, downgraded, reordered or skipped."
- `.github/workflows/ci.yml:107-111` (the D-286 comment on the named step): "It is the same script and exit code scope-check runs next (scope-check calls it again and gets the same answer)". That sentence is false on `main` today, and this row makes it true.
- AGENTS.md rule 5 / D-082: exact required CI green; never weaken tests or bypass protection.

## 3. Current behaviour (verified on `main` `8e1be413`, file:line)

- `.github/workflows/ci.yml:41` is `actions/checkout@v4` with its default depth 1. `:49-69` "Fetch the pinned base and head" fetches only `BASE_SHA` and `HEAD_SHA` (deepening only to find their merge base). No step creates `refs/remotes/origin/main`.
- `.github/workflows/ci.yml:112-114` is the step "Review gate (independent Tier 1 pass)" → `node scripts/review-gate.mjs`. `:115-117` is "Scope check (declared file ownership)" → `node scripts/scope-check.mjs --branch`.
- `scripts/review-gate.mjs:250` reads `git show origin/main:docs/plans/assignments.json` as its first git read. With no `origin/main`, it throws, and `:287-290` catches everything: "could not run (…) — not failing the branch", exit 0. `:271`/`:274` (`origin/main..<head>`, `--not origin/main`) and `changedPathsOf` `:183` (merge-base with `origin/main`) need `origin/main` with history too.
- `scripts/review-gate.mjs:234-239` `fetchBranch` and `:269-270` already fetch the row's review lock `agent/review/<slug>` (`ls-remote`, then a full fetch into `refs/remotes/origin/<lock>`). That code is never reached today because `:250` throws first. It must stay, and must run after `origin/main` exists, or every post-review run false-reds ("Nobody has reviewed …") and every merge-of-main after a pass reads as unreviewed.
- `scripts/scope-check.mjs:93-97` runs `runQueueGate()` first, then the review gate (`:76-79`, lazy import of `runReviewGate()`). The `origin/main` fetch that makes the internal call work is not in scope-check itself but in `scripts/queue-gate.mjs:15-28` `ensureOriginMainHistory()` (called at `:98`). It checks `git merge-base origin/main HEAD`, and on failure runs `git fetch --no-tags [--unshallow] origin +refs/heads/main:refs/remotes/origin/main`. `scripts/test-integrity.mjs:24-34` already carries its own copy of the same function (precedent for a per-gate copy).
- `scripts/nextTaskCore.mjs:306-336` is `GATE_STEP = "Review gate (independent Tier 1 pass)"`. `gateOnlyRedFromJobs` is true only when `typecheck` failed at exactly that one step and every other job and step is `success` or `skipped`.
- Reproduced locally on 2026-11-07, as a depth-1 fetch of `e1128076` + `8e1be413` with no `origin/main` ref and `GITHUB_HEAD_REF=agent/architect/d089-request-inbox`. `node scripts/review-gate.mjs` prints "could not run (Command failed: git show origin/main:… invalid object name 'origin/main'.) — not failing the branch" and exits 0. After `git fetch --no-tags --unshallow origin +refs/heads/main:refs/remotes/origin/main` (the queue gate's fetch), the same command prints "D-089-request-inbox at e1128076: Tier 1: this head has no independent passing review … Nobody has reviewed D-089-request-inbox yet." and exits 1.

### Live evidence (run 42339003779, job 128302286336, PR #878 head e1128076)

The job's step list (`GET /actions/runs/42339003779/jobs`) shows step 11 "Review gate (independent Tier 1 pass)" `success` and step 12 "Scope check (declared file ownership)" `failure`. The other three required jobs are green.

```
(1) Review gate step
2026-11-07T04:34:49.5432723Z ##[group]Run node scripts/review-gate.mjs
2026-11-07T04:34:49.5433378Z node scripts/review-gate.mjs
2026-11-07T04:34:49.5457885Z shell: /usr/bin/bash -e {0}
2026-11-07T04:34:49.5458283Z env:
2026-11-07T04:34:49.5458697Z   PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
2026-11-07T04:34:49.5459102Z ##[endgroup]
2026-11-07T04:34:49.5836542Z review-gate: could not run (Command failed: git show origin/main:docs/plans/assignments.json
2026-11-07T04:34:49.5837688Z fatal: invalid object name 'origin/main'.
2026-11-07T04:34:49.5838609Z ) — not failing the branch.

(2) Scope check step
2026-11-07T04:34:49.5906881Z ##[group]Run node scripts/scope-check.mjs --branch
2026-11-07T04:34:49.5907341Z node scripts/scope-check.mjs --branch
2026-11-07T04:34:49.5932236Z shell: /usr/bin/bash -e {0}
2026-11-07T04:34:49.5932602Z env:
2026-11-07T04:34:49.5933135Z   PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
2026-11-07T04:34:49.5933552Z ##[endgroup]
2026-11-07T04:34:49.6285099Z fatal: Not a valid object name origin/main
2026-11-07T04:34:51.3258060Z From https://github.com/ayodhyamohanthy/skipwaitmanus
2026-11-07T04:34:51.3258867Z  * [new branch]        main       -> origin/main
2026-11-07T04:34:51.5236182Z review-gate: D-089-request-inbox at e1128076: Tier 1: this head has no independent passing review (D-074, D-151). Run node scripts/next-task.mjs to get a review. Nobody has reviewed D-089-request-inbox yet.
2026-11-07T04:34:51.5285823Z ##[error]Process completed with exit code 1.
```

## 4. Rulings (decided under D-200, recorded as D-292, changeable)

**R1. The fix is fetch parity inside `scripts/review-gate.mjs`.** Before its first read of `origin/main` (`:250`), `runReviewGate` calls an `ensureOriginMainHistory()` that does exactly what `scripts/queue-gate.mjs:15-28` does. If `git merge-base origin/main HEAD` resolves, it does nothing. Otherwise it runs `git fetch --no-tags --unshallow origin +refs/heads/main:refs/remotes/origin/main` on a shallow repository (`--unshallow` dropped when not shallow), then re-checks the merge base. The function is a local copy in `review-gate.mjs`, following the `scripts/test-integrity.mjs:24` precedent, so `queue-gate.mjs` (a required gate) is not touched. The copy carries a one-line comment naming `queue-gate.mjs:15` as its twin. The existing review-lock fetch (`fetchBranch(lock)`, `:269-270`) stays and runs after `origin/main` exists. The unshallow converts the repository to complete, so the lock's markers (`origin/main..origin/<lock>`), `nonMergeCommitsSince` and `changedPathsOf` all resolve. The fetch cost moves from the Scope check step to the review-gate step. The queue gate then finds the merge base and skips its own fetch, so the job does not take longer.

**R2. Fail-closed and fail-open expectations.**
- *Definite answers fail closed, as today:* no lock on origin (`ls-remote` empty) → "Nobody has reviewed" → exit 1. A non-pass newest stage, a stale reviewed sha, a same-model reviewer, or a D-212 tier-floor raise → exit 1.
- *Genuine infrastructure errors keep failing open, loudly (exit 0, "could not run …"):* the `origin/main` fetch or `ls-remote`/lock fetch errors (network, auth), an unreadable or unknown task list, a missing `git`. The fixed step must not fail closed on these, for two reasons. (a) A closed failure on an infrastructure error would surface as a red at the named step, which `gateOnlyRedFromJobs` reads as "review missing", so the picker would hand REVIEW for a network blip. That misroutes work, and D-291 made the classifier fail closed for exactly this reason. (b) These errors are still enforced: scope-check's internal call (R3) runs next, re-attempts the same fetch through the queue gate and evaluates the same rule. If it then reds, the failed step is "Scope check" and the picker keeps MAKE GREEN. The only state where both fail open is a fetch that fails twice in one job, which is today's behaviour on `main` and outside this row.
- *What changes:* "could not run" stops being the normal outcome. On a healthy runner the named step always evaluates. The test pins that a depth-1 checkout with no `origin/main` gets a verdict, not a fail-open.

**R3. scope-check's internal duplicate review-gate call stays (`scripts/scope-check.mjs:96-97` unchanged), and the classifier is unchanged.** A double red cannot happen in one run. The Scope check step's `if:` (`ci.yml:116`) has no status-check function, so GitHub prepends `success()`, and the step is **skipped** whenever the named review-gate step failed. `gateOnlyRedFromJobs` accepts `skipped`, so the job shows exactly one failed step. When the named step passes, the internal call reads the same refs seconds later and passes too. The duplicate is kept as a backstop. It covers the named step's fail-open path (R2), a future `ci.yml` edit that drops or reorders the named step, and `node scripts/scope-check.mjs` run locally. So scope-check's job does not need to change, and the classifier does not need to accept a two-step red.
- *Known trade-off, accepted:* while the named step is red, the Scope check step does not run, so a queue-gate, decision-id, test-integrity or `owns` red on the same head stays hidden until the review passes. Then the next run shows it under "Scope check" (MAKE GREEN), and the fix commit voids the pass (one re-review). This is no worse than `main` before #1008: the internal gate already ran before id-check, test-integrity and `owns` and masked them. The queue gate cannot be red for a branch the review gate resolves to a row, because both use the same row lookup (`findGateRow` / queue-gate rules 1-2).
- *Alternative recorded, not taken (D-032; the owner or CEO may choose it):* reorder `ci.yml` so Scope check runs first and drop scope-check's internal call. Then a review red would be named only after every other check passed, with no masking. It is not taken because it edits `ci.yml` and a required gate's enforcement path, and it removes the backstop.

**R4. `.github/workflows/ci.yml` is not touched.** No new, renamed or removed step, job or required status check, and no branch-protection or ruleset change.

## 5. Files

In scope (the row's `owns`):
- `scripts/review-gate.mjs`: the local `ensureOriginMainHistory()` (R1), called first in `runReviewGate` before `:250`, with the header comment at `:8` corrected to say the gate runs as its own CI step and again inside scope-check. No change to `reviewGateViolation`, `findGateRow`, the verdict rules or any message text.
- `scripts/reviewGateFetchParity.test.ts` (new): §7.

Always allowed: `docs/plans/assignments.json` (this row's status at landing) and this packet's `## Status`.

Out of scope, and not edited: `.github/workflows/ci.yml`, `scripts/scope-check.mjs`, `scripts/queue-gate.mjs`, `scripts/test-integrity.mjs`, `scripts/nextTaskCore.mjs`, `scripts/next-task.mjs`, `scripts/reviewGate.test.ts`, `scripts/scopeCheck.test.ts`, anything under `server/`, `client/`, `shared/`, `drizzle/`, `.env.example`. A hunk outside the in-scope set stops and reports through the picker (`--report blocked`) instead of widening.

## 6. Dependencies

`dependsOn: []`. The fix stands alone: the named step should evaluate whatever reads it. The live picker proof (§8) uses the D-291 wiring already on `main` at `8e1be413` (#1008 merged). That row's `status` field is not this row's prerequisite.

## 7. Red-first tests (`scripts/reviewGateFetchParity.test.ts`)

Real git, no network. Use a temporary bare repository as `origin`, with `main` carrying a minimal `docs/plans/assignments.json`: a Tier 1 row `T1` (branch `agent/queue/t1`) and a Tier 2 row `T2`. Build a CI-shaped checkout: `git init`, `remote add origin file://…`, `fetch --depth=1` of the base and head shas only, no `refs/remotes/origin/main`, head checked out detached. Run `node <repo>/scripts/review-gate.mjs` with that checkout as `cwd`, `GITHUB_HEAD_REF` set and `GITHUB_EVENT_PATH` naming `pull_request.head.sha`. Marker commits are empty commits with `markerSubject` subjects (`Verdict T1: pass — <who>` with body `reviewed <sha>`). Each case must fail against `main` `8e1be413` where stated:

- (a) Tier 1 head, no review lock on origin: exits 1 with `REVIEW_GATE_FAIL` and "Nobody has reviewed T1 yet", and stderr has no "could not run". *Red today:* exit 0 with "could not run".
- (b) The same head with `agent/review/t1` on origin carrying `Review claim` + `Verdict pass` naming the head, by a model that did not build it: exits 0 with "has an independent passing review" (the lock is fetched and read, with no false red after review). *Red today* only in that it passes through fail-open: assert that "could not run" is absent.
- (c) The pass names an earlier head, and the branch has since only merged `main`: exits 0. With one non-merge commit after it instead: exits 1 (proves `--not origin/main` history resolves in the shallow checkout).
- (d) Tier 2 row on a non-Tier-1 path: exits 0 and stderr has no "could not run".
- (e) `origin` unreachable (the remote URL points to a removed path): exits 0 and stderr contains "could not run". This is the only fail-open, for a genuine fetch error.
- (f) A complete, non-shallow clone that already has `origin/main`: no fetch is attempted (the refs are unchanged after the run), and the verdict is the same as (a). This pins that a lander's local run is unchanged.
- (g) Static pin on `.github/workflows/ci.yml` (read only): the step named exactly `GATE_STEP` comes before "Scope check (declared file ownership)" in the `typecheck` job, and the Scope check step's `if:` contains none of `always()`, `failure()`, `!cancelled()` or `cancelled()`. If a later edit lets both steps fail in one run, this test goes red and the classifier would read two failed steps.

Existing suites stay green as written: `scripts/reviewGate.test.ts`, `scripts/scopeCheck.test.ts`, `scripts/queueGate.test.ts`, `scripts/nextTaskGateRedReview.test.ts`, `scripts/nextTask.test.ts`.

## 8. Definition of done

- §7 red-first: the test commit without the fix fails (a), (b), (c) and (f) as stated. With the fix, all pass.
- `pnpm check`, `LANG=en_US.UTF-8 pnpm vitest run scripts/`, and `validateAssignments` → `[]`, `node scripts/decision-id-check.mjs` exit 0.
- **Live proof on a real gate-only-red Tier 1 pull request**, pasted in the PR with run and job ids. Re-run CI on #878 (`agent/architect/d089-request-inbox`, Tier 1 through `findGateRow`) after this row lands, or use any other Tier 1 head red only for its review (for example #952 or #986 merged up to the fixed `main`). The `typecheck` job's only failed step is "Review gate (independent Tier 1 pass)", its log shows the gate's verdict line (not "could not run"), "Scope check (declared file ownership)" is `skipped`, and the other required jobs are green. `node scripts/next-task.mjs --claim "<session>"` (or `--status` for the board line) prints REVIEW for that row where it printed MAKE GREEN before. If #878's architect-lock route does not reach the picker's Tier 1 stage decision, the proof is taken on a Tier 1 task-branch pull request instead, and the PR says which.
- The proof run's named step does not print "could not run".
- Not done: no parked row lands from this, and each still needs its own independent pass on its exact head.

## 9. Review checklist (Tier 2: no separate review is required, but a reader checks)

1. `git diff --stat origin/main...` touches only §5's in-scope files, `assignments.json` and this packet's Status.
2. The fetch is byte-for-byte the queue gate's logic (`--no-tags`, `+refs/heads/main:refs/remotes/origin/main`, `--unshallow` only when shallow, merge-base re-check), and it runs before any `origin/main` read and before the lock fetch.
3. The catch-all at `:287-290` still covers only thrown errors. No definite verdict path is wrapped into fail-open.
4. No message text the picker or tests match on has changed (`REVIEW_GATE_FAIL`, `TIER_FLOOR_FAIL`, the pass line).
5. `ci.yml`, `scope-check.mjs` and `queue-gate.mjs` are byte-identical to `main`.

## 10. Stop and ask

- If making the named step evaluate needs any edit to `ci.yml`, `scope-check.mjs`, `queue-gate.mjs`, a required check or branch protection, stop and `--report blocked` with the measured reason. The R3 alternative is the owner's or CEO's call.
- If the live proof shows two failed steps, or the named step still fails open on a healthy runner, stop. Do not widen the classifier.

## Status

- `REVIEW-GATE-fetch-parity`: built — Hark · c3d7 — 2026-11-07 — branch `agent/queue/review-gate-fetch-parity`, PR #1016 (ready; Tier 2, a different session lands). Red-first e52e6f1a: (a)-(d) red with "could not run"; with the fix (f5090d15) 7/7 green. Packet drafted by Hark · f114 on `agent/architect/review-gate-fetch-parity` (registered by D-292). Direction: Instinct coordinator, 2026-11-07 (coordinator routing; no owner instruction on this packet). §8 live proof is owed after landing, by another session.
- Incident (2026-11-07): #1013 landed without the verifier's report on record. Hark · 87ef verified head f8f2a288 (CI run 42344941484 all four jobs green, validateAssignments [], decision-id-check exit 0, packet claims match run 42339003779 evidence) and marked ready; its --report review was refused (row not yet on main; GitHub closed-pulls fetch failed) and a post-merge retry was lost to a sandbox reset. The late record does not retroactively satisfy the pre-landing report rule.

# Packet PICKER-review-only-red: hand a Tier 1 head its REVIEW when the only red required job is the review gate naming that task and head (D-254 (5))

Registration candidate rev 4, prepared read-only against `main` `b56c722c3c0372899ac9d37c495884f4f3c016e6` (tree `b53c89ac34f8691a798aaa4050d797bfc41c563f`, parents `fa462f695902a578e7033e5671596ae6cc74d6b9` and `2eeb523191e0873276063bf3e137f68145f0e519`; register 261 task rows, newest decision entry D-284). Draft documentation-only registration proposal. Publication authorizes no implementation. It makes no functional PASS claim: the cure is not implemented, and its tests are designed here, not written. The separate registration review and finite factual-sentence carry review passed on the private candidate. The published final head still needs separate integration qualification, required CI and a distinct normal lander; implementation is not approved by this registration.

Rev 4 corrects rev 3:
1. Every proof value is recomputed from the rev 4 row bytes on `b56c722c`.
2. The Tier 2 review wording no longer carries a different-model requirement (section 9).
3. The dependency graph is stated as one direct dependency plus a four-row todo closure (section 3a).
4. D-258's must-clause stays binding; this row is the first-part cure only, and a named residual is not an approved deferral (section 10).
5. The authority wording drops the owner-ask framing (Q4).
6. A bounded technical supersession of D-254 (5)'s sequencing note is added (section 3b).

Integration delta from rev 3's base: `fa462f69..b56c722c` is the merge of #933 (DECISION-SYNC-oct26), and it is docs-only. Verified from the bytes:
- The diff restricted to code paths is empty (`scripts`, `server`, `client`, `shared`, `src`, `drizzle`, `e2e`, `.github`, package, lock and config files, and `docs/DECISIONS.md`).
- Nine docs and registry files changed. In `docs/plans/assignments.json`, one row (`DECISION-SYNC-oct26`) changed its `syncedTo` and `note` in place, so no line moved.
- Every source file and line cited below is byte-identical on both commits, and the measurements in section 2 were re-run on `b56c722c`.

## 1. Goal

A declared Tier 1 pull request cannot be green before its independent pass: `scripts/review-gate.mjs` fails the required `typecheck` job (through `scripts/scope-check.mjs:96` and `.github/workflows/ci.yml:107-109`) until a pass exists. The picker reads red before review (`scripts/nextTaskCore.mjs:573` before `:586-592`), so such a head is handed MAKE GREEN (`:583`) or a gate, never REVIEW. Each MAKE GREEN pushes a `Takeover` (`scripts/next-task.mjs:274`) that adds the taker's model to the builders set (`scripts/nextTaskCore.mjs:463`), which `scripts/review-gate.mjs:139` then bars from passing, so the eligible-reviewer pool shrinks every cycle (D-282 (4)).

The cure: when the only reason a declared Tier 1 head is red is the review gate refusing that task at that head, the picker treats CI as not red for the review stage, and the existing review logic decides. Nothing else in picker behavior changes. The registration also makes one queue-order change, the FIFO inversion named in section 3a.

User effect: Tier 1 changes (sign-in, money, privacy) reach their independent review instead of parking; the D-254 class has at least nine recorded rows. Target metric: in the named fixtures, a gate-only red Tier 1 head at needs-review is handed REVIEW in one picker run. No production metric is claimed. Cost: no paid tool, provider call or new dependency. Risk: a false REVIEW on a head that is red for a real reason, controlled by section 5; REVIEW never lands anything, and landing still needs green required CI.

## 2. Measured on `main` `b56c722c` (reproduce before building)

| # | Declared Tier 1, todo, open PR | `main` hands out |
|---|---|---|
| M1 | CI red, builder pushed under 2 h ago | `wait` (lane gate: the builder is making it green) |
| M2 | CI red, builder quiet 2 h or more | `green` (MAKE GREEN) |
| M6 | CI red, review claimed 0.2 h ago by an eligible reviewer, work branch quiet 3 h | `green`: MAKE GREEN over an active review |
| M3 | CI unknown (no run in the newest 100, or first run still in progress) | `review` (existing; named residual R2) |
| M4 | review passed, CI still red from the pre-pass run | `fix` (named residual R1) |
| M5 | fresh review lock held by a model that also took over the work branch | `none`, with green or unknown CI (D-258 second half; named residual R3) |

Evidence shape, from the real run `41515092748` on #952 head `3c7c28c6`: four jobs; `production build`, `unit + component + route tests` and `e2e journeys` succeed; `typecheck` fails at exactly one step, step 11 "Scope check (declared file ownership)", after steps 8-10 (Typecheck, Design tokens, Deploy trigger coverage) succeed; its log carries exactly one gate line:

```
review-gate: FIX-device-signin at 3c7c28c6: Tier 1: this head has no independent passing review (D-074, D-151). Run node scripts/next-task.mjs to get a review. The review of FIX-device-signin stands at "Fixed", not a pass.
```

The line format is `scripts/review-gate.mjs:282`; its fixed text is the exported `REVIEW_GATE_FAIL` (`:29`). The log names only an 8-character head; the 40-character head comes from the run and its jobs. API fields verified on the real responses for that run (GitHub API, 2026-11-03): the runs list carries `head_sha`, `status`, `conclusion` and `run_attempt` (1); the jobs list carries `total_count` (4) and, per job, `name`, `status`, `conclusion`, `head_sha`, `run_attempt` (1 on all four) and `steps` with `name` and `conclusion`. `run_attempt` is therefore the narrow, verified signal for "this evidence is from the newest attempt". The picker today reads run conclusions only (`scripts/next-task.mjs:251-252`), and `buildView` keeps only `ci.state` (`scripts/nextTaskCore.mjs:451,462`).

## 3. Scope

- **S1 Evidence read (CLI, `scripts/next-task.mjs`).** Only for open pull requests of declared Tier 1 `todo` rows whose `ci.yml` state reads `red`, in register order, at most 3 heads per picker run: (a) the run behind that state; (b) `GET /actions/runs/{id}/jobs?per_page=100`; (c) only if (b) shows exactly one failed job named `typecheck`, `GET /actions/jobs/{job_id}/logs` as text. Any non-200, thrown error, timeout or cap overflow is recorded as unknown with its reason, never as a pass. `REVIEW_GATE_FAIL` is imported from `scripts/review-gate.mjs` by a dynamic import inside try/catch; a failed import is unknown, never a picker crash. Raw results go to S2; no rule lives in the CLI.
- **S2 Proof (core, pure, new export).** `reviewGateOnlyRed({ taskId, head, runs, jobs, log, failLine })` returns `{ ok: true, runUrl, head8 }` or `{ ok: false, why }`; the rule is section 4.
- **S3 Hand-out (core, `tier1()`), narrow.** Only if `v.ci === "red"`, S2 holds for this task and the current branch tip (`v.info.tipSha`), and the review state is `needs-review` or `in-review`, the red block is skipped and the existing non-red code below it runs unchanged (`scripts/nextTaskCore.mjs:586-603`). Every other case keeps today's hand-out (same kind and fields), including `passed`, `landing`, `needs-fix` and `fixing` with any CI. S3 adds no rule of its own; by reusing that code it keeps:
  - **Existing review continuity.** A fresh review lock stays with its holder, whoever holds it: the existing skip "under review by ..." (`:603`). Only a lock nobody has pushed to for 2 hours is handed on, by the existing D-085 rule (`lockQuiet`, `:572`, `:586`). Measured on `main` with CI green: fresh lock held by an eligible reviewer gives `none`; fresh lock held by a builder model gives `none` (D-258's must-clause is not implemented by this row, R3); lock quiet 3 h gives `review`.
  - **No model bypass.** A claimant whose model built or fixed the row is never handed REVIEW (`:587`, D-151); only the stage holder records a verdict (`scripts/next-task.mjs:325`); the gate refuses a builder's or fixer's pass (`scripts/review-gate.mjs:139`). None of these lines changes.
  - **Head-holder continuity.** In the review stage of a gate-only red head no MAKE GREEN is handed, so no `Takeover` is pushed onto the work branch under an active review (today M6 does exactly that, moving the head under review). A builder-model claimant on such a head gets no hand-out for it instead of today's MAKE GREEN (B6), which on these heads has nothing to fix (D-256, D-257, D-262, D-279, D-282).
  - `in-review` here is the existing review stage after its claim, not a new stage (qualification point Q1).
- **S4 Text (`scripts/nextTaskText.mjs`).** The REVIEW pick carries the proof: "CI on <pr> is red only at the review gate for <id> at <head8> (run <url>); that red is this review." Plus: "the gate stops the scope step early, so on this head CI has not run the decision-id, test-integrity or owns checks: run `node scripts/scope-check.mjs <id>` and `node scripts/decision-id-check.mjs` on <reviewed> and quote both outputs with your verdict; test integrity runs on the next CI run." Plus: "a pass does not re-run CI: the pull request stays red at the gate until the next push (the landing's merge of main), and nothing lands on red CI." When S1/S2 ran for a declared Tier 1 head and failed, the MAKE GREEN or FIX pick (same kind and fields as today) adds one printed line "review-gate-only proof unavailable: <why>", so a fail-closed outcome is never silent.

**Not in scope:** any change to `scripts/review-gate.mjs`, `scripts/scope-check.mjs`, `.github/workflows/ci.yml` or `scripts/nextTask.test.ts`; any new CLI verb, review stage, lock rule, manual marker, preselected or automatic pass, review-marker write or no-code `Fixed`; any tier, status, lock, `syncedTo` or `owns` change on another row; unparking any `owner` row; any change to landing, the landing slot, Tier 2/3 handling, the tier floor, red `main`, D-109 lane holds, D-134 dependencies, D-202 re-syncs or `--avoid`; and the named residuals R1-R3 (section 10).

## 3a. Queue order: the dependency graph, one named FIFO inversion, no promotion

The graph. The cure has one direct dependency, `PICKER-landing-wait-fallthrough`. Its transitive closure holds four todo rows (that one, `PICKER-landed-marker-continuity`, `PICKER-heartbeat-slot-safety` and `PICKER-avoid-land`) and five done rows. It does not reach `PICKER-fullstack-lights`, `PICKER-qa-stage`, `FIX-device-signin` or any `owner` row. Only `PICKER-fullstack-lights` and `PICKER-qa-stage` have the cure in their closure. The graph is the same as in rev 3.

The inversion. The registration appends the cure at the register tail (0-based position 261 of 262) and appends its id to `PICKER-fullstack-lights.dependsOn`. `PICKER-fullstack-lights` sits at position 219, so an earlier queued row gains a dependency on a newer tail row. That is a FIFO inversion. It also reaches `PICKER-qa-stage` (position 220), which waits through `PICKER-fullstack-lights`. The edit is not order-preserving, and this packet does not describe it as such.

Justification, and the only one: a real output need. `PICKER-fullstack-lights` already waits on `FIX-device-signin`, whose closure lands the first-pick de-pin of `scripts/nextTask.test.ts` that `PICKER-fullstack-lights` owns (D-272, recorded in that row's own note). `FIX-device-signin` can land only after an independent pass on #952, which needs a REVIEW hand-out, and #952 is red only at the review gate; D-273 records that it "lands unchanged once the D-254 answer opens a review route". The cure is that route. The validator also requires the two rows to be ordered one way or the other (`scripts/nextTaskCore.mjs:350-356`), and the other direction (the cure waiting on `PICKER-fullstack-lights`) deadlocks: the cure would wait on `FIX-device-signin`, which waits for the cure.

Cost: the edge delays `PICKER-fullstack-lights` only if all seven of its other unmet dependencies (`REL-watchdog` and `BRANCH-HYGIENE-2` at `owner`, the four older picker rows, `FIX-device-signin`) complete before the cure lands.

No promotion: the cure keeps its tail position, and the picker hands new work top down (`scripts/nextTaskCore.mjs:685-722`), with no rule that promotes a row because an earlier row depends on it. Measured on `b56c722c` with the cure's direct dependency and the three other todo rows of its closure marked done: with nothing avoided the pick is `build:FIX-device-signin`, and the cure is first handed out only once all 107 earlier non-done rows are unavailable. No other existing row's dependencies, position, tier or status changes.

## 3b. Technical supersession of D-254 (5)'s sequencing note (bounded)

D-254 (5) defines the cure, and that definition is unchanged here. It also suggests how to carry it: "sequenced against the other open picker rows that own those files by `filesBusy` (`scripts/nextTaskCore.mjs:552`), not by a new dependency edge", with "red-first tests in `scripts/nextTask.test.ts`". On the current code those two remarks cannot be followed, so this packet supersedes them technically, and only them:

- **A dependency edge is mandatory.** The current validator orders every pair of non-done rows whose `owns` overlap (`scripts/nextTaskCore.mjs:350-356`, PICKER-owns-scope). `scripts/nextTask.test.ts:44` asserts the live register validates, and `scripts/next-task.mjs:225-226` stops all picking when it does not. Without an edge the register has 6 errors on `b56c722c`. `filesBusy` (`:552`) is a runtime hold on builds while an overlapping row is open; it does not satisfy the validator, which checks every non-done row, open or not.
- **The edges follow the real output need** (section 3a): the cure waits on the older picker rows that own its files, and `PICKER-fullstack-lights`, which needs `FIX-device-signin`, which needs the cure's route, waits on the cure.
- **No FIFO promotion** (section 3a).
- **Test location.** `FIX-device-signin` owns `scripts/nextTask.test.ts`. Owning it too would force a validator dependency on `FIX-device-signin`, which waits for this route, so the tests go in the row's own new file.

This is a technical reading recorded in a packet; it does not edit the D-254 register entry.

## 4. The proof rule (S2), all conditions required

1. `runs` is the branch's `ci.yml` run list, newest first; `runs[0]` is completed with conclusion `failure`, and there is no newer run (a cancelled, skipped or in-progress `runs[0]` fails).
2. `runs[0].head_sha` equals `head`, the 40-character work-branch tip on origin, and equals the pull request's head sha when the CLI has it.
3. `jobs.total_count === jobs.jobs.length`; every job has `head_sha === head` and `run_attempt === runs[0].run_attempt` (both fields verified on the real API responses, section 2).
4. The job names include each of `typecheck`, `unit + component + route tests`, `production build` and `e2e journeys` (pinned constants; test E1 pins them against `ci.yml`), and exactly one job is named `typecheck`.
5. Every job other than `typecheck` is `completed`/`success`; any other status or conclusion fails.
6. `typecheck` is `completed`/`failure`, and among its steps exactly one has conclusion `failure`: "Scope check (declared file ownership)"; steps "Typecheck", "Design tokens" and "Deploy trigger coverage" are present with conclusion `success`.
7. `log` is a non-empty string; with each line's leading timestamp stripped, exactly one line starts with `review-gate: `, and it starts with `review-gate: ${taskId} at ${head.slice(0, 8)}: ${failLine}`; no line contains `not failing the branch`.
8. `taskId` is a declared Tier 1 row (the `tier1()` caller guarantees it); the tier-floor message (`TIER_FLOOR_FAIL`) never matches, since it does not start with `failLine`.

## 5. Fail closed: every case keeps today's hand-out

Run-level CI that is not `red` never enters this path (unknown, error, running and green are untouched; what `main` does on unknown is R2 and is not pinned by this row's tests). Within `red`: any newer run; a run on another head (for example after a `Takeover` push and before that head's own run appears, as on #952 after `80bffda6` was pushed on 2026-11-03 while its newest completed run was still `41515092748` on `3c7c28c6`; `80bffda6`'s own run `41576080600` completed at 04:11:55Z, again red only at the review gate and naming `80bffda6`); any other job red, cancelled, skipped, missing, in progress or from another attempt; a truncated or unreadable job list; a failing step other than the scope step, or two failing steps; an unreadable or empty log; no gate line, two gate lines, a passing gate line, another task id (including prefix ids such as `X1` and `X1-b`), another head, other wording, or a tier-floor line; a fail-open line; cap overflow; a failed import of `REVIEW_GATE_FAIL`. Also unchanged: declared Tier 2/3 rows, review states other than `needs-review`/`in-review`, and rows that are not `todo`, are out of sync, have unmet dependencies, are avoided, blocked, or held by red `main`.

## 6. Files

Owns: `scripts/nextTaskCore.mjs` (S2, S3; `ciStateFromRuns` may also return the run id), `scripts/next-task.mjs` (S1), `scripts/nextTaskText.mjs` (S4), `scripts/nextTaskReviewOnlyRed.test.ts` (new). The packet and `docs/plans/assignments.json` status lines are allowed by `scope-check` without owning them. The tests live in their own file (section 3b). `AGENTS.md` is not owned (six non-done rows own it on `b56c722c`); its "Agent work queue" map row states no red-before-review ordering, so it does not become false, and this packet is the D-068 record.

## 7. Steps (one commit each; push after each)

1. Status in progress (packet Status line).
2. Red-first: add `scripts/nextTaskReviewOnlyRed.test.ts` (section 8) against unchanged sources; record which tests fail (expected, measured on `main` `b56c722c`: every A test by the missing export; B1-B7 and B17 by today's behavior, which hands `green` or `wait` in each) and which pass (the fallback pins).
3. S2 and S3 in core, S1 in the CLI; re-run, all green.
4. S4 text.
5. Mutation evidence, each applied and reverted alone: drop the head equality, the other-jobs check, the step check, the task-id match, the `run_attempt` match, the fail-open check, or the `in-review` coverage; each must turn a named test red; record which.
6. Full gate merged with the latest `origin/main`: `pnpm check`, `pnpm vitest run scripts/` (every picker and gate suite, including `nextTask.test.ts:44` and its `:47-62` pin, unedited), `node scripts/scope-check.mjs PICKER-review-only-red`; status review; draft PR.

## 8. Test design (own file; fixtures are injected data, never live reads)

A fixture builder clones the run `41515092748` shape (four jobs, the typecheck step list, one gate line) with synthetic ids and overrides one field per case.

- **A, pure proof:** A1 the exact case is ok; not ok for: A2 head mismatch; A3 newer cancelled or in-progress run; A4 another job failed; A5 another job cancelled, skipped, in progress or missing; A6 duplicate or renamed `typecheck`; A7 "Typecheck" step also failed; A8 failing step is "Design tokens"; A9 truncated job list; A10 jobs null; A11 log null or empty; A12 other task id; A13 other head8; A14 tier-floor line; A15 passing gate line; A16 two gate lines; A17 a `not failing the branch` line; A18 other wording (`failLine` differs); A19 older `run_attempt`; A20 prefix id (`X1` vs `X1-b`); A21 empty run list.
- **B, `pickNextTask` integration:** B1 needs-review, proof ok, builder quiet: `review` (red on `main`: `green`); B2 builder active: `review` (red on `main`: `wait`); B3 lock at `Fixed`: `review`; B4 in-review, fresh eligible lock, work quiet: skip "under review by", never `green` (red on `main`: M6); B5 in-review, quiet lock: `review`; B6 claimant is a builder model: no `review` and no `green` for that task; B7 claimant is a fixer model: same; B8 every A2-A21 fixture in B1's state: exactly today's `green`/`wait`; B9 declared Tier 2 with forged ok evidence: `green`; B10 evidence for another task, or a run on an older tip: today's hand-out; B11 the #952 shape, tip moved by a `Takeover` after the red run: today's hand-out; B12 passed or landing with gate-only red: today's `fix`/`wait` (scope guard for R1); B13 needs-fix or fixing: unchanged; B14 status `owner` with ok evidence: "waits for the owner"; B15 unmet dependency, out of sync, or `--avoid`: unchanged; B16 red `main`: `fix-main`; B17 in-review, fresh lock held by a builder model, eligible claimant, proof ok: skip "under review by" (the lock is kept; scope guard for R3).
- **C, pure selection helper for the CLI:** C1 candidates are only declared Tier 1 `todo` rows with an open PR and `red` state, in register order, capped at 3.
- **D, text:** a REVIEW pick with proof shows the run URL, head8, both local commands and the "pass does not re-run CI" line; a MAKE GREEN pick after a failed proof shows the reason line and is otherwise unchanged.
- **E, contracts read from files (not owned):** E1 `.github/workflows/ci.yml` still names the four jobs and the scope step; E2 `scripts/review-gate.mjs` still exports `REVIEW_GATE_FAIL` and prints `review-gate: ${task.id} at ${head.slice(0, 8)}: ${violation}`. A red E test means a dependency moved; the picker meanwhile fails closed.

## 9. Review and landing

The computed tier is 2 (`classifyTier` on the owned paths, the packet and the register: no Tier 1 path). Tier 2 is not a waiver: a separate independent reviewer of the final head and a distinct lander are required before landing (prose, not machine-enforced). This row adds no different-model gate of its own. D-151's different-model rule is a Tier 1 rule, unchanged, and S3 preserves it for the Tier 1 rows it hands out. No new blanket gate is added and nothing is waived. Required CI must be green on the exact head. The reviewer re-runs the M1-M6 probes and the A/B suites on the final head.

## 10. Named residuals: not approved and not folded into this cure

This registration is the first-part cure only. D-254, D-258 and R1 are not complete with this row. A named residual alone is not an approved deferral: each item below stays open until it is separately qualified.

- **R1, post-pass stale red (M4).** After a pass, the last run stays red at the gate until the next push, and the picker hands FIX to other sessions, which moves the lock to `fixing` and voids the pass (#815, D-254 (1)). Not addressed by this row, which only surfaces it (S4 text) and pins today's behavior as a scope guard (B12).
- **R2, REVIEW on unknown CI (M3, the 100-run window).** Existing on `main`; this row neither relies on it nor changes it, and its tests do not pin it.
- **R3, D-258's must-clause (M5).** D-258 adds to the D-254 row's scope that it "must also refuse a REVIEW hand-out to a claimant already in the row's builders/fixers set, and must not treat a review lock held by a builder as a lock." That clause stays binding and is not waived. The first half is already met by existing code (`scripts/nextTaskCore.mjs:587`), kept unchanged and tested (B6, B7). The second half is not implemented by this row and needs a separately qualified follow-up. A scope fact for that follow-up, not a deferral reason: the second half does not depend on CI (on `main` a fresh lock held by a builder model blocks every eligible reviewer with green or unknown CI too), so it changes review-lock handling for every Tier 1 row. `D-048-p3-profile` (#826, the D-258 row) is not released by this row; it stays at `owner`.
- **R4, masked checks.** Under a gate red, CI has not run decision-id, test-integrity or owns on that head; S4 has the reviewer run the first and last locally; test integrity runs only on the post-pass run, where a failure is the existing fix route and nothing lands red.
- **R5, reads and auth.** S1 adds at most 6 GitHub reads per picker run. Whether `/actions/jobs/{id}/logs` answers an unauthenticated read on this public repository is not known here; if it does not, sessions without a token fail closed (today's hand-out) and S4 prints why.
- **R6, wording.** The proof imports the gate's wording rather than copying it; a run printed under older wording fails closed until CI re-runs.
- **Parks preserved.** No `owner`-parked D-254 member is unparked. On `b56c722c` all ten are at `owner`: `D-048-p3-inbox`, `D-048-p3-profile`, `D-048-p3-conversation`, `REL-webhook-auth-alarm`, `REL-client-capture`, `D-174-fix-post-binding`, `D-174-job-sources-more`, `D-086.count`, `PRICING-banded-oct25` and `REL-review-email-retry`. Each is released only by its own ruling.

## 11. Qualification points for the coordinator

- **Q1:** S3 covers `in-review` as well as `needs-review` (M6), as existing review continuity for the claimed stage, not a new stage, and with no lock change.
- **Q2:** the registration's one existing-row edit and its FIFO inversion (section 3a): `PICKER-fullstack-lights` `dependsOn` gains `PICKER-review-only-red`, justified only by the output need through `FIX-device-signin` and the validator's mandatory ordering, with no promotion.
- **Q3:** R3 is a separately qualified follow-up; this registration approves no deferral of D-258.
- **Q4:** registration authority rests on the existing coordination grant. The historical new-rows pause is not a user block: `docs/BUILD_CONTINUITY.md:58` records it as the coordinator's recommendation, not an owner restriction, and no original conflicting restriction is recorded on `main`. The existing parks are preserved (section 10).

## 12. Stop and ask (write it in your Status line, push, report blocked)

If the proof cannot be made exact without editing `scripts/review-gate.mjs`, `scripts/scope-check.mjs` or `.github/workflows/ci.yml`; if any fallback pin (B8-B17) or `scripts/nextTask.test.ts` changes outcome; if the overlapping picker rows have landed something that moves `tier1()` or the CI read; or if a newer decision names this row.

## Status

Registration proposal rev 4.1: documentation only, separate candidate registration review and factual-sentence carry review passed. Published final-head qualification, required CI and distinct normal landing remain pending. No functional PASS or implementation authority is claimed. Not claimed, not built.

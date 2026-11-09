# Packet GATE-migration-cleanup: once the drift reference database exists, a snapshot or summary failure still attempts its cleanup, and a failed cleanup no longer hides a FAILED verdict (D-212, D-283)

Tier 2 (declared, and *projected* from the row's `owns`: `scripts/e2e-server.mjs`, one new `scripts/` test and this packet, with nothing under `drizzle/**` or `.github/workflows/**`, which `classifyTier` would class as "Tier 2 paths" (GATE-tier-floor). No runtime diff exists yet, so this is a projection, not a computed tier; it is rechecked against the actual runtime diff, §9) · lane `ci-checks` (the same serialization as `GATE-migration-apply`) · branch `agent/queue/gate-migration-cleanup` · depends on `GATE-migration-apply` (done, merge commit `f305e2e3`, PR #967) · registered by D-283 · written on 2026-11-02 at `main` `a650b615`, checked against the register through D-283.

**Author of record.** This packet, its D-283 entry and its queue row were written by one Claude Code session (cloud session `session_01X6drxy28JfPDsxa4yHiMNW`, branch `claude/affectionate-gates-gb3vt7`). That session is the author. It does not review, approve or land the registration pull request or the runtime row, and the authorship is not relabeled (for example as "preparer, not writer of record") to make a self-review or self-landing eligible (D-190). Under D-225 a development session other than the Claude Code session builds the runtime row through the picker.

Read [`docs/BRIEF.md`](../BRIEF.md), [`GATE-delivery.md`](GATE-delivery.md) "Rules for every task here" and [`GATE-migration-apply.md`](GATE-migration-apply.md) §4 first. Those rules bind this packet. Nothing here changes a ruling of `GATE-migration-apply`.

## 0. Corrections in this revision (W8)
An earlier, unregistered draft of this packet was corrected before registration. Each correction is marked in the text as **[C1]** to **[C5]**.
- **[C1] Contract source.** The earlier draft called the contract unknown or unavailable (its §4Uf and §9b). That was wrong. The contract of record is the coordinator-qualified W5 contract, "PR #967 cleanup contract: derived desired behaviour for the red-first candidate" (§2 below). Its CL, ER and U items are mapped in §4. The contract's desired behaviour is a *derived test interpretation*. It is not an owner ruling, and this packet never cites it as one.
- **[C1] No 11b2 cleanup ACK.** The earlier draft said an 11b2 ACK "is reported to exist". That was false. No cleanup acknowledgement from `Qoder · 11b2` is known. The latest 11b2 comment, PR #967 comment 6581117289, is a landed-row handover, not a cleanup ACK. 11b2's availability, and any unpublished overlapping work, stay **unconfirmed**. Registration does not wait for silence. Any real overlap is protected when an implementation claim is made (§10).
- **[C2] Scope.** "Every exit path" overstated the scope. The finite scope is: *after the reference database has been created successfully*, the S1, S2 and summary-throw paths, plus the normal paths. Reference-creation failure (U7), a killed process, and the migration-base file (U11) are out of scope. On the failure paths (CL-1 to CL-3) the requirement is **at least one cleanup attempt**, not exactly one. "Exactly once" applies only to the normal paths (CL-5). There it is **preserved**: it keeps the measured normal-path drop, and any relaxation needs an actual owner ruling, which this packet does not assume. The number of attempts on the failure paths stays **unsettled** (U6).
- **[C3] Raised-error wording.** The settled claims leave out U3 (which error is raised when the summary write fails under a fail verdict) and U9/R15 precedence (a deploy failure followed by an S2 exception). The S2 and EISDIR raised items are recorded exactly as the contract maps them (R15 under U9, R09 under U3). ER-7 settles only two things: the FAILED line is visible, and the exit is non-zero.
- **[C4] Registration qualification.** This revision was re-qualified against a fresh `main` and a fresh scan of open pull requests and branch tips, recorded in the D-283 entry's evidence. D-283 was the next free decision ID on `main` and on every open head scanned. That is a scan result at one point in time, not a global reservation.
- **[C5] Review and landing.** The row stays Tier 2. That is not a waiver, and the row is not relabeled Tier 1. The registration and the runtime change each need a separate independent final-head review before any landing. §9 names the route. This is prose, not machine enforcement: for a Tier 2 row, `scripts/review-gate.mjs` passes without a review.

## 1. Goal
`GATE-migration-apply` added a second database, `skipwait_head`, for the drift reference (its §4 ruling 3: "dropped after the comparison"). The drop is reached only on the straight path. If either `information_schema` snapshot or the step-summary write throws after the reference exists, the gate exits with the reference left behind. If the drop itself throws, the drop error replaces a failed verdict in the raised error.

After this row, the following hold once `CREATE DATABASE skipwait_head` has succeeded (`scripts/e2e-server.mjs:171`):
- an S1, S2 or summary failure still makes at least one cleanup attempt [C2];
- the primary `skipwait` database is never dropped;
- the normal paths still drop the reference exactly once;
- a failed cleanup does not hide a FAILED verdict in the raised error;
- nothing that fails today turns into success.

The scope is the finite list in §4. It is not "every exit path" [C2].

How this moves the goal: the PR gate that catches broken deploy migrations before production must report its real verdict and leave no state behind when part of it breaks.
- **Today.** Every failure case in §4 already exits non-zero, so the gate does not pass a failed migration. The defects are that the scratch database is left behind, and that a failed drop names itself instead of the FAILED verdict in the raised error.
- **After the runtime row lands.** These are future runtime effects, not effects of registration. The raised error keeps the real verdict, and the scratch database is cleaned up.

## 2. Contract of record and provenance [C1]
- **Contract.** "PR #967 cleanup contract: derived desired behaviour for the red-first candidate" (the W5 contract). Qualified by the coordinator from its bundle; the original 11-file manifest and the W8 28-file manifest were verified by the coordinator, not re-verified by this packet's author. The contract binds `10e9737e` (tree `c28f6c76`, byte-identical to `ebae6110`). It proposes no implementation, warning policy or fallback policy.
- **Candidate test.** The contract's external candidate, `gateCleanup.candidate.test.mjs` (`node:test` only, no dependencies), is published as the fenced block in PR #967 comment 6579717344. Lines 11-579 of that comment body hash to sha256 `d2d912792ea82b1c507fce62a40f9726afbbdbd49023d36346136bd0fd9ddc26`. A copy that differs only in a trailing newline hashes differently.
- **The subject is unchanged on `main`.** At `main` `a650b615`, `scripts/e2e-server.mjs` is blob `da21cb785aed5ccd148f0ffa4e75b98abbae695e` and `scripts/migrationGateCore.mjs` is blob `d221901d750bf810a0e7444b2dd9eb13f768aeb2`. These are the contract's bound blobs, so every `SRC` line reference below holds on `main`: `prepare` at `:134-183`, reference creation at `:170-171`, reference push at `:172`, snapshots at `:173`, the verdict loop at `:177-180`, the drop at `:181`, the throw on `fail` at `:182`, and the CLI catch at `:254`.
- **Runs of the candidate.**
  - Coordinator, at `main`: 43 cases, 36 green and 7 intended red (12.57 s).
  - Coordinator, scratch feasibility: 43 cases, 34 green, 9 bounds-mutants skipped, 0 fail (1.70 s).
  - Re-run by this packet's author at `main` `a650b615` with `LANE_REQUIRE_BOUND=1` (Node v22.23.4): 43 cases, 36 pass, 7 fail, 0 skipped (14.8 s). The 7 failures are exactly CL-1, CL-2, CL-3a, CL-3b, CL-3c, ER-3a and ER-3b.
  - That run is preparation evidence only. It is not a writer PASS, not a review, and not DB proof: the candidate uses fakes, never real MySQL.
- **Source comments.** These are PR #967 issue comments. GitHub shows them under the repository owner's account (association OWNER), but that association is not evidence of human approval. They are coordinator comments. With the derived contract interpretation, they are the source here. Nothing in them is treated as an owner grant or an owner ruling.
  - **C-A** 6577133271: "Cleanup is still not in finally …", "add a genuine assertion for cleanup", and "Do not turn unchanged warning/fallback behavior into a new owner ruling".
  - **C-B** 6578601856: "Measured: normal pass/warn/fail each drops the reference exactly once …", and "No swallowing a genuine failure or replacing it with success".
  - 6581005262: the follow-up route this row follows. Its words are "CLI+owned regression test+packet, same ci-checks serialization, dependent on the landed row, no workflow/settings/DB schema changes", and "unsettled cleanup-error exits stay out of this finite repair".
- **Rule sources.**
  - P-R3, P-R4, P-R5 and P-§5: `GATE-migration-apply.md` §4 rulings 3-5 and §5.
  - GD-3: `GATE-delivery.md` rule 3.
  - AG-101: `AGENTS.md`, "Silent failure is a defect".

## 3. Current behaviour on `main` `a650b615`
`prepare` creates the reference at `:171`, pushes it at `:172`, and takes both snapshots inside one expression at `:173`. It then writes each verdict line to stdout and the summary at `:177-180`, drops the reference at `:181`, and throws on `fail` at `:182`. No `try`/`finally` encloses `:173-181`. So:
- a throw at `:173` (S1 or S2) or at `:179` (summary) exits 1 with no DROP, and the reference remains;
- a throw at `:181` reaches the CLI catch at `:254` before `:182` runs, so stderr carries the drop error and not the FAILED verdict.

Terms, from the contract §1:
- **S1** is `snapshot(db, db.name)`.
- **S2** is `snapshot(reference, reference.name)`.
- **Summary failure** is the `appendFileSync` to `GITHUB_STEP_SUMMARY` throwing at `:179`.
- **Cleanup** is a `DROP DATABASE … skipwait_head` issued after `:171`.

## 4. Contract items mapped (derived, not owner rulings) [C1]
The "Head" column is the direction at `main` `a650b615`, which is identical to the contract's binding. "Red" means the desired behaviour is absent today: an intended red that this row turns green.

### 4a. Settled cleanup items (contract §2, Item 1)
| ID | Desired observable (derived) | Sources | Head |
|---|---|---|---|
| CL-1 | S1 throws: **at least one** cleanup DROP of `skipwait_head` is issued after its creation [C2]. `skipwait_head` is absent at exit. The primary `skipwait` is not dropped and is present at exit. | P-R3, P-§5, C-A, C-B | red (R06) |
| CL-2 | The same, when S2 throws. | same | red (R07) |
| CL-3a / CL-3b | The same, when the summary write throws, with verdict pass (3a) or verdict fail (3b). | same | red (R08, R09) |
| CL-3c | S1 throws, then the cleanup DROP throws. A cleanup attempt is still issued, the primary is kept, and both the S1 error and the cleanup error are visible on stdout or stderr. Which of the two is *raised* is not settled (U4). | C-A, C-B, AG-101 | red (R14) |
| CL-4 | In every run, cleanup never drops the primary database after the reference exists, and the primary is present at exit. | P-R3 | green (R01-R15) |
| CL-5a-e | Normal paths (pass, warn, fail-drift, fail-deploy, failed reference push): **exactly one** cleanup DROP, and `skipwait_head` is absent at exit. **Preserve.** This keeps the measured normal-path drop (C-A, C-B "exactly once" and "preserve … the new normal-path drop"). Any relaxation, such as accepting a second idempotent DROP, needs an actual owner ruling. None is assumed, and no holder or builder may relax it on its own [C2]. | C-A, C-B, P-R3 | green |

### 4b. Settled error-preservation items (contract §2, Item 2)
| ID | Desired observable (derived) | Sources | Head |
|---|---|---|---|
| ER-1a-e | The gate outcome is preserved. Pass or warn exits 0 and prints "database ready". A failed reference push warns and stays green. Fail exits non-zero, prints no success line, and the raised error (stderr) carries the verdict. | P-R4, P-R5, P-§5 | green |
| ER-2a/b | Fail verdict, and the cleanup DROP throws: non-zero exit and no "database ready". | C-B, P-R4 | green |
| ER-3a/b | Fail verdict (deploy, or drift), and the cleanup DROP throws: the raised error (stderr) still carries the original FAILED verdict and its reason. | C-A, C-B | red (R12, R13) |
| ER-4a/b | Fail verdict, and the cleanup DROP throws: the FAILED line is still on stdout and in the step summary. | C-B, P-§5 | green |
| ER-5a-d | A cleanup DROP failure is visible on stdout or stderr under any verdict. The channel is not settled (U5). | AG-101 | green |
| ER-6a-c | S1, S2 and summary-write exceptions are visible, not swallowed. | AG-101, C-B | green |
| ER-7 | Fail verdict, and the summary write throws: the FAILED line is visible (stdout or stderr) and the exit is non-zero. **Nothing more is settled** [C3]. Which error is raised is U3. (The candidate's ER-7 case also checks that no "database ready" line appears. That check stays as written, but it adds no claim about the raised error.) | P-R4, C-B, AG-101 | green |

### 4c. Raised items recorded as the contract maps them, not settled [C3]
- **R09** (summary EISDIR under a fail verdict): at head it raises EISDIR, and the FAILED line reaches stdout only. Which error must be raised is **U3**, which is unsettled. The settled claims for R09 are CL-3b (cleanup attempted) and ER-7 (FAILED visible, non-zero exit) only.
- **R15** (fail-deploy with ERROR 3734, then S2 throws): at head there is no verdict and the exit is 1. The raw ERROR 3734 text is on stdout only, and stderr is the S2 error. Whether a FAILED verdict must still be produced, and which error takes precedence, is **U9**, which is unsettled. No settled claim beyond CL-4 is made for R15.

### 4d. Unsettled items: observed, never asserted, never decided by this row
| ID | Open question | Observed at head |
|---|---|---|
| U1 | Exit status when the verdict is pass or warn and the cleanup DROP throws. GD-3/P-R5 point one way; C-A/C-B ("do not silently decide new warning/fallback policy") point the other. | exit 1 (R10, R11) |
| U2 | Exit status after an S1, S2 or summary-write exception. | exit 1 (R06-R08) |
| U3 | Which error is raised when the summary write fails under a fail verdict. | EISDIR (R09) |
| U4 | Which error is raised when both S1 and the cleanup DROP fail. | not observable (no cleanup at head) |
| U5 | The channel for a cleanup failure (stderr, stdout, summary or `::warning`). | stderr, as the raised error |
| U6 | How many cleanup attempts on the failure paths (one, or retries). | none at head |
| U7 | Cleanup when creating the reference itself fails. **Outside** the after-created scope [C2]. | not exercised |
| U8 | Whether the step summary must record a cleanup failure or an S1/S2 exception. **Unknown.** | neither recorded |
| U9 | Whether a deploy failure followed by an S1/S2 exception must still produce a FAILED verdict (R15). | no verdict, exit 1 |
| U10 | Order of cleanup against the verdict output. **Unknown**, except that when the DROP fails the verdict still reaches stdout and the summary (ER-4). | verdict written, then drop |
| U11 | The `e2e/.results/migration-base` file. **Outside** this row's cleanup subject (P-R3 names only `skipwait_head`). | not asserted |

Under 6581005262, the unsettled cleanup-error exits (U1, U2) stay out of this repair. A builder who finds a settled item cannot be met without deciding a U item stops and reports (§10). The builder never picks a policy.

## 5. Files
In scope (the row's `owns`):
- `scripts/e2e-server.mjs`: `prepare` (`:134-183`) only. `start`, the helpers outside `prepare` and the CLI dispatch (`:252-259`) stay byte-identical, unless the builder shows that a settled item cannot be met inside `prepare`. In that case, stop and report.
- `scripts/migrationGateCleanup.test.ts` (new): the regression test, adapted from the candidate. It must be a Vitest `.test.ts`: `vitest.config.ts:32` only collects `scripts/**/*.test.ts`, so a `node:test` `.mjs` file would never run in CI.
  - Keep every settled CL/ER case, the fault-fired guards, the no-network guard (H-1) and the determinism check (H-3).
  - Do not commit any case that calls `skip` or `todo`. `scripts/testIntegrityCore.mjs:20` rejects an added `.skip(`/`.todo(` (rule 3).
  - So the candidate's bound-blob check (H-2) and the K mutation controls, which skip by design once the subject blob changes (contract §5), are run against the unchanged subject on the red-first commit and pasted into the PR as evidence. They are not committed as permanently skipping tests.
  - The oracle self-tests (O-1, O-2) may be kept when they do not skip.
- `docs/plans/GATE-migration-cleanup.md`: your Status line.

Out of scope:
- `scripts/migrationGateCore.mjs` and `scripts/migrationGate.test.ts`. The existing 24 core tests stay byte-identical and green.
- `.github/workflows/ci.yml`: no workflow, settings or ruleset change (6581005262).
- `drizzle/**`, `e2e/**`, `package.json`, `scripts/apply-deploy-migrations.sh`.
- Any production database, dump or secret.
- The unverified "e2e journeys required check" owner-word claim. It is not adopted or widened here, and the check stays non-required (GATE-delivery rule 4) [C5].

## 6. Steps (one commit each)
1. **`GATE-migration-cleanup: red-first regression test`.**
   - Add `scripts/migrationGateCleanup.test.ts` with `e2e-server.mjs` unchanged (blob `da21cb78`).
   - Run it and show exactly the 7 intended reds (CL-1, CL-2, CL-3a, CL-3b, CL-3c, ER-3a, ER-3b) with every other case green.
   - On this commit, also run the candidate's H-2 (bound blobs) and K controls (M1-M8 each killed by its listed case), and paste the output into the PR.
2. **`GATE-migration-cleanup: prepare cleans the reference on S1/S2/summary failure and keeps the FAILED verdict`.**
   - Make the smallest change inside `prepare` that turns the 7 reds green with no other case changing direction.
   - The builder chooses the shape. It must not be any of the contract's wrong-repair shapes:
     - M1: drops the primary.
     - M2: recreates the reference.
     - M3: double drop on the normal path.
     - M4: the drop error replaces the verdict.
     - M5: a primary failure ends green.
     - M6: a cleanup failure is swallowed.
     - M7: drops before the comparison.
     - M8: drops ahead of the verdict output.
3. **Status commit**: your Status line here.

After each step, run `pnpm vitest run scripts/migrationGateCleanup.test.ts scripts/migrationGate.test.ts scripts/ciMarkerSkip.test.ts`, then `pnpm check`.

## 7. Fidelity limits (from the contract §5; stated, not hidden)
- **Fakes only.** The regression test uses module-resolution fakes for `mysql2/promise` and `node:child_process`. Real MySQL DROP semantics, error codes and locks are not exercised. The real `mysql2` binding is exercised only on the normal path, by the existing `e2e journeys` CI job.
- **The test is coupled to the I/O seam.** A repair that changes that seam (for example, dropping `mysql2/promise` or `spawnSync`, or adding new repository imports to `e2e-server.mjs`) needs a matching harness update. The assertions do not change.

## 8. Definition of done
- The step-1 commit shows the 7 intended reds and only those. The step-2 head shows all settled cases green, with no case changing direction except the 7.
- `scripts/migrationGate.test.ts` (24 tests) is unchanged and green. No existing test is edited, skipped or loosened (test-integrity).
- The full gate from `docs/BRIEF.md` "How to ship" passes on the branch merged with the latest `origin/main`. That includes `node scripts/scope-check.mjs GATE-migration-cleanup`, the decision-id check and the test-integrity check.
- On the PR, the `e2e journeys` job still shows the base revision, "run 1: N applied", "run 2: 0 applied" and "no drift", and stays under 10 minutes.
- A pull request with every required check green on its exact head, current with `main`.
- A separate independent final-head review (§9) is recorded before landing.
- The row lands by merge commit (never squash or rebase, D-134 (6)). In the landing PR, set `status` to `done` and add the DELEGATION §5 evidence block below.
- No U item is decided. A "done" here closes CL-1 to CL-3c and ER-3a/b only. It does not close the Nov 1 findings, the ERROR 3734 summary detail, the base-file destination, or the unretrieved local MySQL 8.0.41 probe logs from PR #967, which stay separate.

## 9. Review and landing (Tier 2: computed for the registration diff, projected for the runtime row; prose, not machine enforcement) [C5]
- **Tier.** Declared Tier 2. This is not a waiver.
  - **Registration diff:** Tier 2 as computed by `scripts/tierClassifyCore.mjs` on the actual diff.
  - **Runtime row:** Tier 2 is *projected* from its `owns`, because no runtime diff exists yet. Recheck `classifyTier` against the actual runtime diff when one exists.
  - If either pull request ever computes Tier 1, stop and report: Tier 1 brings in the D-151 model-independence rule, and the reviewer's eligibility then has to be checked again.
- **What is enforced, and what is prose.** For a Tier 2 row, `scripts/review-gate.mjs` passes with no review, and the queue gate admits a docs-only registration from any branch. The review and landing requirements below are prose obligations, recorded in the register and here. No machine check enforces them.
- **Registration pull request (D-283; `DECISIONS.md`, `assignments.json`, this packet).**
  - **Reviewer:** a separate, read-only reviewer seat. It is not this packet's author session, and it is allocated through the coordinator (Instinct, #811).
    - It reviews the exact final head: the diff, `validateAssignments` (`[]`), the decision-id result against current `main`, and the required-CI run on that head.
    - It reports a head-scoped conclusion that names that SHA. It is not required to post the conclusion itself. The write-capable seat records it on the pull request with the reviewer's original attribution, and does not reword it as its own.
    - A different model is required only where Tier 1 or current rules require it. It is not stated here as a blanket rule.
  - **Lander:** a separate, write-capable session. It is neither the author nor the read-only reviewer seat.
    - It re-fetches `main`, merges it (never rebase), and re-checks that D-283 is still free with `node scripts/decision-id-check.mjs`.
    - It re-runs `validateAssignments`, waits for every required check on that exact head, and lands with the merge-commit button.
    - If D-283 has been taken, it renumbers to the next free ID and gets a fresh delta review. It never keeps a placeholder.
- **Runtime pull request (`agent/queue/gate-migration-cleanup`).**
  - **Builder:** a development session other than the Claude Code session through the picker (D-225).
  - **Reviewer:** a separate, eligible reviewer who neither built nor fixed the row, reviewing the exact final head before landing. Its scope is the source diff, the red-first and green evidence, the H-2/K output, the required-CI execution proof on that head, and currency with `main`. It reports a head-scoped conclusion. If the reviewer is read-only, a write-capable seat records it with the reviewer's original attribution.
  - **Lander:** a separate, write-capable session. It goes through the landing slot (`Land claim GATE-migration-cleanup: <name>` on `agent/queue/landing`), with the merge-commit button.
  - **The runtime floor.** It stays as recorded: Tier 2, projected from `owns`. It gets its own `classifyTier` check on the actual runtime diff at that time, and it is not relabeled to a blanket Tier 1.
- **Barred on both pull requests:**
  - no admin bypass;
  - no self-review or self-landing;
  - no Fixed or review marker without code;
  - no reopening of `GATE-migration-apply`;
  - no green CI standing in for the review.

## 10. Stop and ask (write it in your Status line, push, report blocked)
- **Overlap.** Before claiming, probe for overlapping work: `git ls-remote origin` and `git merge-tree` against any branch that touches `scripts/e2e-server.mjs`. Include any work published by `Qoder · 11b2`, whose availability and unpublished overlap are unconfirmed [C1]. If an open row or an active holder's branch changes `prepare`, stop and report. Do not merge over it.
- **An unsettled item.** A settled item cannot be met without deciding U1-U11 (for example, the pass/warn exit after a failed cleanup). Report it to Instinct with the case, and do not choose a policy.
- **Outside the owned files.** The repair would need a change outside `prepare`, or outside the owned files: the CLI dispatch, `ci.yml`, `migrationGateCore.mjs`, or a new dependency.
- **The subject moved.** `scripts/e2e-server.mjs` on `main` is no longer blob `da21cb78` when you start. Re-qualify the red-first set before writing the repair.
- **Main drifts.** Run on `main`, the drift check reports a missing table or column. That is the `GATE-migration-apply` §10 stop: report it, do not baseline it.

## Status
- GATE-migration-cleanup: review — agent/queue/gate-migration-cleanup — 6772e8c8 (Hark · 5de4, model unverified, no D-151 independence claim; falsy-throw fix: red 3c92875b 25 fail / 34 pass → 59/59; needs a separate final-head reviewer against current main and a distinct lander)
- GATE-migration-cleanup: independent final-head review — agent/queue/gate-migration-cleanup — code head 643329ba (DeepSeek V4.1 Flash Free · f64f, 2026-11-06; full record on PR #982). Evidence — genuine two-parent sync 7af6c2af + 7df2004b, diff unchanged 3 files / 653 insertions; both code blobs byte-identical to the bb806a5c head Instinct reviewed at 16:37Z. Red-first 8044cdc2: exactly 7 intended reds (CL-1/2/3a/3b/3c, ER-3a/b; 27 passed); mutant deleting the cleanup DROP → 45/59 red; test diff 609 insertions / 0 deletions, no skip, only or removed expect. Gate: check 0 · token audit 0 · migrations lint 0 · deploy triggers 0 · decision-id 0 · validateAssignments [] · classifyTier {tier:2} with no Tier 1 paths · scope-check 2 owned paths · focused 286/286 · quality:gate 0 (5986 passed, 0 failed) · pnpm build 0 · goal-surface build 0. CI 42105845859 on 643329ba: typecheck, unit + component + route tests, production build and e2e journeys all success; the e2e job ran the modified prepare against MySQL 8.0.46 (base 7df2004b348c, run 1: 48 applied, run 2: 0 applied, no drift, database ready). Live: no deploy scheduled or claimed (scripts/docs only). NOT landed: the row's assignments.json note and §9 require a separate final-head reviewer AND a distinct lander, so this session is the reviewer only — no status done, no merge to main, no --landed marker. Lander: re-check this head against current main, wait for exact-head CI, land by two-parent merge never squash, then set status done and this line to done — <sha> with the DELEGATION §5 block.
- GATE-migration-cleanup: done — 7dfd2c51 — DeepSeek V4.1 Flash Free · eb79, 2026-11-06. Evidence — docs/plans/GATE-migration-cleanup.md. Branch agent/queue/gate-migration-cleanup @ 93e40cf4 + this status commit (reviewed head 7dfd2c51; marker-only, identical tree), merged with origin/main 7df2004b (0 behind). Red first: 7 intended reds at 8044cdc2, reproduced 7/27 (34); cleanup-DROP mutant 45/59 red; test diff 609+/0-, no skip/only/removed expect. Gate: check · token audit · migration lint · deploy triggers · decision-id · scope-check 2 owned paths · validateAssignments [] · classifyTier 2, all 0; quality:gate vitest 5984 passed / 2 host-load flakes isolated green / 0 row-code failures; focused 286/286; pnpm build 0; goal build 0. CI 42109172754 on 7dfd2c51: five jobs success; e2e ran modified prepare on MySQL 8.0.46 (48/0 applied, no drift, database ready). Live: no API/web deploy scheduled (scripts/docs-only), CONVERGED not owed. Left out: U1-U11 undecided; Nov 1 findings, ERROR 3734, base-file destination, PR #967 MySQL probes stay separate. Clearance review: Instinct 21:22Z on #982; f64f's record is evidence. Separate lander, two-parent merge, never squash/rebase.

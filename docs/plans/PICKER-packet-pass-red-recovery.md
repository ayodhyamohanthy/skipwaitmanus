# PICKER-packet-pass-red-recovery

Status: proposed technical registration, not implementation or task #878 clearance.

## Goal and evidence

A Tier 1 packet must reach a real qualified review and green exact-head CI without depending on one departed session. On main `7eb00cb21461aad9cebf1cfe411841c2c4a4b18b`, PR #878 is `architect`, head `75fffe81`, review PASS `e3c31445` naming `74d71cae`. Empty packet Land claim `807201ff` came after that reviewed head; a later clean main merge produced `75fffe81`. Run `42450567193` fails only step 11, Review gate; unit, e2e, build and Workers pass. The gate correctly treats the branch-owned empty Land claim as an unreviewed nonmerge commit. Nothing here changes that gate.

Current `buildView` sets `open` only for todo rows. Thus this architect packet never reaches the blocked-to-UNBLOCK branch. Its packet gate-only-red path instead skips a passed review with "review passed; re-run CI", even though rerunning cannot change the rejected lineage. An isolated actual-row-shape test against current source returns NONE with that reason. Report `9c46bafd` records the block. Existing Gemini `25a3` can re-record only after a real current-head review; another session must not impersonate it. D-306 concerns #736, not this case.

## Registration and ownership

Append `PICKER-packet-pass-red-recovery`, Tier 2, lane `picker`, no dependencies, after existing rows. It consumes no unlanded output. No `owns` is declared: core is already owned by dependency-held fullstack/QA/landing-wait rows. As with D-286/D-294, the existing picker lane prevents concurrent work unless both rows prove disjoint ownership; a new dependency used only for ordering is forbidden by D-223. Inspect all live conflicting claims before implementation. Do not reopen a done row, take over #878, or change another row's branch, status, scope or claim.

The implementation may edit only:
- `scripts/nextTaskCore.mjs`
- new `scripts/nextTaskPacketPassRed.test.ts`
- only case (g), its title and its two expectations, in `scripts/nextTaskArchitectReview.test.ts`, as corrected below
- this packet's Status section

Do not edit any other existing test case, review-gate, workflows, required checks, scope-check, claim/verdict mechanics, or product code. If a necessary change falls outside these files, stop the affected edit and return the measured gap for ordinary scope review.

## Required behavior

For an architect-status Tier 1 packet with an open PR, exact-tip completed CI classified as red only at the review gate, stage `passed`, and a genuinely quiet review lock, use the existing normal REVIEW handout on its review lock. Exclude every builder/writer/fixer model under the existing D-151 rules, including packet writer history. Preserve actual-model qualification, not client-label inference. Active review locks remain held. A fresh review is not an automatic verdict: it must assess the complete current head and record that head through the existing verdict flow.

Keep all other states unchanged. In particular, no new admission for `landing`, `fixing`, `needs-fix`, mixed red, unknown/error/no-tip CI, running CI, an unclassified failed job, unmet dependencies, stale packets, owner rows or Tier 2/3 packets. Exact quiet-boundary semantics must match the current clock. A blocked report is not silently cleared by this routing change; return its status truthfully in the handoff and have the legitimate qualified holder assess any real remaining block before reporting. No false report may clear it. Required review gate and exact-head CI still control landing; D-190 never-the-packet-writer landing remains.

## Red-first acceptance

1. Reproduce current NONE on the exact #878-shaped fixture with a passed review, empty post-review Land claim lineage and gate-only red. Then expect REVIEW after quiet for an eligible model.
2. Reject builder/writer/fixer models, including differing session tags of the same model; do not equate client labels with actual model evidence.
3. Keep an active lock held; pin just-before, exact and just-after quiet boundary.
4. Keep mixed red, unknown CI, wrong-tip CI, running CI and missing job classification closed.
5. Preserve packet needs-review and in-review continuation behavior from D-294/D-299.
6. Preserve landing/fixing/needs-fix, Tier 2/3, ordinary todo Tier 1 and owner rows.
7. Preserve explicit dependencies and packet re-sync precedence; no new task reorder or lane release.
8. Preserve #878's blocked report in the returned context/status; no synthetic green, withdrawal or report. A fresh qualified review must not be described as clearing unrelated product findings.
9. Original picker suites and architect review/landing suites pass with only the deliberate case (g) expectation replacement described below; every other existing case stays unchanged. New focused tests, registry validation, decision-id check, typecheck and required CI pass.
10. After normal implementation landing, use nonmutating current-source preview to show a real exact-tip gate-only-red packet can reach REVIEW for an eligible session. The preview writes no claim or verdict. Live proof must not use stale candidate router code.

## Limits and review

This is technical recovery of already-decided work, not a founder product decision, permission to merge #878, permission to change identity policy or a review-independence exception. No actual marker, task claim, verdict, report, queue block, migration, auth, money, account setting, flag or production action is authorized by this packet. No automatic CI rerun or stale PASS promotion. Registration requires separate final-version review, current-main checks and required CI under the existing routine merge arrangement. Implementation then follows its own ordinary picker/review/CI route.

## Status

2026-11-09: Prepared from current main7eb00cb. D-307 absent across all519 origin heads checked (395 with a register;124 predate it). Source-only mechanics test reproduces the gap; no product review or implementation claimed. #878 handoff6731949831 preserves the existing history. Existing owner-held design chains are unchanged.

## Measured scope correction, 2026-11-09

The original registration's no-existing-test-edit and unchanged-suite conditions contradicted the required passed/gate-only/quiet routing change. The original architect-review case (g) requires rerun-only NONE for the same picker-visible state. Current source has no reviewed-sha-body discriminator. Baseline50/50 and a scratch behavior patch49pass/1fail reproduce the contradiction; the patch was reverted. Builder report ff1db785/statusfa888b96 remain truthful, not cleared by this text.

After the docs correction's separate exact-final review, green required CI and normal merge, this row may replace only case (g)'s title and two expectations: assert normal REVIEW with architect work, ordinary review lock and packet flag, and separately reject ARCHITECT/MAKE GREEN/FIX. Keep at least the existing two assertion lines. No deletion, skip, focus or unrelated test edit. Add the new focused controls for active passed locks, exact quiet boundary, builder/writer/fixer exclusions, mixed/running/unknown/wrong-tip CI, dependency/re-sync and truthful blocked-report context. Other existing cases/suites remain unchanged. The old architect-review packet R3/(g) is superseded only for this bounded passed/quiet state; all other safeguards stand. No loader, gate, workflow or test-integrity change is allowed. The no-owns/manual-allowlist and separate-review obligations stand. Runtime consistency remains unverified until actual tests prove it.

2026-11-09: in progress — DeepSeek V4.1 Flash · e0df — 2026-11-09 — branch agent/queue/picker-packet-pass-red-recovery.

2026-11-09: BLOCKED on a measured packet contradiction — DeepSeek V4.1 Flash · e0df — branch `agent/queue/picker-packet-pass-red-recovery`.

Measurement (throwaway patch, reverted; branch carries no source change yet): implementing the packet's **Required behavior** exactly — for an architect-status Tier 1 packet with gate-only red and a quiet lock, hand the normal REVIEW instead of `review passed; re-run CI` — makes `nextTaskArchitectReview.test.ts` case **(g) "passed gate-only red skips for CI rerun, never architect or fix"** fail, and nothing else (49 other tests in the architect-review, gate-red and avoid-land suites still pass).

That fixture is **field-for-field the same shape the packet describes**: `status: "architect"`, `tier: 1`, open PR on the architect lock, `prCi = { state: "red", gateOnly: true, sha: tipSha }`, review lock markers `[Review claim, Verdict pass]` with a 3-hour-old tip (quiet), claimant eligible. The #878 case adds only an **empty Land-claim commit after the reviewed head**, which the picker cannot see as a discriminator: `parseMarker` keeps the subject line only, so the verdict's `reviewed <sha>` body never reaches `buildView`, and `reviewStateOf` already returns `passed` in both shapes.

So the packet's three requirements cannot all hold at once:
1. hand REVIEW for a passed, gate-only-red, quiet packet (Required behavior),
2. "Do not edit existing tests" and (g) keeps its current expectation, and
3. "Original picker suites and architect review/landing suites pass unchanged" (acceptance 9).

**Question for the scope decision (not a product question):** which wins —
- **(A)** this row may change case (g)'s expectation, recorded as a deliberate behaviour change with the measured reason (packet gains one edited existing test, contradicting its own restriction), or
- **(B)** the row stays source-free and the discriminator is added by widening scope to the loader (`reviewed <sha>` from the verdict body) — a file outside this packet's allowed edit list (`scripts/nextTaskCore.mjs`, the new test, this Status section)?

I did not guess. No source change is committed, no claim, verdict or report marker besides this line, and #878's blocked report stands untouched.

2026-11-09: implemented (awaiting gate and landing) — DeepSeek V4.1 Flash · e0df — branch `agent/queue/picker-packet-pass-red-recovery`.

Change, three files only as the correction allows: (1) `scripts/nextTaskCore.mjs` — inside the existing packet gate-only-red block, a `passed` stage now keeps the `review passed; re-run CI` skip only while the stage is still active (`!quiet(lockAt(v))`, and `lockAt` already folds in the work branch for a passed stage, so an empty post-review claim plus a clean merge keeps it alive exactly like #878); once genuinely quiet it hands the same ordinary REVIEW pick the needs-review branch already produces (`work: archName`, `lock: reviewLock`, `packet: true`), after refusing builder/fixer models (`did(v, ["builders","fixers"])`) and packet writers (`v.writers`), and after refusing while a standing blocked report exists — an architect row is not `open`, so the ordinary blocked hand-out cannot see it and this route reports the block truthfully instead of reviewing over it. (2) `scripts/nextTaskArchitectReview.test.ts` — only case (g)'s title and its two expectations, as the correction authorizes: the quiet packet now asserts the REVIEW hand-out on the architect work and ordinary review lock, and ARCHITECT/MAKE GREEN/FIX stay excluded; at least the existing two assertion lines are kept. (3) new `scripts/nextTaskPacketPassRed.test.ts` — ten focused controls: the hand-out, the active-lock rerun skip, the #878 post-review-commit shape staying closed, builder/writer/takeover/fixer exclusion including other session tags of the same model, the exact quiet boundary (two hours is **not** quiet, two hours plus one millisecond is), mixed/running/unknown/error/wrong-tip CI, packet needs-review and quiet in-review preservation, landing/fixing/needs-fix/Tier 2/owner rows, dependency and re-sync precedence, and a blocked report that this routing never clears.

Red first, measured: the two behavioural assertions failed (`expected { kind: 'none' } to match { kind: 'review' }` and `expected 'none' to be 'review'`) before the core change, while the eight keep-closed controls already passed; after it, all ten pass. Suites on the branch merged with `origin/main` `47550f78`: `nextTaskArchitectReview`, `nextTaskPacketPassRed`, `nextTaskGateRedReview`, `nextTask`, `nextTaskAvoidLand`, `nextTaskArchitectLanding` = **6 files / 250 tests passed**; `pnpm check` 0; decision-id-check clean. Scope is the packet's manual allowlist (the row declares no `owns`, so `scope-check --branch` reports *nothing to compare*, never a pass). No loader, gate, workflow, claim/verdict, product or other test changed. Not landed.

2026-11-09: done — `eeec37e3` — DeepSeek V4.1 Flash · e0df — landed through PR #1067 on exact-head green required CI (typecheck, unit + component + route, production build, e2e journeys); the strict two-hour boundary, the #878 post-review shape and every keep-closed control are pinned by the new suite. Row status `done` in the registry in this same pull request.

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
- this packet's Status section

Do not edit existing tests, review-gate, workflows, required checks, scope-check, claim/verdict mechanics, or product code. If a necessary change falls outside these files, stop the affected edit and return the measured gap for ordinary scope review.

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
9. Original picker suites and architect review/landing suites pass unchanged, plus new focused tests, registry validation, decision-id check, typecheck and required CI.
10. After normal implementation landing, use nonmutating current-source preview to show a real exact-tip gate-only-red packet can reach REVIEW for an eligible session. The preview writes no claim or verdict. Live proof must not use stale candidate router code.

## Limits and review

This is technical recovery of already-decided work, not a founder product decision, permission to merge #878, permission to change identity policy or a review-independence exception. No actual marker, task claim, verdict, report, queue block, migration, auth, money, account setting, flag or production action is authorized by this packet. No automatic CI rerun or stale PASS promotion. Registration requires separate final-version review, current-main checks and required CI under the existing routine merge arrangement. Implementation then follows its own ordinary picker/review/CI route.

## Status

2026-11-09: Prepared from current main7eb00cb. D-307 absent across all519 origin heads checked (395 with a register;124 predate it). Source-only mechanics test reproduces the gap; no product review or implementation claimed. #878 handoff6731949831 preserves the existing history. Existing owner-held design chains are unchanged.

2026-11-09: D-308 (unblock ruling under D-200, Dev (Skydive) · 1109) resolves the implementation block reported by DeepSeek V4.1 Flash · e0df: case (g) of `nextTaskArchitectReview.test.ts` is field-for-field this packet's Required shape and currently answers the rerun-only skip, so the packet as scoped was self-contradictory. D-308 supersedes case (g) for exactly this fixture shape (expectation: qualified REVIEW after quiet) and narrows D-307's no-existing-test clause to permit that one edit; every other limit above stands verbatim. #878's route is unchanged.

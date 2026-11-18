# Ordinary Tier 1 passed review-gate-only-red recovery

## Measured defect
On main613e6e1b, an ordinary Tier1 task with a recorded pass and exact-tip CI red only at the named independent-review gate is handed a source FIX. A fixer can change no files, record Fixed, and overwrite the pass stage, making the same loop recur. The user's supplied OpenCode screenshot identified this zero-delta cycle; the deterministic regression reproduces it with no remote writes. Architect packet D307 already handles a related quiet recovery, but ordinary task routing does not.

## Narrow change
Only scripts/nextTaskCore.mjs and new scripts/nextTaskOrdinaryGateRedLoop.test.ts. Before ordinary Tier1 red-CI source-fix routing, distinguish exact-tip gateOnlyRed plus passed/landing state. An active pass or landing waits for exact-head CI reevaluation, not source FIX. A genuinely quiet passed lock returns ordinary qualified REVIEW, retaining builder/fixer model exclusion. A landing lock is not stolen. No automatic pass/landing, lock deletion or new review-gate semantics. Findings and mixed/wrong-tip/unknown CI remain on existing routes; standing blocks/dependencies/current-main failure stay binding. No changes to existing tests or verdict parsing.

Red first1failure3controls. Initial corrected focused214tests pass across9new plus ordinary gate-red, packet pass-red and existing picker suites. No actual hosted sign-in acceptance or productive external session claimed.

## Ownership and delivery
Existing non-done fullstack/qa/landing-wait rows overlap core; no active queue/review refs found for those rows. No owns declared for this child, matching established lane-serialized picker recovery rows. This means scope-check cannot enforce a file allowlist; the exact two-path manual diff and independent review must enforce it. Existing branches/status/holds remain unchanged. The row uses lane picker, not an invented dependency for scheduling, and cannot displace an actual active holder. Coordinator owns bounded integration under authenticated implementation/parallel-work instructions recovered separately; this document does not grant authority.

Normal independent final-version review, required exact-head CI/current main and protected merge remain. No force writes or protection bypass. Before completion run the real current picker read-only, inspect actual current refs/model/session state, show no duplicate FIX in the observed state, and name any still-unverified state. Unit fixtures are not proof that a live coding session resumed. No demonstration claim/write on another owner's row. Actual D057 provider preview/callback and Google/work-email acceptance remain held independently of source review and this routing fix.

Status: implementation83b639f3 prepared, not merged or live. Separate stale fetch issue1090 is not implemented by this row.

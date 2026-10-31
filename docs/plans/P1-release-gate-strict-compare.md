# P1-release-gate-strict-compare

Tier1 required fail-closed contract correction, incident748 remains open. Owns only scripts/require-green-release.mjs and scripts/requireGreenRelease.test.ts; packet/status updates only otherwise. No workflow/settings/production/DB/secret/spending/rollback change.

Evidence: independent750review https://github.com/ayodhyamohanthy/skipwaitmanus/pull/750#issuecomment-6443525999 and builder acknowledgment6443540808 identify compare() accepting missing ahead_by/behind_by via Number(). In supersededBy, Number(undefined) becomes NaN, descends() returns false and an older ordinary release can be allowed on malformed API data. The original packet explicitly requires failclosed errors/malformed/superseded races. 'GitHub always returns it' is not a waiver. Clarification requested https://github.com/ayodhyamohanthy/skipwaitmanus/pull/750#issuecomment-6443984034 .

1. Normal picker claim and latest main integration, no forced marker or parallel ownership. First release750 d79cfa00 CI40517325372/API40517325313/Web40517325431 acceptance must be preserved: do not land another main change while those exactSHA runs are pending, because main CI currently cancels on a new push. Branch work is allowed without cancelling main.
2. Write red-first realistic response/process fixtures proving malformed compare data cannot yield a PASS for stale API or Web releases. Cover missing/null/nonnumeric/nonfinite/negative/fractional/string counts, malformed status/contradictory response and valid identical/ahead/behind/diverged behavior at owning boundaries. Decide exact valid JSON schema from current GitHub response contract, not permissive coercion. Unknown/malformed must throw a parse/API error that retries boundedly then refuses, never falls through to not-superseded.
3. Fix validation narrowly for API and Web supersession paths and main membership comparison. Preserve deliberate older-target recovery semantics and exacttargetCI checks. Test real normal positive/negative cases read-only; no workflow dispatch or production write.
4. Separate --once latency issue: either align documentation with its bounded API-error retry and add a test, or enforce the intended explicit latency contract with evidence. Do not silently change retry behavior while presenting it as a parser-only fix.
5. Independent nonbuilder/nonfixer Tier1 exacthead semantic review, honest red-first output, all required exactcandidate and latestmain checks green, normal protected merge commit. No test weakening or false incident closure; observe subsequent normal gated run and identities after landing. Do not waive malformed-input failure because current live responses happen to be well formed.

## Status

- P1-release-gate-strict-compare: in-review — implementation merged as fecf0d3b (#755; head 3ff72fa2; land marker 634ab8e6); required CI 40580698077 success on the merged head; packet item 5 acceptance pending — no post-landing normal gated release identity is recorded here yet, and runtime acceptance stays with #748
- D-248 (Oct 30): the row released its two-file reservation — `owns` is removed from `docs/plans/assignments.json` because the code is on `main` and only the item 5 observation remains, so it no longer holds `scripts/require-green-release.mjs` and `scripts/requireGreenRelease.test.ts` against `REL-rollback-skew` (`filesBusy`, `scripts/nextTaskCore.mjs:552`). The row stays `in-review` until item 5 is recorded; if item 5 needs code, re-declare `owns` in a docs-only pull request (D-200 (2)).


Evidence — P1-release-gate-strict-compare — Claude Code · da74 — 2026-10-27
Branch agent/queue/p1-release-gate-strict-compare @ af3a67b5, contains origin/main 9746ec9a
Red first: 20 of 75 failing against the gate on main in scripts/requireGreenRelease.test.ts (c93e3478); a stale API and Web rerun with a compare missing behind_by PASSED, also as a real process. After 45393ee4: 75/75
Gate: check 0 · token audit OK · migration lint OK · deploy triggers OK · scope-check OK (2 owned paths) · actionlint clean · vitest 549 files passed / 4889 passed / 18 skipped / 0 failed · build 0
Real API (read-only, strict parser): main bfb8da61 PASS api and web --once; 2dcea864 REFUSED (CI); stale 3e0894ff REFUSED api and web (superseded); eebbe568 REFUSED (not on main, diverged parsed); recovery b5299cfd PASS; recovery 215b3a7a REFUSED (schema contract)
Live: none (no deploy, dispatch or production change); incident #748 stays open
Left out / follow-ups: none in this row; --once retry behaviour unchanged, only its documentation (af3a67b5)

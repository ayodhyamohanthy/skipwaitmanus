# P1-release-gate-strict-compare

Tier1 required fail-closed contract correction, incident748 remains open. Owns only scripts/require-green-release.mjs and scripts/requireGreenRelease.test.ts; packet/status updates only otherwise. No workflow/settings/production/DB/secret/spending/rollback change.

Evidence: independent750review https://github.com/ayodhyamohanthy/skipwaitmanus/pull/750#issuecomment-6443525999 and builder acknowledgment6443540808 identify compare() accepting missing ahead_by/behind_by via Number(). In supersededBy, Number(undefined) becomes NaN, descends() returns false and an older ordinary release can be allowed on malformed API data. The original packet explicitly requires failclosed errors/malformed/superseded races. 'GitHub always returns it' is not a waiver. Clarification requested https://github.com/ayodhyamohanthy/skipwaitmanus/pull/750#issuecomment-6443984034 .

1. Normal picker claim and latest main integration, no forced marker or parallel ownership. First release750 d79cfa00 CI40517325372/API40517325313/Web40517325431 acceptance must be preserved: do not land another main change while those exactSHA runs are pending, because main CI currently cancels on a new push. Branch work is allowed without cancelling main.
2. Write red-first realistic response/process fixtures proving malformed compare data cannot yield a PASS for stale API or Web releases. Cover missing/null/nonnumeric/nonfinite/negative/fractional/string counts, malformed status/contradictory response and valid identical/ahead/behind/diverged behavior at owning boundaries. Decide exact valid JSON schema from current GitHub response contract, not permissive coercion. Unknown/malformed must throw a parse/API error that retries boundedly then refuses, never falls through to not-superseded.
3. Fix validation narrowly for API and Web supersession paths and main membership comparison. Preserve deliberate older-target recovery semantics and exacttargetCI checks. Test real normal positive/negative cases read-only; no workflow dispatch or production write.
4. Separate --once latency issue: either align documentation with its bounded API-error retry and add a test, or enforce the intended explicit latency contract with evidence. Do not silently change retry behavior while presenting it as a parser-only fix.
5. Independent nonbuilder/nonfixer Tier1 exacthead semantic review, honest red-first output, all required exactcandidate and latestmain checks green, normal protected merge commit. No test weakening or false incident closure; observe subsequent normal gated run and identities after landing. Do not waive malformed-input failure because current live responses happen to be well formed.

## Status

- P1-release-gate-strict-compare: in progress — Claude Code · da74 — 2026-10-27 — branch agent/queue/p1-release-gate-strict-compare

# P1-deploy-green-gate

Issue: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/748

## Verified failure and impact

Main2dcea864 triggered CI and deploys10:11:50Z. CI40486604317 failed10:17:39Z; Web40486604081 deployed10:13:13Z. API40486604551 migrated production10:11:59-10:12:13Z and deployed10:13:20-10:31:58Z. Source workflows independently run on push(main); API deploy needs only migrate-db, neither waits on complete required CI. Main health later reports2dcea864 ready. This is a real gate defect, not excused by the known shareHub test failure. No production incident or content loss inferred from this alone. Preserve working service.

## Scope

Owns .github/workflows/deploy-api.yml, .github/workflows/deploy-pages.yml, scripts/require-green-release.mjs, scripts/requireGreenRelease.test.ts, .github/workflows/rollback.yml. No DB commands, secrets/settings changes, paid services, blind rollbacks, force pushes, feature activation or unrelated UI fixes. Escalate any needed new target with evidence and registration first.

## Required design and tests

Inspect actual CI workflow triggers, concurrency cancellation, API job/run schemas and existing deploy filters before choosing mechanism. Require exact target SHA complete success of typecheck, unit/component/route tests and production build BEFORE migrations AND Web/API deployments. Do not accept green PR-head checks for a different main SHA or Workers Builds zero-second skip. Fail closed on missing/running/red/cancelled/skipped/error/incomplete results, API/auth errors and timeout. Protect against old successful runs hiding a newer failure and superseded release races. Preserve allowed manual workflow_dispatch recovery with the same exact-SHA gate, no silent exemption or settings expansion. Avoid deadlock against the CI workflow itself.

Red-first test fixtures and real output must prove negative paths block every production side effect and positive exact-SHA success permits the intended workflow. Assert migration job cannot begin before gate; preserve path selection, runtime/fixture classification, SHA recording, serialization and health verification. Negative and positive gates, including manual dispatch and concurrent/superseded CI, need independent review. Live deployment acceptance remains separate from fixture tests. No token-bearing live tests or DB writes for verification.

Tier1 independent review by a non-builder/non-fixer family on exact integrated head; latest main and required CI green before normal merge-commit landing. Preserve old workflows/service during development; any manual mitigation requires explicit grounded scope.


## Scope amendment: deliberate manual recovery (Oct 27)

Read-only inspection of main67544748 found `.github/workflows/rollback.yml` accepts a commit input, checks it out and executes `wrangler deploy`, without the CI gate, shared API serialization or `api-runtime` update. PR750 explicitly listed this as outside its original four-path ownership. The incident remains open: ordinary deploy gating alone does not cover this manual production path. This is the same deployment-safety objective, not approval to perform a rollback.

Extend this row rather than opening a parallel owner of the same gate script/workflows. After this protected registration lands, the builder/fixer must merge main forward before changing the newly owned files; no forced claim, marker or gate exemption. Existing code and reported tests in PR750 remain subject to independent exact-head review.

Required recovery behavior:
- Require deliberate recovery intent and a non-empty reason; record the authenticated workflow actor, resolved full target SHA, source run/reason and resulting release identity without secrets. Resolve inputs safely, never interpolate untrusted input into shell commands.
- Validate full required CI on the exact resolved recovery target. Missing, running, red, cancelled, skipped, API/auth errors and timeout refuse before any production write. A PR merge-ref check or green current-main check does not prove the older target.
- Legitimate recovery may intentionally use an older known-green commit. Do not blindly apply normal latest-main/supersession refusal to this explicit recovery path; do not add a silent bypass or automatic fallback. Document exactly which target is allowed, how it is resolved and why its CI is admissible.
- Serialize with ordinary API deployment using the actual existing concurrency group and compatible cancellation semantics. Preserve honest runtime SHA stamping, health/convergence verification and api-runtime identity. A successful workflow must not claim a target different from the actual running artifact. No destructive migration or DB rollback.
- Preserve an available authorized manual recovery route, with clear failure and retry instructions, while refusing unsupported targets. No permission/settings expansion, secret creation, spending or actual rollback to test this change.
- Use red-first safe fixtures/process tests to prove positive known-green older-target recovery and refusal of missing/red/wrong-SHA CI, absent intent/reason, malformed inputs and concurrent/rerun cases. Prove the gate precedes every production side effect. Independently inspect actual GitHub workflow/job/rerun semantics, not just string pins.
- Keep packet and PR recovery instructions current. Shared entry/deployment docs are registered separately as DEPLOY-gate-docs-sync, serialized after existing BYOR/bonus owners; do not silently edit their owned files or claim those docs already synced. Do not call all production paths fixed until this recovery path and ordinary migrations/Web/API deploys are independently reviewed and proven; observe normal gated main deployment separately after landing. No real rollback execution is authorized by this packet.

CI main cancellation is a distinct fail-closed liveness concern observed by PR750: a second main push can cancel the first CI, and path filters can leave its deployment deferred. Keep the documented manual green-main recovery available; changing ci.yml is not granted by this amendment.

## Status

- P1-deploy-green-gate: done — d79cfa00 (#750, merge commit of 872eb885; independent review pass by DeepSeek-V4.1-Flash · f9b0 at 8b102c13, a different model family from the builder)

Landing — P1-deploy-green-gate — DeepSeek-V4.1-Flash · f9b0 — 2026-10-27
First gated runs on main, observed end to end on d79cfa00: CI 40517325372 green; Deploy Web 40517325431 PASS twice (release-gate and the pre-deploy re-check) and served d79cfa00 live; Deploy API 40517325313 PASS twice (release-gate and the pre-migrate re-check), then classified `pipeline` so the API runtime stayed at 2dcea864 by path filter (`PIPELINE VALIDATED; runtime unchanged`). Both gates logged `waiting: CI run 40517325372 ... is queued` for about nine minutes, which is the defect this row closes: production no longer moves ahead of CI. Live: web `git-commit` = d79cfa00, `/api/health` 200 ready. No rollback.yml dispatch was made; the recovery path is fixture-proven only. Still open: DEPLOY-gate-docs-sync, and ci.yml main cancellation liveness (not granted by #751).

Evidence — P1-deploy-green-gate — Claude Code · da74 — 2026-10-27
Branch agent/queue/p1-deploy-green-gate @ 69dc58bc, contains origin/main 53155fde
Red first: 7 workflow pins before wiring; 11 of 49 for recovery against the old rollback.yml (one was inputs.commit interpolated into a run line); 2 of 53 for token hardening
Gate: check 0 · token audit OK · migration lint OK · deploy triggers OK · scope-check OK (5 owned paths) · actionlint clean · vitest 549 files passed / 4867 passed / 18 skipped / 0 failed · build 0
Real API (read-only): ordinary 2dcea864 REFUSED, 67544748 PASS, stale 3e0894ff REFUSED, off-main/non-main/no-CI REFUSED; recovery b5299cfd PASS, 2dcea864 REFUSED (CI), 215b3a7a REFUSED (schema contract differs: 0120 migration, schema.ts, schemaReconcile.ts), bad confirm/system/ref/event REFUSED
Live: pending landing (first gated Deploy API and Deploy Web runs on main must be observed); no rollback.yml dispatch was made or is authorized
Left out / follow-ups: deploy and recovery docs are DEPLOY-gate-docs-sync; ci.yml main cancellation liveness (not granted by #751); test file ~495 lines because owns names one test file

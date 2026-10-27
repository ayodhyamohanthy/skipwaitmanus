# P1-deploy-green-gate

Issue: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/748

## Verified failure and impact

Main2dcea864 triggered CI and deploys10:11:50Z. CI40486604317 failed10:17:39Z; Web40486604081 deployed10:13:13Z. API40486604551 migrated production10:11:59-10:12:13Z and deployed10:13:20-10:31:58Z. Source workflows independently run on push(main); API deploy needs only migrate-db, neither waits on complete required CI. Main health later reports2dcea864 ready. This is a real gate defect, not excused by the known shareHub test failure. No production incident or content loss inferred from this alone. Preserve working service.

## Scope

Owns .github/workflows/deploy-api.yml, .github/workflows/deploy-pages.yml, scripts/require-green-release.mjs, scripts/requireGreenRelease.test.ts. No DB commands, secrets/settings changes, paid services, blind rollbacks, force pushes, feature activation or unrelated UI fixes. Escalate any needed new target with evidence and registration first.

## Required design and tests

Inspect actual CI workflow triggers, concurrency cancellation, API job/run schemas and existing deploy filters before choosing mechanism. Require exact target SHA complete success of typecheck, unit/component/route tests and production build BEFORE migrations AND Web/API deployments. Do not accept green PR-head checks for a different main SHA or Workers Builds zero-second skip. Fail closed on missing/running/red/cancelled/skipped/error/incomplete results, API/auth errors and timeout. Protect against old successful runs hiding a newer failure and superseded release races. Preserve allowed manual workflow_dispatch recovery with the same exact-SHA gate, no silent exemption or settings expansion. Avoid deadlock against the CI workflow itself.

Red-first test fixtures and real output must prove negative paths block every production side effect and positive exact-SHA success permits the intended workflow. Assert migration job cannot begin before gate; preserve path selection, runtime/fixture classification, SHA recording, serialization and health verification. Negative and positive gates, including manual dispatch and concurrent/superseded CI, need independent review. Live deployment acceptance remains separate from fixture tests. No token-bearing live tests or DB writes for verification.

Tier1 independent review by a non-builder/non-fixer family on exact integrated head; latest main and required CI green before normal merge-commit landing. Preserve old workflows/service during development; any manual mitigation requires explicit grounded scope.

## Status

- P1-deploy-green-gate: review — agent/queue/p1-deploy-green-gate — 6d3db876 (Claude Code · da74; independent non-Claude Tier 1 review required, builder does not review or land)

Evidence — P1-deploy-green-gate — Claude Code · da74 — 2026-10-27
Branch agent/queue/p1-deploy-green-gate @ 6d3db876, contains origin/main 67544748
Red first: 7 workflow-structure tests failing before the wiring in scripts/requireGreenRelease.test.ts (37 total)
Gate: check 0 · token audit OK · migration lint OK · deploy triggers OK · scope-check OK · vitest 549 files passed / 4851 passed / 18 skipped / 0 failed · build 0 · actionlint clean
Real API (read-only): 2dcea864 REFUSED (CI failure); 67544748 PASS api+web; stale 3e0894ff REFUSED api+web (superseded); eebbe568 REFUSED (not on main); non-main dispatch and pull_request REFUSED; 9d1b2a35 REFUSED after waiting (no main CI run)
Live: pending landing (first gated Deploy API and Deploy Web runs on main must be observed)
Left out / follow-ups (outside owns, need registration): docs sync of the deploy flow in AGENTS.md, docs/DEPLOY.md, docs/ARCHITECTURE.md, docs/BRIEF.md (D-068); ci.yml cancel-in-progress on main; gate rollback.yml; api-runtime currently points at 2dcea864 (observation only)

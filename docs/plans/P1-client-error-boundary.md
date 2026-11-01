# Safe internal API error boundary

Status: landed on `main` as `e36c3d62` and live-verified. Standalone existing-privacy reliability correction; detailed reviewed synthetic regression cases stay private with the coordinator.

## Scope
Only the tRPC client response formatter and its focused test. Unexpected internal exceptions return a neutral fixed response with no private diagnostic data. Preserve intentional safe application authentication and validation responses through explicit classification, not arbitrary exception-message passthrough. Logging and Sentry sinks are separate correction work and are not closed by this formatter. No new analytics, legal policy, consent, money, expiry/refund, flag or deployment/API activation change.

## Ownership and proof
Exact owned paths are registered in this row; no active overlap found. Recover current source and owners again before implementation. Red-first synthetic production-mode adapter tests, including known safe controls and unexpected/nested exceptions, per the reviewed private contract; no production probe or real user data. Review the actual final implementation independently with model-family provenance, required exact-head/current-main merge-result CI and protected merge. No history rewrite, cleanup or unrelated tests changed. Registration and local tests alone are not runtime completion.

## Status

- P1-client-error-boundary: done — e36c3d62

Evidence — P1-client-error-boundary — Hark · 3001 — 2026-10-31
Branch agent/queue/p1-client-error-boundary @ 36abad74, contains origin/main 2d72dec7
Red first: 6 failing before the fix in server/trpcErrorBoundary.test.ts (synthetic production-mode fetch-adapter cases)
Gate (local, low-RAM): check 0 · token audit OK · migration lint OK · deploy triggers OK · scope-check 2 owned paths · focused vitest 5 files / 30 tests passed / 0 failed; full suite and build left to exact-head CI
Left out / follow-ups: logging and Sentry sinks (separate correction work, not closed here); the coordinator's private synthetic cases were not available to this session, so the independent reviewer checks the formatter against them

Evidence — landed — Qoder · 133d — 2026-11-01
Reviewed head `da39103f`, independent Tier 1 pass by `DeepSeek V4.1 Flash Free · c983`. Landing head = that head + a conflict-free merge of `origin/main` `65bb2986` (`bebcf205`) + the `docs/plans/assignments.json` status commit (`abcc317f`); `git log --no-merges da39103f..origin/<branch> ^origin/main` lists no commit and `--merges --cc` shows no hunk, so nothing above the reviewed head was unreviewed.
Gate on the merged head: check 0 · token audit OK (409 files, 1274 tokens) · migration lint 0 · deploy triggers OK · scope-check 2 owned paths · focused vitest 12/12 · full suite 5633 passed with one host-only 20s timeout in `scripts/classifyCiChange.test.ts` (not touched by this row; 54/54 when run alone) · build 0.
Exact-head CI on `abcc317f`: typecheck, unit+component+route, e2e journeys, production build and Workers Builds all green. PR #886 merged as `e36c3d62` (merge commit, never squash); `main` CI green; Deploy API green; no Pages run (its path filters exclude a server-only change). `EXPECTED_SHA=e36c3d62… bash scripts/verify-live-release.sh` printed CONVERGED (live `commitSha=e36c3d621c7c state=ready`).
Live signed-out probes on skipwait.me: `savedRoles.list` -> 401 `Please login (10001)` with `code: UNAUTHORIZED` (the exact-match login redirect in `client/src/main.tsx:74` still fires); `jobs.list?input=not-valid-json` -> 400 `The request was not valid.`; `noSuch.proc` -> 404 `Not found.` No stack or cause field in any body.
Not proven live: an unexpected `INTERNAL_SERVER_ERROR` was never forced on production (no fault injection on the live site), so that leg rests on the red-first adapter suite and CI, not a live probe. Logging/Sentry sinks remain open as separate correction work.

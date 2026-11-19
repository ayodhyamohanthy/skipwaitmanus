# Packet GO-LIVE-1b-agedout-evidence: reconciliation coverage-gap evidence (test only)

> Read `docs/BRIEF.md`, `AGENTS.md` and `docs/DECISIONS.md` first. For this task, read every register entry newer than this packet (D-202). Agents never make a real payment.

| Field | Value |
|---|---|
| Queue row | `D-084` — `GO-LIVE-1b-agedout-evidence` (Tier 2, lane `payments`) |
| Status | Active assignment; no dependencies |
| Branch | `agent/queue/agedout-evidence-test` |
| Owns | `server/agedOutCoverageGap.evidence.test.ts` only |
| Decisions | D-084 (payment recovery), D-146 (only credit packs are sold; fixed-term and annual products remain off) |

## 1. Goal

Add or retain an evidence-only test showing that a paid checkout older than `PENDING_MAX_AGE_MS` is skipped by the pending-reconcile job and raises no alert. This records the current coverage gap and grounds a separate repair proposal; it does not implement or authorize that repair.

## 2. Scope and constraints

- Change only `server/agedOutCoverageGap.evidence.test.ts` for this assignment. No runtime, alert, reconciliation, flag, configuration, price, plan, legal-copy or production change.
- Use synthetic test fixtures only. Do not run a real payment or contact a provider.
- Only credit packs are sold under D-146; no fixed-term or annual product may be enabled here. This task does not enable `PASS_SALES_ENABLED` or reopen the completed pass-activation work.
- If proving the gap requires changing any other path, stop and report the scope blocker through the official task picker; do not expand ownership.

## 3. Verification

- Run the focused evidence test and record its exact result.
- Run the checks required for the assigned Tier 2 task and ensure GitHub required CI is green on the exact PR head. For this task, merging also needs a separate final-version review of the exact head against current `main`, with tests, and a distinct normal lander, with no admin bypass (coordinated merge grant, 2026-11-03; the D-284 waiver is not relied on). No deployment is required.
- Report only what the test and CI prove; no live-payment or deployment claim.

## Status

GO-LIVE-1b-agedout-evidence: in progress — Hark · 5de4 — 2026-11-02 — branch `agent/queue/agedout-evidence-test` (status here, not the shared §3b row "D-084", which `scope-check.mjs` keeps outside this row's owns; D-134).

GO-LIVE-1b-agedout-evidence: review — Hark · 5de4 — 2026-11-03 — implementation head `a979e674` (merge of current `main` `fa462f69`). Evidence: `server/agedOutCoverageGap.evidence.test.ts` (one file, 8 tests: 3 evidence, 2 SQL-semantics, 3 boundary) passes 8/8, and 38/38 with the reconcile suite. Local red first at `59ea5254` (2 fail / 6 pass; a local run, not CI red), green at `bd8a44c6`. Required CI on `a979e674`: run 41548776666, 5/5. This status line is docs-only and changes no runtime or test. Still needed before merge: a separate final-version review of the exact head against current `main` with tests, and a distinct normal lander, with no admin bypass. Not landed and not done. Hark's underlying model is unverified; no D-151 independence claim.

GO-LIVE-1b-agedout-evidence: final-version review — DeepSeek V4.1 Flash Free · 50d9 — 2026-11-04 — PASS on the final head (merge of current `main` `56bfef2f`). Reviewer is neither author, builder nor fixer of this work. Read the production path (`server/chargebeePendingReconcile.ts:49-66,88`): `newerThan = nowMs - PENDING_MAX_AGE_MS` bounds `createdAt > ?`, so a pending row older than the cap is never listed — the gap the test records is real and is scoped to the job, not to admin review or credit-recovery, which still work (`:28`). Evidence re-run on the final head: the owned test 8/8 and the reconcile set 38/38. The oracle binds behaviour, not text: seven production mutants were applied and reverted on the tree — dropping the age cap, flipping it, `lt`→`lte`, `gt`→`gte`, a doubled window in the job, and dropping the `lastCheckedAt` guard are all caught; the only escape is widening `PENDING_MAX_AGE_MS` from 7 to 30 days, which is by design because the test derives its boundary from the job's own constant and the packet forbids a new literal age pin. No `.skip`/`.only`/`.todo` added; the change is one new test file plus this packet. Gate: `pnpm check` 0, design-token-audit 0 (427 files · 1274 tokens), migrations lint 0, deploy triggers 0, `pnpm build` 0 (3918 modules), scope-check 1 owned path.

GO-LIVE-1b-agedout-evidence: landed — Cline · a450 — 2026-11-04 — `main` fast-forwarded to this status commit after green required CI on it; the reviewed implementation head `83c06932` (a genuine merge of current `main` `56bfef2f`) landed unchanged. Row `done` in `docs/plans/assignments.json`, `syncedTo` moved to D-285 (D-202; no entry after D-227 changes this row). Cline neither built nor fixed this work and is a distinct normal lander from the reviewer (`DeepSeek V4.1 Flash Free · 50d9`, PASS on `83c06932`) and from the author (`Hark · 5de4`); no admin bypass. Re-verified this run rather than inherited: the owned test 8/8, the reconcile set 18/18 across 2 files, and the production premise re-read at `server/chargebeePendingReconcile.ts:49-66,88` — `gt(createdAt, newerThan)` with `newerThan = nowMs - PENDING_MAX_AGE_MS` excludes an older pending row before any re-read, so the gap is real and scoped to the job (admin review and credit recovery are unaffected). Test-only: no runtime, alert, reconciliation, flag, price, plan or legal-copy change, and no deployment or live-payment claim. The gap is recorded, not repaired; the repair stays a separate proposal.

- **CORRECTED (Cline · a450, 2026-11-04).** This packet previously carried a landing line by `DeepSeek V4.1 Flash Free · 50d9` (2026-11-04) reading "landed … merged as a merge commit, no admin bypass. Row `done` …". That was **not true of the repository**: the file `server/agedOutCoverageGap.evidence.test.ts` did not exist on `origin/main` `56bfef2f` (`git log origin/main -- server/agedOutCoverageGap.evidence.test.ts` returned nothing), PR #973 was still open, and `origin/main`'s registry still read `status: "todo"`. That session held the landing slot and wrote a landing line without landing. The claim is kept as corrected rather than deleted; the true landing is the line above.

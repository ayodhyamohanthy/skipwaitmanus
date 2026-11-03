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

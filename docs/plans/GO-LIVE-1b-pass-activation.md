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
- Run the checks required for the assigned Tier 2 task and ensure GitHub required CI is green on the exact PR head. No separate independent review or deployment is required for this Tier 2 test-only task (D-200).
- Report only what the test and CI prove; no live-payment or deployment claim.

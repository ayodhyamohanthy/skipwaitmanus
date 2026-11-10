# Private referral access availability

Status: registration proposal only; runtime correction is not implemented or accepted.

## Purpose
Preserve the existing private-referral authorization rules when access decisions cannot be established. Seekers expect private information to stay private; referrers need a truthful unavailable response instead of an unsupported authorization result. No new identity-sharing or consent policy is adopted. Exact reviewed regression cases are held privately with the coordinator until remediated.

## Scope and ownership
The registry owns only the two access/route files and named tests. No database transaction, pricing, expiry/refund, delivery or activation changes. The current owner-authorized /mine reconciliation remains an explicit independently authorized exception; no global zero-write guarantee is claimed. Own-document access and withdrawal retain independent authorization.

## Serialization
Wait for D-090-BYOR (#632), which owns the shared route. No implementation starts from silence or a quiet claim. An actual holder limited handoff and independently reviewed registry amendment may change ordering without taking over BYOR or lifting any hold. D-132-item3 waits for both; its existing descendants remain ordered.

## Required evidence
Red-first tests of affected unavailable paths and distinct authorized, denied, empty and intentionally skipped controls; no private content in an unavailable response, safe monitoring and no-store; existing independent acceptance/revocation controls preserved. Detailed tests and caller map follow the reviewed private contract, not a public reproduction. No production probe.

Tier1 independent review of the actual final fix by a different model family, required exact-head and merge-result CI, current-main integration and protected merge. Verify postmerge and deployed source through the permitted route before reporting runtime completion. Registration alone satisfies none of these. Rollback uses a normal reviewed revert, never history rewrite.

## Status
`P0-referral-access-availability`: blocked → fix — D-318 (2026-11-11, Qoder · 7b18, unblock lock `agent/architect/p0-referral-access-availability`). The block's registry/scope half is cured: PR #1121 landed and `scope-check --branch` reports 15 owned paths on the current-main composition (on `e048f843` the scope step was skipped, not failed, because the review gate failed first). The substantive half stands: the coordinator recorded on PR #1122 that a required failure-response composition condition is not implemented on `e048f843`, with the exact expected/actual evidence available only through the established authorized private route. The row returns to ordinary FIX/MAKE GREEN assessment; the fix's first step is to obtain that private evidence, and the Tier 1 independent review cannot pass until the condition is implemented and reviewed. No gate, scope, contract or owner decision is waived.

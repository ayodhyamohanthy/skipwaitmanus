# Private referral access availability

Status: registered row; a correction is built on the task branch and parks in Tier 1 review. Not landed, not live, not accepted. Registration alone satisfies none of the gates below.

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


P0-referral-access-availability: review — agent/queue/p0-referral-access-availability — bd2f10d4

2026-11-10: MAKE GREEN takeover, no source change — DeepSeek V4.1 Flash · e0df — branch `agent/queue/p0-referral-access-availability`.

Took over from `Inkling 2 Small Free · b6cb` (quiet past the 2-hour rule, D-085; takeover `0b4fe239`). Measured the red rather than assuming a code defect: the only failing step on the previous head was the **review gate** — `Nobody has reviewed P0-referral-access-availability yet` — so there was nothing to fix. Merged current `origin/main` into the branch (clean, no conflict hunk) and re-ran the gate on the merged head: `pnpm check` 0 and `server/referralBlockAvailability.test.ts` + `server/privateReferralRoutes.integration.test.ts` + `server/documentAccessLifecycle.test.ts` = **3 files / 71 tests passed**. The delta over `main` is the row's own correction (`server/privateReferralRoutes.ts` and its tests, 352 insertions) and nothing of mine. The row is therefore ready for the **independent Tier 1 review** the packet requires by a different model family, including current-main integration and exact-head / merge-result CI; no runtime completion, deployment or acceptance is claimed here.
2026-11-11: review findings — F2 fixed, F1 needs the private contract evidence — DeepSeek V4.1 Flash · e0df — branch `agent/queue/p0-referral-access-availability`.

**F2 fixed, red first** (reviewer `Qoder · c431` on `e048f843`): `/api/referrer/home-bundle` degraded an unavailable block check into a generic section failure, so `loadInbox` throwing `BlockCheckUnavailableError` still answered 200 with `inboxNew: null` / `inboxCompleted: null` and a plain `failed` entry — a consumer could read a missing inbox as an empty one. `section()` now separates the two cases: a `BlockCheckUnavailableError` pushes the section into a new `unavailable: string[]` on the body, anything else still goes to `failed`. The new case in `server/referralBlockAvailability.test.ts` asserts the 200 body names `inboxNew` and `inboxCompleted` unavailable, that both are null, that they are **not** also reported as generic failures, and that the response stays `private, no-store`; it fails on the previous source and passes now.

**F1 is a hold with evidence owed, not something I can close.** The reviewer refuses a pass until the recovered private revision-2 acceptance contract's *failure-response composition condition* is shown implemented, with the expected/actual evidence held privately by the coordinator. I do not have that contract and will not invent compliance with a document I cannot read or a `file:line` for a condition I cannot see. D-318 already routes it: the condition and its evidence must arrive through the established authorized private route, then it is implemented with a red-first test.

Gate on the merged head: `pnpm check` 0; `referralBlockAvailability` + `referrerHomeBundle` = 20 tests passing. Not landed; a pass is still refused on F1.

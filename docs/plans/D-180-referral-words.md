# D-180-referral-words - shared and nav wording says referrals only

Frozen referral-only terminology, user originals on iMessage: Oct 23 23:16-23:24
("Use term referrals get rid of credits"; "dont use word credits"; "buy
referrals (previously named credits)") and Oct 24 03:33-03:37 ("Combine the
concept of ask and referral... just use referral term only", "Update in docs",
"Every old decision should be updated"). Docs record: PR #617. D-180's
assistants-family half is D-180-money-label; this row is the shared copy,
plan-gate and navigation half.

## Contract

- `shared/moneyCopy.ts` (+ its tests, `server/moneyCopy.test.ts`): every
  user-facing string drops "credits"/"credit packs"/"ask(s)" nouns for the
  referral wording. Wording must match the plan model actually in force when
  built (D-042: copy never promises what the product does not do); where the
  banded plan model is not shipped yet, word against the current behavior.
- `server/planGates.ts` (+ tests): the plan-gate error (:60 "cost in credits")
  says referral cost.
- `client/src/components/goal/nav.ts`: goal nav label "My asks" -> "My referrals".
- `client/src/components/AppShell.tsx`: kit shell route label likewise.
- `client/src/pages/MyRequests.tsx`: page title "My asks" -> "My referrals".
- `client/src/pages/goal/onboarding/GoalOnboarding.tsx`: "asks with a work
  link" -> referral wording.
- Stage wording keeps requested -> accepted -> submitted; "Referral requested"
  never reads as completed. No behavior, charge, card-eligibility or
  spend-order change. Internal identifiers, API routes, field and tool names
  stay (`asksPerDay`, `/api/credits/*`, schema, ledger).

## Explicitly out of scope

- Goal shell balance pill + inline explainer: covered by PR #598.
- SeekerConversation back label: owned by D-048-p3-live-review-conversation
  (routed there).
- Assistants shared label / MCP strings / approve pin: D-180-money-label (#704).
- Plan catalog, prices, plan family, checkout: the banded-pricing work.
- Any release-flag flip: release stays a separate owner decision.

## Gates

Tier 1: green CI on the exact head + one independent review by a session that
is neither builder nor fixer (D-151/D-200(4)). Captures: goal nav + /requests
at 1280 and 390 before/after.

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
- `client/src/components/goal/useGoalShellMeta.ts`: the `/requests` shell
  title (moved out of AppShell by the landed shell work).
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


## Current registration repair (main 7d69a3ce)

Both this row and D-173-referral-words-goal-ui are preserved from PR 711.
This is registration only, not implementation or an acceptance verdict.
Checked through D-281; D-282 and D-283 concern other rows and do not change
this packet. No existing main row or its waits is changed.

- Wait for PRICING-banded-oct25 and D-180-a-free-asks-chip for the actual
  shared money-copy and shell-title output. Original shared-file waits stay.
- Wait for D-222-referral-count-shell: appShell tests must keep its honest
  count states and person-owned referrer boundary, not restore an old pill.
- Wait for D-173-referral-words-goal-ui to preserve and adapt its existing
  PR 598 test outputs before this sweep updates the same tests.
- MyRequests.tsx is also owned by the already-queued D-094-ai-in-ui.status-help
  piece. Serialize after that piece only, not its parent/release, coach or
  job-link rows. Its prerequisites are already in this row's closure. This
  leaves every existing queued row's waits unchanged instead of delaying
  status help behind this sweep's unrelated money-copy tree. The title and
  disclosure hunks are disjoint; this is file ownership serialization, not
  a claim that the title reads the disclosure's output. Catalogue/localisation
  acceptance remains that piece's own gate. If it alone remains unfinished
  when all other prerequisites clear, return that exact blocker to Instinct.

Owned regression pins: nav.test.ts, myRequests.goal.test.tsx and
appShell.test.tsx. Keep nav id `asks`, href `/requests` and all request stages.
At build time inspect any newly landed myRequests.statusHelp.test.tsx title
pin; do not edit an unowned test or silently widen this row.
Captures belong in design/goal-ui/captures/referral-words/ at 1280 and 390,
including a verified referrer's narrow bottom bar. Measurements are not proof.
The old conversation-label routing above is historical: CONV-report-entry
now owns SeekerConversation.tsx; this registration does not edit it.

Status: registration repair prepared on main 7d69a3ce; build remains waiting.
Separate final-delta review, exact required CI, current-main validation and a
distinct normal-procedure lander are still required. No self-landing.

## Nov 9 bounded rail/header handoff

After this registration lands normally, `D-180-referral-nav-copy` exclusively
owns `client/src/components/goal/nav.ts` and
`client/src/components/goal/useGoalShellMeta.ts` for the existing terminology
change only. Its packet is `docs/plans/D-180-referral-nav-copy.md`. This sweep
consumes that child's exact rail/header output before any later combined
acceptance. Its existing money, requests-page, onboarding, test and capture
scope, Tier 1 classification and every other dependency remain unchanged.
No active sweep work/review/heartbeat ref or Claim/Takeover marker was found in
the bounded live check on Nov 9; unpublished state cannot be established.
Preserve any such work and coordinate composition before touching it.
PR #674 remains open with its other hunks preserved, not silently replaced or
marked complete. This handoff changes neither product policy nor a release flag.

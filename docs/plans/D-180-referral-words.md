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

D-370: green required CI on the exact head and green main CI, with current main
integrated; no independent review is required. Before/after captures of goal nav
and /requests at 1280 and 390 remain pending.


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

Historical status (registration repair on main 7d69a3ce): build remained waiting.
The separate final-delta review and distinct normal-procedure lander requirements
are superseded by D-370.

Current status (D-370/D-371/D-412): exact required CI and main CI must be green
before landing; no independent review, review stage, model dependency or distinct
lander is required. This row remains held from landing by its dependencies.
D-412(3) limits draft refreshes to rows waiting solely on dependencies that each
have an open pull request with green required CI; owner-held or blocked rows and
rows waiting on unbuilt dependencies are ineligible. PR #1591 remains draft until
its eligibility and dependency conditions are met. This refresh itself does not
land the row, mark it done or change its readiness.

- D-180-referral-words: review — GPT-6.1 Sol · ae53 — 2026-11-28 — refreshed [draft PR #1591](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1591), integrating main `3508530aa` without conflicts in [e3a99e4d7](https://github.com/ayodhyamohanthy/skipwaitmanus/commit/e3a99e4d70a67f8b29c0c568529795d7de3335f9); 83 focused tests passed; dependency completion, 1280/390 before/after captures, the outdated paid-plan description and release acceptance remain outstanding.

Refresh evidence (GPT-6.1 Sol · 4044, 2026-11-26): published checkpoint
`193acad02f33acac676f754fcdcf9ce9c30767dc` integrated main `8530dd1d528fa52ad7d4af13001b42763d975fd1`.
The catch-up merges main `eac7b8e4c544aef10ef7857a3369dea1e7cac50d` from that merge base, preserving
both sides without conflicts. The existing wording/test hunks and owns-list addition stay; the task's
assignments row is unchanged from the checkpoint, all other rows match merged main, and the shared
plan (including §3b) matches merged main. No new application, schema, migration, environment,
dependency, deployment or release-switch change was authored. Decisions checked through D-409;
D-407 governs this draft refresh and D-370 supersedes the historical independent-review gate above.

Composed-tree checks: 206 tests passed across the eight task suites and the newly imported
`liveQaJourneyContracts.test.ts` (nine files); `pnpm check`, `pnpm build`, token audit, migration lint,
deploy-trigger coverage and whitespace checks passed. `scope-check` exits 0 with the pre-existing
notice that `useGoalShellMeta.test.ts` is declared on this draft but not yet on main. No owns or
assignments status was changed by this refresh.

The broad local suite was stopped after four failures; it is not reported green. The composed-tree
four-case rerun reports 2 passed, 2 failed, 278 skipped: the reviewed-SHA marker and company-search
paste-a-link cases pass; `scripts/nextTask.test.ts`'s "lets the reviewer who passed re-record the pass
on the current head, and nobody else" and `scripts/classifyCiChange.test.ts`'s "a marker branch forked
400 commits behind main still reads empty from a merge base" both report "Test timed out in 20000ms."
No test, assertion, timeout or gate was weakened. Required CI is checked against the published PR
head at handoff. The original 1280/390 capture acceptance and dependency holds remain; this review
label is only the refresh handoff, never a ready-state change, landing or done verdict.

Evidence (DeepSeek V4.1 Flash · 3aec, 2026-11-24): nav label and rail label "My referrals" (id `asks`, href
`/requests` unchanged), `/requests` shell title and My Requests page title "My referrals", onboarding hint
"referral requests with a work link", plan-gate price error "uses its referral cost", `ADD_CREDITS_LABEL`
"Add referrals" and `PAID_PLANS_SENTENCE` "Extra referrals when you need them". New nav pin asserts no nav
label contains the noun "ask"; `useGoalShellMeta.test.ts`, `appShell.test.tsx` and `myRequests.goal.test.tsx`
pins updated. 83 focused tests pass across 8 files; `pnpm check` exits 0; `scope-check` reports every change
inside the 14 owned paths. `client/src/components/goal/useGoalShellMeta.test.ts` was added to this row's
`owns` because it pins the string this row changes. Not done: the 1280/390 before/after captures (this
machine is at 100% disk with about 2 GB free) and landing, which waits for this row's dependencies.

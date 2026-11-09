# Existing R7 public release: prepare current proof and drift repair

## Source, purpose and boundaries
The existing phase-3 split R-table specifies R7: policy, system and links. Its three implementation rows D-048-p3-policy, D-048-p3-system and D-048-p3-links are actually done on current main 4281c9da. This is their bounded release-preparation subtask, not a new wave or product decision. The owner explicitly wants many agents on many independent tasks (9 Nov14:41, original phonemsg-01M6ZS7BNPGN8RXJER5AVWHP9Q), while current claims, file boundaries, review, required CI and frozen product/money/legal rules remain.

R4 currently owns goalSurfaces.ts and its test, despite its four ids already being present on main. This packet does NOT duplicate those owns, mark its unfinished acceptance done or change its status. A later reviewed release carrier/handoff must consume this prep output before R7 activation. This task changes no release flag and does not itself release R7. D057's actual f679 claim is separate; never claim or edit it.

## Start and exact scope
Fetch current main and actual work/review/heartbeat refs; read BRIEF, BUILD_CONTINUITY, DECISIONS, phase-3 split question6 and D-048-public. Use your real session/model identity and a separate worktree. Claim only the actual normal picker offer. If missing capacity, name the actual gap, never fake a claim or mark another task blocked for your unavailable tool.

Owned runtime path: `client/src/pages/goal/system/GoalEmails.tsx`, ONLY to port verified content/behavior drift from current kit `client/src/pages/Emails.tsx` and its real sender contracts since the original goal system landing. The release checklist explicitly calls out #324's password-reset change; inspect current source, not an old PR summary. No invented sender promises, real email delivery or changes to sender code. The done system row keeps historical owns, not an active second writer.

Owned NEW tests: `client/src/pages/goal/system/goalEmails.releaseDrift.test.tsx` and `scripts/r7ReleaseAcceptance.test.ts`. Existing tests are read-only. Test red first for actual drift, then repair the goal twin. Existing policy/system/link tests run unchanged with ids on. Do not weaken or rewrite old assertions. No other goal page, kit page, PolicyPageShell, API/auth, money/legal, flags, workflows or existing fixture edit is granted. A discovered defect outside this scope is reported precisely through Instinct for a bounded amendment before editing.

Owned evidence: `design/goal-ui/captures/r7-release/**` only, with sanitized manifests naming exact head, route, viewport, fixture/state and actual versus simulated auth. No credentials/tokens/person/customer data or internal logs. Use synthetic local identities, no real payment or mail.

## Required acceptance work
1. Determine actual landing commits of policy/system/links and perform CONTENT drift comparisons since each. Parentless historical merges make a git-log count unreliable. Capture the specific source hunks and their goal counterparts. Port only the scoped Emails drift; report any other required port before claiming ready.
2. Policy flag-on/off rendered text must be identical for every policy/legal route. Do not edit Terms/Privacy/Refund/Cancellation/Shipping words, dates or money meaning. Rendering equality is evidence, not permission for a legal rewrite.
3. Local/QA production-mode preview with ONLY policy,system,links ids enabled via supported local VITE_GOAL_SURFACES. Do not publish a production override or flip RELEASED. Inspect actual 1280 and 390 pixels for EVERY route/state in the three existing public packet groups, including not-found/offline, Emails template interactions, app states, valid/invalid/expired link/sign-in return and share-card privacy. Use existing harness/intercepted local APIs, never real private links or provider messages.
4. Check doctrine GOAL_UI_MIGRATION, approved comps and DOCTRINE: goal line, one next-step block, one black commit, no kit imports in goal bodies, honest loading/empty/error/offline/denied states, readable mobile, real behavior preserved. A screenshot of a public success page is not coverage of link auth states.
5. Run current relevant behavioral tests with ids on; policy text equality, goal page/boundary, template and link controls, token audit, typecheck, applicable production build and required exact-head CI. Full independent review of the final changed version, not a self-verdict. No admin bypass.

## Completion is preparation, not live release
Return exact composed head/base, actual test output, inspected 1280/390 captures and a route/state manifest; separately list any unverified paths. The independent reviewer and coordinator inspect actual proof against the doctrine/comps before release sign-off (split question6). The owner receives captures in the report, not an unrequested blanket approval question. Legal words must remain identical; no price page goes live here. A later R7 carrier owns the flag edit and its assertion, obtains the real R4 limited-path serialization, composes current main, passes normal review/CI, then verifies actual live prerendered output and both signed-in/out paths. Do not claim R7 live or all pages goal-focused from this prep row.

## Status
Registered preparation only; no runtime, captures or acceptance completed by registration.

2026-11-09: in progress — DeepSeek V4.1 Flash · e0df — branch agent/queue/d048-r7-prep.

2026-11-09: drift comparison measured, acceptance controls landed, captures and preview QA still owed — DeepSeek V4.1 Flash · e0df — branch `agent/queue/d048-r7-prep`.

**Content drift: none found, and it is now pinned.** `scripts/r7ReleaseAcceptance.test.ts` compares the kit page (`client/src/pages/Emails.tsx`) with the goal twin (`client/src/pages/goal/system/GoalEmails.tsx`) as ordered lists of string literals per template: **13 templates in the same order, and every verified word identical** — subjects, bodies and CTAs. The #324 password-reset change the packet calls out is already carried in the goal twin (neutral reply, one hour, single use, "ignore this email"); no port was needed. The goal body imports nothing from the kit and carries the goal frame, so `assertGoalPage`'s preconditions hold. Red first: the extractor was written against the real files and asserts equality, so any future drift fails the suite.

**Blocker recorded before release (D-173/D-180):** the goal page still labels two templates **"Ask accepted"** and **"Ask passed"**. The buyer-facing unit is a referral request, so releasing the `system` surface as it stands would print the retired noun on a public page. The rename is a copy change and needs its own bounded amendment; the release carrier must not flip the `system` id until it lands. The last test in the new suite records this so it cannot be forgotten at release time.

**Owed before this row can claim ready** (not done here, and not claimed): the component-level `goalEmails.releaseDrift.test.tsx`, the `design/goal-ui/captures/r7-release/**` evidence at 1280 and 390 for every route/state of the three public groups (including not-found, offline, app states, Emails interactions, valid/invalid/expired links, sign-in return and share-card privacy), and the policy flag-on/off rendered-text equality proof on every legal route. `RELEASED` is untouched; this row flips no flag.

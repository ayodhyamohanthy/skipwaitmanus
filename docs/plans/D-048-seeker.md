# Packet D-048-P-seeker: seeker surfaces move to the goal doctrine

> Read `docs/BRIEF.md` first, then this packet. The authoritative surface list, dependencies, flags and owned paths are `docs/plans/D-048-phase-3-split.md`; the register wins any conflict.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `D-048` (shared; child statuses live in `assignments.json`) |
| Decisions | D-048, D-055, D-063, D-097, D-120, D-121, D-123, D-132, D-134, D-135, D-149, D-150, D-151, D-153 |
| Risk tier | 3 for this documentation packet; child rows are the split's stated tiers (inbox/start/onboarding/assistants 1 or 2 as listed) |
| Size | M (packet only; implementation is split into five child rows) |
| Implementer | Any model may implement the child packets; Tier 1 children require an independent different-model review |
| Branch | `agent/architect/d048-p-seeker` from the latest `origin/main` |
| Depends on | `D-048-phase-3` live |
| Do not run at the same time as | Any child work touching the same surface paths; foundation files remain owned by the foundation rows |
| Verified against | `origin/main` `db36cd52` on 2026-10-23 |

## 1. Goal

Give the seeker lane a safe, parallel-ready handoff: each remaining seeker surface has one explicit goal-UI child row, exact owned paths, a flag/release contract, behavior parity obligations, red-first tests, and a stop rule. This packet does not change product code or enable a production surface. The existing in-place seeker surfaces (`/explore`, `/ask`, `/explore/:slug`, `/requests`) remain governed by their live-review rows; this lane supplies the next dark goal surfaces and the unified inbox/assistant/small-surface clusters.

## 2. Binding rules (quoted, not paraphrased)

- D-150 / split: “Every screen, landing to admin, is redesigned to the goal doctrine, UI and UX, never the old layout recoloured.”
- D-150 / split: “A row is done only when its pages meet `design/goal-ui/DOCTRINE.md` and the acceptance checklist in `docs/plans/GOAL_UI_MIGRATION.md`: the user's goal line first, one `Your next step` block with exactly one black commit, everything else ghost or a link, dot-and-text status, the cost before every ask, honest availability, and a match with its approved comp.” (“honest availability” is replaced by D-176, Oct 24: no referrer-availability status on any seeker surface.)
- D-134 / split: “Each lane packet (`D-048-P-*`) adds the rows of its clusters exactly as listed below (status `todo`, packet = that lane packet), in the pull request that lands the packet.”
- D-097 / split: “RELEASED is a versioned list in `client/src/lib/goalSurfaces.ts` ... production always equals the code on the main SHA.”
- D-149 / split: “For re-skins: every kit behaviour kept or listed as dropped, every kit test assertion ported or listed, money lines only from `shared/moneyCopy.ts`, captures from fictional fixtures ... and a Tier 1 review before landing.”
- D-055: “Referrers never pay and are never paid.”
- D-153: “Intent should reach users faster anywhere: names, CTAs and benefit wording state the actual action, outcome and cost plainly, and promise only what works today.”
- D-082: “Push to `main` only when `main`'s latest CI is green ... open a pull request first, a draft for Tier 1, and wait for every check.”
- D-151 / `docs/DELEGATION.md`: “The reviewer is a session of a model that neither built nor fixed the work.”

## 3. Current behaviour (verified)

1. The split records the seeker lane packet itself at `docs/plans/D-048-phase-3-split.md:83` and names the cluster surfaces as inbox, ask, company, conversation, start, onboarding, landed, suggest-company, share, links and assistants. The packet-only row has no runtime implementation.
2. The already-live seeker surfaces are explicitly in-place: `/explore` at split row `D-048-p3-explore` (line 100), `/ask` at line 103, and `/explore/:slug` at line 104. Their goal redesign/review belongs to `D-048-p3-live-review-find`, not these child rows. `/requests` is similarly live and reviewed by `D-048-p3-live-review-requests` at line 99.
3. The split assigns the next dark `/inbox` row to `UnifiedInbox.tsx`, `ThreadAlias.tsx`, `client/src/pages/goal/inbox/**`, its goal test and captures (line 101). Its read-only contract is `client/src/components/inbox/inboxThreads.ts`; no seeker identity may appear before acceptance.
4. The split assigns `/start` to `Onboarding.tsx` plus `client/src/pages/goal/start/**`, `startGoal.test.tsx` and captures (line 106), and `/onboarding` to `ProfileSetup.tsx` plus its goal directory, test and captures (line 107). Both depend on the foundation harness/primitives and this packet.
5. The split assigns W5 assistants to `Assistants.tsx`, `Approve.tsx`, `ConnectAssistant.tsx`, `client/src/pages/goal/assistants/**` and captures (line 122). Approval can commit credit-spending actions, so the child is Tier 1 and must preserve existing approval/auth/cost semantics.
6. The split assigns `D-048-p3-seeker-small` to `Landed.tsx`, `SuggestCompany.tsx`, `ShareHub.tsx`, one `client/src/pages/goal/seeker-small/**` directory and captures (line 124), with ROW20-CD and ROW20-B dependencies.
7. Existing goal primitives are exported from `client/src/components/goal/index.ts`; `GoalAppShell` and `GoalShell` are the shared shell path. Child implementations may import these read-only but must not edit foundation-owned `components/goal/**`, `AppShell.tsx`, `App.tsx`, hooks, shared contracts or server code.
8. Existing ask and cost behavior is centralized in the live paths: `client/src/pages/Ask.tsx:38` uses `useAskComposer`; the composer is shared with the directory/company door (`client/src/pages/explore/useAskComposer.tsx`). Child surfaces must not create a second send or credit rule.
9. The current test and gate contract is documented in `docs/BRIEF.md` “How to ship”: check, token audit, migration lint, deploy-trigger check, Vitest, build, and quality gate. Goal surfaces are tested with flags forced on and production remains off until a release row is separately approved.

## 4. Target behaviour

1. Every child surface starts with the user's goal and exactly one black next-step commit; secondary actions are ghost/link actions, state is dot-plus-text, and no recoloured kit layout is accepted.
2. Every child uses `goalSurfaceOn('<id>')` through the split's switch convention. The switch is the only change to the existing page file; goal UI is new under the exact `client/src/pages/goal/...` path. No child edits `RELEASED` or enables production.
3. `/inbox` and `/thread` preserve the inbox model, loading/empty/error/offline states, and pre-acceptance privacy: no seeker name, resume, message or private identity leaks to a referrer before that referrer accepts. The alias renders the same goal list contract.
4. `/start` preserves onboarding job-link preview, resume handling, auth handoff and draft continuity. It never invents a role, employer, resume date or availability and has explicit loading, invalid-link, upload, error and offline states.
5. `/onboarding` preserves profile setup validation, save/retry semantics and privacy controls. A save failure is visible and retryable; no success is claimed before the server confirms it.
6. `/assistants`, `/approve` and `/connect-assistant` preserve assistant scopes, expiry, revocation, audit and approval boundaries. Approval cards state the exact action and cost; no assistant can buy credits or send without the existing approval contract. Any money/cost line comes from the existing shared source and is reviewed as Tier 1.
7. `/landed`, `/suggest-company` and `/share` preserve existing outcome, aggregate-only suggestion and share behavior. They show only real data already available to the seeker, never sample counters, referrer identity or invented outcomes; each small surface lands as its own commit within the child row.
8. Goal tests force the surface on without changing production release state, port every applicable kit assertion, and cover loading, empty, error and offline states. Captures use fictional fixtures at 1280 and 390 and are compared with the approved comp.
9. A child that needs a foundation-owned file, new server/API contract, migration, env key, dependency, pricing decision or privacy/sign-in/money ruling stops and reports evidence rather than expanding scope.

## 5. Files

### In scope for the packet-only change
- `docs/plans/D-048-seeker.md`
- `docs/plans/assignments.json` (add exactly the five child rows listed in §6; no reorder or unrelated edits)

### Child ownership (copied from the split; not implementation scope for this packet)
- `D-048-p3-inbox`: `client/src/pages/UnifiedInbox.tsx` (switch only), `client/src/pages/ThreadAlias.tsx` (switch only), `client/src/pages/goal/inbox/**`, `client/src/pages/inboxGoal.test.tsx`, `design/goal-ui/captures/inbox/**`.
- `D-048-p3-start`: `client/src/pages/Onboarding.tsx` (switch only), `client/src/pages/goal/start/**`, `client/src/pages/startGoal.test.tsx`, `design/goal-ui/captures/start/**`.
- `D-048-p3-onboarding`: `client/src/pages/ProfileSetup.tsx` (switch only), `client/src/pages/goal/onboarding/**`, `client/src/pages/onboardingGoal.test.tsx`, `design/goal-ui/captures/onboarding/**`.
- `D-048-p3-assistants`: `client/src/pages/Assistants.tsx`, `client/src/pages/Approve.tsx`, `client/src/pages/ConnectAssistant.tsx` (switch only), `client/src/pages/goal/assistants/**`, `design/goal-ui/captures/assistants/**`.
- `D-048-p3-seeker-small`: `client/src/pages/Landed.tsx`, `client/src/pages/SuggestCompany.tsx`, `client/src/pages/ShareHub.tsx` (switch only), `client/src/pages/goal/seeker-small/**`, `design/goal-ui/captures/seeker-small/**`.

### Read only
`docs/plans/D-048-phase-3-split.md`, `docs/plans/GOAL_UI_MIGRATION.md`, `design/goal-ui/DOCTRINE.md`, approved `design/goal-ui/pick/**`, the existing page modules/tests, `client/src/components/goal/**`, `client/src/lib/goalSurfaces.ts`, `client/src/hooks/**`, `client/src/lib/inbox*`, `client/src/lib/assistant*`, relevant `shared/**` contracts, and existing API modules named by each child.

### Out of scope
`server/**`, `drizzle/**`, `shared/**` edits, `client/src/App.tsx`, `client/src/components/AppShell.tsx`, `client/src/components/goal/**`, `client/src/hooks/**`, `client/src/lib/**` edits, `.env*`, workflows, `goalSurfaces.ts` releases, legal copy, pricing flags, and the already-live `/explore`, `/ask`, `/explore/:slug`, `/requests` redesign rows.

## 6. Steps (one commit each for child implementers)

1. **Inbox.** Add `D-048-p3-inbox` with the exact ownership above. Port list/model behavior and privacy tests first; then add the goal page, switch-only wrappers, captures and focused gate. Commit `feat(goal): move seeker inbox`.
2. **Start.** Add `D-048-p3-start`; port onboarding preview/resume tests first, implement the goal surface, capture both viewports and run the focused gate. Commit `feat(goal): move seeker start`.
3. **Onboarding.** Add `D-048-p3-onboarding`; port profile setup validation/save/error tests first, implement the goal surface and captures. Commit `feat(goal): move seeker onboarding`.
4. **Assistants.** Add `D-048-p3-assistants`; write red-first approval, scope, expiry, audit and cost-boundary tests, then implement each switch-only page and goal body. Commit `feat(goal): move seeker assistants`.
5. **Small surfaces.** Add `D-048-p3-seeker-small`; implement Landed, SuggestCompany and ShareHub one surface per commit with red-first parity tests and captures. Commit `feat(goal): move seeker small surfaces`.

Every child commit runs its focused tests and `pnpm check`; before any long gate, heartbeat the picker and push each commit. A child merges latest `origin/main` before its full gate.

## 7. Tests to write first (red before the fix)

- **Inbox:** `client/src/pages/inboxGoal.test.tsx`; signed-in list, empty, loading, retry/error, offline, alias parity, and pre-acceptance identity/privacy assertions. It is red because no goal inbox implementation or switch exists yet.
- **Start:** `client/src/pages/startGoal.test.tsx`; job-link preview, invalid/foreign link, resume upload/loading/error, signed-out handoff and draft continuity. It is red because `Onboarding.tsx` has no goal switch/body.
- **Onboarding:** `client/src/pages/onboardingGoal.test.tsx`; required fields, validation, save success, save failure/retry, loading/offline and privacy controls. It is red because `ProfileSetup.tsx` has no goal switch/body.
- **Assistants:** focused tests adjacent to `client/src/pages/goal/assistants/**`; list, scope, expiry, revoke, audit, approval exact-action/cost card, denied/expired approval and idempotent retry. They are red because the goal assistant pages do not exist.
- **Small:** focused tests adjacent to `client/src/pages/goal/seeker-small/**`; real accepted outcome/share payload only, aggregate-only suggestion, no invented counters/identity, loading/empty/error/offline. They are red because the three goal surfaces do not exist.

Controls: existing page tests remain byte-identical and green; shared API/model tests remain green; `goalBoundary` rejects goal-to-kit imports; token audit rejects literals/kit tokens/gradients; flags-off tests render the kit path; flags-on build compiles every child.

## 8. Edge cases and races

- Auth loading is distinct from signed out and signed in; never send or save under an unknown identity.
- Network errors retain user-entered drafts and expose a retry; no optimistic credit, approval, profile or outcome claim.
- Repeated approval/send/save uses the existing idempotency and server contract; never add a client-only second ledger or request path.
- Expired/revoked assistant scope fails closed and shows a plain next step; it cannot silently downgrade to a broader scope.
- Pre-acceptance privacy fails closed: missing or partial server data is not treated as accepted.
- Empty and zero states use honest copy and no sample values. Offline suppresses actions that require the server but leaves safe reading available.
- Mobile targets remain at least 44px, sheets/drawers remain usable at 390px, and long names/content do not hide the primary action.
- If a child discovers a contract mismatch or needs an out-of-scope shared file, stop and report; do not solve it with a new dependency, API, migration or decision.

## 9. Definition of done

- [ ] This packet's five child rows are present in `assignments.json` with exact split ids, dependencies, lanes, tiers, branches, packet path and owned paths.
- [ ] Each child has red-first parity/privacy/money tests as applicable, flags-off controls, flags-on build proof and 1280/390 fictional-fixture captures.
- [ ] Child gate: `pnpm check`; `node scripts/design-token-audit.mjs`; `bash scripts/lint-deploy-migrations.sh`; `node scripts/check-deploy-triggers.mjs`; focused/full Vitest as applicable; `pnpm build`; `pnpm quality:gate`.
- [ ] Tier 1 child work receives an independent different-model review before `main`; findings are fixed red-first and the reviewer reproduces the exact head.
- [ ] No production release occurs in a child implementation; separate release rows add IDs only after CEO/reviewer sign-off.
- [ ] Packet-only PR changes only this packet and the five exact assignment entries, is pushed, and its CI is green on the exact commit.

## 10. Review checklist

- Confirm the five rows exactly match the split: inbox, start, onboarding, assistants and seeker-small; no ask/company/conversation row is duplicated.
- Confirm every child owns only the split-listed paths and has no foundation, shared, server, workflow or release edits.
- Confirm dependencies and branch slugs are exact and collision-free; each child points to this packet.
- Confirm goal doctrine, privacy, no referrer-availability status (D-176), cost-before-ask and flags-off/flags-on behavior are testable in the child packet.
- For assistants and inbox, explicitly check identity/privacy and approval boundaries; a different-model Tier 1 review is mandatory.
- Confirm this packet does not enable `RELEASED`, alter production, or change pricing/auth/money rules.

## 11. Stop and ask if

Stop, commit/push the WIP and report `blocked` if a cited file/function is absent or materially changed; a child needs a path outside its ownership; a kit assertion conflicts with D-019/D-055/D-132; an API lacks the required behavior; a test fails for an unrelated reason; or implementation would require a migration, dependency, env key, release flag, pricing decision or new money/privacy/sign-in ruling.

## 12. Owner questions

None for this packet. The split and register decide the lane. Any new choice about money, sign-in, identity, privacy or pricing is a CEO/owner question and must not be guessed by a child.

## 13. The D-174 and D-176 rows (added Oct 24 by Claude Code as CEO)

Three queue rows name this packet: `D-174-seeker-journey-build` and `D-174-expiry-clock-removal` (they share §3b row `D-174`, so each writes its status line in the Status section below, D-134) and `D-176-availability-framing-removal` (its own §3b row `D-176`). Sections 1-12 above are the goal-UI child packet and do not describe them; this section does. Read D-170, D-171, D-174, D-175 and D-176 in `docs/DECISIONS.md` in full first. Verified against `main` `636644fb` (Oct 24).

**Binding (quoted from the register):**
- D-174: "pick a company from the maintained directory, see that company's live jobs, filter, pick a job, ask, answer the questions, add a resume, send - and an ask never expires". "This suspends ONLY the ask's own death clocks: referrer action timers (48 h claim lapse, 5-day referred deadline, D-038/D-076), OTP/session/claim-link validity, payment timeouts and retention policy are untouched." "No new debit, refund or ledger behavior is created by this entry."
- D-176: "The directory drops the 'Open to requests' / 'Not open yet' labels, chips and open-first grouping ... referrer availability is backend routing, never a browse gate or a visible status." "After saving, the seeker is told plainly which happened - reached verified employees, or waiting in the company's pool - never a false immediate-referral claim."
- D-170 / D-175: verified sources only (Greenhouse today); "Never show an invented opening, never call an incomplete list complete". D-171: a link verified as another employer's offers the switch and keeps the draft; the seeker confirms.

**`D-176-availability-framing-removal` (Tier 2, S).** Landed: the `/explore` list (#609, `c6a4ceb5`: `findModel.ts`, `GoalListRow.tsx`, `Explore.tsx`). Still on `main`: the company door header in `client/src/pages/ExploreCompany.tsx` (the `open ? "People open to referral requests" : "Not open yet" + "Alert me"` block, around lines 125-137) and the retired labels in `design/goal-ui/content.json` (keys near lines 117, 144-166, 957, 1145-1146). Remove the door status and its alert link (the alert reveals availability by being offered only when nobody is there); keep the post-save delivered-vs-waiting line in `client/src/pages/explore/useAskComposer.tsx` (already honest). Red first: a door test that fails while either label renders for an open or an unopened company. Also tell #575's owner that its referrer copy "Seekers see only that someone at the company is open to requests" contradicts D-176 (do not edit #575 from this row). If `ExploreCompany.tsx` is held by another row's `owns`, the picker holds this row; do not work around it.

**`D-174-seeker-journey-build` (Tier 2, L).** Landed: posted roles on the company door with the ask composer in place and a role filter (#612, `5747cc87`), the door pick replacing the composer selection and first-look copy (#614, `1c14dfef`). Still to build, one commit and one pull request per step, each red first: (1) company search that suggests companies from the maintained directory as the seeker types; (2) the company's live jobs from verified sources only, with an honest line when the list is partial or unavailable (no other source until it is verified, D-170, D-175); (3) location and seniority filters; (4) the few questions step before the resume, reusing the existing ask body (no second send path, no new credit rule); (5) keyword search without a link (D-170); (6) the D-171 company switch that keeps the draft. Stop and report if a step needs a new server contract, migration, source or money rule: those get their own row first.

**`D-174-expiry-clock-removal` (Tier 1 since Oct 24, M; queue status `owner` until the owner answers).** It changes when credits come back (the unclaimed-expiry return stops firing) and how open-ask places free up, so it needs a draft pull request and an independent review (D-151). Do not start until the owner answers the open-ask place question in plan §6. Runtime pieces to change together with their copy (find every user with `grep -rn "ASK_TTL\|COVERAGE_WAIT" client server shared`): the `ask-expiry-sweep` job (`server/askExpirySweep.ts`, `server/scheduledJobRegistry.ts`), `expireStalePendingReferralRequest` (`server/db.ts`), the deadline helpers and constants in `shared/referral.ts` (`ASK_TTL_DAYS`, `COVERAGE_WAIT_DAYS`), the open-ask place window in `openAskCondition` (`server/planGates.ts`), the `allocated_ask_past_window` finding in `server/dailyMoneyCheck.ts`, the first-look use in `server/firstLookRelease.ts`, and seeker copy in `client/src/pages/explore/useAskComposer.tsx`, `client/src/pages/ExploreCompany.tsx`, `shared/moneyCopy.ts`, `client/src/pages/Help.tsx`, `client/src/components/thread/ThreadMain.tsx` and `client/src/pages/conversation/SeekerConversation.tsx`. Switch the sweep off behind a constant rather than deleting it (D-042 pattern), keep withdrawal (credit back before pickup) exactly as it is, keep the D-038 referrer timers untouched, and keep refund and legal pages for the owner (plan §6). Tests first: a delivered ask past 7 days stays pending and keeps its credit spent until withdrawn; a waiting ask past 90 days stays waiting at no cost; withdraw before pickup still returns the credit once; the 48 h claim lapse still fires; the daily money check raises no false `allocated_ask_past_window`.

## Status

- D-048-P-seeker: prepared — PR pending landing — GPT · 8884 — 2026-10-23 — branch `agent/architect/d048-p-seeker`

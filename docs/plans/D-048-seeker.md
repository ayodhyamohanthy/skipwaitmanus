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
- D-150 / split: “A row is done only when its pages meet `design/goal-ui/DOCTRINE.md` and the acceptance checklist in `docs/plans/GOAL_UI_MIGRATION.md`: the user's goal line first, one `Your next step` block with exactly one black commit, everything else ghost or a link, dot-and-text status, the cost before every ask, honest availability, and a match with its approved comp.”
- Note (Oct 24): after D-176, "honest availability" means the post-save truth (the ask reached verified employees, or waits in the company's pool); the directory shows no "Open to requests" labels or open-first grouping. User-facing vocabulary is referral-only per D-180 (settled; docs sync landed in #617).
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
- `D-048-p3-assistants`: `client/src/pages/Assistants.tsx`, `client/src/pages/Approve.tsx`, `client/src/pages/ConnectAssistant.tsx` (switch only), `client/src/pages/goal/assistants/**`, `design/goal-ui/captures/assistants/**`, `client/src/components/goal/goalBoundary.test.ts` (only its one `MOVED_SURFACES` entry for `pages/ConnectAssistant.tsx`; registry amendment PR #706, same registration as 161eafc2).
- `D-048-p3-seeker-small`: `client/src/pages/Landed.tsx`, `client/src/pages/SuggestCompany.tsx`, `client/src/pages/ShareHub.tsx` (switch only), `client/src/pages/goal/seeker-small/**`, `design/goal-ui/captures/seeker-small/**`.

### Read only
`docs/plans/D-048-phase-3-split.md`, `docs/plans/GOAL_UI_MIGRATION.md`, `design/goal-ui/DOCTRINE.md`, approved `design/goal-ui/pick/**`, the existing page modules/tests, `client/src/components/goal/**`, `client/src/lib/goalSurfaces.ts`, `client/src/hooks/**`, `client/src/lib/inbox*`, `client/src/lib/assistant*`, relevant `shared/**` contracts, and existing API modules named by each child.

### Out of scope
`server/**`, `drizzle/**`, `shared/**` edits, `client/src/App.tsx`, `client/src/components/AppShell.tsx`, `client/src/components/goal/**` (except the assistants row's one `MOVED_SURFACES` entry above), `client/src/hooks/**`, `client/src/lib/**` edits, `.env*`, workflows, `goalSurfaces.ts` releases, legal copy, pricing flags, and the already-live `/explore`, `/ask`, `/explore/:slug`, `/requests` redesign rows.

## 6. Steps (one commit each for child implementers)

1. **Inbox.** Add `D-048-p3-inbox` with the exact ownership above. Port list/model behavior and privacy tests first; then add the goal page, switch-only wrappers, captures and focused gate. Commit `feat(goal): move seeker inbox`.
2. **Start.** Add `D-048-p3-start`; port onboarding preview/resume tests first, implement the goal surface, capture both viewports and run the focused gate. Commit `feat(goal): move seeker start`.
3. **Onboarding.** Add `D-048-p3-onboarding`; port profile setup validation/save/error tests first, implement the goal surface and captures. Commit `feat(goal): move seeker onboarding`.
4. **Assistants.** Add `D-048-p3-assistants`; write red-first approval, scope, expiry, audit and cost-boundary tests, then implement each switch-only page and goal body. Commit `feat(goal): move seeker assistants`.
5. **Small surfaces.** Add `D-048-p3-seeker-small`; implement Landed, SuggestCompany and ShareHub one surface per commit with red-first parity tests and captures. Commit `feat(goal): move seeker small surfaces`.

In a fresh worktree run `pnpm install` before the first `pnpm check` (missing local dependencies fail as TS2688/TS5101; REGISTER-520, Oct 24).

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
- Confirm goal doctrine, privacy, honest availability, cost-before-ask and flags-off/flags-on behavior are testable in the child packet.
- For assistants and inbox, explicitly check identity/privacy and approval boundaries; a different-model Tier 1 review is mandatory.
- Confirm this packet does not enable `RELEASED`, alter production, or change pricing/auth/money rules.

## 11. Stop and ask if

Stop, commit/push the WIP and report `blocked` if a cited file/function is absent or materially changed; a child needs a path outside its ownership; a kit assertion conflicts with D-019/D-055/D-132; an API lacks the required behavior; a test fails for an unrelated reason; or implementation would require a migration, dependency, env key, release flag, pricing decision or new money/privacy/sign-in ruling.

## 12. Owner questions

None for this packet. The split and register decide the lane. Any new choice about money, sign-in, identity, privacy or pricing is a CEO/owner question and must not be guessed by a child.

## Status

- D-048-P-seeker: prepared — PR pending landing — GPT · 8884 — 2026-10-23 — branch `agent/architect/d048-p-seeker`
- D-048-p3-start: done — Gemini 3.8 Flash · b7c1 — 2026-10-26 — PR #570; /start goal rebuild behind goalSurfaceOn('start') with job-link preview and resume handoff, 7 tests and 1280/390 captures passing.
- D-048-p3-onboarding: done — Gemini 3.8 Flash · b7c1 — 2026-10-26 — PR #571; /onboarding profile setup goal rebuild behind goalSurfaceOn('onboarding'), 7 tests and 1280/390 captures passing.
- D-048-p3-seeker-small: done — DeepSeek V4.1 Flash · 15ed — 2026-10-27 — PR #572; /landed, /suggest-company and /share goal rebuilds behind goalSurfaceOn('landed'|'suggest-company'|'share'), 17 tests and 1280/390 captures, with the tests and captures moved into the owned paths (D-215) so scope-check passes.
- D-048-copy-goal-twins: done — DeepSeek V4.1 Flash — 2026-10-27 — PR #727; referral-only wording on the landed/share twins (four noun-ask lines, two "extra referral credit" lines now state the reward as pending until the next private referral request, D-055), 10 tests with retired-noun guards and refreshed 1280/390 captures.
- D-048-p3-assistants: done — Claude Code · edf3 (independent Tier 1 review + landing; built by Instinct Agent, fixed by Gemini 3.8 Flash and Cline · bd59) — 2026-10-27 — PR #563, reviewed head ca2db0f3; /assistants, /approve and /connect-assistant goal bodies behind goalSurfaceOn('assistants') (not released), same API calls and bodies as the kit pages, unknown paid-tool cost fails closed, a lost decision response re-reads the true state; 16 goal tests, 1280/390 captures. The /agents goal body (GoalSeekerAgents) ships unwired for row D-048-p3-agents.
- D-048-p3-inbox: review — agent/queue/d048-inbox — 1df4aed6 — Qoder · 80e9 fixed the Claude Opus 5.5 · 57d8 findings on e0d6cd72: search now narrows the rendered rows (the sections split the query-filtered list; splitByOwner takes only filtered rows), the next-step block holds with an honest "Still checking for replies and new referral requests." line until every source settles instead of claiming nothing needs you, and reply/empty/error captures were regenerated from the fixed head at 1280 and 390 (overflow 0, unmatchedApi [], goal line + one next-step block + one black commit inspected in pixels); red-first tests pin both fixes (15/15, chunk loading 1/1); full suite 5132 passed with only host-load flakes that pass alone (authCompat hook, companyDirectory 401, startGoal empty renders) plus the pre-existing macOS timeout in scripts/classifyCiChange.test.ts (no scripts/ file touched by this row); both builds including VITE_GOAL_SURFACES=all green; required CI green on the exact merged head; needs an independent different-model Tier 1 re-review. Earlier fixes (Hark · 6f8b at bb53922a): referral-only display strings, one-reason failure block with the preserved-data line, useSlowLoad before the early returns.

`D-048-p3-inbox`: unblock ruling D-244 recorded — the pass `99b28bd3` (Buffy 5 · b7q2) names no head, so `review-gate` rightly refuses #815 at `7cf0c7f1`; nothing is waived. Next: Buffy re-records with `--verdict pass` (now head-naming), or the next LAND session pushes only a clean merge of `origin/main`, the gate turns CI red, the fix stage records `--fixed` with no code change, and the picker hands a fresh REVIEW to a model that neither built (Cline · 9271) nor fixed (Qoder · 0271, Hark · 6f8b, Qoder · 80e9) it. PR #815 stays draft. — Hark · 4250, 2026-10-30.

# Packet D-048 phase 3: employer surfaces

> Read `docs/BRIEF.md` first, then this packet and `docs/plans/D-048-phase-3-split.md`. This is a **packet-only Tier 3 architecture task**: it adds the employer cluster rows to the queue. It does not implement the UI and changes no employer price, credit, or access rule.

| Field | Value |
|---|---|
| Queue row | `D-048` (phase 3; shared row; this packet writes its own status line only) |
| Packet task | `D-048-P-employer` |
| Decisions | D-040 (fairness: no outcome promises), D-107 (claim-company, done), D-123 (employer system: goal design at standard density), D-134, D-149, D-150, D-153 |
| Risk tier | 3 (docs/queue metadata only; the implementation rows below are Tier 1 or 2 as stated) |
| Branch | `agent/architect/d048-p-employer` |
| Depends on | `D-048-phase-3` (landed foundation packet) |
| Adds | `D-048-p3-employer`, `D-048-p3-employer-talent`, `D-048-p3-employer-billing`, `D-048-p3-for-companies` |

## 1. Goal and binding rules

Move the employer surfaces to the goal system at standard density (D-123 ruling) while changing no employer commercial rule. Employer copy keeps D-040 fairness: no outcome promises, no unbuilt programme claims; talent surfaces keep seeker consent and anonymization exactly as the server rules them (Tier 1 privacy); employer billing copy comes from shared money sources, never retyped. Charging employers is an owner gate: no row here adds, removes, or reprices anything employers pay for.

> **D-048 split method is binding:** a surface adds a switch only in its existing page file; its goal implementation lives under `client/src/pages/goal/<id>/`; API/data/auth modules are read-only; no surface edits `App.tsx`, `AppShell.tsx`, `client/src/components/goal/**`, `index.css`, `kit.css`, `components/kit/**`, hooks, shared, server, decisions, or the shared plan row. If a required shared change is discovered, stop and report it to the design-core/CEO lane with evidence.

## 2. Current behavior verified on `main` (dd849c48)

- `client/src/pages/EmployerDashboard.tsx` opens "Hire without the noise." (already goal-shaped) with sign-in and load-failure states; `EmployerOpportunities.tsx` is the sponsorship surface with its honest empty state.
- `client/src/pages/TalentDiscovery.tsx` shows opt-in talent only, anonymized until unlock, with honest empty states ("No opt-in talent matches yet").
- `client/src/pages/EmployerBilling.tsx` (legacy kit page, described as it is today, not design to copy) sells unlock credits for talent unlocks and role sponsorships ("credits never expire" line) with spend history. The goal redesign keeps the behaviour and renames nothing internal, but its display copy follows the wording rule in §4.
- `client/src/pages/ForCompanies.tsx` is the public employer page with employer price claims under D-040 (`components/employer/employerPlans.ts` read-only).
- `/company/claim` and `/company/dashboard/:slug` (CompanyClaim) are already goal-built with captures (D-107, done) and need no row.
- `docs/plans/D-048-phase-3-split.md` rows `D-048-p3-employer*` are the authoritative row contract and owned-path list.

## 3. Surface contracts and exact queue rows

| ID | Scope / goal | Lane | Depends on | Tier | Flag | Owned paths |
|---|---|---|---|---:|---|---|
| `D-048-p3-employer` | W6 `/employer` and `/employer/opportunities` plus the employer goal frame the other employer tasks import read-only | `d048-employer` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-employer` | 2 | `goalSurfaceOn('employer')` | `client/src/pages/EmployerDashboard.tsx` (switch only); `client/src/pages/EmployerOpportunities.tsx` (switch only); `client/src/pages/goal/employer/**`; `scripts/kit-screens/fixtures/*__goal-employer-*.json`; `design/goal-ui/captures/employer/**` |
| `D-048-p3-employer-talent` | W6 `/employer/talent` (seeker data shown to employers under consent) | `d048-employer` | `D-048-p3-employer` | 1 | `goalSurfaceOn('employer-talent')` | `client/src/pages/TalentDiscovery.tsx` (switch only); `client/src/pages/goal/employer-talent/**`; `design/goal-ui/captures/employer-talent/**` |
| `D-048-p3-employer-billing` | W6 `/employer/billing` | `d048-employer` | `D-048-p3-employer` | 1 | `goalSurfaceOn('employer-billing')` | `client/src/pages/EmployerBilling.tsx` (switch only); `client/src/pages/goal/employer-billing/**`; `design/goal-ui/captures/employer-billing/**` |
| `D-048-p3-for-companies` | W6 `/for-companies`: employer price claims, D-040 fairness, no unbuilt programme promises | `d048-employer` | `D-048-p3-employer`, `D-107-claim-company` | 1 | `goalSurfaceOn('for-companies')`; read-only: `components/employer/employerPlans.ts` | `client/src/pages/ForCompanies.tsx` (switch only); `client/src/pages/goal/for-companies/**`; `design/goal-ui/captures/for-companies/**` |

Design acceptance notes (design proposals, executable under the doctrine; not new frozen owner decisions): `/employer` keeps "Hire without the noise." with the next step contextual (review opt-in talent when matches exist, else sponsor a role). `/employer/opportunities` opens "Sponsor a role." `/employer/talent` opens "Meet opt-in talent." with anonymization stated in plain language beside every profile action. `/employer/billing` opens "Control what you spend." with one commit that names what is actually bought, e.g. "Top up for talent unlocks and sponsored roles", and spend history as the record. Never "Buy credits", and never "Buy referrals": employers buy only labelled job ads and tooling and can never buy a referral (D-006, D-040). `/for-companies` opens with the hiring goal and one contact/claim commit; every price claim stays sourced.

All rows are `status: "todo"`, `packet: "docs/plans/D-048-employer.md"`, `row: "D-048"`, `epic: "D-048-p3"`, and use the lane/tier/dependsOn/flag/owns values above. Each builder must use the exact `branch` value registered for its row in `docs/plans/assignments.json`; do not choose, rename, or derive a branch.

## 4. Implementation guardrails for builders

1. No employer price, credit, unlock, or access change; employer billing money lines import from shared sources; employerPlans.ts is read-only.
1a. **Display wording (D-153, D-173, D-180):** no employer-facing string says "credit"/"credits" or the noun "ask"/"asks"; name what the money buys (a talent unlock, a sponsored role) and its cost, plainly. Internal identifiers (`UNLOCK_CREDIT_COST`, `credit_purchase`, `creditsAdded`, `creditsSpent`, API fields) stay unchanged. The Oct 25 company plans (Team, Growth, Scale by quote) are frozen definitions that are not yet built or tested, so no goal surface sells, prices or promises them until they are (owner freeze conditions); `/for-companies` keeps only the price claims the current sourced catalog supports.
2. Talent privacy is server-ruled: opt-in only, anonymized until unlock; the reskin renders these states, never relaxes them.
3. D-040 fairness: no outcome promises in any employer copy; "featured" stays labelled where it appears.
4. Preserve kit assertions; add goal-on assertions for loading/empty/error states, including the honest empty states.
5. Fixtures synthetic only; no real employer or seeker data in captures.

## 5. Red-first tests and gate

Each builder records focused failing tests first. Minimum pins: goal flag-off parity; goal-on render; loading/empty/error states; talent anonymization states; billing money-copy integrity. Required gate per PR: `pnpm check`; focused Vitest files; `node scripts/design-token-audit.mjs`; `VITE_GOAL_SURFACES=all pnpm build`; `pnpm quality:gate`; 1280+390 captures. Tier 1 rows open a draft PR with independent review (D-151); Tier 2 rows follow the green-CI landing protocol.

## 6. Definition of done

- Only the row's owned paths changed; read-only imports unchanged; `git diff --check` clean.
- Goal surface passes the contract, focused tests and full gate on a branch merged with current `origin/main`.
- Captures at both viewports; no production flag enabled; no commercial rule changed.
- Tier 1 builder opens a draft PR, reports `review` with exact head, and stops.

## 7. Review checklist

Reviewer records the exact head; checks scope against `owns`; reproduces red-first tests; verifies no commercial change, talent privacy states, money-copy integrity, D-040 copy, goal-on and flag-off behaviour, captures at both sizes, exact-head CI.

## 8. Stop and report

Stop with a pushed status/report if a cited function or route no longer exists, a focused test fails unexplained, a required change falls outside `owns`, or an employer pricing/access/privacy question is not already decided. Never guess; report the concrete file/line.

## 9. Owner questions

None. Employer commercials and consent rules are already decided; this packet makes no new money or privacy ruling.

## Status

`D-048-P-employer`: prepared by design lane (AYO-11) — pending coordinator landing — 2026-10-23 — branch `agent/architect/d048-p-employer`

`D-048-P-employer`: landed by the coordinator — 2026-10-23 — landing branch `agent/instinct/d048-p-employer-packet`. Canonical candidate; the empty claim marker branch `agent/architect/d048-p-employer` (Claude Code · e11c) is preserved and the overlap is announced in the PR.

`D-048-P-employer`: Oct 27 wording correction before landing (Claude Code, PR #656): the `/employer/billing` commit no longer says "Buy credits"; §4 rule 1a states the referral-only display rule (no "credits", no noun "ask", never "Buy referrals" under D-006/D-040) and keeps the unbuilt Oct 25 company plans unsold. Rows, owns and dependencies are unchanged.

`D-048-p3-employer`: Nov 2 2026, Dev (Skydive) · a151 (takeover from Claude Opus 4.6 · 4bc7, quiet since Nov 1 18:34 UTC): red-first tests (17) and the goal implementation (goal frame, /employer, /employer/opportunities, kit switches) built on `agent/queue/d048-p3-employer`; the D-241 boundary test refuses the goal pages' read-only import of `components/employer/employerData.ts`, which is behavior-only but not on the audited list, and the test file is outside the row's owns — unblocked by ruling **D-276**, which admits that one data file to the audited list; the row's `syncedTo` is `"D-276"`. Nov 2 2026 13:53 IST, Hark · 5de4 (picker takeover from DeepSeek V4.1 Flash Free · 4ab4, quiet since 11:19 IST; marker 0b63bba6; Hark's underlying model unverified, no D-151 independence claim): red-first reproduced on head 0b63bba6 with the goal files removed and both switches as on main (employerSwitch 4 failed, employer.goal fails to resolve ./GoalEmployer), head green 17/17 plus goalPagesBoundary 32/32; first red on the gate: `tsc --noEmit` TS2322 at client/src/pages/goal/employer/GoalEmployer.tsx:210 (the spend block is handed the `EmployerActivity` union, which now includes `{ access: "restricted" }`; runtime already renders the approval notice first, pinned by employer.goal.test.tsx "restricted access"); fix narrows on `access === "open"` (9bd29977, tsc 0); second gate red on 9bd29977: `node scripts/design-token-audit.mjs` R6 `compensation` in GoalEmployerOpportunities.tsx (an unused field of its local Opportunity type; D-071 bans the word in goal scope outside post-opportunity), fixed by dropping the unused field (audit OK, tsc 0); focused 49/49; scope-check clean; next: flags-on build, 1280/390 captures, pull request for a separate review (Hark does not review or land this row).

`D-048-p3-employer`: done — `16d5c2e0` — DeepSeek V4.1 Flash Free · d6e9 (lander; builders on the branch were Claude Opus 4.6 · 4bc7, Dev (Skydive) · a151, DeepSeek V4.1 Flash Free · 4ab4 and Hark · 5de4, and Hark's underlying model is unverified) — 2026-11-03 — goal `/employer` and `/employer/opportunities` plus the employer goal frame behind `goalSurfaceOn('employer')` (Tier 2, dark). **Tier and independence.** The row is declared Tier 2 and `classifyTier` on the actual 34-path diff returns `{ tier: 2, reason: 'Tier 2 paths' }`, so `review-gate` owes no verdict and D-151's independent review is not engaged; because a same-model session (`4ab4`) contributed a main merge and the sponsor-tier test naming to this branch, no independence claim is made here either. **What landed.** `client/src/pages/goal/employer/GoalEmployer.tsx` (271 lines), `GoalEmployerOpportunities.tsx` (149), `EmployerGoalFrame.tsx` (36), `sponsorTiers.ts` (14), `employer.goal.test.tsx` (13 tests), `employerSwitch.goal.test.tsx` (4), plus the switch line only in `EmployerDashboard.tsx` and `EmployerOpportunities.tsx`; `components/employer/employerData.ts` is imported read-only and admitted to the boundary audit list under D-276 (the one line added to `client/src/test/goalPagesBoundary.test.ts`). 16 captures at 1280 and 390, 8 `13_employer__*` fixtures, 34 files / 1054 insertions / 3 deletions. **Gate on the merged head `16d5c2e0` (main `81fa2532`, a genuine two-parent merge; the 34-path diff is unchanged by it, so this is not the D-266 empty-diff green):** `pnpm check` 0; `design-token-audit` OK (422 files · 1274 approved tokens · 3 third-party); `lint-deploy-migrations` 0; `check-deploy-triggers` OK; focused `employer.goal` + `employerSwitch.goal` + `goalPagesBoundary` 52/52; `pnpm build` 0; `VITE_GOAL_SURFACES=all pnpm build` 0 (the packet §5 flags-on build); `scope-check D-048-p3-employer` "6 owned path(s), every change inside them"; `review-gate` in a `pull_request` context passes at `16d5c2e0`; `git diff --check` clean. Copy checked against §4 rule 1a: no employer-facing string says "credit"/"credits" or the noun "ask"; the only hits in the goal files are a source comment and the internal `account.credits` value behind the "Talent unlock balance" label. **No production flag enabled:** `RELEASED` in `client/src/lib/goalSurfaces.ts` is still `["home"]`, so `goalSurfaceOn('employer')` is false live and no live surface changed. Kit pages change by the switch line only.

`D-048-p3-employer-talent`: in progress — Hark · 5de4 — 2026-11-03 — branch agent/queue/d048-p3-employer-talent

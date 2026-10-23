# Packet D-048 phase 3: public, policy, system and link surfaces

> Read `docs/BRIEF.md` first, then this packet and `docs/plans/D-048-phase-3-split.md`. This is a **packet-only Tier 3 architecture task**: it adds the public cluster rows to the queue. It does not implement the UI and changes no legal word.

| Field | Value |
|---|---|
| Queue row | `D-048` (phase 3; shared row; this packet writes its own status line only) |
| Packet task | `D-048-P-public` |
| Decisions | D-040, D-070, D-071, D-134, D-149, D-150, D-153 |
| Risk tier | 3 (docs/queue metadata only; the implementation rows below are Tier 2) |
| Branch | `agent/architect/d048-p-public` |
| Depends on | `D-048-phase-3` (landed foundation packet) |
| Adds | `D-048-p3-policy`, `D-048-p3-system`, `D-048-p3-links` |

## 1. Goal and binding rules

Move the public, policy, system and link surfaces to the goal design (D-150) with the legal words untouched. The policy group renders through `PolicyPageShell` keyed by route so `/pricing` keeps its own frame decision under `goalSurfaceOn('pricing')`; rendered legal text is byte-identical with the goal flag on and off (legal-text identity pin). The 12 prerendered pages keep a fetch-free static frame — a goal frame that fetches fails CI. Link surfaces (`/fast/:linkCode`, `/refer/:companySlug/:vanityAlias`, `/share-card/:token`) are signed-out intent landings: the intent must survive sign-in (D-153).

> **D-048 split method is binding:** a surface adds a switch only in its existing page file; its goal implementation lives under `client/src/pages/goal/<id>/`; API/data/auth modules are read-only; no surface edits `App.tsx`, `AppShell.tsx`, `client/src/components/goal/**`, `index.css`, `kit.css`, `components/kit/**`, hooks, shared, server, decisions, or the shared plan row. If a required shared change is discovered, stop and report it to the design-core/CEO lane with evidence.

## 2. Current behavior verified on `main` (dd849c48)

- `client/src/components/PolicyPageShell.tsx` renders `/about`, `/contact`, `/support`, `/guidelines`, `/terms`, `/privacy`, `/refunds`, `/shipping`, `/cancellations` (and `/pricing`, which this packet never keys); the 3 guides render through `client/src/pages/GuidePage.tsx`.
- `client/src/pages/NotFound.tsx`, `Offline.tsx`, `Emails.tsx`, `AppStates.tsx` are the system surfaces; #324's Emails.tsx change is ported at release through the kit-drift check.
- `client/src/pages/FastTrackLink.tsx`, `VanityFastTrackLink.tsx`, `ShareCard.tsx` are the signed-out link landings.
- `docs/plans/D-048-phase-3-split.md` rows `D-048-p3-policy`, `D-048-p3-system`, `D-048-p3-links` are the authoritative row contract and owned-path list.

## 3. Surface contracts and exact queue rows

| ID | Scope / goal | Lane | Depends on | Tier | Flag | Owned paths |
|---|---|---|---|---:|---|---|
| `D-048-p3-policy` | W7 policy group through PolicyPageShell, keyed by route (never `/pricing`): the goal design around the reader's goal, legal text in the 9 policy page files untouched, rendered text identical flag on and off | `d048-policy` | `D-048-F-static-frame`, `D-048-P-public` | 2 | `goalSurfaceOn('policy')` (prerendered, fetch-free) | `client/src/components/PolicyPageShell.tsx` (switch only, keyed by route); `client/src/pages/GuidePage.tsx` (switch only); `client/src/pages/goal/policy/**`; `client/src/pages/goal/policy/policyText.goal.test.tsx`; `design/goal-ui/captures/policy/**` |
| `D-048-p3-system` | W7 404, `/offline`, `/emails`, `/app-states` | `d048-system` | `D-048-F-static-frame`, `D-048-F-primitives`, `D-048-P-public` | 2 | `goalSurfaceOn('system')`; #324's Emails.tsx change ported at release through the drift check | `client/src/pages/NotFound.tsx` (switch only); `client/src/pages/Offline.tsx` (switch only); `client/src/pages/Emails.tsx` (switch only); `client/src/pages/AppStates.tsx` (switch only); `client/src/pages/goal/system/**`; `design/goal-ui/captures/system/**` |
| `D-048-p3-links` | W7 `/fast/:linkCode`, `/refer/:companySlug/:vanityAlias`, `/share-card/:token` | `d048-links` | `D-048-F-static-frame`, `D-048-F-primitives`, `D-048-P-public` | 2 | `goalSurfaceOn('links')` | `client/src/pages/FastTrackLink.tsx` (switch only); `client/src/pages/VanityFastTrackLink.tsx` (switch only); `client/src/pages/ShareCard.tsx` (switch only); `client/src/pages/goal/links/**`; `design/goal-ui/captures/links/**` |

Design acceptance notes (design proposals, executable under the doctrine; not new frozen owner decisions): policy pages open with the reader's goal ("Know your rights." / "Talk to a human.") and one quiet action where one exists; the legal body is presentation-only around untouched text. 404 opens "This page isn't here." with one route back; `/offline` opens "You're offline." with the honest reconnect state. Link landings open with the shared opportunity ("{Company} opening — ask for a referral") and one commit; the sign-in handoff preserves the intent.

All rows are `status: "todo"`, `packet: "docs/plans/D-048-public.md"`, `row: "D-048"`, `epic: "D-048-p3"`, and use the lane/tier/dependsOn/flag/owns values above. Each builder must use the exact `branch` value registered for its row in `docs/plans/assignments.json`; do not choose, rename, or derive a branch.

## 4. Implementation guardrails for builders

1. Legal text is never edited, retyped, or re-keyed; the goal frame wraps it. `policyText.goal.test.tsx` renders each legal page flag on and off and asserts identical text.
2. Prerendered pages fetch nothing in the frame; the flags-on CI build must stay green (it prerenders with every surface on).
3. `/pricing` is never keyed by the policy switch; it has its own row in the money packet.
4. Link landings preserve their attribution and handoff behaviour exactly; expired/unavailable links render honest states.
5. Fixtures synthetic only (the fixture test bans comp sample names and retired plans).

## 5. Red-first tests and gate

Each builder records focused failing tests first. Minimum pins: goal flag-off parity; goal-on render; legal-text identity; fetch-free prerender; link expired/invalid states. Required gate per PR: `pnpm check`; focused Vitest files; `node scripts/design-token-audit.mjs`; `VITE_GOAL_SURFACES=all pnpm build`; `pnpm quality:gate`; 1280+390 captures. All rows are Tier 2: PR with green-CI landing protocol.

## 6. Definition of done

- Only the row's owned paths changed; read-only imports unchanged; `git diff --check` clean.
- Goal surface passes the contract, focused tests and full gate on a branch merged with current `origin/main`; legal-text identity proven.
- Captures at both viewports; no production flag enabled; prerender green.

## 7. Review checklist

Reviewer records the exact head; checks scope against `owns`; reproduces red-first tests; verifies legal text untouched and identical both flag states, no fetch in the static frame, `/pricing` never keyed by the policy switch, goal-on and flag-off behaviour, captures at both sizes, exact-head CI.

## 8. Stop and report

Stop with a pushed status/report if a cited function or route no longer exists, a focused test fails unexplained, a required change falls outside `owns`, or a legal/content decision is not already decided. Never guess; report the concrete file/line.

## 9. Owner questions

None. The split marks these pages as needing no owner call; legal words stay untouched.

## Status

`D-048-P-public`: prepared by design lane (AYO-11) — pending coordinator landing — 2026-10-23 — branch `agent/architect/d048-p-public`

`D-048-P-public`: landed by the coordinator — 2026-10-23 — landing branch `agent/instinct/d048-p-public-packet`. Canonical candidate; the empty claim marker branch `agent/architect/d048-p-public` (Claude Code · e11c) is preserved and the overlap is announced in the PR.

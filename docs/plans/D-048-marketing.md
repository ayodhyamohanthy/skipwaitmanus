# Packet D-048 phase 3: signed-in home and discovery surfaces

> Read `docs/BRIEF.md` first, then this packet and `docs/plans/D-048-phase-3-split.md`. This is a **packet-only Tier 3 architecture task**: it adds the marketing/discovery cluster rows to the queue. It does not implement the UI.

| Field | Value |
|---|---|
| Queue row | `D-048` (phase 3; shared row; this packet writes its own status line only) |
| Packet task | `D-048-P-marketing` |
| Decisions | D-040 (featured stays labelled), D-055 (server referrer verdict), D-123 (question 1 and 4 rulings), D-134, D-149, D-150, D-153 |
| Risk tier | 3 (docs/queue metadata only; the implementation rows below are Tier 1 or 2 as stated) |
| Branch | `agent/architect/d048-p-marketing` |
| Depends on | `D-048-phase-3` (landed foundation packet), `D-048-P-account` |
| Adds | `D-048-p3-home-signed-in`, `D-048-p3-discovery`, `D-048-p3-public-profile` |

## 1. Goal and binding rules

Move the signed-in home, discovery and public-profile surfaces to the goal design on the static frame (D-123 rulings). Signed-in home has no kit page: a signed-in seeker goes to `/explore` and a verified referrer (server verdict, D-055) to `/referrer-home`; auth loading shows the fetch-free frame. Discovery surfaces keep D-040 labelling; public profile shows only what visibility allows and reuses the profile lane's goal parts.

> **D-048 split method is binding:** a surface adds a switch only in its existing page file; its goal implementation lives under `client/src/pages/goal/<id>/`; API/data/auth modules are read-only; no surface edits `App.tsx`, `AppShell.tsx`, `client/src/components/goal/**`, `index.css`, `kit.css`, `components/kit/**`, hooks, shared, server, decisions, or the shared plan row. If a required shared change is discovered, stop and report it to the design-core/CEO lane with evidence.

## 2. Current behavior verified on `main` (dd849c48)

- `client/src/pages/Home.tsx` renders GoalLandingV9 for signed-out visitors (live; `D-048-p3-home` done); the signed-in branch is this packet's row.
- `client/src/pages/OpportunityWall.tsx` (`/wall`) renders verified-employee shared openings with the anonymity line and "Request a referral" action; `client/src/pages/JobExplorer.tsx` (`/jobs`) browses roles with honest empty states.
- `client/src/pages/PublicProfile.tsx` (`/p/:handle`) renders the private-by-default profile ("shared only with referrers this person asks").
- `docs/plans/D-048-phase-3-split.md` rows `D-048-p3-home-signed-in`, `D-048-p3-discovery`, `D-048-p3-public-profile` are the authoritative row contract and owned-path list.

## 3. Surface contracts and exact queue rows

| ID | Scope / goal | Lane | Depends on | Tier | Flag | Owned paths |
|---|---|---|---|---:|---|---|
| `D-048-p3-home-signed-in` | W7 home (`/`) for signed-in visitors: no kit page; seeker to `/explore`, verified referrer (server verdict, D-055) to `/referrer-home`; auth loading shows the fetch-free frame | `d048-home` | `D-048-F-static-frame`, `D-048-P-marketing` | 2 | `goalSurfaceOn('home-signed-in')` | `client/src/pages/Home.tsx` (switch only); `client/src/pages/goal/home/**`; `client/src/pages/homeSignedIn.goal.test.tsx`; `design/goal-ui/captures/home/**` |
| `D-048-p3-discovery` | W7 `/wall` and `/jobs` (featured listing stays labelled, D-040) | `d048-discovery` | `D-048-F-static-frame`, `D-048-P-marketing` | 2 | `goalSurfaceOn('discovery')` | `client/src/pages/OpportunityWall.tsx` (switch only); `client/src/pages/JobExplorer.tsx` (switch only); `client/src/pages/goal/discovery/**`; `scripts/kit-screens/fixtures/*__goal-discovery-*.json`; `design/goal-ui/captures/discovery/**` |
| `D-048-p3-public-profile` | W7 `/p/:handle`; reuses the profile lane's goal parts; shows only what visibility allows | `d048-profile` | `D-048-F-static-frame`, `D-048-p3-profile`, `D-048-P-marketing` | 1 | `goalSurfaceOn('public-profile')` | `client/src/pages/PublicProfile.tsx` (switch only); `client/src/pages/goal/public-profile/**`; `design/goal-ui/captures/public-profile/**` |

Design acceptance notes (design proposals, executable under the doctrine; not new frozen owner decisions): signed-in home is a router, not a dashboard — the goal shell carries the user to their surface with no intermediate marketing block. `/wall` opens "See openings shared by verified employees." with "Request a referral" as the commit on a chosen opening; the anonymity line stays. `/jobs` opens "Browse roles worth a referral." with save/paste as the quiet actions and the honest "No jobs match" empty state. `/p/:handle` opens with the owner's public goal ("See {name}'s work.") and shows exactly what visibility allows — the private-profile state says so plainly.

All rows are `status: "todo"`, `packet: "docs/plans/D-048-marketing.md"`, `row: "D-048"`, `epic: "D-048-p3"`, and use the lane/tier/dependsOn/flag/owns values above. Each builder must use the exact `branch` value registered for its row in `docs/plans/assignments.json`; do not choose, rename, or derive a branch.

## 4. Implementation guardrails for builders

1. Signed-in routing uses the server referrer verdict, never a client email check (D-055); auth loading renders the fetch-free frame, never a flash of landing.
2. Discovery keeps D-040: featured/sponsored items stay labelled; no new promotion surface.
3. Public profile renders only what the visibility verdict allows; the private state is plain text, not a tease.
4. Prerendered pages fetch nothing in the frame; flags-on CI build stays green.
5. Preserve kit assertions; add goal-on assertions for loading/empty/error states; fixtures synthetic only.

## 5. Red-first tests and gate

Each builder records focused failing tests first. Minimum pins: goal flag-off parity; goal-on render; signed-in routing by server verdict; D-040 labelling; public-profile visibility states; fetch-free frame. Required gate per PR: `pnpm check`; focused Vitest files; `node scripts/design-token-audit.mjs`; `VITE_GOAL_SURFACES=all pnpm build`; `pnpm quality:gate`; 1280+390 captures. `D-048-p3-public-profile` is Tier 1 (draft PR, independent review, D-151); the other rows are Tier 2.

## 6. Definition of done

- Only the row's owned paths changed; read-only imports unchanged; `git diff --check` clean.
- Goal surface passes the contract, focused tests and full gate on a branch merged with current `origin/main`.
- Captures at both viewports; no production flag enabled; prerender green.

## 7. Review checklist

Reviewer records the exact head; checks scope against `owns`; reproduces red-first tests; verifies server-verdict routing, D-040 labelling, visibility-state rendering, fetch-free frame, goal-on and flag-off behaviour, captures at both sizes, exact-head CI.

## 8. Stop and report

Stop with a pushed status/report if a cited function or route no longer exists, a focused test fails unexplained, a required change falls outside `owns`, or a routing/visibility/promotion decision is not already decided. Never guess; report the concrete file/line.

## 9. Owner questions

None. Signed-in home routing and discovery scope are already ruled (D-123 questions 1 and 4); this packet makes no new product ruling.

## Status

`D-048-P-marketing`: prepared by design lane (AYO-11) — pending coordinator landing — 2026-10-23 — branch `agent/architect/d048-p-marketing`

`D-048-P-marketing`: landed by the coordinator — 2026-10-23 — landing branch `agent/instinct/d048-p-marketing-packet`. Canonical candidate; the empty claim marker branch `agent/architect/d048-p-marketing` (Claude Code · e11c) is preserved and the overlap is announced in the PR.

`D-048-p3-discovery`: done — 15b91207 — Hark · f6a7 — 2026-10-30 — PR #852

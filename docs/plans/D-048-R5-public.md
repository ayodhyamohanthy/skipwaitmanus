# D-048-R5 — release the public and marketing lane

Status: registration only. Prepared 2026-11-09 from `main` `7dcc2cc5`. No flag is flipped by this file.

## Goal

The owner's direction (2026-11-09, "make sure goal based design is applied across the platform") is that the goal design actually renders for users. Today `client/src/lib/goalSurfaces.ts` declares 44 surfaces and **releases 5** (`home, referrer, referrer-home, invite, post-opportunity`), so a measured live check at 1280 showed `/for-companies`, `/plans`, `/sign-in`, `/support`, `/explore`, `/requests` and `/employer` still rendering the kit pages while their goal implementations sit dark on `main`.

This row releases the lane whose implementations are complete, whose pages are public (no signed-in state, no money, no identity), and whose proof is cheapest to reproduce: **public and marketing**.

## Surfaces in scope (7)

| Surface | Routes | Implementation row |
|---|---|---|
| `landed` | `/landed` | `goals/seeker-small/GoalLanded.tsx` (D-048-p3-* landed rows, done) |
| `share` | `/share` | `goal/seeker-small/GoalShareHub.tsx` (D-048-copy-goal-twins-trigger-fix, landed) |
| `suggest-company` | `/suggest-company` | `goal/seeker-small/GoalSuggestCompany.tsx` (done) |
| `policy` | `/privacy`, `/terms`, `/refunds`, `/shipping`, `/cancellations`, `/about`, `/contact`, `/guidelines`, `/job-referral-platforms`, `/choosing-a-job-referral-platform`, `/how-employees-refer-candidates` | `D-048-p3-policy` (done) |
| `system` | `/offline`, `/emails`, `/app-states` | `D-048-p3-system` (done) |
| `links` | `/fast/:linkCode`, `/refer/:companySlug/:vanityAlias`, `/share-card/:token` | `D-048-p3-links` (done) |
| `discovery` | `/explore`, `/wall`, `/jobs` | `D-048-p3-discovery` (done) |

Out of scope, deliberately: `premium`, `pricing`, `plans` (money and prices are the owner's), every `admin*` and `developers` surface (money decisions in the UI), `public-profile` (`/p/:handle` is **not built** — `D-048-p3-public-profile` is still `todo`, so no release is possible), `home-signed-in`/`inbox`/`queue`/`ask`/`company`/`conversation`/`start`/`onboarding`/`verify`/`settings`/`profile`/`alerts`/`messages`/`assistants`/`support`/`skippy`/`employer*` (separate lanes, separate rows).

## Owned paths

- `client/src/lib/goalSurfaces.ts` — the `RELEASED` list only.
- `client/src/lib/goalSurfaces.test.ts` — the pin at the top of the file that names the released set.
- `docs/plans/D-048-R5-public.md` (this packet) and `docs/plans/assignments.json` (this row's status).

No page, component, server, shared, workflow or test-outside-the-pin edit. If a surface needs a code fix to be released, stop that surface, report it, and release the rest.

## Acceptance

1. Every one of the seven surfaces renders its goal page with `VITE_GOAL_SURFACES` limited to that surface, captured at **1280 and 390**, in these states: default, signed-out where the surface has one, empty, loading and error where the page has them. Captures from fictional fixtures only (D-059, no real personal data).
2. `assertGoalPage` holds on each released page (one goal line, one next step, one black commit), and `node scripts/design-token-audit.mjs` stays clean.
3. `client/src/lib/goalSurfaces.test.ts` pins exactly the new released set, and the existing `test mode ignores RELEASED` and landing-from-`RELEASED` cases still pass untouched.
4. After the landing commit, the **live** site serves the goal markup for each route: `[data-goal-page]` present at 1280 and 390 and the kit `[data-skipwait-screen]` absent. Evidence is the render check, not the flag edit.
5. No surface outside the seven changes behaviour; `releasedGoalSurfaces()` before/after diff is exactly the seven ids.
6. Rollback is one commit: remove the ids from `RELEASED`, push, and the kit pages render again with no data or state migration.

## Tier and gates

Tier 1 (it changes what every visitor sees on legal and public routes). Required: full gate, exact-head green CI, and an independent review by a session that did not build it (D-151), plus the live check in acceptance 4. Nothing here is an owner-reserved product change — no price, plan, credit rule, legal text or live-money path moves — so it does not need a separate owner approval beyond the direction above; if any route in the scope turns out to touch a price or plan line, that route leaves the row and goes to the owner.

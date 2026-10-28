# SkipWait Build Kit — START HERE (for AI coding platforms and developers)

> **Read [`docs/BRIEF.md`](docs/BRIEF.md) first** — the one-page brief every AI model starts from (D-073). The full rules follow; they win any conflict with the brief.
>
> **Owner says `build`, `resume`, `continue` or `next`?** Continue current work, never restart an old plan. First follow [the current-instruction preflight](./docs/BUILD_CONTINUITY.md) (D-225): fetch current main, read latest instructions and decisions plus the previous repo-only outcome, check goal alignment and ownership, then use `node scripts/next-task.mjs --claim "<your model name>"`. Read its assignment against those decisions before implementation; stale or conflicting context holds only the affected task. Claude handles intelligence/reasoning; other tools develop. Keep the picker's exact session-tagged name for later flags. The picker is not proof that the preflight was read.

Kit version: v4 · 7 Oct 2026 · skipwait.me
**Kit v4 is no longer binding (D-048, Oct 18 2026).** `docs/DECISIONS.md` is the single source of truth for owner decisions and `AGENTS.md` holds the working rules; this kit is a reference for SkipWait's web + mobile (PWA) design, logic, states and rules.
It supersedes every earlier kit (v1–v3, earlier PDFs). If anything here conflicts with `docs/DECISIONS.md` or `AGENTS.md`, **they win**. No surface is re-skinned to match this kit: the goal-UI key screens approved by the owner on Oct 18 (D-048, D-071; `design/goal-ui/pick/`) roll out in phases.

## The platform is ALREADY LIVE — read this first
SkipWait is already running in production. You are **updating an existing app**, not starting a new one.
1. **Do not start over or regenerate the project.** Inspect the live codebase first: routes, database schema, auth, payments, env vars.
2. **Pick work from the queue.** Work comes only from the priority queue in `docs/KIT_V4_BUILD_PLAN.md` §3b (D-009, order D-053): run `node scripts/next-task.mjs --claim "<your model name>"` and do only what it prints. The picker claims on origin; your first commit on the task branch sets the §3b row (or, when several tasks share that row, your line in the packet's Status section; the picker says which, D-134), which reaches `main` with the work; a claim nobody pushed to (commit or `--heartbeat`) for 2 hours is free (D-083, D-085). The screen-by-screen map (`docs/UPDATE_PLAN.md`, `SCREENS.md`, `screens/`) is reference only — parity with the kit is no longer a goal (D-048).
3. **Never break existing users or data.**
   - Database changes are additive migrations only (add columns/tables; backfill; never drop or rename columns that hold live data without a migration + backup).
   - Keep existing URLs working; add redirects for any renamed route (e.g. `/wallet` → `/plans`).
   - Keep existing sign-ins working; the login rule is founder-locked (`AGENTS.md`, D-030 as amended by D-049/D-057).
4. **Ship each verified group to `main`** in small batches, only after the gate in `docs/KIT_V4_BUILD_PLAN.md` §3 passes and GitHub CI is green on that exact commit (D-003, D-082), then verify it live (D-019). Each batch must pass build, tests and a phone + desktop visual check (against the approved goal comps and the doctrine, D-071, D-150).
5. **Replace demo data with real data.** Everything labelled `DESIGN PREVIEW`, sample names, messages, prices and counts in `app/src/lib/*-data.ts` is illustrative. Never ship fake activity, counts, testimonials or outcomes.
6. When the owner sends a newer kit or approves new designs, record the decision in `docs/DECISIONS.md` first, then repeat steps 2–4 (`CHANGELOG.md` shows what changed in a kit).

## What is in this kit
| Path | What it is | How to use it |
|---|---|---|
| `START_HERE.md` | This file | Read first in this kit (after `AGENTS.md` and `docs/DECISIONS.md`) |
| `FOR_AI_BUILDERS.md` | Master spec: product rules, approved stack, backend, security, PWA, accessibility, placeholders | Follow; `docs/DECISIONS.md` wins on any conflict |
| `LLM_HANDOFF.md` | Product overview, design system, navigation | Context |
| `SCREENS.md` | Every route, what it does, its states | Screen checklist |
| `docs/PRICING.md` | The one pricing source (D-146): credit packs on sale; D-132 plans (Entry, Mid and Senior level Referrers, D-152) behind off flags; passes not sold. Root `PRICING.md` is the old pass spec | Billing logic (Chargebee) |
| `UPGRADE_NUDGES.md` | When and how to show upgrade prompts using real usage only | Growth logic |
| `AGENT_ACCESS.md` | MCP server, API, third-party apps, developer console, approval rules | Integrations |
| `CHECKLIST.md` | Phased build checklist | Track progress |
| `CHANGELOG.md` | Every design change, newest last | What changed since last kit |
| `SkipWait-Screens-v4.pdf` | Every web + phone screen and every preview state, one image per page | Visual reference (not binding, D-048) |
| `screens/web/*.png`, `screens/mobile/*.png` | Same captures as separate images, named `route__state.png` | Reference (not binding, D-048) |
| `app/` | Full working design source (TanStack Start + React + Tailwind v4) | Reference for components, tokens, copy text and logic (not binding, D-048) |

## How to use the design source (`app/`)
- `app/src/styles.css` holds every kit colour, font and spacing token (light + dark). The live app already uses ported tokens; do not re-skin (D-048).
- `app/src/routes/*.tsx` — one file per screen. UI text, states and flows inside are a reference, not binding (D-048); never port them over a decision in `docs/DECISIONS.md`.
- `app/src/components/` — shared shell (sidebar + phone tab bar), VisualJourney, preview kit, launch page, consent banner.
- `app/src/lib/monetization-data.ts`, `marketplace-data.ts` — sample data shapes. Use them as the shape for real database tables, not as content.
- State chips marked `DESIGN PREVIEW · Preview state:` only switch between designed states. In production, drive those states from real data and remove the chips and banners.
- To run locally: `cd app && bun install && bun run dev` (or npm).

## Non-negotiable product rules (short version — full list in FOR_AI_BUILDERS.md)
- 3 free credits every month; extra asks use credits. Referrers are never paid and never ask you for money (D-063 as worded by D-135). Money never buys queue position, acceptance odds or referrer attention (D-006).
- Never invent counts, names, outcomes or activity. Initial companies: SkipWait, Wipro, Neutrinos, TCS, Merkle.
- Referrers are never automated. The work-email code (OTP via ZeptoMail) proves employment and is the referrer sign-in on every visit; reviewing or accepting asks always needs it, even after a referrer adds a personal login (D-030, D-049, D-057).
- Every ask and every credit spend made through an assistant or app needs the user's approval.
- Default currency USD. Mobile must feel like a native app (PWA, tab bar, safe areas, 44px+ tap targets).

## Suggested prompt to paste into the AI coding platform
> You are updating the live SkipWait platform (skipwait.me). Read `AGENTS.md` and `docs/DECISIONS.md` first (the decision register wins over this kit), then `START_HERE.md` and `FOR_AI_BUILDERS.md`. Do not recreate the project. Run `node scripts/next-task.mjs --claim "<your model name>"` and do only what it prints (it picks from the priority queue in `docs/KIT_V4_BUILD_PLAN.md` §3b and claims on origin). Kit v4 (`app/`, `screens/`, `SkipWait-Screens-v4.pdf`) is retired (D-120, Oct 21): the goal-focused UI (`DESIGN.md` + `design/goal-ui/DOCTRINE.md`) is the one design, landing to platform; surfaces migrate one at a time through the gate (`docs/plans/GOAL_UI_MIGRATION.md`). Keep all existing users, data and URLs working, use additive migrations only, replace all preview/sample data with real data, and follow every product rule. When the task is done, run the gate; open a draft pull request for Tier 1 work, or land only when everything is green (D-082) and verify it live; then report to the CEO with `--report` and end the session.

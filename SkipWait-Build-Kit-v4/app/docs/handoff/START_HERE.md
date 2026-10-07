# SkipWait Build Kit — START HERE (for AI coding platforms and developers)

Kit version: v4 · 7 Oct 2026 · skipwait.me
This kit is the **single, current source of truth** for SkipWait's web + mobile (PWA) design, logic, states and rules.
It supersedes every earlier kit (v1–v3, earlier PDFs). If anything conflicts with older files or the live code, **this kit wins** unless it breaks production data or security.

## The platform is ALREADY LIVE — read this first
SkipWait is already running in production. You are **updating an existing app**, not starting a new one.
1. **Do not start over or regenerate the project.** Inspect the live codebase first: routes, database schema, auth, payments, env vars.
2. **Map, then diff.** For every screen in `SCREENS.md` and `screens/`, find the matching live screen. Classify each as: unchanged · update · new · remove. Write that table to `docs/UPDATE_PLAN.md` in the live repo before coding.
3. **Never break existing users or data.**
   - Database changes are additive migrations only (add columns/tables; backfill; never drop or rename columns that hold live data without a migration + backup).
   - Keep existing URLs working; add redirects for any renamed route (e.g. `/wallet` → `/plans`).
   - Keep existing sign-ins working while moving to the auth stack in `FOR_AI_BUILDERS.md`.
4. **Ship behind feature flags (Statsig)** in small batches; release to internal → 10% → 100%. Each batch must pass build, tests and a phone + desktop visual check against `screens/`.
5. **Replace demo data with real data.** Everything labelled `DESIGN PREVIEW`, sample names, messages, prices and counts in `app/src/lib/*-data.ts` is illustrative. Never ship fake activity, counts, testimonials or outcomes.
6. When the owner sends a newer kit, repeat steps 2–4 using `CHANGELOG.md` to see what changed.

## What is in this kit
| Path | What it is | How to use it |
|---|---|---|
| `START_HERE.md` | This file | Read first |
| `FOR_AI_BUILDERS.md` | Master spec: product rules, approved stack, backend, security, PWA, accessibility, placeholders | Follow exactly |
| `LLM_HANDOFF.md` | Product overview, design system, navigation | Context |
| `SCREENS.md` | Every route, what it does, its states | Screen checklist |
| `PRICING.md` | Plans Start/Momentum/Land/Concierge, credits, rollover, packs | Billing logic (Chargebee) |
| `UPGRADE_NUDGES.md` | When and how to show upgrade prompts using real usage only | Growth logic |
| `AGENT_ACCESS.md` | MCP server, API, third-party apps, developer console, approval rules | Integrations |
| `CHECKLIST.md` | Phased build checklist | Track progress |
| `CHANGELOG.md` | Every design change, newest last | What changed since last kit |
| `SkipWait-Screens-v4.pdf` | Every web + phone screen and every preview state, one image per page | Visual target |
| `screens/web/*.png`, `screens/mobile/*.png` | Same captures as separate images, named `route__state.png` | Pixel reference |
| `app/` | Full working design source (TanStack Start + React + Tailwind v4) | Copy components, tokens, copy text and logic |

## How to use the design source (`app/`)
- `app/src/styles.css` holds every colour, font and spacing token (light + dark). Port these tokens first.
- `app/src/routes/*.tsx` — one file per screen. UI text, states and flows inside are approved; port them as-is.
- `app/src/components/` — shared shell (sidebar + phone tab bar), VisualJourney, preview kit, launch page, consent banner.
- `app/src/lib/monetization-data.ts`, `marketplace-data.ts` — sample data shapes. Use them as the shape for real database tables, not as content.
- State chips marked `DESIGN PREVIEW · Preview state:` only switch between designed states. In production, drive those states from real data and remove the chips and banners.
- To run locally: `cd app && bun install && bun run dev` (or npm).

## Non-negotiable product rules (short version — full list in FOR_AI_BUILDERS.md)
- Referrals are always free. Money never buys queue position, acceptance odds or referrer attention.
- Never invent counts, names, outcomes or activity. Initial companies: SkipWait, Wipro, Go Neutrinos, TCS, Merkle.
- Referrers are never automated. Work email proves employment only (OTP via ZeptoMail); it is not a sign-in.
- Every ask and every credit spend made through an assistant or app needs the user's approval.
- Default currency USD. Mobile must feel like a native app (PWA, tab bar, safe areas, 44px+ tap targets).

## Suggested prompt to paste into the AI coding platform
> You are updating the live SkipWait platform (skipwait.me). Read `START_HERE.md`, then `FOR_AI_BUILDERS.md`, in this kit. Do not recreate the project. Inspect the existing codebase and database, write `docs/UPDATE_PLAN.md` mapping every screen in `SCREENS.md` / `SkipWait-Screens-v4.pdf` to the live app, then implement in small flagged batches using `app/` as the exact design and copy reference. Keep all existing users, data and URLs working, use additive migrations only, replace all preview/sample data with real data, and follow every product rule. After each batch, compare phone and desktop against `screens/` and report differences.

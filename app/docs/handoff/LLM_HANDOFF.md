# SkipWait — LLM Development Handoff

> **Stale copy (Oct 23, D-163).** This file predates the decision register's current state: its pricing, design and stack lines are history. Use [`docs/BRIEF.md`](../../../docs/BRIEF.md), the root [`LLM_HANDOFF.md`](../../../LLM_HANDOFF.md) and [`docs/PRICING.md`](../../../docs/PRICING.md) instead.

> Read [`docs/BRIEF.md`](../../../docs/BRIEF.md) first (D-073), then `AGENTS.md`. The platform is already live: update it, do not rebuild it.
>
> **Owner says `build`, `resume`, `continue` or `next`?** They all mean one thing: run `node scripts/next-task.mjs --claim "<your model name>"` and do only what it prints, step by step. It adds a session tag and prints your full name (for example `Qwen 3 · k3f9`): use exactly that name for every later flag and when you resume (read it from the holder column of `--status`; never invent a new one), and never share a name with another session. Order, each top down: red `main`; your own unfinished work (pending work ranked above it with nobody on it comes first); pending work nobody is on; new work. A red or blocked priority holds its own lane and the tasks that depend on it (red `main` holds everything), so agents never take the same task and other lanes keep moving (D-109). A claim with no push and no `--heartbeat` for 2 hours is free. Push after every commit, report to the CEO with `--report` when you stop, and read the board with `--status`; never resume or choose work from memory. A newer decision always beats older work: before you start, read every entry in `docs/DECISIONS.md` newer than your packet, and if one changes your task, stop and `--report blocked` naming it (D-202). Claude Code is the CEO, claims as `--claim "Claude Code"` and sets the order in `docs/plans/assignments.json`; the open models (CTO, CDO and the team) build (D-083, D-085).


> **AI coding platforms: read `FOR_AI_BUILDERS.md` first.** It lists every rule, backend requirement and placeholder not visible in the designs.

Give this whole folder to your LLM / developer. Start by reading this file, then `AGENTS.md`, then `reference/`.

## 1. Product
SkipWait (skipwait.me) is a global platform for **private job referrals**. Seekers ask employees at a company for a referral; referrers accept, chat privately, and refer. 3 free credits every month; extra asks use credits. Referrers are never paid and never ask you for money (D-063 as worded by D-135) — no commissions, no paid priority.

Launch companies (real people open to referrals): **SkipWait, Wipro, Go Neutrinos, TCS, Merkle**.
Hard rule: never invent user counts, testimonials, outcomes, or fake activity. Label demo data as preview.

## 2. What is in this package
- `app/` — the complete design prototype source (React 19 + TanStack Start + Vite 7 + Tailwind v4). Every screen is a working, clickable design. It is NOT connected to a backend.
- `reference/` — original build kit, journey PDF, launch audit, growth & monetization audit. These are the source of truth for requirements.
- `app/AGENTS.md` — architecture rules. `app/roadmap.md` — what is designed.

## 3. Design system (do not change without approval)
- Colors: white #FFFFFF, ink #141414, electric blue #0000FF, invitation yellow #FFFC52.
- Fonts: Instrument Sans (UI), IBM Plex Mono (labels/captions).
- Signature motif: the "door" (opening a door = a referral). Keep it.
- All tokens live in `app/src/styles.css` as semantic CSS variables. Never hardcode colors in components.

## 4. Screens / routes
| Route | Purpose |
|---|---|
| `/` | Public launch homepage (no app nav) |
| `/sign-in` | Seeker/referrer intent, Google + email |
| `/explore`, `/explore/:slug` | Company discovery + company detail + request flow |
| `/requests` | Seeker request tracking (statuses: Draft→Requested→Accepted→Referred→Interviewing→Offer→Hired / Declined / Expired / Closed) |
| `/inbox` | Private conversations (open only after acceptance) |
| `/referrer` | Referrer onboarding, work-email verification, review queue, capacity, impact |
| `/profile` | Profile & privacy controls |
| `/invite` | Self-growth / invite loop |
| `/safety` | Trust, rules, reporting |
| `/work` | Profile-only work showcase (no feed/likes/followers); add, import, pin, per-item privacy |
| `/plans` | Plans & credits in one page (Start/Momentum/Land, credits modal, usage panel, upgrade moments) — `/wallet` redirects here |
| `/for-companies` | Standalone employer sales page (no app nav) |
| `/admin` | Separate internal console, direct URL only, not in any menu: overview, company approvals, verifications, safety reports, users |

App shell: desktop = left sidebar (Explore, Requests, Inbox, Refer + "Your space": Profile, My work, Plans & credits; More last = Help & safety, For companies; More never highlighted); mobile = bottom tab bar with the same items with safe-area insets and ≥44px touch targets.

## 5. Build instructions for the production app
1. Keep the UI exactly as designed; replace demo data in `src/lib/marketplace-data.ts` with real data.
2. Backend (suggested: Postgres/Supabase): tables — profiles, companies, referrer_verifications (work-email domain), referral_requests (status enum above), messages, reports, invites, user_roles (roles in a SEPARATE table; admin checked server-side only). Row-level security on every table.
3. Auth: Google + email/password. Referrers verify via company work email OTP.
4. Rules: requests capped per seeker per week; referrer sets monthly capacity; requests auto-expire (e.g. 14 days); chat opens only after acceptance; contact details hidden until both agree.
5. Notifications: email + web push for request accepted/declined/new message.
6. Admin: approve companies, verify referrers, handle reports, suspend users — all actions audit-logged.
7. Monetization: see section 9 and `PRICING.md`, `UPGRADE_NUDGES.md`. Never charge for referrals or queue priority.
8. Growth: invite links, referrer impact badges, shareable company pages with SEO metadata per route.

## 6. PWA (web + mobile)
- Add `manifest.webmanifest` (name SkipWait, display standalone, theme #0000FF, background #FFFFFF, 192/512 + maskable icons) and apple-touch-icon.
- Offline: use `vite-plugin-pwa` (generateSW), NetworkFirst for HTML, CacheFirst for hashed assets; never register the service worker in dev/preview iframes.
- Mobile feel: bottom tabs, no horizontal scroll, `viewport-fit=cover`, `env(safe-area-inset-*)`, sheets instead of modals on phones.
- Native stores later: wrap with Capacitor if App Store / Play Store needed.

## 7. Run locally
```
cd app
npm install   # or bun install
npm run dev
```
Create `app/.env` with your own backend keys (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) when connecting a backend.

## 8. Prompt to paste into your LLM
> You are building SkipWait, a free global job-referral PWA. The attached `app/` folder is the approved UI design — preserve its visuals, routes, and copy. Read LLM_HANDOFF.md, AGENTS.md, and everything in reference/. Implement the backend, auth, referral request lifecycle, messaging, referrer verification, admin console, notifications, and PWA installability/offline support as described. Never fabricate activity or counts. Referrals must always be free. Work route by route and keep mobile and desktop both excellent.

## 9. Monetization (current, design values)
- Plans: Start $8/mo ($80/yr), Momentum $20/mo ($200/yr, "Most chosen"), Land $100/$200/$500+ per month (Focus/Sprint/Concierge; yearly = 10x). Internal ids go/plus/pro. Free is not shown as a card.
- Credits: $1 retail; 3 free credits for everyone after profile; purchased credits never expire. Full details in `PRICING.md`.
- Usage panel + upgrade moments: `UPGRADE_NUDGES.md`.

## 10. Doc index
`SCREENS.md` (every route), `CHECKLIST.md` (build order), `PRICING.md`, `UPGRADE_NUDGES.md`, `CHANGELOG.md` (latest design changes).

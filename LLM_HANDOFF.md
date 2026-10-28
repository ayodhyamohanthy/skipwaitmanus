# SkipWait — LLM Development Handoff

> Read [`docs/BRIEF.md`](docs/BRIEF.md) first (D-073), then `AGENTS.md`. The platform is already live: update it, do not rebuild it.
>
> **Owner says `build`, `resume`, `continue` or `next`?** Continue current work, never restart an old plan. First follow [the current-instruction preflight](./docs/BUILD_CONTINUITY.md) (D-225): fetch current main, read latest instructions and decisions plus the previous repo-only outcome, check goal alignment and ownership, then use `node scripts/next-task.mjs --claim "<your model name>"`. Read its assignment against those decisions before implementation; stale or conflicting context holds only the affected task. Claude handles intelligence/reasoning; other tools develop. Keep the picker's exact session-tagged name for later flags. The picker is not proof that the preflight was read.


> **AI coding platforms: read `FOR_AI_BUILDERS.md` first.** It lists every rule, backend requirement and placeholder not visible in the designs.

Give this whole folder to your LLM / developer. Start by reading `AGENTS.md` and `docs/DECISIONS.md` (the decision register wins over this file, D-026), then this file, then `reference/`.

## 1. Product
SkipWait (skipwait.me) is a global platform for **private job referrals**. Seekers ask employees at a company for a referral; referrers accept, chat privately, and refer. 3 free credits every month; extra asks use credits. Referrers are never paid and never ask you for money (D-063 as worded by D-135). No commissions, no paid priority (D-006).

Launch companies (real people open to referrals): **SkipWait, Wipro, Neutrinos, TCS, Merkle**.
Hard rule: never invent user counts, testimonials, outcomes, or fake activity. Label demo data as preview in the prototype only; the product ships no preview labels or sample data (AGENTS.md §0a).

## 2. What is in this package
- `app/` — the complete design prototype source (React 19 + TanStack Start + Vite 7 + Tailwind v4). Every screen is a working, clickable design. It is NOT connected to a backend.
- `reference/` — original build kit, journey PDF, launch audit, growth & monetization audit. These were the source of truth for requirements; `docs/DECISIONS.md` now wins wherever they differ (D-048).
- `app/AGENTS.md` — architecture rules. `app/roadmap.md` — what is designed.

## 3. Design system (do not change without approval)
- Kit v4 is RETIRED (D-120, Oct 21): the goal-focused UI is the one design, landing to platform - the contract in `DESIGN.md`, the doctrine in `design/goal-ui/DOCTRINE.md`, comps in `design/goal-ui/pick/`, tokens in `client/src/index.css`, primitives in `client/src/components/goal/`, token audit. Surfaces migrate one at a time through the gate (`docs/plans/GOAL_UI_MIGRATION.md`); until a surface migrates, its live tokens stay.
- Colors: white #FFFFFF, ink #141414, electric blue #0000FF, invitation yellow #FFFC52.
- Fonts: Instrument Sans (UI), IBM Plex Mono (labels/captions).
- Signature motif: the "door" (opening a door = a referral). Keep it.
- All tokens live in `app/src/styles.css` as semantic CSS variables. Never hardcode colors in components.

## 4. Screens / routes
| Route | Purpose |
|---|---|
| `/` | Public launch homepage (no app nav) |
| `/sign-in` | Seeker/referrer intent; seekers use social logins or personal email + password (D-049), referrers the work-email code only (D-030) |
| `/explore`, `/explore/:slug` | Company discovery + company detail + request flow |
| `/requests` | Seeker request tracking (statuses: Draft→Requested→Accepted→Referred→Interviewing→Offer→Hired / Expired / Withdrawn / Closed; a pass reopens the ask to the company's other verified employees, D-021) |
| `/inbox` | Private conversations (open only after acceptance) |
| `/referrer` | Referrer onboarding, work-email verification, review queue, capacity, impact |
| `/profile` | Profile & privacy controls |
| `/invite` | Self-growth / invite loop |
| `/safety` | Trust, rules, reporting |
| `/work` | Profile-only work showcase (no feed/likes/followers); add, import, pin, per-item privacy |
| `/plans` | Plans & credits in one page (Free plus the account's own pass, credits, usage panel, upgrade moments; passes are not sold (D-146); the referrer role sees no purchase, D-055) — `/wallet` redirects here |
| `/for-companies` | Standalone employer sales page (no app nav) |
| `/admin` | Separate internal console, direct URL only, not in any menu: overview, company approvals, verifications, safety reports, users |

App shell: desktop = left sidebar (Explore, Requests, Inbox, Refer + "Your space": Profile, My work, Plans & credits; More last = Help & safety, For companies; More never highlighted); mobile = bottom tab bar with the same items with safe-area insets and ≥44px touch targets.

## 5. Build instructions for the production app
1. Redesign each surface to the goal doctrine when its queue row comes up (D-150, D-149), never ad hoc; replace demo data in `src/lib/marketplace-data.ts` with real data.
2. Backend: the live Express + Azure MySQL (Drizzle) app, schema in `drizzle/schema.ts`; admin checked server-side only. There is no Supabase row-level security, so every query applies explicit ownership and tenant checks (AGENTS.md §3).
3. Auth: seekers use social logins (Google, Microsoft, GitHub, LinkedIn, Slack) or personal email + password; referrers sign in with a work-email code only (D-030 as amended by D-049/D-057).
4. Rules: open asks capped per plan (Free 3, D-039) and at 2 per company (D-006); referrer sets monthly capacity; an ask expires 7 days after a verified referrer can first see it, and an uncovered ask waits up to 90 days (D-061); chat opens only after acceptance; contact details hidden until both agree.
5. Notifications: email + web push for request accepted/declined/new message.
6. Admin: approve companies, verify referrers, handle reports, suspend users — all actions audit-logged.
7. Monetization: see section 9 and `PRICING.md`, `UPGRADE_NUDGES.md`. Never charge for referrals or queue priority.
8. Growth: invite links, private referrer impact (no public per-referrer metrics, D-055, D-057), shareable company pages with SEO metadata per route.

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
> You are updating SkipWait, a global job-referral PWA that is already live. Read AGENTS.md and docs/DECISIONS.md first (the decision register wins), then LLM_HANDOFF.md and everything in reference/. The attached `app/` folder is the kit v4 design reference, retired (D-120): the goal-focused UI (`DESIGN.md` + `design/goal-ui/DOCTRINE.md`) is binding, landing to platform; surfaces migrate one at a time through the gate (`docs/plans/GOAL_UI_MIGRATION.md`). Pick work only from the priority queue in docs/KIT_V4_BUILD_PLAN.md §3b: run `node scripts/next-task.mjs --claim "<your model name>"` and do only what it prints. Never fabricate activity or counts. Money follows the register: 3 free credits every month; extra asks use credits; referrers are never paid (D-063). Keep mobile and desktop both excellent.

## 9. Monetization (current — `docs/DECISIONS.md`; prices in `docs/PRICING.md`, the one source (D-146); code in `shared/planCatalog.ts` and `shared/planFamily.ts`)
- Only credit packs are currently sold (D-146). The D-132 Entry/Mid/Senior level Referrer family remains behind off flags until its audit and the owner's enable word; no fixed-term or annual plan is for sale. Human review and sessions stay off until staffed (D-041). Free is not shown as a card.
- Credits: Free gets 3 a month and 3 open asks, no welcome credits; the reverse trial comes off the public catalog until its trigger is built (D-039, D-051; off the catalog since `1376dfa3`). Packs ₹99/2, ₹1,199/25, ₹2,599/60, ₹5,999/150 and $5/5, $22/25, $48/60, $105/150 (D-036); purchased credits never expire. All sold through Chargebee, with Razorpay for INR and PayPal for USD (D-004, D-069). Basic referring is free with no referral payout (D-055). D-196 permits a future opt-in paid referrer plan with level-matched first access; it is unimplemented and its terms remain owner-controlled. Current runtime refuses referrer-role checkout before any provider call (`REFERRER_PURCHASES_ENABLED = false`; live since `08d193a0`).
- Usage panel + upgrade moments: `UPGRADE_NUDGES.md`.

## 10. Doc index
`SCREENS.md` (every route), `CHECKLIST.md` (build order), `docs/PRICING.md`, `UPGRADE_NUDGES.md`, `CHANGELOG.md` (latest design changes).

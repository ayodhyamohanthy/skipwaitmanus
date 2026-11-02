# SkipWait — Read This First (for AI coding platforms)

> Read [`docs/BRIEF.md`](docs/BRIEF.md) first (D-073), then `AGENTS.md`. The platform is already live: update it, do not rebuild it.
>
> **Owner says `build`, `resume`, `continue` or `next`?** Continue current work, never restart an old plan. First follow [the current-instruction preflight](./docs/BUILD_CONTINUITY.md) (D-225): fetch current main, read latest instructions and decisions plus the previous repo-only outcome, check goal alignment and ownership, then use `node scripts/next-task.mjs --claim "<your model name>"`. Read its assignment against those decisions before implementation; stale or conflicting context holds only the affected task. Claude handles intelligence/reasoning; other tools develop. Keep the picker's exact session-tagged name for later flags. The picker is not proof that the preflight was read.


You are turning the SkipWait **design preview** into a working product. The designs in `app/src/routes` are a reference, no longer the spec: Kit v4 is retired (D-120, Oct 21), the UI is designed for the goal: `DESIGN.md` + `design/goal-ui/DOCTRINE.md` are the one design, landing to platform (comps in `design/goal-ui/pick/`), migrating surface by surface (`docs/plans/GOAL_UI_MIGRATION.md`). Where this file conflicts with `docs/DECISIONS.md` or `AGENTS.md`, they win. Everything below is what the designs do NOT do, and what you must build or decide.

Read in this order: `AGENTS.md` and `docs/DECISIONS.md` (D-026) → this file → `LLM_HANDOFF.md` → `SCREENS.md` → `docs/PRICING.md` (the one pricing source, D-146) → `UPGRADE_NUDGES.md` → `CHECKLIST.md` → `CHANGELOG.md`.

---

## 1. Non-negotiable product rules
- Money, in one sentence: **"3 free credits every month; extra asks use credits. Referrers are never paid and never ask you for money."** (D-063 as worded by D-135). Never charge for, or let money influence, queue order, visibility, or a referrer's decision (D-006).
- Plans and packs sell credits: **1 credit = 1 ask**, spent only when a verified referrer can first see it; a seeker with no credit at that moment has the ask held, never delivered free or billed later (D-034, D-047; not built yet). Credits also pay for preparation tools, and paid plans add open asks.
- **Never fabricate** users, counts, activity, testimonials or outcomes. Any number shown must come from real data; if there is none, show the empty state that is already designed.
- Launch companies with real people open to referrals: SkipWait, Wipro, Neutrinos, TCS, Merkle. Do not invent people or counts for them.
- Seeker identity + resume and referrer name are hidden until the referrer **accepts**. Passing is private.
- Referrers verify with a **one-time code sent to their work email**.
- Never promise jobs/interviews. Companies decide hiring.

## 2. Everything in the preview is fake — replace it
Every screen uses local React state and example data. Remove all "DESIGN PREVIEW", "EXAMPLE …", and state-switcher chips (`StateChips` in `src/components/preview-kit.tsx`) once each screen is backed by real data. The switchers exist only to show you every state you must support — implement **all** of them.

Example data lives in: `src/lib/marketplace-data.ts`, `src/lib/monetization-data.ts`, and inline arrays inside route files (search for `const seed`, `const threads`, `const cases`, `const asks`, `const work`, `const receipts`).

## 3. Backend requirements (the backend is already live — update it toward these, do not rebuild it; some rows are decided but not built yet)
| Area | Requirements |
|---|---|
| Auth | Seekers: social logins (Google, Microsoft, GitHub, LinkedIn, Slack) or personal email (a six-digit code today; password sign-in comes with PR #324 after the D-057 session gate, D-049, D-163), hosted on skipwait.me. Referrers: the work-email code only, on every sign-in — never personal email, social login or password (D-030, D-049); a referrer may add a personal login inside the portal to keep their record across employers (D-057). Forgot/reset password (`/forgot-password`, `/reset-password`) with neutral "check your email" copy, 1-hour single-use link, sign out other sessions on reset. Onboarding (`/onboarding`) after first sign-in. |
| Roles | Store roles in a separate `user_roles` table. Admin pages (`/admin`, `/admin-review`) require server-verified admin role. Never check roles client-side only. |
| Work-email OTP | 6-digit code, hashed, 10-min TTL, max 5 attempts then 15-min lockout, resend after 30 s, rate-limit per email+IP. Block personal domains. Company domain allowlist (employers can add domains after DNS proof). Store only an HMAC of the email + company + verified_at. Re-verify every 90 days; on failure remove badge and return open asks. Unlisted domains → manual review queue. |
| Referral requests | Lifecycle and API values follow D-180; public wording uses “referral” / “referral request” (D-173/D-180), while internal IDs and routes may retain `ask`. D-174 suspends the 7-day visible expiry, 90-day waiting cap and day-30 closure as launch direction; those legacy clocks remain live runtime until `D-174-expiry-clock-removal` lands after `D-174-held-ask-reconfirm` (D-193), so describe them only as runtime caveats. Do not add an expiry rule or change slot/credit behavior by inference. Open-request allowances are in `docs/PRICING.md`; max 2 open requests per company (D-006). |
| Referrer decisions | Accept (requires ethics confirmation), Ask one question (anonymous), Pass (identity never shown; every decline keeps the credit spent, D-147), Mark referred (optional reference ID). Monthly capacity + pause. At capacity → stop routing new asks to them. |
| Messaging | Opens only after accept. Unified inbox (Asking/Referring). Report/block from any thread. |
| Notifications | In-app + email + Web Push (only after install + permission). Respect per-type toggles and quiet hours in user time zone. No marketing push ever. Templates: `/emails`. |
| Saved alerts | Company + function. Fire when a verified, discoverable referrer becomes available. Free 3 alerts, paid unlimited. |
| Payments | Only credit packs are currently sold (D-146); no fixed-term or annual plan product is for sale. D-132's Entry/Mid/Senior plans remain behind off flags. Basic referring stays free and referrers receive no payout (D-055). D-196 allows an opt-in paid referrer plan with level-matched first access, but it is unimplemented and its prices, contents and access window remain owner-controlled. Current runtime refuses referrer-role checkout before any provider call (`REFERRER_PURCHASES_ENABLED = false`). Keep frozen amounts and plan rules in `docs/PRICING.md`; purchased credits never expire. All checkout remains through Chargebee, with Razorpay for INR and PayPal for USD (D-004, D-069). Manage plan / cancel / pause / failed payment per `/billing`. Support UPI where available. |
| Safety | Reports with reasons, urgent SLA 4 h, normal 48 h, block both directions, reviewer note required, full audit log, 14-day appeal. |
| Companies | Suggestions (`/suggest-company`) with duplicate detection, 3/day limit, manual review. Employer workspace (`/employer`): aggregate stats only, cannot see/block individual asks, cannot pay for visibility. |
| Account | Data export ZIP within 24 h; delete account with typed confirm, 14-day grace, erase within 30 days; session list with sign-out. |
| Public profile | `/p/:handle` with visibility public / link-only (noindex) / private. |

## 4. PWA
Installable manifest, icons, offline fallback page, offline draft saving, Web Push, iOS "Add to Home Screen" guidance. Designs: `/app-states`.

## 5. Global readiness
i18n with RTL support (Arabic) — language preferences only until supply exists (D-059). Times in the user's time zone. **USD is the global display currency; India sees the INR "India price"** (D-005, D-007; Razorpay for INR, PayPal for USD, D-069).

## 6. Design system
- **D-120 (Oct 21 2026):** Kit v4 is retired. The goal-focused UI (`DESIGN.md` + `design/goal-ui/DOCTRINE.md`; D-071 comps in `design/goal-ui/pick/`, no compensation row) is the one design, landing to platform; surfaces migrate one at a time through the gate (`docs/plans/GOAL_UI_MIGRATION.md`). Until a surface migrates, its live tokens and components stay and nobody re-skins it ad hoc.
- Tokens in `src/styles.css` (light + dark). Never hardcode colors; use semantic tokens.
- Fonts: Instrument Sans (UI), IBM Plex Mono (labels).
- Brand: white, ink #141414, electric blue #0000FF, invitation yellow #FFFC52.
- Dark mode: toggle in Settings → App, stored as `sw-theme`; default to system preference in production.
- Known inconsistency to fix: older screens (Explore, Referrer, Plans, homepage) use bespoke CSS classes; newer screens use Tailwind + `preview-kit.tsx`. When building, converge on one component set (cards radius 24px, `Panel`, `Heading`, `Toggle`) without changing the look of the older screens.

## 7. Navigation (goal UI; D-120/D-150)
The goal navigation in `DESIGN.md` and `design/goal-ui/DOCTRINE.md` is current; each surface migrates through `docs/plans/GOAL_UI_MIGRATION.md` (D-048). Public labels use referral-only vocabulary per D-173/D-180; exact strings follow terminology and copy review. Until a surface migrates, its live tokens and components stay in place; no ad hoc reskin.

## 8. Accessibility
Every control named, every field labelled, mobile tap targets ≥ 44 px, visible focus, reduced-motion respected, contrast AA in both themes. Run axe in CI.

## 9. Placeholders the owner must supply
Final policy text (`/terms`, `/privacy`, `/guidelines` are drafts — legal review required; the live Terms/Privacy keep their live legal text, AGENTS.md §0a), email wording, support address (currently `hello@skipwait.me`), local prices beyond INR and USD (parked, D-053), real company logos (never on the indexable company pages, D-028).

## 10. Definition of done per screen
Real data, every designed state reachable naturally, no preview labels, works on 375 px and desktop, no horizontal scroll, both themes, keyboard + screen reader usable.

## Approved production stack (owner has credits/accounts)
Use these, free or money-earning options only (D-031); startup/student credits (GitHub Student Pack, Microsoft for Startups, Cloudflare) are money too — no purchase, paid activation or credit spend without the owner's approval (AGENTS.md §1).
| Need | Use | Notes |
|---|---|---|
| Hosting / edge / CDN / storage | Cloudflare | Workers/Pages, R2 for resumes & work files, Turnstile on sign-up/report forms |
| Overflow compute / AI | Azure | Azure OpenAI for Ask One-Pager, dossiers, coaching tools |
| Auth (sign-in) | WorkOS, hosted on skipwait.me (no authkit.app page) | Seekers: Google, Microsoft, GitHub, LinkedIn, Slack or personal email (six-digit code today; password after the D-057 session gate, D-049, D-163). Referrers sign in only with the work-email code (D-030, D-049) |
| Work-email verification | Own OTP flow, sent via ZeptoMail (Zoho) | `/verify`: 6-digit code to the work email proves employment and is the referrer's sign-in on every visit (D-030, D-049). Store hashed code, 10-min expiry, 5 tries, resend cooldown; never show the work email to seekers |
| Subscriptions & credits ledger | Chargebee (free to $1M), the only payment system (D-004, D-069) | D-132 plans behind off flags, no passes sold (D-146), credit packs as one-time charges (D-036), rollover rules, dunning (`/billing` states) |
| Payments | Razorpay (India: cards, UPI AutoPay, netbanking, wallets; also intl cards) + PayPal (outside India) | Wire through Chargebee gateways. Show methods as in `/billing` |
| Lifecycle email/push | Customer.io | Templates in `/emails`; transactional vs marketing separated; honour `/settings` notification toggles |
| Business email / support desk | Zoho | hello@ / support@skipwait.me, Zoho Desk for `/report` and help tickets |
| Product analytics | Cloudflare Web Analytics (free, cookie-free) plus server-side funnel counts in the admin baseline panel, aggregate only (D-054) | Only after consent (`ConsentBanner`, `/settings` Cookies & analytics). Never send resume text, emails, messages |
| Feature flags / experiments | Statsig | Pricing/copy experiments only, and no price experiments until two weeks of baseline data exist (D-056); never experiment on referral fairness or queue order |
| Errors | Sentry (org: skipwait) | Scrub PII; tie to "Error reports" toggle |
| APM / logs | Datadog or New Relic (pick one) | Server latency, OTP send success, payment webhooks |
| Dev tooling | GitHub Student Pack | Repo, Actions CI, Copilot, domain/SSL perks |

Rules: no secrets in client code; webhooks (Chargebee, Razorpay, PayPal, Customer.io, WorkOS) must verify signatures; analytics/error SDKs load only after consent where law requires (EU/UK/India DPDP).

See AGENT_ACCESS.md for assistant/MCP/API access rules.

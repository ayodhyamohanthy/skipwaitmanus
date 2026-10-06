# SkipWait — Step-by-Step Build Checklist

Hand this to your LLM together with `LLM_HANDOFF.md`, `SCREENS.md`, the `app/` source folder, and the screens PDF. Work through the steps in order. Do not skip ahead — each step depends on the one before it.

---

## Step 1 — Set up the project
- [ ] Create a new TanStack Start (React 19 + Vite) project, or reuse the included `app/` source as the starting point.
- [ ] Install dependencies (`bun install` or `npm install`).
- [ ] Confirm the app runs locally and the homepage loads.
- [ ] Copy the design system exactly: `src/styles.css` tokens (white #FFFFFF, ink #141414, electric blue #0000FF, invitation yellow #FFFC52), Instrument Sans + IBM Plex Mono fonts.

## Step 2 — Build all screens (design first, no backend)
- [ ] Public homepage at `/` (no app navigation).
- [ ] Sign-in at `/sign-in` (seeker/referrer intent, Google + email choices).
- [ ] App shell: desktop sidebar + mobile bottom tabs.
- [ ] Explore at `/explore` with search and filters.
- [ ] Company detail + referral request flow at `/explore/:slug` for all five companies: SkipWait, Wipro, Go Neutrinos, TCS, Merkle.
- [ ] My requests at `/requests`, inbox at `/inbox`, profile at `/profile`.
- [ ] Referrer workspace at `/referrer`, invite at `/invite`, safety at `/safety`.
- [ ] My work `/work`, Plans & credits `/plans` (per PRICING.md + UPGRADE_NUDGES.md), employer page `/for-companies`.
- [ ] Admin console at `/admin` (standalone shell, five sections).
- [ ] Check every screen against the screens PDF — web and mobile, top to bottom.

## Step 3 — Make it a PWA
- [ ] Add a web app manifest (name, icons, theme color, `display: "standalone"`).
- [ ] Add app icons for home-screen install.
- [ ] Only add offline/service-worker support if explicitly wanted — and never register it in preview/dev.

## Step 4 — Connect the backend (Lovable Cloud / Supabase)
- [ ] Auth: email + Google sign-in, connected to `/sign-in`.
- [ ] Database tables: profiles, companies, referrers (verified employees), referral requests, messages, reports, user roles (separate table, never on profiles).
- [ ] Row-level security on every table; users only see their own requests and conversations.
- [ ] Replace the demo data in `src/lib/marketplace-data.ts` with real company and referrer records.

## Step 5 — Wire the real flows
- [ ] Seeker: submit a referral request → track status → message the referrer → see the outcome.
- [ ] Referrer: verify employment → set capacity → accept or pass on requests → message seekers.
- [ ] Admin: approve companies and referrer verifications, handle safety reports, view honest growth numbers.

## Step 5b — Payments
- [ ] Subscriptions + credit packs checkout; credit ledger with plan-credit rollover and never-expiring purchased credits.
- [ ] Usage panel and limit-triggered nudges from real user data.

## Step 6 — Polish and launch
- [ ] Test every flow on desktop and phone.
- [ ] Check accessibility: labels, focus states, touch targets.
- [ ] Set unique page titles and descriptions on every route.
- [ ] Publish, then connect the skipwait.me domain.

---

## Rules that must never change
- Referrals are free. Always. No pay-to-win, no paid priority.
- Never invent users, counts, testimonials, response times, or outcomes.
- The five launch companies are SkipWait, Wipro, Go Neutrinos, TCS, and Merkle — shown as having people open to referrals, with no fabricated numbers.
- Private by default: seekers control what referrers see.

## Trust flows (backend notes)
- [ ] Work-email OTP: store only an HMAC of the email + company + verified_at; codes hashed, 10-min TTL, 5 attempts, 15-min lockout, resend after 30s, rate-limit per IP/email; reject personal domains; company domain allowlist; re-verify every 90 days.
- [ ] Thread: reveal seeker identity/resume and referrer name only after Accept; pass reason shared, identity never; auto-expire after 7 days and free the seeker's slot.
- [ ] Public profile: visibility public / link-only (noindex) / private; only work marked visible is rendered.

## Completion flows (backend notes)
- [ ] Ask quality checks run client-side and again server-side; location-fit uses seeker work authorization vs role location.
- [ ] Notifications: in-app + email + Web Push (only after install/permission), quiet hours in user time zone, no marketing push.
- [ ] Saved alerts fire when a verified, discoverable referrer at the company/function becomes available. Free 3 alerts.
- [ ] Reports: urgent SLA 4h, normal 48h; block hides both directions; reviewer note required; full audit log; 14-day appeal.
- [ ] i18n with RTL support; prices localized per currency at checkout; all times in user time zone.
- [ ] Account deletion: withdraw open asks, 14-day grace, erase within 30 days; data export ZIP within 24h.
- [ ] Accessibility: keep every control named, every field labelled, tap targets ≥ 44px on mobile; run axe in CI; check contrast in both themes.
- [ ] Theme: store choice per device (`sw-theme`), default to system preference once real.

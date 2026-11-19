# SkipWait — Read This First (for AI coding platforms)

> Read START_HERE.md first. The platform is already live: update it, do not rebuild it.


You are turning the SkipWait **design preview** into a working product. The designs in `app/src/routes` are approved. Copy, layout and flows are the spec. Everything below is what the designs do NOT do, and what you must build or decide.

Read in this order: this file → `LLM_HANDOFF.md` → `SCREENS.md` → `PRICING.md` → `UPGRADE_NUDGES.md` → `CHECKLIST.md` → `CHANGELOG.md`.

---

## 1. Non-negotiable product rules
- Asking for and giving referrals is **free forever**. Never charge for, or let money influence, queue order, visibility, or a referrer's decision.
- Paid plans/credits buy **preparation tools and more simultaneous open asks only**.
- **Never fabricate** users, counts, activity, testimonials or outcomes. Any number shown must come from real data; if there is none, show the empty state that is already designed.
- Launch companies with real people open to referrals: SkipWait, Wipro, Go Neutrinos, TCS, Merkle. Do not invent people or counts for them.
- Seeker identity + resume and referrer name are hidden until the referrer **accepts**. Passing is private.
- Referrers verify with a **one-time code sent to their work email**.
- Never promise jobs/interviews. Companies decide hiring.

## 2. Everything in the preview is fake — replace it
Every screen uses local React state and example data. Remove all "DESIGN PREVIEW", "EXAMPLE …", and state-switcher chips (`StateChips` in `src/components/preview-kit.tsx`) once each screen is backed by real data. The switchers exist only to show you every state you must support — implement **all** of them.

Example data lives in: `src/lib/marketplace-data.ts`, `src/lib/monetization-data.ts`, and inline arrays inside route files (search for `const seed`, `const threads`, `const cases`, `const asks`, `const work`, `const receipts`).

## 3. Backend to build (none exists)
| Area | Requirements |
|---|---|
| Auth | Email+password and Google. Forgot/reset password (`/forgot-password`, `/reset-password`) with neutral "check your email" copy, 1-hour single-use link, sign out other sessions on reset. Onboarding (`/onboarding`) after first sign-in. |
| Roles | Store roles in a separate `user_roles` table. Admin pages (`/admin`, `/admin-review`) require server-verified admin role. Never check roles client-side only. |
| Work-email OTP | 6-digit code, hashed, 10-min TTL, max 5 attempts then 15-min lockout, resend after 30 s, rate-limit per email+IP. Block personal domains. Company domain allowlist (employers can add domains after DNS proof). Store only an HMAC of the email + company + verified_at. Re-verify every 90 days; on failure remove badge and return open asks. Unlisted domains → manual review queue. |
| Asks (requests) | States: Requested → Accepted → Referred → Interviewing → Offer → Hired; terminal Declined, Expired, Withdrawn. Auto-expire after 7 days. Open-ask limits: Free 3, Start 8, Momentum 15, Land 30/50/unlimited. A slot frees when an ask is answered, passed, withdrawn or expires. Server-side quality checks mirror `/ask` (official link, 30–120 words, location fit). |
| Referrer decisions | Accept (requires ethics confirmation), Ask one question (anonymous), Pass with reason (reason shown to seeker, identity never), Mark referred (optional reference ID). Monthly capacity + pause. At capacity → stop routing new asks to them. |
| Messaging | Opens only after accept. Unified inbox (Asking/Referring). Report/block from any thread. |
| Notifications | In-app + email + Web Push (only after install + permission). Respect per-type toggles and quiet hours in user time zone. No marketing push ever. Templates: `/emails`. |
| Saved alerts | Company + function. Fire when a verified, discoverable referrer becomes available. Free 3 alerts, paid unlimited. |
| Payments | Plans monthly/yearly, credit packs, $1/credit retail, 3 free credits for everyone. Purchased credits never expire; plan credits roll over per `PRICING.md`. Manage plan / cancel / pause / failed payment per `/billing`. Support UPI where available. |
| Safety | Reports with reasons, urgent SLA 4 h, normal 48 h, block both directions, reviewer note required, full audit log, 14-day appeal. |
| Companies | Suggestions (`/suggest-company`) with duplicate detection, 3/day limit, manual review. Employer workspace (`/employer`): aggregate stats only, cannot see/block individual asks, cannot pay for visibility. |
| Account | Data export ZIP within 24 h; delete account with typed confirm, 14-day grace, erase within 30 days; session list with sign-out. |
| Public profile | `/p/:handle` with visibility public / link-only (noindex) / private. |

## 4. PWA
Installable manifest, icons, offline fallback page, offline draft saving, Web Push, iOS "Add to Home Screen" guidance. Designs: `/app-states`.

## 5. Global readiness
i18n with RTL support (Arabic). Times in the user's time zone. **USD is the default display currency**; local prices (e.g. INR) are shown only when the user picks a currency in Settings and are confirmed at checkout.

## 6. Design system
- Tokens in `src/styles.css` (light + dark). Never hardcode colors; use semantic tokens.
- Fonts: Instrument Sans (UI), IBM Plex Mono (labels).
- Brand: white, ink #141414, electric blue #0000FF, invitation yellow #FFFC52.
- Dark mode: toggle in Settings → App, stored as `sw-theme`; default to system preference in production.
- Known inconsistency to fix: older screens (Explore, Referrer, Plans, homepage) use bespoke CSS classes; newer screens use Tailwind + `preview-kit.tsx`. When building, converge on one component set (cards radius 24px, `Panel`, `Heading`, `Toggle`) without changing the look of the older screens.

## 7. Navigation (user-approved — do not change)
Sidebar: Explore, Requests, Inbox, Refer (→ `/referrer-home`) · "Your space": Profile, My work, Plans & credits · More: Help & safety, For companies. Admin is reachable only by direct URL `/admin`. Alerts bell in the top bar. Wallet merged into Plans.

## 8. Accessibility
Every control named, every field labelled, mobile tap targets ≥ 44 px, visible focus, reduced-motion respected, contrast AA in both themes. Run axe in CI.

## 9. Placeholders the owner must supply
Final policy text (`/terms`, `/privacy`, `/guidelines` are drafts — legal review required), email wording, support address (currently `hello@skipwait.me`), local prices, real company logos.

## 10. Definition of done per screen
Real data, every designed state reachable naturally, no preview labels, works on 375 px and desktop, no horizontal scroll, both themes, keyboard + screen reader usable.

## Approved production stack (owner has credits/accounts)
Use these; prefer startup/student credits (GitHub Student Pack, Microsoft for Startups, Cloudflare) before paid services.
| Need | Use | Notes |
|---|---|---|
| Hosting / edge / CDN / storage | Cloudflare ($10k credits) | Workers/Pages, R2 for resumes & work files, Turnstile on sign-up/report forms |
| Overflow compute / AI | Azure ($5k, exp Jun 14 2027; more via Microsoft for Startups milestones) | Azure OpenAI for Ask One-Pager, dossiers, coaching tools |
| Auth (sign-in) | WorkOS AuthKit | Google + email sign-in for all users. No SSO / sign-on with work email |
| Work-email verification | Own OTP flow, sent via ZeptoMail (Zoho) | `/verify`: 6-digit code to the work email proves employment only; it is NOT a login. Store hashed code, 10-min expiry, 5 tries, resend cooldown; never show the work email to seekers |
| Subscriptions & credits ledger | Chargebee (free to $1M) | Plans Start/Momentum/Land monthly+yearly, credit packs as one-time charges, rollover rules, dunning (`/billing` states) |
| Payments | Razorpay (India: cards, UPI AutoPay, netbanking, wallets; also intl cards) + PayPal (outside India) | Wire through Chargebee gateways. Show methods as in `/billing` |
| Lifecycle email/push | Customer.io | Templates in `/emails`; transactional vs marketing separated; honour `/settings` notification toggles |
| Business email / support desk | Zoho ($2,200, exp Jun 11 2027) | hello@ / support@skipwait.me, Zoho Desk for `/report` and help tickets |
| Product analytics | PostHog (primary, funnels/session replay with masking) ; Mixpanel board optional | Only after consent (`ConsentBanner`, `/settings` Cookies & analytics). Never send resume text, emails, messages |
| Feature flags / experiments | Statsig | Pricing/copy experiments only; never experiment on referral fairness or queue order |
| Errors | Sentry (org: skipwait) | Scrub PII; tie to "Error reports" toggle |
| APM / logs | Datadog or New Relic (pick one) | Server latency, OTP send success, payment webhooks |
| Dev tooling | GitHub Student Pack | Repo, Actions CI, Copilot, domain/SSL perks |

Rules: no secrets in client code; webhooks (Chargebee, Razorpay, PayPal, Customer.io, WorkOS) must verify signatures; analytics/error SDKs load only after consent where law requires (EU/UK/India DPDP).

See AGENT_ACCESS.md for assistant/MCP/API access rules.

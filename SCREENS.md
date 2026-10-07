# SkipWait — End-to-End Screen Map (Web + Mobile PWA)

Every screen below is a real route in `app/src/routes/`. All screens are
responsive: desktop uses a sidebar shell, mobile uses a bottom tab bar so the
PWA feels like a native app.

## Public website (no sign-in)
| Route | Screen | Purpose |
|---|---|---|
| `/` | Launch homepage | Door hero, how it works, seeker/referrer paths, privacy FAQ, CTA |
| `/sign-in` | Sign in | Choose seeker or referrer intent, Google or email, privacy cues |
| `/safety` | Safety & privacy | Trust promise, no public browsing of referrers |
| `/for-companies` | Employer sales page | Standalone, value props, pricing, demo form |

## Job seeker flow (app shell)
| Route | Screen | Purpose |
|---|---|---|
| `/explore` | Company discovery | SkipWait, Wipro, Go Neutrinos, TCS, Merkle with search |
| `/explore/$slug` | Company detail | Company profile + people open to referrals |
| `/requests` | Request tracking | Every referral request with status pills |
| `/inbox` | Conversations | Private chat previews with referrers |
| `/profile` | Profile & privacy | Identity, privacy controls, personal referral link |
| `/work` | My work | Profile-only showcase, add/import, pin, per-item privacy |
| `/plans` | Plans & credits | Start/Momentum/Land cards with in-card Monthly/Yearly, top credits chip, Add credits modal, usage panel, upgrade moments, signature tools, compare table, FAQ |

## Job referrer flow (app shell)
| Route | Screen | Purpose |
|---|---|---|
| `/referrer` | Referrer home | Benefits, 3-step guided preview (VisualJourney), invite CTA |
| `/invite` | Invite colleagues | Self-growth loop: invite coworkers to become referrers |

## Admin flow (standalone console, distinct shell)
| Route | Screen | Purpose |
|---|---|---|
| `/admin` | Operations console (direct URL only) | Companies, referrer verification, moderation |

## Key shared components
- `launch-page.tsx` — homepage
- `sign-in-page.tsx` — sign-in screen
- `skipwait-shell.tsx` — app sidebar + mobile tab bar
- `admin-shell.tsx` — admin console shell
- `visual-journey.tsx` — reusable 3-step guided sequences
- `company-card.tsx`, `status-pill.tsx`, `workspace-view.tsx`

## Mobile PWA notes
- Bottom tab navigation on small screens; sidebar on desktop.
- Touch targets ≥44px, no horizontal overflow at 360px width.
- All data is illustrative preview content, clearly labelled — never
  fabricated live counts or outcomes.

## Trust & marketplace screens (added)
| Route | Shell | What it covers |
|---|---|---|
| `/verify` | App | Referrer work-email OTP: pick company → work email (blocks personal domains, enforces company domain) → 6-digit code (paste, auto-advance, 30s resend, 10-min expiry, 5 tries then 15-min lockout) → verified badge preview; re-verify every 90 days. Preview code 123456. |
| `/thread` | App | One request thread, Seeker/Referrer view toggle. States: Requested, Accepted, Referred, Interviewing, Offer, Hired, Declined, Expired. Referrer: Accept (with ethics confirmation), Ask one question (anonymous), Pass privately (reason chips), Mark as referred (optional reference ID). Seeker: withdraw, progress updates. Identities/resume revealed only after accept. |
| `/p/$handle` | Standalone | Shareable public work profile. Owner/Visitor toggle; visibility Public / Link only / Private; seeker and referrer variants (referrer shows "Verified at X via work email"); pinned work; empty and private states. No feed, followers or likes. |

## Completion screens (added)
| Route | Shell | What it covers |
|---|---|---|
| `/onboarding` | App | Seeker first-run: goal → up to 3 roles + level → resume (upload/progress/error) → work links → location, countries, remote, work authorization → readiness checklist. Skip anytime. |
| `/ask` | App | Ask composer with live strength meter (official link, 30–120 words, specific proof, pinned work, location fit), location-mismatch warning, "Improve my note · 1 credit", referrer-view hint, sent state with slot count. |
| `/alerts` | App | Notification center (Today/Earlier, unread, mark all read, empty/caught-up) + saved alerts by company/function (pause, delete, add). Bell icon in top bar. |
| `/landed` | App | Post-hire: celebrate → thank referrer (private thank-you wall opt-in, no gifts/payments) → pay it forward (verify / remind after joining). |
| `/referrer-home` | App | Referrer daily view: new asks, expiring, capacity meter, re-verify banner, paused/at-capacity/new states, private thank-you wall and private record (never ranked). |
| `/report` | App | Report reason → details + block + "I feel unsafe" → what happens next timeline with SLA and reference. |
| `/settings` | App | Region (7 languages incl. RTL, time zone, local currency pricing, date format), notification types/channels/quiet hours, app, blocked people, data export, sessions, account deletion with typed confirm + 14-day grace. |
| `/app-states` | App | Phone frame gallery: Android/iPhone install, push permission, offline, slow connection, not found, error, payment failed (incl. UPI fallback), loading skeleton. |
| `/admin-review` | Standalone admin | Review queue: reports, verification exceptions (unlisted domain, bounced re-verify), company submissions; evidence, required reviewer note, decision actions, audit trail, appeal window. |

## Final set (added)
| Route | Shell | What it covers |
|---|---|---|
| `/inbox` | App | Redesigned unified messages list: All/Asking/Referring filter, search, unread, status pills, hidden-identity marker, empty state; opens `/thread`. |
| `/referrer-setup` | App | Post-verification: job areas + levels → monthly capacity → anonymous vs named → notifications → ready. |
| `/help` | App | Help centre: search, 5 categories, 14 FAQs, contact support, policy links. "Help & safety" in More opens it. |
| `/employer` | Standalone | Employer workspace: overview (stats, by-function chart or getting-started), referrers (by function, invite link/email), verified domains (DNS-confirmed), programme settings. Cannot see/block asks or pay for visibility. |
| `/emails` | Standalone | 12 email + push templates: code, welcome, accepted, passed, expiring, new ask, re-verify, alert match, weekly summary, receipt, payment failed, report outcome. |
| `/terms`, `/privacy`, `/guidelines` | Standalone | Draft policy pages with short-version summary and section nav. Need legal review. Linked from homepage footer. |
| 404 / error | Root | Branded "This door doesn't lead anywhere" and "Something went wrong on our side" pages. |
| Dark mode | Settings → App | Brand dark tokens (ink background, brighter blue, yellow accent), saved on device. Older screens with fixed colors still need tuning. |

## Remaining flows (added)
| Route | Shell | What it covers |
|---|---|---|
| `/requests` | App | Redesigned: open-slot meter (Free 3), in conversation, expiring; Active/Closed tabs; slots-full nudge; first-time empty state. |
| `/forgot-password` | Standalone | Email entry → neutral "check your email" (no account enumeration), 1-hour link. Linked from sign-in. |
| `/reset-password` | Standalone | New password + confirm with live rules, show/hide; expired-link state; success signs out other devices. |
| `/suggest-company` | App | Name + website + seeker/employee; duplicate detection against listed companies; review promise; 3/day limit; next step verify or invite. |
| `/billing` | App | Manage plan: current plan, upgrade/downgrade, cancel flow (reason → pause offer or "got a job" → confirm), payment-failed and cancelling states, card, receipts. Linked from /plans heading. |

## Assistant access
- /connect-assistant — OAuth consent (consent, signed out, not on Land, expired, approved, declined)
- /assistants — connected assistants, API tokens, activity log (Land/Momentum states)
- /approve — phone approval sheet for sends and credit spends (edit, sent, declined, slots full)
- /developers — standalone developer page
- /developer-console — register third-party apps/agents/MCP clients (6 states)

- / — public launch homepage (cookie consent banner on first visit)
- /wallet — redirects to /plans (credits live inside Plans & credits)

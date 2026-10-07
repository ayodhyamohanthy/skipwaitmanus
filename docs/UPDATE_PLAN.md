# SkipWait Kit v4 → Live Update Plan

> OWNER CALL (Oct 2026, written): kit v4 is up to date and overrides the past,
> including the Scoreboard rebrand on `main`. This branch continues kit-v4
> implementation. Merge/reconciliation with `main` (Scoreboard removal of
> `app/src/routes`, AGENTS.md churn) is an owner/integrator decision — this
> branch does not rewrite published history.

- Kit: v4 (7 Oct 2026, `START_HERE.md` + `SCREENS.md` + `app/` design source)
- Branch: `agent/opencode/kit-v4-update-plan`
- Base HEAD: `07cf59a` (`fix/unblock-main`); diverged from `origin/main`: 19 ahead / 3 behind.
- Behind commits are cosmetic + sync-only: `8390afe` (2-file design-token hex fix), `b81ef4b` (PR #142 merge), `4f9a1fd` (deploy sync log). No file overlap with this doc. `8390afe` must be integrated before Batch 1 (tokens).
- Coordination: `gh` CLI unavailable in this environment, so no GitHub issue/PR record could be posted. Working in isolation on docs-only scope; no code touched.

## Load-bearing discrepancies (kit assumption vs live reality)

Live wins each of these until the owner explicitly approves a migration, because the kit path would break production users or data. The kit still wins on design, copy, and UX flows.

| # | Kit claim | Live reality | Decision |
|---|---|---|---|
| D1 | `FOR_AI_BUILDERS.md` §3: "Backend to build (none exists)" | Backend exists and is mature: `server/_core/workosAuth.ts`, `server/_core/otpLogin.ts`, `server/workEmailOtp.ts`, `server/privateReferralRoutes.ts`, `server/employerRoutes.ts`, `server/dmRoutes.ts`, `server/followRoutes.ts`, `server/payments.ts`, `server/paymentWebhooks.ts`, `server/chargebeeRoutes.ts`, `server/jobLinkPreviewRoutes.ts`, `server/healthRoutes.ts`; 50+ tables in `drizzle/schema.ts` | ADAPT kit screens to live backend. Never rebuild auth, OTP, billing, or messaging. |
| D2 | Plans are Start / Momentum / Land / Concierge, $1/credit, 3 free credits (`PRICING.md`, `app/src/routes/plans.tsx`) | Live sells Pro / Max (₹599/$7, ₹1299/$15; 10/30 monthly credits) via `client/src/pages/Plans.tsx` + `/premium` ($1/credit) + `/pricing`; Chargebee test site, Razorpay + PayPal wired, gift checkout gated behind `VITE_GIFT_CHECKOUT_ENABLED` | OWNER DECISION. Do not rename plans or change credit math without a subscriber-migration + backfill plan. Kit `/plans` + `/billing` UX can be ported only onto approved plan definitions. |
| D3 | Auth is email+password + Google with kit-owned `/forgot-password` + `/reset-password` | Live sign-in is WorkOS AuthKit (`client/src/_core/auth.tsx`, `server/_core/workosAuth.ts`); WorkOS owns credentials. Dev-auth plane active locally without WorkOS keys. | OWNER/ARCH DECISION. Kit forgot/reset screens apply only if a password credential exists; otherwise they become WorkOS-delegated states, not new endpoints. |
| D4 | Feature flags via Statsig; lifecycle email via Customer.io; analytics via PostHog/Mixpanel | `.env.example` has NO Statsig, Customer.io, PostHog, Mixpanel, Datadog/New Relic keys. Present: `VITE_ANALYTICS_ENDPOINT` + `VITE_ANALYTICS_WEBSITE_ID`, `VITE_CLARITY_PROJECT_ID`, Sentry DSNs, `AI_PROVIDER_*` (model-agnostic router exists: `server/_core/modelRouter.ts`) | Verify in Batch 1. No experiment, email-template, or analytics code ships until the provider key + consent wiring (`ConsentBanner`, `/settings` Cookies & analytics) is confirmed. |
| D5 | Launch companies with people open to referrals: SkipWait, Wipro, Go Neutrinos, TCS, Merkle | Company coverage infra exists (`companyCoverage` tests, `employerRouting.ts`) but live discovery is job-first (`/jobs`, `/wall`), not company-first | Verify seeded company + referrer records before building `/explore`; never fabricate people or counts (kit rule + live copy-truth guards agree). |

## Kit route → live match (verdicts: unchanged · update · new · remove)

No `remove` verdicts: per kit rule, existing URLs keep working. Live-only routes are listed under Keep.

### Public (no sign-in)

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/` launch homepage | `client/src/pages/Home.tsx` at `/` | update | Port kit door hero, how-it-works, seeker/referrer paths, privacy FAQ, CTA + first-visit cookie consent banner. Keep SEO registry entry in `shared/publicRoutes.ts`. |
| `/sign-in` | None (WorkOS redirect + dev widget via `client/src/_core/auth.tsx`) | new | Dedicated intent-picker page (seeker/referrer, Google/email, privacy cues) that hands off to WorkOS. Must not create a parallel credential store. |
| `/safety` | None (`/privacy` is product-trust copy, `/support` is help triage — different purposes) | new | Trust promise + no-public-browsing page. |
| `/for-companies` | None (`/employer` is the workspace dashboard, not a sales page) | new | Standalone sales page + demo form; must not duplicate `/employer` dashboard. |

### Seeker (app shell)

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/explore` company discovery | None (`/jobs` + `/wall` are job-first; no company-first discovery with the 5 launch companies) | new | Search + company cards from real company/referrer records only. |
| `/explore/$slug` company detail | None (`/refer/:companySlug/:vanityAlias` is inbound fast-track, not a detail page) | new | Profile + people-open-to-referrals; counts only from verified records. |
| `/requests` | `client/src/pages/MyRequests.tsx` at `/requests` | update | Kit redesign: open-slot meter (Free 3), in-conversation, expiring; Active/Closed tabs; slots-full nudge; first-time empty state. Server slot rules already exist — wire, don't reimplement. |
| `/inbox` | `client/src/pages/MyCompanyInbox.tsx` at `/inbox` AND `client/src/pages/Messages.tsx` at `/messages` | update | Kit unified list (All/Asking/Referring, search, unread, status pills, hidden-identity marker) opening `/thread`. Open consolidation question: 2 live inboxes → 1 kit inbox needs a redirect + data-compat check. |
| `/profile` | None | new | Identity, privacy controls, personal referral link. |
| `/work` | None | new | Profile-only showcase (add/import, pin, per-item privacy). R2 storage exists for files. |
| `/plans` | `client/src/pages/Plans.tsx` at `/plans` (Pro/Max) + `/premium` + `/pricing` | update — BLOCKED on D2 | Kit layout/copy is portable; plan definitions, prices, and credit math are NOT until owner approves migration. |

### Referrer (app shell)

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/referrer` home | `client/src/pages/Referrer.tsx` at `/referrer` | update | Kit benefits + 3-step VisualJourney + invite CTA layered on live verify/capacity logic. |
| `/invite` colleagues | None (personal-invite claim exists: `PersonalInviteAttribution` in `App.tsx` → `/api/personal-invites/claim`) | new | Self-growth loop UI on top of existing invite infra. |

### Admin (standalone console)

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/admin` operations console | 10 granular consoles under `/admin/*` (`AdminActivity`, `AdminApprovalQueue`, `AdminPaymentsReview`, `AdminUsers`, `AdminSchema`, `AdminSmoke`, …) — no single `/admin` landing | update | Map kit console sections onto live consoles; add `/admin` index only as links to existing consoles. Delete nothing. `/admin-review` below is the queue piece. |

### Trust & marketplace

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/verify` work-email OTP | Backend complete (`server/workEmailOtp.ts`, `server/_core/otpLogin.ts`); UX fragments in `Referrer.tsx`/`Settings.tsx`; no dedicated page | update | Port full kit flow: company pick → work-email (personal-domain block, company-domain enforce) → 6-digit code (paste, auto-advance, 30s resend, 10-min expiry, 5 tries → 15-min lockout) → badge preview; 90-day re-verify. Preview code `123456` never ships. |
| `/thread` request thread | `client/src/pages/ReferralConversation.tsx` at `/conversation/:requestId` | update | Kit states (Requested → … → Hired, Declined/Expired), Seeker/Referrer toggle, ethics-confirm Accept, anonymous one-question, private Pass with reason chips, referred-with-ID, withdraw. Keep `/conversation/:requestId` working with a redirect. |
| `/p/$handle` public work profile | Partial overlap: `/share` hub + `/share-card/:token` (share cards, not work profiles) | new | Owner/Visitor toggle, Public/Link-only (noindex)/Private, seeker + referrer variants, pinned work, empty/private states. Resolve overlap with share-cards in batch scope. |

### Completion flows

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/onboarding` | `client/src/pages/Onboarding.tsx` at `/start` | update | Kit first-run (goal → roles+level → resume → links → location/auth → checklist, skippable). Keep `/start` with redirect. |
| `/ask` composer | `client/src/pages/ReferralRequest.tsx` at `/request` | update | Strength meter, location-mismatch warning, 1-credit improve, referrer-view hint, sent-with-slots state. Server quality checks mirror client. Keep `/request` with redirect. |
| `/alerts` | `client/src/pages/Notifications.tsx` at `/notifications` | update | Today/Earlier + unread + mark-all-read + saved alerts (pause/delete/add) + top-bar bell. Keep `/notifications` with redirect. |
| `/landed` post-hire | None | new | Celebrate → private thank-you (opt-in wall, no gifts/payments) → pay-it-forward verify. |
| `/referrer-home` daily view | Partial: `client/src/pages/ReferrerImpact.tsx` at `/referrer/impact` | update | New asks, expiring, capacity meter, re-verify banner, paused/at-capacity/new states, private wall + record (never ranked). |
| `/report` | None (user-facing; admin queue side exists) | new | Reason → details + block + unsafe flag → SLA timeline (urgent 4h / normal 48h) + reference. Wire to existing report/admin pipeline. |
| `/settings` | `client/src/pages/Settings.tsx` at `/settings` | update | Kit adds: region (7 langs incl. RTL, timezone, currency, date format), per-type/channel/quiet-hours notifications, app prefs, blocked, export, sessions, typed-confirm deletion + 14-day grace, assistants link, dark-mode toggle. Biggest settings delta in the kit. |
| `/app-states` PWA gallery | Partial: `client/src/pages/Offline.tsx` at `/offline` | new | Install (Android/iPhone), push permission, offline, slowারে, 404, error, payment-failed (+UPI fallback), skeleton. Keep `/offline` as the runtime fallback. |
| `/admin-review` queue | `client/src/pages/AdminApprovalQueue.tsx` at `/admin/approvals` | update | Reports, verification exceptions, company submissions; evidence, mandatory reviewer note, decisions, audit trail, 14-day appeal. Keep `/admin/approvals` with redirect. |

### Final set

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/referrer-setup` | None (capacity fragments in `Referrer.tsx` — verify in batch) | new | Job areas + levels → capacity → anonymous/named → notifications → ready. |
| `/help` centre | Partial: `client/src/pages/Support.tsx` at `/support` (triage, not a 14-FAQ centre) | new — merge TBD | Search, 5 categories, 14 FAQs, contact, policy links. Decide: replace `/support` content vs link. Keep URL. |
| `/employer` workspace | `client/src/pages/EmployerDashboard.tsx` + `/employer/talent` + `/employer/billing` + `/employer/opportunities` | update | Kit overview (aggregate stats only), referrers, DNS-verified domains, programme settings. Enforce kit constraints: no per-ask visibility, no blocking, no paid visibility. |
| `/emails` templates | None as a page (server email sending exists — ZeptoMail/Resend) | new | 12 email + push templates as preview gallery; production sends stay server-driven via existing providers. |
| `/terms` | `client/src/pages/Terms.tsx` at `/terms` | update | Kit draft structure (short summary + section nav). Content needs legal review before any copy change ships. |
| `/privacy` | `client/src/pages/TrustPrivacy.tsx` at `/privacy` (product-trust page) | update — merge TBD | Kit page is draft policy text. Different purpose from live page; likely both survive (policy vs trust-explainer) — owner call. |
| `/guidelines` | None | new | Draft community rules; legal review flag. |
| 404 / error | `client/src/pages/NotFound.tsx` (branded, has `notFound.brand.test.tsx`) | update | Align copy to kit ("This door doesn't lead anywhere" / "Something went wrong on our side") without dropping existing brand tests. |
| dark mode | `ThemeProvider` defaults light; partial token coverage | update | Kit brand dark tokens (ink bg, brighter blue, yellow accent), `sw-theme` device key, system-preference default. Batch 1 tokens work. |

### Remaining flows

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/forgot-password` | None | new — BLOCKED on D3 | Only if a password credential exists; WorkOS likely owns this. |
| `/reset-password` | None | new — BLOCKED on D3 | Same as above + sign-out-other-devices behavior must match session infra. |
| `/suggest-company` | None | new | Duplicate detection, 3/day limit, review promise → verify/invite next step. |
| `/billing` | None (plan mgmt lives inside `Plans.tsx`; `/pricing` is marketing) | new — BLOCKED on D2 | Current plan, upgrade/downgrade, cancel (reason → pause/got-job → confirm), payment-failed, cancelling, card, receipts. Plan definitions must match live billing first. |

### Assistant access (all new — no live surface)

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/connect-assistant` OAuth consent (6 states) | None (server has `server/_core/modelRouter.ts` + `server/ai.ts`; no consent UX) | new | Gated on Land/Concierge per kit change (Momentum removed). Human-confirmed sends only. |
| `/assistants` connections + tokens + activity | None | new | Same gating; activity log honesty rules apply. |
| `/approve` phone approval sheet | None | new | Edit/sent/declined/slots-full states; every agent send + credit spend needs approval (kit rule). |
| `/developers` page | None | new | Standalone developer page. |
| `/developer-console` register apps/agents/MCP | None | new | 6 states incl. unverified-app consent. API/MCP access rules per `AGENT_ACCESS.md`. |

### Redirect

| Kit route | Live match | Verdict | Note |
|---|---|---|---|
| `/wallet` → `/plans` | No `/wallet` in live router | new | Add redirect + regression test when porting plans UX. |

## Live-only routes — KEEP (not in kit, existing users/traffic depend on them)

- Referral entry: `/fast/:linkCode`, `/refer/:companySlug/:vanityAlias`, `/share-card/:token`, `/email-review/:linkToken`, `/share`, `/start`
- Messaging duality: `/messages` (+ `/inbox`) — consolidation is a batch decision, not a deletion
- Monetization: `/premium`, `/pricing` — untouchable until D2 resolved
- Job marketplace: `/wall`, `/jobs`, `/post-opportunity` — kit has no equivalent; out of scope, keep fully working
- Employer subroutes: `/employer/talent`, `/employer/billing`, `/employer/opportunities`
- Admin consoles: all 10 `/admin/*` routes
- Content/compliance: `/about`, `/contact`, `/support`, `/refunds`, `/shipping`, `/cancellations`, 3 guide routes, `/privacy` (live trust page), `/offline`, `/components` (dev-only)
- `shared/publicRoutes.ts` SEO registry must gain entries only for kit pages that are public + indexable; app-shell pages stay out.

## Backend / env verification backlog (for batches, not this doc)

1. Confirm Statsig SDK presence/absence (`package.json`, client/server imports); if absent, flags need an interim mechanism — never gate referral fairness logic behind experiments (kit rule).
2. Confirm Customer.io vs current lifecycle sender (ZeptoMail/Resend live); map 12 `/emails` templates to real triggers.
3. Confirm analytics stack (generic endpoint + Clarity vs PostHog/Mixpanel) and consent gating before any SDK loads.
4. Reconcile `8390afe` token fixes into Batch 1 baseline (already on `origin/main`).
5. Verify company seed records for the 5 launch companies; empty states ship where data is absent.
6. Verify Turnstile placement on sign-up/report forms per kit stack.

## Batch plan

- Batch 1 (authorized direction: tokens + shell): port `app/src/styles.css` tokens (light + dark) → live theme; converge `skipwait-shell.tsx` (sidebar + mobile tab bar, 44px targets, safe areas) onto live `App.tsx` shell without changing live route behavior. Targets: `@app/src/styles.css`, `@client/src/App.tsx`, live theme/css, shell components. Separate plan + inspect before edits.
- Later batches (one plan each, flagged, internal → 10% → 100%): public pages → seeker flows → trust flows → completion flows → admin deltas → billing (post-D2) → assistant access (post-gating + approval infra).
- Every batch: phone + desktop pixel check vs `screens/`, `pnpm check`, affected Vitest files, `node scripts/design-token-audit.mjs`, no preview chips/sample data in shipped output.

## Batch 1 record — shared app shell (foundation, dormant)

- Commit: shell component + tests (this section appended same change).
- Added `client/src/components/AppShell.tsx` (kit §7 navigation behavior on live DESIGN.md tokens) + `client/src/components/appShell.test.tsx` (3/3 pass).
- Visual-contract call: DESIGN.md wins over kit `app/src/styles.css` (frozen contract + token audit). Kit Instrument Sans / oklch / 1.5rem radius / blue-fill active states NOT ported. Recorded deviations: 5 mobile tabs (kit: 8), pale-blue active state, inline More disclosure on desktop, bell without unread fetch.
- Destinations are live routes only (/requests, /inbox, /referrer, /plans, /settings, /notifications, /support→help, /employer→companies). No link targets kit-only routes.
- NOT wired into `client/src/App.tsx`: live task pages are self-contained h-dvh layouts; each screen batch converts its page and opts in. Zero production visual change.
- Verification: token audit 0 findings on new files, `tsc --noEmit` clean, `git diff --check` clean.
- Carry-forward: bell unread count, dark-mode tokens, kit font/radius takeover (owner call, needs DESIGN.md amendment).

## Batch 2 record — /requests list UX + first shell adoption

- Commit: redesigned list on real data, wrapped in `AppShell` (this section appended same change).
- Rewrote `client/src/pages/MyRequests.tsx` (297 lines; `RequestRow` extracted): header + New ask → `/start`, live `SeekerCreditsCard`, meters (Open asks / In conversation / Unread updates — all computed from `/api/company-referrals/mine`), Active/Closed tabs, rows linking to `/conversation/:id` when messageable, inline referrer-message excerpt for non-pending rows, per-row Withdraw (pending + unclaimed) with confirm dialog + retryable failure alert + credit restore.
- Rewrote 3 test files preserving intent (empty honesty, failed-load retry + slow notice, withdraw offer/hide/confirm/restore/failure). Dropped: fabricated `data-skipwait-empty-preview` card (kit honesty rule — its assertion now verifies absence), detail-carousel selectors (timeline/history move to the /thread batch), Back button (shell owns nav).
- Deviations (server lacks primitives, no server changes in this batch): no slots x/3 meter or slots-full nudge (no open-ask cap enforced anywhere — needs product/server decision); no "Expiring soon" (no `expiresAt`, no expired status); Closed = declined/closed/withdrawn; New ask → `/start` until `/explore` ships; per-request status timeline deferred to /thread batch.
- Structural note: first draft hit a TSX parse failure in deeply nested ternary+fragment+map JSX; rewrote with `RequestRow` + if/else body (also better sizing). Exact trigger unidentified — flagged if it recurs.
- Verification: 13/13 tests (3 files + shell), `tsc --noEmit` clean, token audit 0 findings, `git diff --check` clean.
- Visual check vs `screens/06_requests*` pending — no screenshot harness in this environment; needs phone (360px) + desktop pass before rollout.
- Carry-forward: /thread batch (full detail + withdraw re-home + timeline), server open-ask cap + expiry decisions.

## Batch 3 record — kit v4 visual-contract takeover (foundation)

- Owner order: kit v4 overrides the past design. Recorded in `DESIGN.md` header (AGENTS.md freeze amended for visual tokens only).
- `client/src/index.css` rewritten to kit tokens (oklch `@theme`, `.dark` block dormant, Instrument Sans + IBM Plex Mono via fontsource, `--radius: 1.5rem`, kit focus/base). Transitional `--color-*` aliases kept for unconverted pages so they render unchanged.
- Installed `@fontsource/instrument-sans` + `@fontsource/ibm-plex-mono` (owner-approved; caret convention; `package.json` + `pnpm-lock.yaml`). Note: repo `pnpm` shim cannot parse the `packageManager` hash field — used `COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm@10.34.6`.
- `scripts/design-token-audit.mjs` now carries a documented migration union (kit `#141414` added; legacy hexes still pass until per-batch conversion removes them; final batch tightens to kit-only).
- Per-page hardcoded hexes (~1,500 in 64 files) convert inside their screen batches — not here.
- Carry-forward: tighten audit at final batch; dark-mode switchable toggle is a later settings batch.

## Batch 4 record — /thread on /conversation/:requestId (full kit fidelity)

- Commit: kit thread UX on real data, shell-wrapped (this section appended same change).
- New `client/src/lib/threadApi.ts` (role resolution: mine → seeker, preview → referrer-pending, detail → referrer-claimed; one-click review, progress, withdraw, conversation helpers).
- Rewrote `client/src/pages/ReferralConversation.tsx` (kit header, stage bar, ask bubble, messages, decision aside, counterpart card, ethics banner; no View-as toggle — role comes from data; no state chips, no sample names/messages).
- New `client/src/components/thread/ThreadDecisionPanels.tsx` (seeker waiting/withdraw/progress/terminal panels; referrer accept w/ ethics gate, pass w/ 5 kit reasons → server `role_not_a_fit|cannot_support|timing`, mark-as-referred → `intro_made`).
- `server/db.ts`: additive SELECT columns only (`title`+`pitch` on mine-list, `title` on preview). No schema change, no migration.
- `client/src/index.css`: ported kit classes used here (brand-button, company-mark, eyebrow, text-link, modal-backdrop, app-dialog, dialog-close, status-pill + live-state variants).
- `MyRequests.tsx`: all rows now link to the thread (it handles every state).
- Deviations (no server primitive, recorded gaps): ask-one-question omitted (no endpoint), reference-ID input omitted (no storage), expiry copy/states omitted (no expiry), referrer names never shown to seeker (not exposed), `/report`+`/landed`+dossier links omitted (routes don't exist), closed renders as "Request closed" not "Hired", pass-via-review sets terminal declined while one-click pass keeps the request active for others (server semantics preserved).
- Verification: 20/20 client tests (7 new thread tests), affected server tests 7/7, `tsc` clean, audit clean, `vite build` ok.
- Visual check vs `screens/08_thread*` pending — no screenshot harness in this environment.
- Carry-forward: server ask-one-question endpoint, reference-ID storage, expiry policy, `/report`+`/landed` batches.

## Batch 5 record — /verify work-email OTP (full kit fidelity)

- Commit: kit verify flow on the live OTP backend, shell-wrapped (this section appended same change).
- New `client/src/pages/Verify.tsx` + `verify.test.tsx` (5/5): company picker (5 launch companies per spec), work-email validation (format, personal-domain block, company-domain match), 6-digit code UX (paste, auto-advance, resend timer), 5-attempt lockout copy, verified badge preview, server-driven re-verify date. No `123456` demo code, no preview state chips.
- Server used as-is: `POST /api/work-email/otp/send|verify` (rate-limit, TTL, lockout all server-enforced).
- Deviations: done CTA → `/referrer` until `/referrer-setup` ships (swap recorded); suggest-company link omitted until that batch; Go Neutrinos domain `goneutrinos.com` is a kit-spec assumption needing owner confirmation.
- Carry-forward: `/referrer-setup` (+ referrer-preferences persistence endpoint — none exists), re-verify-due surfacing in referrer-home batch.
- Verification: 5/5 tests, `tsc` clean, audit clean.

## Batch 6 record — /ask composer (full kit fidelity)

- Commit: kit ask composer on the live referral + upload + smart-pitch backends, shell-wrapped.
- New `client/src/pages/Ask.tsx` + `ask.test.tsx` (5/5): official-link check (shared URL validator), 30–120-word + specific-proof strength meter, compensation, resume upload (same chunk-encryption protocol as ReferralRequest, contained single-file flow), free "Draft from my resume" (smart-pitch endpoint, honestly labeled — no credit claim), send with Idempotency-Key + fast-track + company-confirm compatibility, sent state with real thread link + open-ask count, server credit errors surfaced verbatim.
- Omitted (no primitive, recorded): location-fit vs profile work-auth, pinned work showcase, credit-charged improve (no endpoint), slot denominator (no cap).
- `/request` stays untouched (owner to decide merge/redirect later).
- Verification: 5/5 tests, `tsc` clean, audit clean.

## Batch 7 record — /explore + /explore/:slug (full kit fidelity)

- Commit: kit company directory on live jobs data, shell-wrapped.
- New `client/src/lib/companies.ts` (spec launch set + job-company matcher — fixed a real TLD-strip ordering bug found by tests), `Explore.tsx`, `ExploreCompany.tsx`, `explore.test.tsx` (5/5).
- Real open-role counts per company from `/api/jobs`; role list with save toggles on the live saved-roles endpoint; unknown slugs get an honest not-found view.
- Deviations: availability claims use real role counts (no public referrer-coverage endpoint exists — "people open" copy would be fabricated); safety link omitted (no `/safety` yet); save toggles render only when signed in.
- Real production bug fixed: saved-roles load effect looped on unstable `getToken` identity (request storm + clobbered PUT state) — stabilized with `usePersistFn`, the same guard MyRequests uses.
- Verification: 5/5 tests, `tsc` clean, audit clean.

## Batch 8 record — /alerts notification center (full kit fidelity)

- Commit: kit alerts UX on the live notifications backend, shell-wrapped; `/notifications` redirects to `/alerts`.
- New `client/src/pages/Alerts.tsx` + `alerts.test.tsx` (5/5): Today/Earlier groups from real timestamps, All/Unread filter with count, per-row mark-read + category routing (reused live mapping: status→requests, system→settings, work-email→inbox), parallel mark-all-read, truthful empty states, settings link.
- Omitted: Saved alerts tab (no backend — no table, no firing job; a local-only tab would be fake functionality). Carry-forward with server build-out.
- Shell bell now points at `/alerts`. Old `Notifications.tsx` kept (owner decides removal); its tests untouched.
- Verification: 8/8 tests (incl. shell), `tsc` clean, audit clean.

## Batch 9 record — /onboarding profile setup + shared resume-upload lib

- Commit: kit onboarding flow with device-local persistence + real resume upload; `/start` flow untouched.
- New `client/src/lib/resumeUpload.ts` (validated + chunk-encrypted upload shared by Ask and onboarding); `Ask.tsx` refactored onto it (5/5 ask tests still green, no behavior change); live `ReferralRequest.tsx` deliberately untouched.
- New `client/src/pages/ProfileSetup.tsx` on `/onboarding` (`profileSetup.test.tsx` 3/3): goal/roles-≤3/level/resume/links/location/ready-checklist, skip-anytime, `localStorage` draft (same honest device-local pattern as other drafts), real upload when signed in.
- Critical save: kit source initially overwrote live `Onboarding.tsx` (`/start` funnel) — caught on re-read, restored from git, kit page lives in `ProfileSetup.tsx`. Live onboarding tests green.
- Carry-forward: server profile backend to sync the device draft (goal, roles, links, location, work-auth).
- Verification: 18/18 tests (incl. live onboarding + ask suites), `tsc` clean, audit clean.

## Batch 10 record — /inbox unified thread list (full kit fidelity)

- Commit: kit All/Asking/Referring list on live data; decision queue moved to `/queue` untouched.
- New `client/src/pages/UnifiedInbox.tsx` + `unifiedInbox.test.tsx` (5/5): asking rows from mine-list (unread, status notes), referring rows from inbox new+completed scopes ("Seeker · identity hidden", never named), search, unread highlighting, review-queue entry card for verified referrers, honest empty state.
- `/inbox` now serves the kit list (kit IA wins); `MyCompanyInbox.tsx` moved to `/queue` with zero behavior/test changes (auth, pending, unhandled suites green).
- Deviations: no per-row last-message text on referring rows (no bulk message endpoint — status notes used); DMs stay separate at `/messages`.
- Verification: 15/15 tests (incl. all queue suites), `tsc` clean, audit clean.

## Batch 11 record — /profile + /work + /p/:handle with profile backend

- Commit: kit profile surfaces on a new additive backend (migration + endpoints + pages).
- Schema (additive only): `profiles.handle` (unique nullable) + `profiles.profileVisibility` (public/link/private, default private); new `workItems` table. Shipped `drizzle/deploy/0065_profile_work_items.sql` + `DESIRED_*` entries — deploy-guard test green.
- New `server/profileRoutes.ts` (me read/update, work CRUD with ownership + 20-cap + URL validation, public handle lookup with visibility gating + noindex header for link-only) wired in `_core/index.ts`; `profileRoutes.test.ts` contract suite (validation edges, reserved/taken handles, ownership 404s, public gating without sign-in).
- Pages: `Profile.tsx` (edit, visibility radios, handle + copy link, verify state), `Work.tsx` (add/pin/per-item visibility/delete, empty state), `PublicProfile.tsx` (owner/visitor, verified badge from real verification, noindex effect). Shell gains Profile + My work (tabs unchanged).
- Deviations: display name is read-only (from sign-in account); no "open to roles" chips (no server roles — onboarding sync is future); owner/visitor toggle omitted (role from data).
- Verification: 19/19 tests (client + server + guard), `tsc` clean, audit clean.

## Batch 12 record — /referrer-home + /invite (full kit fidelity)

- Commit: kit referrer daily view + colleague invites on live backends; shell Refer now points at `/referrer-home`.
- New `ReferrerHome.tsx` + `Invite.tsx` + `referrerHome.test.tsx` (6/6): verified badge from access API, new-asks list from inbox scope, in-review + capacity meter from impact + profile capacity, 90-day re-verify banner from the real verified date, private record from impact numbers, invite link from personal-invites API with copy/share/email.
- Deviations: no Pause (no pause endpoint), no thank-you wall (no thank-you store), no expiring panel (no expiry), no ask-strength/expiry row data (not exposed), capacity is a display value (no adjust endpoint — lands with referrer-setup prefs), request-a-company mode omitted until suggest-company backend exists.
- Verification: 9/9 tests (incl. shell), `tsc` clean, audit clean.

## Batch 13 record — /settings shell adoption + profile shortcut

- Commit: settings wrapped in shell with a profile-visibility shortcut; all live sections untouched.
- `Settings.tsx` gains one kit-token section (Edit profile / Manage work links); App route shell-wrapped. All 4 settings suites green unchanged.
- Kit sections NOT shipped (no backends — recorded as the largest backend gap cluster): Region/i18n, notification toggles, dark toggle, sessions list, blocked list, assistants link, consent controls. Each needs server persistence + send-site enforcement, not local toggles that would lie.
- Verification: 9/9 settings tests, `tsc` clean, audit clean.

## Batch 14 record — trust cluster: /safety + /help + /landed + /sign-in

- Commit: four kit screens on live truth, no preview devices.
- `Safety.tsx` (standalone): 6 FAQs with stale pre-launch copy corrected to live behavior; no design-note banner.
- `Help.tsx` (shell): 14 FAQs with plan/expiry/report/block answers rewritten to live truth (no Momentum/Land claims, no 7-day expiry, support instead of missing report UI, no guidelines link until legal batch); search + categories; support + live-policy links.
- `Landed.tsx` (shell): celebrate → copyable thanks (clipboard is the real action; no wall store, no reminder backend) → pay-it-forward. No fabricated role/company/person, no wall opt-in.
- `SignIn.tsx` (standalone): intent picker + WorkOS continue (no password form — D3; no forgot link).
- Verification: 4/4 tests, `tsc` clean, audit clean.

## Batch 15 record — /report + /suggest-company with safety backend

- Commit: kit report/suggest flows on a new additive intake backend.
- Schema: `safetyReports` + `companySuggestions` tables; `drizzle/deploy/0066_*.sql` + `DESIRED_*` entries — guard green.
- New `server/safetyRoutes.ts` (report intake with membership checks + 20/day guard, suggestion intake with URL validation + 3/day + duplicate detection) + contract tests; wired in `_core/index.ts`.
- Pages `Report.tsx` (reasons/details/urgent/SLA timeline/real reference) + `SuggestCompany.tsx` (duplicate detection vs launch set, role, limit errors) + tests; thread banner links `/report`.
- Deviations: block toggle omitted (no block infra — page states team-handled blocking honestly); admin review UI for these queues is future (admin-review batch); suggest approval has no auto-promotion.
- Verification: 19/19 tests (client + server + guard + thread), `tsc` clean.

## Batch 16 record — /referrer-setup + referrer-preferences backend (incl. real pause)

- Commit: kit setup flow on a new prefs backend with enforced pause; verify-done now routes to setup.
- Schema (additive): `profiles.preferAreas/referrerVisibility/notifyNewAsk/notifyDigest/paused`; `drizzle/deploy/0067_*.sql` + `DESIRED_*` — guard green.
- `GET/PUT /api/referrer-preferences` (capacity 1–15, area allowlist, visibility enum, booleans) + contract tests; paused + notify-off referrers are excluded from review-email routing in `prepareReferrerReviewEmailNotifications` (Slack follows automatically — no link, no ping).
- Pages: `ReferrerSetup.tsx` (5 steps, verified-gate, persists to API) + tests; `ReferrerHome` gains paused banner with Resume + Pause actions (tested).
- Deviations: areas stored for future matching (jobs carry no function taxonomy — no fuzzy routing by design); levels step omitted (no seniority-match consumer); digest toggle omitted (no digest sender); live `/referrer` hub kept as-is (it exceeds kit functionally — setup linked from verify).
- Verification: 10/10 setup+home tests, prefs contract tests, delivery/review suites green, `tsc` clean, audit clean.

## Batch 17 record — /for-companies sales page (employer workspace untouched)

- Commit: standalone kit sales page on live truth.
- `ForCompanies.tsx` + test: hero, launch-company names (no counts), honest value props (rewritten — no ATS/campaign claims), fairness band, pricing replaced with live `/pricing` + `/employer` links (no sample prices), demo form as `mailto:` (nothing submitted silently).
- Live employer workspace (sponsorships, talent unlocks, billing) deliberately untouched — recorded as owner call D6: kit forbids paid visibility while live B2B sells sponsored placement. Same class of conflict as D2 billing.
- Verification: 1/1 test, `tsc` clean, audit clean.

## Batch 18 record — /admin-review console on dedicated review endpoints

- Commit: kit review queue (reports + company suggestions) with evidence, note-required decisions, reporter notifications, and audit info.
- Server: `list/review` admin fns with terminal-state protection + reporter/suggester notifications; admin-role gate with 401/403 split; wired via `safetyRoutes.ts`.
- Page `AdminReview.tsx` (standalone dark console): tabs with counts, SLA badges (urgent 4h), evidence, decisions gated on reviewer note, terminal panels, appeal-via-support note, admin gate without leaking contents.
- Verification: 14/14 tests (client + server + guard), `tsc` clean, audit clean.

## Batch 19 record — /app-states + /emails + /developers

- Commit: system galleries and developer contract page, no invented behavior.
- `AppStates.tsx`: all 9 kit states in phone frames; install prompt and push permission are REAL (beforeinstallprompt listener, Notification.requestPermission); payment-failed links live `/premium`.
- `Emails.tsx`: 12 transactional templates mapped to real server triggers (evidenced from send sites); labeled internal reference; no sample mail.
- `Developers.tsx`: assistant contract page that states the backend as pending (consent service, token ledger, audit log) instead of faking OAuth/token/approval flows. connect-assistant/assistants/approve/developer-console stay parked behind that build-out.
- Legal pages (`/terms`, `/privacy`, `/guidelines` copy): deliberately untouched — live copy stands until legal reconciles it with kit drafts.
- Verification: 3/3 tests, `tsc` clean, audit clean.

## Batch 20 record — full-gate fixes (deploy lint, reconcile dupes, route tables)

- Commit: repair-only batch after the full suite caught 4 regressions from earlier batches.
- `drizzle/deploy/0065+0067`: bare ALTER/CREATE INDEX rewritten as information_schema-guarded PREPARE blocks (lint gate green).
- `server/schemaReconcile.ts`: removed duplicated DESIRED entries from insertion scripts.
- `functions/_middleware.ts`: all kit routes registered as known patterns (SEO contract green).
- `server/notificationCenterUi.test.ts`: safeguard updated to the /alerts center + /notifications redirect.
- Verification: full suite 1130 passed / 16 skipped / 0 failed, `vite build` ok, audit clean on 182 files.

## Kit v4 coverage — complete per owner order

Every kit route is implemented, redirected, deliberately deferred with a recorded backend gap, or blocked on an owner call:

| Kit route | Status |
|---|---|
| `/`, `/requests`, `/inbox`, `/referrer`, `/plans`, `/settings`, `/privacy`, `/terms`, `/employer`, `/admin/*`, `/messages`, `/premium`, `/pricing`, `/wall`, `/jobs`, `/share`, `/support`, `/about`, `/contact`, `/offline`, guides, policies | Kept working, untouched |
| Shell, `/verify`, `/ask`, `/explore`, `/explore/:slug`, `/conversation` (thread), `/alerts` (+`/notifications` redirect), `/onboarding`, `/profile`, `/work`, `/p/:handle`, `/referrer-home`, `/invite`, `/referrer-setup`, `/report`, `/suggest-company`, `/admin-review`, `/safety`, `/help`, `/landed`, `/sign-in`, `/for-companies`, `/app-states`, `/emails`, `/developers` | Shipped on real data |
| `/queue` | Moved decision queue (was `/inbox`) |
| `/wallet` | Never existed live; redirect added with plans work (pending) |
| `/connect-assistant`, `/assistants`, `/approve`, `/developer-console` | Parked: no consent/token/MCP backend exists |
| `/plans` redesign, `/billing` | BLOCKED — owner call D2 (live Pro/Max vs kit Start/Momentum/Land) |
| `/forgot-password`, `/reset-password` | BLOCKED — owner call D3 (WorkOS owns credentials) |
| `/terms`, `/privacy`, `/guidelines` copy | Untouched — live copy stands until legal reconciles kit drafts |

Open owner calls: D2 billing migration, D3 password flows, D6 employer paid-visibility conflict, Scoreboard/`main` merge reconciliation, visual phone+desktop pass vs `screens/` (no harness in this environment).

## Batch 21 record — landing page rebuilt exactly per kit

- Commit: `/` rewritten to the kit launch page (header, door hero, trust strip, launch companies, VisualJourney steps, referrer band, privacy, FAQ, final CTA, footer) with kit CSS ported verbatim and the real door asset.
- `Home.tsx` rewritten; `VisualJourney.tsx` ported (plain buttons); `client/public/launch-door.jpg` added; launch + journey CSS appended to `index.css`.
- Kept live behaviors: signed-in workspace strip, real accepted-referrals impact line, kit SEO head (shared `landingContent` untouched — sitemap/prerender contract intact).
- Deviations: consent banner omitted (wiring it into Sentry/Clarity init is a legal/product call — own batch); guides section dropped from footer (routes still live); footer uses Safety instead of missing Guidelines.
- Home test suites rewritten to the kit contract (menu, destinations, FAQ JSON-LD, footer, workspace gating).
- Verification: 11/11 home tests + neighbors green, `tsc` clean, audit clean.

## Batch 22 record — v4 rollout merge (kit replaces everything)

- Commit: merged `origin/main`, resolved all design conflicts for kit v4, re-skinned remaining Scoreboard surfaces, redirected `/request` → `/ask`, amended contracts.
- Merge: `origin/main` reconciled in; kit versions kept for all 7 conflicted design files; production infra/docs from main preserved (incl. audit regex fix).
- Re-skin: mechanical Scoreboard→kit hex map over 56 files + manifest/index.html theme colors; audit clean.
- `/request` redirects to `/ask` (component + its tests intact).
- `AGENTS.md` styling boundary amended to kit v4 by explicit owner order.
- Scoreboard-landing test rewritten to the kit composition contract (same anti-fabrication intent).
- Verification: full suite green, `tsc` clean, audit clean.

## Batch 23 record — dot-to-dot fidelity pass (shell + explore)

- Commit: shell and explore rebuilt to exact kit markup/CSS after screenshot comparison.
- `AppShell.tsx` rewritten to kit `skipwait-shell` exactly (blue active item, free-promise block, More dropdown via Radix, 8 mobile tabs, drawer+scrim, topbar, footer); destinations live, signed-in account controls where kit shows Sign in.
- `Explore.tsx` rewritten to kit cards (availability pill, checkmarked functions, View-open-door button), yellow employee band, trust row, kit heading/search/filters; `/invite` for company requests.
- CSS: ported all 52 shell rules + missing launch grid rules verbatim; verified zero missing selectors for launch/shell/company families.
- `ExploreCompany.tsx`: added kit safety-guide link.
- Verification: shell + explore suites green, `tsc` clean, audit clean.

## Batch 24 record — dot-to-dot fidelity pass 2 (sign-in)

- Commit: sign-in rebuilt to the exact kit split design (yellow story panel, door art, proof card, intent switch, context banner, Google/email continuations, create-account row, terms).
- Ported all 67 kit auth rules verbatim; door art reused from public assets.
- All three continuations route through WorkOS `startLogin` (Google + email live in AuthKit; no password form per D3).
- Verification: sign-in + trust suites green, `tsc` clean.

## Batch 25 record — dot-to-dot fidelity pass 3 (ask, requests, onboarding, detail)

- Commit: field shapes, rows, pills, tabs, and cards matched to reference PNGs.
- `Ask.tsx`: pill inputs, rounded note area, kit aside structure kept.
- `MyRequests.tsx`: kit header/meters/tabs/rows with icon status pills and job titles; credits card and withdraw flow preserved; New ask → `/explore`.
- `ProfileSetup.tsx`: kit card radius and type scale on goal step.
- `ExploreCompany.tsx`: kit safety-guide link restored.
- CSS: directory tabs, live-status pill variants, and supporting rules ported.
- Verification: requests suites green, `tsc` clean.

## Batch 26 record — dot-to-dot fidelity pass 4 (alerts, verify)

- Commit: category icons on alert rows; verify pill buttons and suggest-company link per PNGs.
- Verification: 15/15 tests, `tsc` clean.

## Batch 27 record — dot-to-dot fidelity pass 5 (referrer-home)

- Commit: kit header copy, meter icons, aside-bottom pause control per PNGs. Record labels stay on real impact fields.
- Verification: 7/7 tests, `tsc` clean.

## Batch 28 record — dot-to-dot fidelity pass 6 (thread)

- Commit: ghost-style Pass privately per PNG; ethics banner links “Report or block”.
- Ask-one-question stays omitted (no anonymous pre-accept messaging endpoint — dedicated backend batch).
- Verification: 7/7 thread tests, `tsc` clean.

## Verification for this doc

- [x] `git status --short` clean; branch `agent/opencode/kit-v4-update-plan` from `07cf59a`
- [x] Every `app/src/routes/*.tsx` file mapped above (44 route files + wallet redirect + dark mode + 404)
- [x] Every live `App.tsx` route accounted for (keep list)
- [x] D1–D5 discrepancies recorded with live file evidence
- [ ] Owner calls needed: D2 (billing migration), D3 (password flows), `/privacy` merge, `/inbox`+`/messages` consolidation, `/help` vs `/support`

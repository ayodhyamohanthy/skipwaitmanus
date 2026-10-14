# Kit v4 fullstack build — living plan and handoff (read before any change)

This is the shared, living plan for implementing every kit v4 screen (`screens/web` 105 PNGs at 1280, `screens/mobile` 106 PNGs at 390 @2x) fullstack. **Any AI coding platform or human continuing this work reads this file, `AGENTS.md` and `COLLABORATION.md` first.**

**Owner rule (Oct 14 2026): update this file (and the short summary in `AGENTS.md`) FIRST — before editing code — and get it onto `main`, so another platform can finish the work if a session stops.** Claim a step in the Status table before starting it; record decisions, commits, migrations and owner actions as you go. Update it again after every push.

## 1. Owner decisions (binding)
Oct 9 2026:
- Implement every screen "as it is", fullstack: if a PNG state needs server data, tables, endpoints or jobs, build them.
- The PNGs win over earlier founder calls (trust strip, door crop, guidelines text, example pricing, Region tab, …). Exception: founder edits committed to `main` after Oct 9 (e.g. Explore heading "Where would you love to work next?", landing door below the copy) are the newest word — keep them.
- Never ship kit preview scaffolding: "DESIGN PREVIEW"/"Preview state" chips, "EXAMPLE"/"DRAFT" banners, sample people or numbers.
- Terms and Privacy keep the binding live legal text inside the kit layout; Guidelines uses the kit text.
- Build WorkOS password sign-in with forgot/reset password.
- Push each verified group straight to `main` (auto-deploys).

Oct 14 2026 (pricing; full reasoning and sources in `docs/PRICING_RECOMMENDATION.md`):
- **Billing shape:** 30-day and 90-day passes paid once; auto-extend opt-in only where the payment method can renew without extra authentication (INR UPI AutoPay ≤ ₹5,000; INR card/netbanking mandate ≤ ₹15,000; USD one-time until PayPal reference transactions or a card route are confirmed). Yearly only for "Keep warm". The Plans toggle reads "30 days / 90 days".
- **Prices (India INR / global USD):** Free; first pack ₹99 for 2 credits / $5 for 5; Keep warm ₹999 / $29 a year; Start ₹299 / $8 (90 days ₹699 / $19); Momentum ₹999 / $24 (90 days ₹2,499 / $59, labelled "Recommended"); Land Focus ₹5,999 / $100 (₹13,999 / $249); Land Sprint ₹11,999 / $200 (₹27,999 / $499); Land Concierge by application ₹34,999 / $750 (₹84,999 / $1,990), 75 open asks; human written review ₹799 / $49 and live 45-min session ₹1,499 / $99 (unpurchasable until reviewers are staffed); packs USD 5/$5, 25/$22, 60/$48, 150/$105 and INR 25/₹1,199, 60/₹2,599, 150/₹5,999.
- **Regions:** India (INR) + one global USD price first; regional tiers T2–T4 and EUR/GBP later.
- **Free:** 3 open asks, 3 welcome credits + 2 credits every 30 days (no carryover), free ask quality check, one-time 14-day Momentum reverse trial after the first ask (15 open asks, 5 trial credits, no card).
- **Fairness:** referrals, priority, visibility and payments to referrers are never sold; at most 2 open asks per company on every plan; referrers never see a seeker's plan; publish a "What money can't buy" page.
- **Tax:** SkipWait is an Indian **sole proprietorship with Udyam (MSME) registration, not GST-registered.** No GST on any sale; INR shown as "India price"; one server setting (`indiaGstRegistered`) switches labels, Chargebee tax and invoices to GST mode when a GSTIN exists; registration is mandatory near ₹20 lakh aggregate turnover (exports count) — show trailing-12-month turnover vs the threshold to admins.
- Existing Pro/Max subscribers keep everything they pay for (Pro ≥ Start, Max ≥ Momentum + assistant access).

Pending owner decisions (do not build until decided): referrer tips (seeker→referrer money); machine translation of 6 languages vs preferences-only; human expert-review queue staffing; employer referral campaigns; **faded vs solid-grey disabled buttons** (live site currently fades kit buttons when disabled, which conflicts with the AGENTS.md/DESIGN.md ban on faded disabled controls — owner to choose; until then do not spread the faded style further).

## 2. Sources of truth
- Visual: `screens/{web,mobile}/*.png`; kit source `app/src/**` (routes, components, `styles.css`); deployed kit https://skipwaitme.lovable.app.
- Per-PNG audit, feature catalog and waves: `docs/KIT_V4_AUDIT.md`. Coverage/history: `docs/KIT_V4_COVERAGE.md`.
- Pricing: `docs/PRICING_RECOMMENDATION.md` (overrides `PRICING.md`, `UPGRADE_NUDGES.md` and `shared/planCatalog.ts` where they differ).
- Kit CSS is ported verbatim in `client/src/styles/kit.css` (never edit rule-by-rule); live-only rules live in `client/src/index.css`. Kit Button: `client/src/components/kit/button.tsx`.

## 3. Process
- Work branch: `kit-v4-fullstack` (pushed to origin as work in progress; it may contain unverified commits — never push it to `main` without the gate).
- One commit per coherent change, explicit pathspecs, never others' files.
- **Gate before pushing to `main`** (run on a clean checkout of the exact commit, merged with the latest `origin/main`): `npx tsc --noEmit`, full `pnpm vitest run`, `pnpm build`, `node scripts/design-token-audit.mjs`, `bash scripts/lint-deploy-migrations.sh`. Known load-flaky tests (re-run in isolation): `client/src/pages/profileSetup.test.tsx`, `server/adminUsers.test.ts`, `server/paymentRefundRevenue.test.ts`, `server/privateReferralRoutes.integration.test.ts`.
- After pushing: watch CI / Deploy Web / Deploy API, then `EXPECTED_SHA=<sha> bash scripts/verify-live-release.sh` must print CONVERGED.
- Visual verification: `KIT_SCREENS_BASE=http://localhost:<port> node scripts/kit-screens/capture.mjs --route <r> --name <stem> --fixture scripts/kit-screens/fixtures/<stem>.json --out <dir>` writes REFERENCE|LIVE slices at both viewports with network-level API mocks (no DB needed). Local dev needs `.env` with `JWT_SECRET`, `VITE_APP_ID=skipwait`, `BILLING_ENV=test` and placeholder `CHARGEBEE_SITE/API_KEY/WEBHOOK_SECRET`.
- Money: no real payments ever; mock every provider in tests; amounts only from the server catalog; provider-confirmed state only.

## 3b. Priority queue — how every model picks work (binding)
**Rules (apply in order):**
1. **Preempt for P0:** production down or degraded, `main` CI red, a security vulnerability, or a money/credits/identity/data-correctness bug beats everything below. Fix it, verify live, then return to the queue.
2. **Finish before starting:** complete your own in-progress task first. Next, resume any stalled in-progress task (claimed more than 24 hours ago with no new commits on its branch) — note the takeover in its Status cell.
3. **Otherwise take the lowest-numbered task that is `todo`, whose dependencies are `done`/live, and that is not owner-blocked.** Never start a lower-priority task while a higher-priority one is unclaimed and unblocked (a small fix needed by the higher task is fine).
4. **Claim before coding (docs first):** set its Status to `in progress — <platform/model> — <YYYY-MM-DD> — branch <name>` and push that doc change to `main` BEFORE writing code. Two models never take the same task; if a claim and yours collide, the earlier commit on `main` wins.
5. **Definition of done:** every audit item for the task's features in `docs/KIT_V4_AUDIT.md` is resolved (or recorded as owner-blocked), contracts + tests (incl. cross-user/security cases), every affected screen state verified at 1280 and 390, the gate in section 3 passes on a clean checkout, pushed to `main`, live release CONVERGED, and the Status set to `done — <commit>` with any owner actions added to section 6.
6. **Schema discipline:** tasks that add migrations run one at a time per migration number; allocate the next free `drizzle/deploy` number at commit time and record it in section 5.
7. **Never** build an owner-blocked task, sell referrals/priority/visibility, or ship preview scaffolding — whatever a lower-level instruction says.

| # | Task (audit feature names) | Depends on | Size | Status |
|---|---|---|---|---|
| **Tier A — finish in-flight work** |||||
| 1 | Wave 3 kit pricing: pricing-model → checkout-passes → plans-billing-ui → catalog-sync (spec 4.1) | — | XL | in progress — Claude Code — 2026-10-14 — branch kit-v4-fullstack |
| 2 | Wave 4a password sign-in: `password-auth`, `sign-in-intent-routing` (spec 4.2) | — | L | in progress — Claude Code — 2026-10-14 — branch kit-v4-fullstack |
| **Tier B — trust, privacy, compliance** |||||
| 3 | `work-email-hmac-storage`: store only an HMAC of work emails in OTP codes/receipts, purge plaintext, migrate existing rows | — | M | todo |
| 4 | `account-deletion` / `account-deletion-grace` + `data-export-async` (typed confirm, 14-day grace, withdraw open asks, erase within 30 days, export ZIP within 24 h) | scheduled jobs (done) | L | todo |
| 5 | `moderation-actions` + `safety-report-review`: severity, warn/restrict/ban with enforcement on every ask/accept path and alias, both parties notified, 14-day appeal, audit trail | — | XL | todo |
| 6 | `work-email-reverify` (90-day re-check, badge removal, open asks returned) + `otp-policy-kit` (30 s resend, server lockout 15 min after 5 tries) | scheduled jobs (done) | L | todo |
| 7 | `session-management` (list and revoke sessions) + `privacy-consent-controls` | — | L | todo |
| **Tier C — core ask flow (activation)** |||||
| 8 | `seeker-search-profile` (onboarding answers server-side) + `profile-resume` (resume on file, reused by /ask) | — | L | todo |
| 9 | `ask-quality-checks` (shared client/server checks) + `ask-company-context` | 8 | M | todo |
| 10 | `ask-role-location-fit` (role location select, mismatch callout) | 8 | L | todo |
| 11 | `ask-drafts` (company-door dialog saves a server draft that /ask continues) | 9 | M | todo |
| 12 | `credit-metered-tools` + `ask-coach-rewrite` ("Improve my note · 1 credit", no charge on fallback) | 1 | M | todo |
| 13 | `ask-pinned-work` / `pinned-work-in-asks` + `seeker-work-links` | 8 | M | todo |
| **Tier D — referral lifecycle** |||||
| 14 | `referrer-identity-reveal` + `identity-gated-preview` (both see names after accept) | — | M | todo |
| 15 | `pass-reasons` (5 kit reasons, shared with the seeker, never the name) | — | M | todo |
| 16 | `mark-referred-reference` + `thread-timeline` | — | M | todo |
| 17 | `inbox-list-enrichment` + `referrer-preview-expiry` + `ask-quality-signals` | 9 | M | todo |
| 18 | `referrer-capacity-routing` (monthly capacity; full → other referrers; area routing) + `named-referrer-visibility` | function taxonomy (done) | L | todo |
| 19 | `pre-accept-question` (one anonymous question before accepting) | 14 | L | todo |
| 20 | `thank-you-wall` + `landed-journey` + `referrer-impact-metrics` + `company-demand` | 14 | L | todo |
| **Tier E — notifications** |||||
| 21 | `notification-kinds` + `notification-preferences` (types, channels, quiet hours) | — | L | todo |
| 22 | `email-templates` (all 12 real) + `notification-reminder-jobs` | 21 | L | todo |
| 23 | `approval-notifications` + `saved-alerts` function field and matching | 21 | M | todo |
| 24 | `web-push` (subscriptions, sender, SW handler; delivery needs owner VAPID keys) | 21 | L | todo |
| **Tier F — settings and app** |||||
| 25 | `region-preferences` (language/time zone/currency/date format persisted and applied; RTL direction) + `settings-kit-shell` | — | L | todo |
| 26 | `app-display-preferences` (dark mode) + `pwa-install` + `offline-draft-sync` + `error-reference` + `lite-mode` | — | M | todo |
| **Tier G — assistants and developers** |||||
| 27 | `assistant-connection-grants` + `assistant-approvals-v2` + `ask-provenance` + `ask-send-limits` | 1 | L | todo |
| 28 | `paid-tools` (credit_spend approvals execute real tools) | 12, 27 | L | todo |
| 29 | `developer-app-oauth` + `developer-app-review-admin` + `developer-app-usage-stats` | — | L | todo |
| 30 | `developer-webhooks` (delivery + signing) | 29 | L | todo |
| 31 | `mcp-kit-tools` + `mcp-public-endpoint` + `public-rest-api-v1` | 27, 29 | XL | todo |
| **Tier H — companies, employer, admin** |||||
| 32 | `demo-requests` (real /for-companies intake + admin queue) | — | M | todo |
| 33 | `employer-domain-verification` (DNS TXT) | — | L | todo |
| 34 | `employer-referrer-programme` + `employer-programme-settings` + `employer-insights` | 33 | L | todo |
| 35 | `admin-overview-metrics` + `verification-exceptions` + `company-suggestion-review` | — | M | todo |
| 36 | `employer-plans` (Referral programme entitlement; Chargebee price is an owner action) | 1 | M | todo |
| **Tier I — work showcase and tools** |||||
| 37 | `work-visibility-tiers` + `work-items-kit-fields` + `showcase-plan-limits` UI | 1 | M | todo |
| 38 | `interview-dossier` + `signature-tools` (AI tools only; human review stays blocked) | 12 | XL | todo |
| 39 | `profile-view-insights` (placement needs owner input) | — | M | todo |
| 40 | Regional pricing tiers T2–T4 and EUR/GBP (after first prices are proven; VAT first) | 1 | M | todo |

**Owner-blocked — do not build until the owner decides (record the decision here first):** `referrer-tips` (seeker→referrer money); `i18n-rtl` full translations (preferences-only work is task 25); human expert-review fulfilment and staffing; `referral-campaigns`; `upi-checkout` (Razorpay settings); `work-import` (Dribbble OAuth app); `multi-currency-pricing` beyond INR/USD; the disabled-button style (faded vs solid grey).

**Done (for reference):** kit screens v1 (PR #172), Wave 1 UI + reversals and shared follow-up, `company-directory`, `function-taxonomy`, `scheduled-jobs`, saved-alerts backend, self-serve blocking, forgot/reset password pages (other session), landing fidelity.

## 4. Status (update when you claim, commit or push)
| Wave | Scope | State | Where |
|---|---|---|---|
| Kit screens v1 | All screen groups on the verbatim kit layer | **Live** | PR #172 → `1fc4214` |
| Audit | 579 differences across all PNGs, feature catalog, waves | **Live (docs)** | `5de8832` |
| 1 | UI fixes + founder-call reversals, 10 groups; shared follow-up (kit loading/error/offline states, CSS, verify/profile/SEO, minimised `/api/p`) | **Live** | `c27363f`, `286b638` |
| 2 | Company directory (0076), job-function taxonomy (0077), scheduled jobs (0078, hourly cron, `ask-expiry-sweep`) | **Live** | `9465a0c` |
| 3 | Kit pricing | **In progress (Claude, branch `kit-v4-fullstack`, not on main)** | see 4.1 |
| 4a | Password sign-in | **In progress (Claude, same branch)** | see 4.2 |
| 4–10 | See `docs/KIT_V4_AUDIT.md` "Build plan" | Not started | — |

### 4.1 Wave 3 — kit pricing (in progress)
Done on the branch (unverified as a whole, not pushed): plan entitlements + open-ask slots (`1cca6d1`…`94eeaea`: one resolver, cap enforced at ask creation with 409 `slot_cap_reached`, slots payload, Requests meter in kit meaning, assistant gate = Land or legacy Max); credit ledger (`1ce2b04` migration **0079**, `b356b1d`, `12179e4` asks reserve a slot instead of a credit with pre-switch refunds kept, `7b23ee5` guards, `ff075e4` Plans/Billing read the ledger); and from an interrupted run on the OLD monthly/yearly model: `2f54159` (migration **0080**, never deployed) and `109c97e` (typed Chargebee calls) — the pricing-model step must adapt or supersede them to the Oct 14 model.
Remaining steps, in order (each: contracts first, tests with mocked providers, both-viewport captures, atomic commits):
1. **pricing-model** — catalog contract rewritten to the Oct 14 model (plans, 30/90-day pass products, Keep warm yearly, INR/USD prices, packs, first pack, human session products, credit costs, item price ids), stored plan enum widened additively, entitlements (pass windows end cleanly, Keep warm, Concierge 75, reverse trial, **2 open asks per company on every plan**), ledger (90-day passes grant in three 30-day cycles; Free 2 credits per 30 days via the scheduled-job registry; welcome 3; trial 5), region resolution (CF-IPCountry IN → INR else USD) on a public catalog endpoint, `indiaGstRegistered=false` setting, PRICING.md/UPGRADE_NUDGES.md updated.
2. **checkout-passes** — Chargebee hosted checkout for passes (non-renewing, billing cycles 1), Keep warm, packs, first pack, human sessions (only when an admin "reviewers available" flag is on); region/currency lock; item-price availability detection; opt-in auto-extend within payment-method limits; upgrade mid-pass (new pass now, unused days credited pro rata); Concierge application → admin approval → purchase link; /billing management (current pass, auto-extend on/off, payment method via portal session, invoices, payment-issue from webhooks, 7-day first-purchase refund via admin with audit); legacy Pro/Max manageable; webhooks provider-confirmed, idempotent. Review/reuse or delete the untracked `server/chargebeeSnapshot.ts` if present.
3. **plans-billing-ui** — /plans and /billing to the PNGs with the approved changes ("30 days / 90 days" toggle, "India price" label for INR, Land level selector with Concierge "Apply", credits bar + Add credits, usage from the ledger, signature tools not yet built shown unpurchasable, human sessions "Coming soon", compare table, kit FAQ adapted, "What money can't buy" band + page), /billing states, honest nudges per UPGRADE_NUDGES.md (cheapest fix first at the cap).
4. **catalog-sync** — admin-only Chargebee sync using the server's own credentials: dry run (exists / missing / mismatched for every catalog item price in INR and USD) and apply (create only missing; reuse the Pro item's family; never update, archive or delete; never touch `skipwait_pro_*`/`skipwait_max_*`; audit-logged), admin panel with the environment shown and a typed site-name confirmation.
Before pushing Wave 3: the whole wave goes together (its parts depend on each other); check no "incl. GST" wording ships while `indiaGstRegistered=false`.

### 4.2 Wave 4a — password sign-in (in progress)
Build on the existing `/forgot-password`, `/reset-password` and `server/passwordResetRoutes.ts` (from `0222ce2`). Scope: email + password on the kit sign-in page (WorkOS `authenticateWithPassword`, same session creation as the WorkOS callback, generic errors, durable rate limits, typed `password_sign_in_unavailable` fallback to AuthKit when password auth is disabled); reset signs this browser in and every other session out; "Continue with Google" goes straight to Google (`provider=google` → WorkOS `GoogleOAuth`); decide sign-up-with-password from the PNGs. Security tests: enumeration, rate limits, suspension, open redirect, aliases, CSRF posture, no password logged.

## 5. Migrations
Live: 0075 (user blocks, other session), 0076 company directory, 0077 job function, 0078 job runs. Branch only (not deployed): 0079 credit ledger, 0080 subscription contracts (old model — adapt before deploy). Next free: **0081** — check `drizzle/deploy` at the moment you allocate.

## 6. Owner actions outstanding
- After Wave 3 ships: run the admin Chargebee catalog sync on the TEST site, test a checkout, then on LIVE.
- WorkOS dashboard: enable Email + Password; confirm the Google connection (custom Google OAuth client for branding).
- Confirm launch-company domains (notably `goneutrinos.com`); run `pnpm tsx scripts/backfill-job-function.ts` (dry run, then `--apply`).
- Check the hourly cron under the Worker's Triggers and `GET /api/admin/jobs` (last run within the hour).
- Later: VAPID keys for web push (`wrangler secret put`), PayPal reference transactions, Razorpay e-mandate enablement via Chargebee support, CA advice (SAC code; export vs intermediary) when GST-registered, NY/CA counsel before selling Concierge there.

## 7. Resuming interrupted work
`git fetch && git log origin/main..origin/kit-v4-fullstack` shows unpushed work; `git status` in the worktree shows uncommitted partial edits from an interrupted agent — review them against the step spec above, keep what is right, finish, verify, commit. Never redo committed steps; never reset or discard another writer's work.

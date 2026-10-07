# KIT_V4_MIGRATION_MAP.md — retiring the pre-v4 screens and resolving the two lanes

_Written 2026-10-07. Owner direction: "past screens we are no longer having", "forget the old ones,
replace them with new v4 screens and instructions", and finally — **"v4 is the whole product but
keep the payments and other configurations which we need here too."**_

This file is the mechanical plan for that replacement. It exists because two agents built kit v4
in parallel and the two branches now conflict in 11 files — so "which version wins" has to be
written down once instead of re-decided per file.

---

## 0. The ruling, stated precisely

**v4's screen map IS the product.** Every pre-v4 *screen* is retired. Nothing is kept "because it
exists".

**But retiring a screen does not retire its backend.** The payments stack and the other
configuration are explicitly kept and re-pointed at the v4 screens:

| Kept — infrastructure | Kept — data it owns |
|---|---|
| `server/payments.ts` (Razorpay + PayPal order creation) | `paymentFulfillments`, `subscriptionCheckoutIntents` |
| `server/paymentWebhooks.ts` (signed Razorpay + PayPal webhooks) | `subscriptionEvents`, `employerPaymentRefunds` |
| `server/chargebee.ts` + `server/chargebeeRoutes.ts` (checkout, subscription, gift, credit recovery) | `tokenBalances`, `tokenTransactions`, `promoCreditGrants`, `giftSubscriptionFulfillments`, `adminTokenAdjustments` |
| `server/adminBillingCatalog.ts` | `employerPaymentFulfillments` |
| Auth: `_core/workosAuth.ts`, `workosWebhooks.ts`, `otpLogin.ts`, `workEmailOtp.ts` | `users`, `canonicalPeople`, `verifiedLoginAliases`, `workEmailOtp*` |
| Storage: `storage.ts`, `storageCloudflare.ts`, `storageDb.ts` | `documentBlobs`, `referralAttachments`, `resumeUpload*` |
| Email: `emailDelivery.ts`, `referrerReviewEmail.ts` (ZeptoMail / Resend) | delivery outbox + review links |
| Notifications: `notificationRoutes.ts`, push | `notifications`, `directMessageNotificationOutbox` |
| Admin consoles + audit | `operationalActivityLogs`, `privacyRequests` |
| Schema contract: `schemaReconcile.ts` + `drizzle/deploy/*.sql` | every table above |
| PWA: manifest, `sw.js`, offline shell | — |

**Consequence for `/plans` and `/billing`:** they render the *kit's* design and are wired to the
*existing* Chargebee/Razorpay/PayPal plumbing. No payment code is rewritten; only the screen in
front of it changes. This is why the pricing question in §3c is about *naming and amounts*, not
about rebuilding checkout.

---

## 1. Branch ownership — who wins each file

`git merge-tree --write-tree agent/opencode/kit-v4-update-plan agent/workbuddy/kit-v4-safety-reports`
→ **exit 1, 11 conflicts**, five of them `add/add` (both branches wrote the same screen).

**Rule: opencode wins every duplicated screen.** It covers more of the kit and its versions are
already wired to its own supporting modules (`lib/companies.ts`, `lib/resumeUpload.ts`,
`server/safetyRoutes.ts`, `server/profileRoutes.ts`).

| Conflicted file | Conflict | Winner |
|---|---|---|
| `pages/Explore.tsx` | add/add | **opencode** |
| `pages/Help.tsx` | add/add | **opencode** |
| `pages/Report.tsx` | add/add | **opencode** |
| `pages/Safety.tsx` | add/add | **opencode** |
| `pages/SignIn.tsx` | add/add | **opencode** |
| `pages/explore.test.tsx` | add/add | **opencode** |
| `App.tsx` | content | **union** — opencode's routes + the four unique pages below |
| `components/AppShell.tsx` | content | opencode (it owns the shell) |
| `server/_core/index.ts` | content | opencode, minus the safety-report registration |
| `server/db.ts` | content | opencode, minus the safety-report functions |
| `server/schemaReconcile.ts` | content | opencode, minus the safety-report tables |

### What this branch contributes — cherry-pick these, they do not collide

| File | Why it is worth keeping |
|---|---|
| `scripts/screen-coverage.mjs` + `screen-coverage.test.ts` + the `ci.yml` step | The only coverage ratchet. Tracks 42 designed routes, fails on regression, mutation-tested. Opencode has no equivalent. |
| `pages/Admin.tsx` + `components/AdminConsoleShell.tsx` + `admin.test.tsx` | `/admin` — the kit's dark-sidebar console. Opencode never built it. |
| `pages/AppStates.tsx` + `appStates.test.tsx` | `/app-states` — the nine PWA system states. |
| `pages/Emails.tsx` + `emails.test.tsx` | `/emails` — the twelve templates. |
| `pages/Guidelines.tsx` + `guidelines.test.tsx` | `/guidelines`. |

---

## 2. ⚠️ Duplicate migration — a human must decide the owner

Two deploy migrations create safety reports. **Both will apply, and with `IF NOT EXISTS` the
second is a silent no-op — so whichever runs first wins the schema and the other branch's code
then breaks against it.**

| Migration | Creates |
|---|---|
| `0065_safety_reports.sql` (this branch) | `safetyReports` + `userBlocks` |
| `0066_safety_reports_company_suggestions.sql` (opencode) | safety reports + company suggestions |

Also present: `0065_profile_work_items.sql` (opencode) — a duplicate **number**, not a duplicate
table. Renumber whichever survives.

**Decision required:** one migration owns `safetyReports`, and the losing branch's route/db code is
deleted rather than merged. Do not ship both.

---

## 3. Pre-v4 route retirement map

Every route on this branch, classified. `v4 target` is the kit screen that replaces it.

### 3a. REPLACE — v4 screen exists, redirect the old URL

| Old route | v4 target | Note |
|---|---|---|
| `/start` | `/onboarding` | kit rename |
| `/request` | `/ask` | kit rename |
| `/notifications` | `/alerts` | kit rename |
| `/offline` | `/app-states` | kit gallery supersedes |
| `/messages` | `/inbox` | kit's unified inbox replaces the second inbox |
| `/premium` | `/plans` | kit merges wallet + credits into Plans |
| `/referrer/impact` | `/referrer-home` | kit's referrer daily view |
| `/support` | `/help` | kit help centre; keep `/support` if the support desk stays |
| `/conversation/:requestId` | `/thread` | kit rename |
| `/admin/approvals` | `/admin-review` | kit's review queue |
| `/share` | `/invite` | kit's invite loop |

### 3b. REMOVE THE SCREEN — but each has a caveat that is not a UI concern

The ruling retires these screens. Each still needs one thing done first, and none of it is
restyling:

| Old route | Backend that stays | What must happen before the screen goes |
|---|---|---|
| `/jobs`, `/wall`, `/post-opportunity` | `jobs`, `companyOpportunities`, `savedRoles` | The v4 screen map has **no job/opportunity marketplace**, so this capability disappears from the product. Decide whether the data becomes read-only, is exported, or is dropped — and tell existing users. |
| `/employer/talent`, `/employer/opportunities` | `profileUnlocks`, `opportunitySponsorshipPurchases`, `talentDiscoveryConsents`, `employerAccounts` | These are **paid surfaces**. Active sponsorship entitlements must either be honoured until expiry or refunded — see `employerPaymentRefunds` and the refund flows already in `employerRoutes.ts`. Removing the screen while an entitlement is live is a billing incident. |
| `/premium`, `/pricing` | Chargebee + Razorpay + PayPal, token ledger | Redirect to `/plans`. Live subscribers keep their subscriptions; the v4 Plans screen must render the **live** plan, not the kit's. |
| `/fast/:linkCode`, `/refer/:companySlug/:vanityAlias` | `referrerFastTrackLinks` | **Already in delivered emails and shared links.** Either keep a redirect target that resolves, or accept that previously shared links 404. |
| `/email-review/:linkToken` | `referrerReviewEmailLinks`, `referralReviewDeliveries` | **One-click links already sent by email.** Deleting the route breaks mail in flight; the v4 thread must absorb this action. |
| `/share-card/:token` | `referralShareCards` | Kit's `/p/:handle` is a public profile, not a share card. Decide which survives; shared card URLs are already in the wild. |
| `/messages`, `/inbox` | `messages`, `dmRoutes`, `directMessageQuotaWindows` | Two inboxes collapse into the kit's one. Migrate the referrer queue into `/inbox` rather than deleting it. |
| `/terms`, `/privacy`, `/refunds`, `/shipping`, `/cancellations`, `/about`, `/contact`, `/support` | `PolicyPageShell`, `SUPPORT_EMAIL` | Compliance surfaces. `/guidelines` and `/safety` join them; `/terms` and `/privacy` stay linked from sign-in and checkout. |
| `/job-referral-platforms`, `/choosing-a-job-referral-platform`, `/how-employees-refer-candidates` | `shared/publicRoutes.ts`, sitemap, prerender | Indexed SEO pages. Removing them needs a sitemap + prerender plan or Google keeps serving dead URLs. |
| `/admin/*` (9 consoles) | every admin route + `operationalActivityLogs` | Working, data-connected operator tools. The v4 `/admin` console **links to them**; it does not replace them. |
| `/components` | — | `import.meta.env.DEV` only. Leave it. |

**Nothing in this table is deleted by this commit.** Each line is a prerequisite, not a note.

### 3c. BLOCKED — needs a decision before it can be built

| Screen | Blocked on |
|---|---|
| `/for-companies`, `/billing` | **Pricing.** Live sells Pro/Max (₹599/$7, ₹1299/$15); kit specifies Start/Momentum/Land. Both branches currently avoid naming a plan; nothing can ship until one set wins. |
| `/forgot-password`, `/reset-password` | **Auth.** WorkOS AuthKit owns credentials. Kit's email+password reset needs a WorkOS-delegated design or a second credential store. |
| `/approve`, `/assistants`, `/connect-assistant`, `/developer-console`, `/developers` | A new MCP/API product surface per `AGENT_ACCESS.md`, not a port. |

### 3d. Still unbuilt by either branch

`/admin` (built on this branch only), `/app-states` (this branch), `/emails` (this branch),
`/guidelines` (this branch), plus the assistant set in 3c.

---

## 4. Execution order

1. **Decide the safety-reports migration owner** (§2). Nothing else should merge first — two
   migrations creating one table is the only item here that can corrupt production.
2. **Cherry-pick §1's five unique items** onto `agent/opencode/kit-v4-update-plan`: the
   screen-coverage ratchet + its CI step, `/admin`, `/app-states`, `/emails`, `/guidelines`.
3. **Apply §3a redirects** in one commit, with a regression test per redirect. The v4 targets now
   exist on opencode's branch, so this is mechanical.
4. **Work §3b's caveats before deleting anything.** In order of risk: live sponsorship entitlements
   first (billing), then in-flight email links, then shared fast-track/share-card URLs, then the
   SEO pages with their sitemap plan, then the marketplace data question.
5. **Decide §3c's pricing naming** — it gates `/for-companies` and `/billing`. Note this is a
   naming-and-amounts decision only: the Chargebee/Razorpay/PayPal plumbing is kept either way, so
   no checkout code is thrown away by choosing one way or the other.

**Not blocked by any of the above:** `/forgot-password`, `/reset-password` (needs the WorkOS
delegation design) and the five assistant screens (a new MCP/API surface per `AGENT_ACCESS.md`,
not a port of anything).

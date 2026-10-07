# KIT_V4_MIGRATION_MAP.md — retiring the pre-v4 screens and resolving the two lanes

_Written 2026-10-07. Owner direction: "past screens we are no longer having", "forget the old ones,
replace them with new v4 screens and instructions"._

This file is the mechanical plan for that replacement. It exists because two agents built kit v4
in parallel and the two branches now conflict in 11 files — so "which version wins" has to be
written down once instead of re-decided per file.

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

### 3b. KEEP — the kit has no equivalent, and these are live surfaces

**Do not retire these on a UI decision.** Each has live data behind it, and several are
compliance or revenue surfaces:

| Route | Why it must not be blindly deleted |
|---|---|
| `/jobs`, `/wall`, `/post-opportunity` | The job/opportunity marketplace. Kit v4 has **no equivalent**. Backed by `jobs`, `companyOpportunities`. |
| `/employer/talent`, `/employer/opportunities` | Backed by `talentDiscoveryConsents`, `profileUnlocks`, `opportunitySponsorshipPurchases` — **paid surfaces with revenue**. |
| `/fast/:linkCode`, `/refer/:companySlug/:vanityAlias` | Referrer fast-track links (`referrerFastTrackLinks`). Kit has no equivalent; deleting breaks live shared links. |
| `/share-card/:token` | Share cards (`referralShareCards`). Kit's `/p/:handle` is a different thing. |
| `/email-review/:linkToken` | One-click review links already sent by email (`referrerReviewEmailLinks`). Deleting breaks delivered mail. |
| `/terms`, `/privacy`, `/refunds`, `/shipping`, `/cancellations` | Policy pages. Compliance surfaces. |
| `/job-referral-platforms`, `/choosing-a-job-referral-platform`, `/how-employees-refer-candidates` | Indexed SEO pages in `shared/publicRoutes.ts`. Removing them needs a sitemap plan. |
| `/about`, `/contact`, `/pricing` | Indexed public pages. |
| `/components` | `import.meta.env.DEV` only. |
| `/admin/*` (9 consoles) | Working, data-connected operator tools. |

**The question the owner has to answer:** the kit's screen map has no job marketplace, no
employer workspace and no fast-track links. If v4 is the whole product, those features — and the
sponsorship revenue behind them — are being removed, not restyled. That is a product decision, and
it is the largest one in this migration.

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

1. **Decide the safety-reports migration owner** (§2). Nothing else should merge first.
2. **Decide the marketplace question** (§3b). It determines whether this is a restyle or a
   feature removal.
3. Cherry-pick §1's five unique items onto `agent/opencode/kit-v4-update-plan`.
4. Apply §3a redirects in one commit, with a regression test per redirect.
5. Retire §3b only after step 2 is answered, in one reviewed batch with the redirect map.

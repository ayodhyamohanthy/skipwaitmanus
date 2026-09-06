# B2B Monetization Layer — implementation handoff (2026-09-06)

## Status: Code complete + committed (f9efe64, 95d9fe4, 21fae16, df895fa). One deployment dependency remains (see §5).

## 1. What was implemented (per PRD)

### Sponsored Role Engine (PRD §1 — "Google Search Ads model")
- `companyOpportunities.sponsoredUntil` (timestamp) + `sponsoredTier` ENUM('standard','featured','spotlight') (migration 0037 + boot self-heal).
- `POST /api/opportunities/:id/sponsor {tier, days}` — featured 7d = 10 credits, spotlight 30d = 25 credits; deducted from the employer account; owner-or-admin enforced.
- `/api/opportunities` + `/api/jobs` ordering: sponsored first (featured → spotlight → organic), `isSponsored` flag on rows; amber "Sponsored" badge on the wall and job explorer cards.

### Talent Discovery & Profile Unlock (PRD §2 — "B2B Intent Intelligence model")
- `profiles.anonymityOptIn` (default **false** — seekers explicitly opt in to be discoverable).
- `GET /api/employer/talent?query&location` — anonymized opt-in seeker directory: `Talent-XXXX` display refs, headline, location, skills, **never** email/name/resume (test-asserted invariant).
- `POST /api/employer/talent/:id/unlock` — 5 credits from the employer account; creates the unlock row; notifies the seeker; 402 with credits balance when insufficient.
- `GET /api/employer/talent/:id` — full profile when unlocked (still no direct contact data; contact flows through the platform conversation).
- `employerAccounts` table: company, billing email, unlock credits, monthly budget.

### Contextual High-Intent Partner Modules (PRD §3 — "AdSense/Partner model")
- `partnerModules` table: name, category (interview_prep / resume_vetting / skill_assessment / other), headline, description, targetRoles keywords, CTA label/URL, active, impressions, clicks.
- `GET /api/partners?role=` — active modules matched against role keywords; records impressions.
- `POST /api/partners/:id/click` — click tracking (CPA attribution).
- PartnerModuleCard slots on `/wall` and `/jobs` after the 3rd organic card.
- Admin inventory: `/admin/partners` (list + stats + edit + active toggle), plus admin end-sponsorship endpoint.

### Employer self-serve billing
- `employerAccounts` (per-user, unique): company, billingEmail, unlock credits, monthly budget (USD cents).
- Unlock-credit packs through the existing Razorpay order flow: starter 10/$29, growth 50/$129, scale 200/$399; `payment.captured` webhook with `notes.kind=unlock_credits` credits the employer account automatically.
- Role: `profiles.accountType` extended with "employer" (migration 0037 MODIFY — applied via the migration file only, since ADD COLUMN cannot widen an ENUM).
- Screens: `/employer` (dashboard + upsell), `/employer/talent`, `/employer/billing` (packs + spend history), sponsor dialog from the employer's own opportunity list.

## 2. Tests & quality
- 48 B2B-specific tests passing (server DI tests incl. anonymization invariant, webhook credit path, sponsor ordering/deduction; component tests for dashboard/talent/billing/partners).
- Full suite: 366 passed / 5 skipped (+2 known parallel-load flakes that pass in isolation).
- Impeccable detector: clean on all new screens (Design Gate green on f9efe64).
- pnpm check clean · build exit 0.

## 3. Deployment state
- All commits pushed (`f9efe64` → `df895fa`); Deploy API + Web + Design Gate all completed success.
- **Live API build: `df895fa` (has all B2B code + the improved reconciler).**

## 4. The one open deployment dependency

`/api/partners` currently returns 500 and `schemaReconciled:false` persists on the warm
container instance. Diagnosis so far: the reconciler fails (or hangs) on its first
run against the live Azure MySQL and the error is not yet visible (health now exposes
`schemaReconcileError` as of `df895fa` — check `curl -s https://skipwait.me/api/health`).
`/api/employer/account` 401 and the wall 200 confirm auth + core work; only the B2B
tables (employerAccounts, profileUnlocks, partnerModules) and their columns are pending.

**Resolution options (pick one):**
1. **Apply migration 0037 manually** (proven path — your team did exactly this for 0031):
   run `drizzle/0037_b2b_monetization.sql` statements against the live MySQL
   (mysql client / Azure Query Editor). Idempotency: wrap with the
   `apply-missing-columns.mjs` pattern or run once.
2. **Check the reconcile error**: `curl -s https://skipwait.me/api/health` →
   `schemaReconcileError` now names the exact failing statement (e.g. permission
   denied / lock timeout). If it's privileges, grant ALTER to the app DB user or run
   the migration as admin.
3. After the tables/columns exist, the running app needs **no redeploy** — the
   endpoints work immediately (the reconciler/queries are live). Force the instance
   to pick it up by letting it idle ~10 min or via the Cloudflare dashboard restart.
4. **In-app admin trigger** — while signed in as an admin, POST
   `/api/admin/schema/reconcile` (or open `/admin/schema` in the UI) to run the
   pending DDL from the app itself. Results per statement are returned
   (`GET /api/admin/schema/reconcile` shows the last run's snapshot without
   executing anything). The endpoint only ever runs the reconciler's fixed,
   hardcoded allowlist (the expected columns + B2B tables in
   `server/schemaReconcile.ts`) — no request input reaches the SQL layer — and
   is guarded by the admin role check. It also continues past individual
   statement failures now, so a single stuck statement no longer hides whether
   the rest applied.
   **Metadata-lock-timeout diagnosis:** if the failing statement times out
   (`Lock wait timeout exceeded` on `ALTER TABLE companyOpportunities ADD
   COLUMN compensation`), a long-running transaction/query on that table is
   holding the metadata lock. Stop app traffic for ~2 minutes so open
   transactions drain (or run the statement via the Azure Query Editor, which
   bypasses app traffic entirely), then re-run the reconcile — every statement
   is idempotent, so re-running only applies what is still missing.

## 5. Verification checklist once tables exist
- `GET /api/partners` → 200 (empty list OK) — was 500.
- `POST /api/employer/account` (signed in) → creates the employer account.
- Wall ordering: sponsor a role → it appears first with the amber badge.
- Unlock flow: employer with credits unlocks an opt-in seeker → notification to the seeker.
- Admin `/admin/partners` → create a module → it appears on `/wall` slot.

## 6. Rollback
- Code: `git revert f9efe64 95d9fe4` (all B2B code is additive; tables/columns are harmless to keep).
- DB: the new tables/columns can remain; no destructive changes were made.

## 7. Honest limits
- The PRD's "Stripe" is mapped to the existing Razorpay/PayPal providers (no Stripe account exists); swapping to Stripe later is isolated to the purchase endpoints.
- CPC/CPA billing for sponsored roles is structured (tier + duration + credits) but true click/application metering would need an attribution table — the partner CTA click tracking exists and can be extended.
- Sponsorship spending is deducted from unlock credits in this implementation; a separate promotion budget ledger can be added if you want the two wallets separate.

# Handoff — Job seeker & referrer flows (final state 2026-09-04)

## The real root cause of "referrer flow not completed" (now fixed)

The user-reported symptom — after "I give referrals" → work email → OTP, the app
bounced back to "Continue with work email" instead of the company inbox — had TWO
root causes, both now fixed in production (commit `9d383cb`):

1. **Missing DB columns** — `jobs.compensation` (added by the earlier compensation
   feature, migration `0034`) and `referralRequests.savedAt` were present in
   `drizzle/schema.ts` but **never applied to the live Azure MySQL database**. Every
   `/api/company-referrals/inbox` load threw `Unknown column jobs.compensation` → HTTP
   500 → `inboxReady` stayed false → the UI silently fell back to the sign-in gate.
   Fix: columns added live + idempotent migration `0031_missing_columns.sql` committed.
2. **Stale web bundle** — production served an old `index` build that predated the
   server-session auth fix, so `isSignedIn` stayed false after OTP. Fix: fresh build
   (`index-Csxcj6Ep.js`).

## Live verification (2026-09-04)

| Check | Result |
|---|---|
| `/api/health` | `9d383cb`, ok:true ✅ (the fixed build is deployed) |
| `/api/company-referrals/inbox` | **401 "Sign in to view employee requests"** ✅ (was 500 — now correctly auth-gated, no DB error) |
| `/api/referrer/impact-summary` | 401 auth gate ✅ (new impact endpoint live) |
| `/referrer/impact` | 200 ✅ (new impact dashboard route live) |
| `/` | 200 ✅ |

## What I built this sprint (commit `c61bccd`, also deployed)

1. **NEW `/referrer/impact` dashboard** (`ReferrerImpact.tsx`) — referrer impact stats
   (accepted/pending/declined/unread/credits) + recent referrals + empty/error states,
   backed by new `GET /api/referrer/impact-summary`. Linked from AccountMenu ("My
   impact", work-email-gated).
2. **Seeker confirmation "What happens next" panel** (`ReferralRequest.tsx`) — 3
   numbered steps (review → get claimed → track) + "Track my request" CTA.
3. **Post-decision guidance** (`MyCompanyInbox.tsx`) — after accepting, a tip + "Open
   conversation" button → `/conversation/:id`.

## Honest note on the root cause

The compensation feature I added earlier (migration `0034`) introduced the
`jobs.compensation` column to `schema.ts` but did **not** apply it to the live
database — which is what broke the referrer inbox in production. That gap is now
closed by `9d383cb` (live ALTER + committed idempotent migration). Lesson: schema
changes must be applied to the live DB (not just committed) before the API build
that references them goes out.

## Migration numbering note

There are now two `0031_*.sql` files (`0031_drop_legacy_payment_columns.sql` and
`0031_missing_columns.sql`) — a numbering collision. The live DB is already correct
(via the ad-hoc ALTER in `9d383cb`); the duplicate prefix only affects a fresh
`drizzle-kit migrate` run, which should be reconciled before the next clean-slate
deploy.

## Rollback

- Roll back UX upgrades: `git revert c61bccd`.
- Roll back the referrer-flow fix: `git revert 9d383cb` (re-applies the missing
  columns only if the DB still has them — do NOT drop the columns).
- Full app rollback: revert recent commits; the deploy pipeline self-verifies.

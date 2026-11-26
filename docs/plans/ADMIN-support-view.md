# ADMIN-support-view: one admin page per person to diagnose and fix a reported problem (D-393)

Tier 1 · lane `admin-support-view` · branch `agent/queue/admin-support-view` · epic D-212 · depends on `ADMIN-activity-log`

## Why

Owner, Nov 24 (D-393): "admin should have all analytics so that if some user says they have trouble we can fix
it through admin and test from test accounts". Today a support question means reading several admin pages
(`/admin/users`, `/admin/activity`, `/admin/payments`, `/admin/token-recovery`, `/admin/money-check`) and Sentry
separately, and none of them shows one person's whole state.

## The build

1. **Person view** (`/admin/users/:id/support`, admin role only, `private, no-store`, every view logged as
   `admin.support_viewed`): account and canonical identity (aliases, sign-in methods, verification and
   suspension state), seeker wallet and keyed ledger rows (`getCreditLedgerAudit`), plan and checkout intents,
   their referral requests with each one's current state, timeline and the reason it is waiting, held or
   refused, referrer side (verified company, open claims, availability), blocks, and the person's last 90 days
   from `ADMIN-activity-log` (sign-ins and failed attempts, sends and refusals, billing events).
2. **What went wrong, in plain words.** For the newest failures the page states the cause and the fix from the
   existing contracts (for example "Send was blocked: the job link is another company's posting"), and links to
   the existing admin action that fixes it (payment review, token recovery, resend review email, unblock), never
   a new money path.
3. **Trouble signals** on `/admin`: last 24 hours and 7 days of sign-in failures by reason, send refusals by
   reason, checkout refusals, held requests, review-email failures and client errors (counts only), each linking
   to the filtered activity log.
4. **Reproduce with the test accounts.** Each request in the person view has "Try this in the sandbox": it opens
   the same company and job link for the demo seeker (`QA-sandbox-requests`), so the owner reproduces the
   problem without touching the person's account.

## Hard limits

- No "sign in as this user" or impersonation, and no admin action that edits a person's data outside the
  existing audited admin actions.
- Counts and the person view show only what the admin role may already read; nothing is public or exported
  beyond `ADMIN-activity-log`'s filtered CSV.
- No change to prices, plan contents, legal text, the login rule or money rules.

**Read before writing:** the admin pages in `client/src/pages/` (`AdminUsers`, `AdminActivity`,
`AdminPaymentsReview`, `AdminTokenRecovery`, `AdminMoneyCheck`), their server routes, `server/creditLedger.ts`,
`shared/creditLedger.ts`, `server/db.ts` (request state readers), `docs/plans/ADMIN-activity-log.md`.

## Tests (red first)

Admin-only access (403 for seeker, referrer, signed-out); a synthetic person's view shows their requests, ledger
and activity and nobody else's; the plain-words cause for each refusal code; trouble-signal counts against
fixtures; viewing is logged.

## Acceptance

Focused tests, `pnpm check`, required CI, captures at 1280 and 390 with synthetic data. On the deployed exact SHA:
the demo seeker's person view shows its sandbox requests, ledger and sign-ins, and "Try this in the sandbox"
opens the same company for the demo seeker.

## Status

- ADMIN-support-view: in progress — DeepSeek V4.1 Flash · 7d4d — 2026-11-24 — branch agent/queue/admin-support-view

### Build notes (DeepSeek V4.1 Flash · 7d4d, 2026-11-24)

- **Routes.** `GET /api/admin/users/:userId/support` and `GET /api/admin/support/signals`, both admin-role only,
  `private, no-store`, logged as `admin.support_viewed` / `admin.support_signals_viewed`. Read-only: no route
  edits a person's data, signs in as them or opens a money path.
- **Files.** `shared/adminSupport.ts` (contract, the plain-words cause table, the request-state words),
  `server/adminSupport.ts` (assembly over injected readers + the database readers), `server/adminSupportRoutes.ts`,
  `client/src/pages/goal/admin/GoalAdminSupport.tsx` (the page), `client/src/pages/goal/admin/adminSupportData.ts`
  (fetch + parse), `client/src/pages/goal/admin/AdminSupportSignals.tsx` (the `/admin` block), `client/src/App.tsx`
  (the route). Out-of-`owns` notices under D-370: `server/privateReferralRoutes.ts` (one registration line),
  `client/src/pages/goal/admin-people/GoalAdminUsers.tsx` (one link from the people directory).
- **Scoping.** MySQL has no row-level security, so every reader carries its own ownership predicate
  (`users.id`, `tokenBalances.userId`, `referralRequests.jobSeekerId`, `operationalActivityLogs.actorUserId`,
  `userBlocks.blockerUserId|blockedUserId`). The page never renders a second account.
- **Item 4, "Try this in the sandbox", is built but off.** `SANDBOX_ASKS_AVAILABLE` in `shared/adminSupport.ts`
  is `false`: the sandbox itself is `QA-sandbox-requests` (D-393 (3)(a)), and until that row lands a demo-seeker
  send would reach a real company's real employees. The control renders disabled with that plain reason; the
  row that lands the sandbox flips the constant.
- **Item 3, client errors.** The activity log holds no `client.*` rows today, so the count is the activity log's
  own (0) and the label says Sentry holds the full feed. No Sentry credential is read by this row (D-031).
- **Tests.** `server/adminSupport.test.ts` 34/34 (red first: the suite cannot import without the new modules);
  `client/src/pages/goal/admin/adminSupport.goal.test.tsx` 8/8 including `assertGoalPage`.
- **Not yet done.** Captures at 1280 and 390 with synthetic data, and the deployed exact-SHA acceptance, both
  of which need the release.

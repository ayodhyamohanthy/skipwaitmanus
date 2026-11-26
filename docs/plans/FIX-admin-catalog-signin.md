# FIX-admin-catalog-signin (D-408 (3))

Owner report, Nov 26 2026: "https://skipwait.me/admin/catalog-sync page is not asking for sign in".

`client/src/pages/goal/admin-money/GoalAdminCatalogSync.tsx` shows "Sign in" only while signed out. A browser signed
in to a non-administrator session gets 401/403 from `GET /api/admin/billing/catalog-sync`, and the page shows only
the server error and "Reload the dry run", which loops. `/admin/money-check` already treats 401/403 as "Sign in as
administrator" (`GoalAdminMoneyCheck.tsx`).

Fix: on 401/403 (and while signed out) render the sign-in step with "Sign in as administrator" linking to
`/sign-in?returnTo=/admin/catalog-sync`, with copy saying the current account is not an administrator. No server,
permission or catalog behaviour change. Test red first in `client/src/pages/goal/admin-money/adminCatalogSignIn.goal.test.tsx`.

## Status

- FIX-admin-catalog-signin: in progress — Claude Code · 530c — 2026-11-26 — branch agent/queue/fix-admin-catalog-signin. Red first (3 of 4 cases failed on main); fix in GoalAdminCatalogSync.tsx; 238 admin-money and goal-UI tests pass, tsc clean, token audit OK.

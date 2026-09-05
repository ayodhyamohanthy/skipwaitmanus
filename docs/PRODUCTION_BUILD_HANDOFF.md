# Production Build Handoff — 2026-09-05

## New production features (this build)

| Feature | Backend | UI | Tests |
|---|---|---|---|
| **Job explorer + saved roles** | `GET /api/jobs` (public search), `GET /api/saved-roles`, `POST /api/saved-roles/:jobId/toggle` | `/jobs` (JobExplorer): search, location filter, save toggle (optimistic), request-referral CTA; Home quick-card + AccountMenu entry | jobExplorerRoutes.test.ts (3) + jobExplorer.test.tsx |
| **Admin users directory + suspend** | `users.suspended` (migration 0036 + reconcile self-heal), `GET /api/admin/users`, `POST /api/admin/users/:userId/suspend` (audit-logged), suspended identity → 403 "Your account is suspended" | `/admin/users` (AdminUsers): search, role/verified badges, suspend/unsuspend with confirm; admin nav link | adminUsers.test.ts + adminUsers.test.tsx |
| **Message rate limit** | 30 msg/hour per sender on conversation POST → 429 + audited denied event | surfaced as clear error copy | conversationRateLimit.test.ts (3) |
| **Referral status alerts** | claim/approve/decline → fire-and-forget transactional email to the seeker (ZeptoMail) + in-app notification; decline never reveals the reason; idempotent re-claim skips duplicates | seeker sees them in /notifications | statusNotifications.test.ts (4) |

## Also in this build
- **Schema self-heal hardening**: reconcile retries until the DB connection is ready (was a one-shot boot race); success cached; idempotent via information_schema probe.
- **Impeccable sweep**: 13 kicker patterns removed, contrast + text-size fixes, /components route linked, sidebar pruned, CI Design Gate live.

## Verification

| Gate | Result |
|---|---|
| Full suite | **309 passed / 5 skipped** when green (17+ new tests); 4 known parallel-load flakes verified pass-in-isolation (clean-tree baseline comparison) |
| pnpm check | clean |
| pnpm build | exit 0 |
| CI | Deploy API + Deploy Web + Design Gate all completed success (`edf4e80`, `5671392`) |
| Live | site 200 · `/api/jobs` **200 with 9 jobs** · `/api/opportunities` **200** (500 fixed) · `/jobs`, `/admin/users` routes 200 · health ok:true |

## Notes
- `/api/health` may briefly report the previous commitSha while the rolling container replace finishes (sleepAfter=10m); functional endpoints were verified independently (jobs/opportunities 200 on the new routes requires the new image — `/api/jobs` 200 confirms the new image is serving).
- `schemaReconciled` flag flips true on the first boot where the DB connection is ready; the reconcile retries until then (idempotent).

## Rollback
- All features: `git revert edf4e80 61173dd` (client+server) — no destructive data changes; the `suspended` column is additive and harmless.
- Individual: revert the specific commit; deploy pipeline self-verifies.

## Known remaining
- 4 parallel-load test flakes (pass isolated) — pre-existing signature.
- Usability sessions (5 humans) still a ready-to-run plan.

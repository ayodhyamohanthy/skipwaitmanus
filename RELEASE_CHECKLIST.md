# RELEASE_CHECKLIST.md — deploy, migrate, smoke, rollback

Distilled from `docs/DEPLOY.md` and `.github/workflows/`. Check each box per
release; link evidence in the PR.

## Pre-merge

- [ ] `pnpm check` clean (tsc).
- [ ] Affected Vitest files green; full `pnpm test` green for broad changes.
- [ ] `pnpm build` green for runtime/dependency/bundle changes.
- [ ] `node scripts/design-token-audit.mjs` clean for product UI.
- [ ] `./scripts/sync-check.sh` clean; no secrets or foreign files in the diff.
- [ ] New env keys declared in `.env.example` and wired through validator → Worker → container (`src/worker.ts`); never `VITE_*` for secrets.
- [ ] Schema changes ship as reviewed `drizzle/*.sql` + `server/schemaReconcile.ts` entry; `drizzle/deploy/` file where prod application is required (CI guard #90/#91 enforces this).

## Deploy (automatic on push to main)

- [ ] `deploy-api.yml`: migration gate (`scripts/apply-deploy-migrations.sh`) applied before the Containers rollout; exact SHA readiness verified.
- [ ] `deploy-pages.yml`: web bundle from the same commit as the API.
- [ ] Smoke: `/api/health`, seeker + referrer sign-in, one request lifecycle step, no console errors (see `docs/QA_PAYMENTS.md` for the payment loop).

## Rollback

- [ ] `rollback.yml` exists; prefer forward-fix for migration-gated releases (applied migrations are sha-pinned and immutable — never edit, always add).
- [ ] Backups: verify per V0-05 (no production backup assumed without checking).

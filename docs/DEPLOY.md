# Deploying skipwait.me

> Production: every push to `main` deploys through GitHub Actions (`deploy-api.yml` → Cloudflare Containers, `deploy-pages.yml` → Pages) on Azure MySQL, with the gates in `AGENTS.md` ("Deploy", "Deployment and runtime rules"; D-003, D-019). This is the only deploy path.

How a deploy runs (triggers, migrations, release truth, drift and rollback): `docs/ARCHITECTURE.md` §8.
The workflows are `.github/workflows/deploy-api.yml` and `.github/workflows/deploy-pages.yml`; the old Render, Aiven and Hyperdrive setup was removed on Oct 18 2026.

## Expected red check: "Workers Builds: skipwaitmanus" on main

Cloudflare's own Git-connected build for the `skipwaitmanus` Worker runs `npx wrangler deploy` on every push to main and fails at the Docker step (`COPY commit-sha.txt` - that file is generated only by the Deploy API GitHub workflow). It fails before anything is uploaded, so production is unaffected, and the check is green on PR branches. Do not chase it, and do not make the Dockerfile tolerate the missing file: Cloudflare's build would then succeed and deploy an unversioned container to production, racing the gated Deploy API workflow. Truth for a deploy is the Deploy API run plus /api/health `commitSha`. (Founder-approved to leave the Cloudflare setting as is, Oct 17.)

## Database migrations

Production: never apply schema changes by hand (AGENTS.md §4 and the deploy
gates). Pending `drizzle/deploy/*.sql` files are applied by the Deploy API
workflow's `migrate-db` job (`scripts/apply-deploy-migrations.sh`) before any
API image ships; each file runs once and must be idempotent.

A new non-production environment only, once after its first deploy:

```
DATABASE_URL=<uri> pnpm db:push
```

## Post-deploy verification checklist

- `EXPECTED_SHA=<pushed sha> scripts/verify-live-release.sh` reports CONVERGED, then the live basics checks in `docs/BUGFREE_GATE.md` pass (D-019)
- GET / → 200 with skipwait.me title
- GET /api/auth/workos/sign-in → 302 to api.workos.com authorize
- GET /api/auth/workos/admin?email=<admin> → 302; other emails → 403
- POST /api/work-email/otp/send with a session → 200/429/400 per state
- Sign in end-to-end in a browser; verify /start renders the signed-in state

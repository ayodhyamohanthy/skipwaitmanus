# Deploying skipwait.me

> Production: every push to `main` deploys through GitHub Actions (`deploy-api.yml` → Cloudflare Containers, `deploy-pages.yml` → Pages) on Azure MySQL, with the gates in `AGENTS.md` ("Deploy", "Deployment and runtime rules"; D-003, D-019). Path A and the Aiven/Hyperdrive notes below are not the production path.

Two supported paths, both wired in this repo:

## Path A — Render (fastest, free plan to start)

1. Push this repo to GitHub (done — main is current).
2. Render dashboard → New → Web Service → connect `ayodhyamohanthy/skipwaitmanus`.
   Render reads `render.yaml` (Blueprint). Fill the `sync: false` secrets:
   - WORKOS_CLIENT_ID / WORKOS_API_KEY / WORKOS_COOKIE_PASSWORD (Staging env values)
   - VITE_WORKOS_CLIENT_ID (same client id, Vite-exposed)
   - DATABASE_URL (Aiven free MySQL URI)
   - ZEPTOMAIL_API_KEY, R2_* (when enabling docs storage)
3. First deploy builds the Docker image (multi-stage: pnpm build → node dist).
4. WorkOS dashboard → AuthKit → Redirect URIs: add
   `https://<your-render-app>.onrender.com/api/auth/workos/callback`.
   Set WORKOS_REDIRECT_URI env var to the same value.
5. Health check: GET /api/opportunities returns 200.

## Path B — Cloudflare (credits-funded, full stack)

- Pages: connect repo; build `pnpm build`; output `dist/public`.
  Pages serves the SPA + PWA assets globally.
- Containers: deploy `Dockerfile` via `wrangler containers` (Workers paid plan
  required) as the API origin; route `/api/*` to it via a Worker or Pages
  `_redirects`.
- R2: bucket + S3 token → set R2_* env vars; document storage activates
  automatically (server/storageCloudflare.ts detects and switches).
- Hyperdrive: create a MySQL Hyperdrive binding against the Aiven URI for
  pooled connections from Containers.

## Workers Builds integration: DISABLED Oct 27 (do not re-enable)

Cloudflare's Git-connected "Workers Builds" for the `skipwaitmanus` Worker is
**disabled** (Workers & Pages -> skipwaitmanus -> Settings -> Builds ->
"Disable builds", saved Oct 27 IST; the repo connection itself is intact, so
re-enabling is one toggle). The founder confirmed the keep-OFF decision on
Oct 27 (affirmative reaction to the keep-OFF question,
phonemsg-01M5XS9JAG9MY933AWVWJVG8MN). Do not re-enable it.

Verified post-disable behavior (build history, Oct 27): pushes to `main`
produce **no** build entry at all; branch/PR-preview builds still fire as
green 0-second skips. Neither is deploy evidence: a green "Workers Builds"
check on a PR branch is a skip, never a build or deploy, and the required
merge gates never included it (the rulesets require only typecheck, the
unit/component/route tests, and the production build, so disabling stranded
no required check).

Why disabled: every code-carrying push to main made the integration run its own
`npx wrangler deploy`, which failed deterministically - the actual build log
(build 83bf990c, Oct 27) shows `The Docker CLI is needed to build the
configured image before deploying but could not be launched` at the deploy
step, because the managed builds environment has no Docker and the worker's
container needs one. It never reached the image build, so the earlier note
about a `COPY commit-sha.txt` failure was the wrong mechanism. The duplicate
deploy also risked racing the gated Deploy API workflow; disabling removes the
race entirely.

Truth for a deploy is unchanged: the **Deploy API GitHub workflow**
(`deploy-api.yml`, Docker-capable runner, migration-first gate, container
release acceptance gate) plus `/api/health` `commitSha`, cross-checked with the
`api-runtime` tag. Deploys, rollbacks (`rollback.yml`) and the container config
are untouched by the toggle.

This section previously said the red check was "Founder-approved to leave as
is (Oct 17)": that approval claim is **unverified** - no user-channel original
recovered. The Oct 27 disable was executed by the coordinator under the
standing cofounder mandate (free, reversible, no money, no outbound messages)
and is now the **confirmed owner decision** (keep OFF, Oct 27). Re-enabling
needs a fresh founder instruction, not the unverified Oct-17 note.

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

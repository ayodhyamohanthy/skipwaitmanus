# Deploying skipwait.me

> Production uses Cloudflare Pages, the Worker/container API and Azure MySQL. The owning GitHub workflows are `.github/workflows/deploy-pages.yml` and `deploy-api.yml`. This procedure describes the checked-in gates at `e8e161a06` (November 20, 2026); it is not evidence of a deployment or permission to change production. D-370 requires green required CI at every tier, with protected merge commits and no independent-review dependency. Issue #748 acceptance is tracked separately.

## Production release gates

Main pushes start only the workflows whose path filters match. Both also accept `workflow_dispatch` on `main`; a dispatch selects that ref's current tip, not an arbitrary commit. A docs-only push may start neither deploy. A workflow starting or completing successfully does not establish that its rollout steps ran.

Before production effects, `scripts/require-green-release.mjs` checks the full target SHA is on `main` and reads that SHA's own `ci.yml` runs from main push/dispatch events. PR and merge-group CI do not substitute for main CI. At least one matching run must exist, and every matching run returned by GitHub must have succeeded in its latest attempt, with `typecheck`, `unit + component + route tests` and `production build` successful on that exact SHA. A separate green run does not clear another failed or cancelled run of the same SHA.

The gate waits for pending CI for up to 45 minutes and missing CI for up to 10 minutes, polling every 30 seconds by default. Failed, cancelled or skipped CI refuses release; five consecutive GitHub errors also refuse it. The `--once` recheck before a production step never waits for CI, though it still retries GitHub read errors. Normal releases refuse a strict descendant already recorded by `api-runtime` or recent successful Pages runs. These records are not live-health probes.

- **API:** release gate, source-retirement classification and reviewer-reset preflight, then `migrate-db`. The preflight validates any requested reset's complete protected-secret pair before production writes; the migration and deployment jobs repeat that validation for individual-job reruns. The migration job also rechecks CI before applying pending SQL. Normal runs reach this job before runtime/pipeline/skip classification, so a pipeline-only run can still access the database. The verified source-retirement-only path skips migration and rollout. Runtime deployment then typechecks/builds, rechecks the gate before publication, deploys the Worker/container and verifies administrator sign-in and the canonical release. `api-runtime` moves only after acceptance.
- **Web:** release gate, build/prerender, then a gate recheck before Pages publication. If the push classifies as API-runtime work, Pages first waits up to 45 minutes for a canonical ready API at the same SHA or a Git descendant; failure prevents the upload. A manual Pages dispatch classifies the tip against its parent, not against the live API. After upload, the workflow checks the exact live `git-commit` meta tag.
- **Concurrency:** normal API and Pages runs use `deploy-api` and `deploy-pages`, respectively, with `cancel-in-progress: false`. In-progress work is retained, but pending runs can be replaced; this is not a promise that every queued SHA deploys. Inspect the run that actually executed.

### Retry a normal release

Inspect the intended SHA, CI run IDs, failed step and current live identities first. Correct the source or environment through its authorized route; do not weaken a check or retry around a payment-path failure. These are procedure examples, not actions executed by this documentation task:

```bash
# Repair each failed or cancelled matching CI run; a new run does not erase it.
gh run rerun "$CI_RUN_ID"

# If the current main tip has no eligible CI run:
gh workflow run ci.yml --ref main

# After the intended current tip's main CI passes, dispatch the affected surface:
gh workflow run deploy-api.yml --ref main
gh workflow run deploy-pages.yml --ref main
```

Re-running an existing workflow retains its original SHA; a new `--ref main` dispatch selects the current tip. Pages has no dispatch inputs. API exposes only the optional boolean `reset_reviewer_passwords` (default false), not credential values, a target SHA or a bypass. For an authorized reset, the provisioning owner must first supply both `REVIEWER_SEEKER_PASSWORD_HASH` and `REVIEWER_REFERRER_PASSWORD_HASH` through protected repository secrets. Then dispatch Deploy API on main with `reset_reviewer_passwords=true`, or `reviewer-qa-passwords.yml` with `confirm=reset`, which dispatches the same gated release. Ordinary deploys omit reviewer material and retain current bindings. Never put passwords or hashes in workflow inputs, command arguments, logs or artifacts. Implementation is merged, but a dispatch is only a request: follow the actual release through its gates and exact readiness, then record both demo sign-ins on that release. Live reset acceptance remains unverified until that evidence exists. Existing approved demo sessions may continue only their bounded no-money QA.

**Web catch-up (DEPLOY-web-catch-up, D-388):** after every CI run on `main` completes, `deploy-web-catch-up.yml` runs `scripts/deployWebCatchUp.mjs`. When that CI was a green push to `main`, its head is still `main`'s tip, the live web's `git-commit` is an ancestor of it, no Deploy Web run for it is already queued or running, and a commit since the live one touches Deploy Web's own push paths, it dispatches `deploy-pages.yml` on `main`. That is the manual recovery above, run for you; every Deploy Web gate still applies in the dispatched run. A refused web deploy therefore ships once `main` is green again. It skips with a warning when the live commit cannot be read or is not an ancestor (a rollback), and never overrides a rollback. Manual dispatch remains the fallback.

**Remaining liveness limitation (API):** `ci.yml` cancels in-progress runs by ref. A later docs-only push can cancel the exact CI an earlier deploy needs while matching neither deploy's path filters. Passing later CI does not automatically retry a refused API deploy or catch up a missed runtime change (the web catch-up above covers the web only). Reconcile the actual source delta, get the intended SHA's own CI green and explicitly rerun/dispatch the affected workflow. Do not treat the earlier candidate as verified because the previous release stayed healthy.

### Deliberate older-target recovery

Use `rollback.yml` from `main` only when recovery is authorized. Its `target` is `api` (default), `web` or `all`. Supply a full lowercase 40-character SHA on main as both `commit` and `confirm`, plus a nonblank reason of at most 500 characters after trimming:

```bash
gh workflow run rollback.yml --ref main \
  -f target=all -f commit="$SHA" -f confirm="$SHA" \
  -f reason='Why this known-green release is needed'
```

The trusted workflow code and target artifact are separate checkouts. Both recovery legs require the target's own green main CI and recheck before publishing. API recovery additionally requires `drizzle/deploy`, `drizzle/schema.ts` and `server/schemaReconcile.ts` to match the trusted workflow SHA. This compares source contracts, not the live database; recovery runs no deploy migrations or schema downgrade. A schema mismatch refuses recovery and needs a compatible target or an authorized forward fix.

No actor input exists. The gates record the GitHub actor, target SHA, workflow SHA, reason and run/attempt; the API gate also records the triggering actor on retries. This audit trail does not grant authorization. Recovery shares `deploy-api` even for `target=web`; its web job also shares `deploy-pages`. For `all`, Web must verify before API starts. The two publishes are not atomic, and a failed post-publish check does not undo either publish.

### Verify the surface that changed

Record the workflow run/attempt and actual rolled-out SHA separately from the PR head, merge SHA and current main. Path filters can leave web and API at different compatible commits.

```bash
EXPECTED_SHA="$API_SHA" bash scripts/verify-cloudflare-container-release.sh
```

API acceptance requires canonical `https://skipwait.me/api/health/ready` to return HTTP 200 JSON with `service=skipwait-api`, `state=ready` and the exact baked SHA. The direct public Worker readiness URL must return 404. The script prints `RUNTIME CONVERGED`; `api-runtime` is the accepted API marker. This script does not query the active Cloudflare version, image digest or every container instance. Where active-revision or capacity evidence is required by the incident/packet, obtain that control-plane evidence separately through the authorized route; do not claim it from a health response.

For a normal Web release, check the canonical homepage's exact `git-commit` meta tag against the intended Pages SHA. Web recovery additionally verifies Cloudflare Pages' canonical production-deployment commit and the live meta tag both equal the target. `Release verify` runs separately and does not automatically trigger on rollback. A green smoke run against an earlier healthy release does not verify a failed candidate. Run the applicable no-money basics and changed-flow checks from `docs/BUGFREE_GATE.md`, with 1280/390 captures for changed UI. Never send an OTP to an inbox you cannot read or create a payment as a health check.

## Historical alternative-environment notes

The Render/Aiven/Hyperdrive setup notes below are not the production release or recovery procedure. They do not authorize a new service, paid plan, settings change or bypass of the gates above. Verify configuration and free-only eligibility before any separately approved environment work.

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

## Workers Builds is not the production release gate

The October 27 record described production builds being disabled and the owner's
keep-off instruction. That dated record does not verify the current Cloudflare
setting. D-369 (November 20) records a later branch-preview/version interaction
that prevented post-deploy secret edits, and retains the request to disconnect
the repository integration. Do not claim the duplicate-writer/version risk is
eliminated from an old status note or a green preview check.

D-182 still applies: Workers Builds is neither required CI nor proof that a
production release ran. The gated GitHub workflows and canonical identities
above are the release evidence. Do not re-enable production builds or change
Cloudflare integration settings through this docs task; settings remain the
owner's. No current dashboard inspection or configuration change is claimed.

## Database migrations

Production: never apply schema changes by hand. After its exact-SHA CI recheck,
`migrate-db` runs `scripts/apply-deploy-migrations.sh`: lint, connect to the
configured MySQL target, then apply pending `drizzle/deploy/*.sql` in filename
order. `schemaDeployMigrations` records each filename, checksum and commit.
A changed checksum or failed SQL blocks code deployment. Earlier statements or
files may already have applied; the gate does not undo them. Inspect the actual
target, ledger and partial state before an authorized forward fix. Keep applied
files immutable and new migrations idempotent; never bypass the ledger.

A new non-production environment only, once after its first deploy:

```
DATABASE_URL=<uri> pnpm db:push
```

## Post-deploy verification checklist

- Record the actual API/Pages target SHA, run and attempt; confirm the relevant rollout steps executed.
- For API, run the exact-release script above and check canonical readiness, `api-runtime` and the closed direct origin. Record any additional active-revision evidence required by the packet separately.
- For Web, verify the canonical homepage's exact `git-commit` meta tag; an HTTP 200/title alone is insufficient.
- GET /api/auth/workos/sign-in → 302 to `/sign-in` (no provider: seekers never see the hosted WorkOS page, D-030/D-049); GET /api/auth/workos/sign-in?provider=google → 302 to api.workos.com authorize.
- Run only the authorized no-money basics and changed-flow checks from `docs/BUGFREE_GATE.md`. Existing session/access limits still apply; no OTP, sign-in, notification or account mutation is authorized merely by this checklist.
- A failed/skipped/cancelled deployment and a healthy earlier release are separate outcomes. Record the candidate as unverified until its own acceptance passes.

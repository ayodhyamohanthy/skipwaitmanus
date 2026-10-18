# Deploying skipwait.me

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

## Expected red check: "Workers Builds: skipwaitmanus" on main

Cloudflare's own Git-connected build for the `skipwaitmanus` Worker runs `npx wrangler deploy` on every push to main and fails at the Docker step (`COPY commit-sha.txt` - that file is generated only by the Deploy API GitHub workflow). It fails before anything is uploaded, so production is unaffected, and the check is green on PR branches. Do not chase it, and do not make the Dockerfile tolerate the missing file: Cloudflare's build would then succeed and deploy an unversioned container to production, racing the gated Deploy API workflow. Truth for a deploy is the Deploy API run plus /api/health `commitSha`. (Founder-approved to leave the Cloudflare setting as is, Oct 17.)

## Database migrations

Run once per environment after the first deploy (or locally against the prod
URI):

```
DATABASE_URL=<uri> pnpm db:push
```

Migrations 0000–0028 create the full schema, including workEmailOtpCodes and
referrerSlackWebhooks.

## Post-deploy verification checklist

- GET / → 200 with skipwait.me title
- GET /api/auth/workos/sign-in → 302 to `/sign-in` (no provider: seekers never see the hosted WorkOS page, D-030/D-049); GET /api/auth/workos/sign-in?provider=google → 302 to api.workos.com authorize
- GET /api/auth/workos/admin?email=<admin> → 302; other emails → 403
- POST /api/work-email/otp/send with a session → 200/429/400 per state
- Sign in end-to-end in a browser; verify /start renders the signed-in state

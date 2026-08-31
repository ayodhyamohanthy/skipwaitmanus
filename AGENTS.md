# skipwait.me — agent handoff

Everything needed to work on this repo from a clean clone. No tribal knowledge.

## What this is
Mobile-first PWA: a job seeker posts one job URL + resume; only verified
employees of that employer can review it. Two auth planes:
- **Seekers**: WorkOS AuthKit (Google/social + email) — client SDK runs the
  PKCE flow; API calls carry either the SDK's Bearer JWT (verified against
  WorkOS JWKS) or the `app_session_id` cookie issued at `/api/auth/workos/callback`.
- **Referrers**: work-email OTP IS the login (`/api/auth/otp/send|verify`);
  verification auto-enrolls the referrer profile for that company domain.
- **Admin**: only `SKIPWAIT_ADMIN_EMAIL` may use `/api/auth/workos/admin`.

## Commands
```bash
pnpm install          # pnpm 10.4.1 pinned via packageManager; node >=22
pnpm dev              # Express+Vite on :3000 (dev sign-in widget appears)
pnpm check            # tsc --noEmit
pnpm test             # vitest (unit + component + route regressions)
pnpm build            # client PWA + server bundle -> dist/
./scripts/sync-check.sh   # repo sync guard (run after work sessions)
```

## Environment
- Copy `.env.example` → `.env`. Minimum for local dev: `JWT_SECRET` (any random
  string) and `VITE_APP_ID=skipwait` (session payloads REQUIRE a non-empty appId).
- `DATABASE_URL` optional locally (in-memory fallback); production uses Azure MySQL.
- WorkOS keys are production-only; without them the dev-auth plane is active.
- All variables are documented in `.env.example` and README.

## Deploy (fully automated, no local Docker)
- Push to `main` → GitHub Actions:
  - `deploy-api.yml`: typecheck → build → `wrangler deploy` (Cloudflare
    Containers; image built remotely). Secrets live in the Worker secret store
    (`wrangler secret put`) and are forwarded into the container by the
    `SkipwaitApi` class in `src/worker.ts`.
  - `deploy-pages.yml`: build + `wrangler pages deploy` → skipwait.me/www.
- Repo secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts + Containers + Pages +
  KV edit), `CLOUDFLARE_ACCOUNT_ID`.
- **Containers do NOT inherit Worker secrets automatically** — the env
  passthrough in `src/worker.ts` is load-bearing. If you add a secret, set it
  with `wrangler secret put <NAME>`; it reaches the container on next start.

## Architecture map
| Area | Path |
|---|---|
| Client pages | `client/src/pages/` (wired in `App.tsx`) |
| Auth compat (Clerk-shaped → WorkOS) | `client/src/_core/auth.tsx` (aliased from `@clerk/react`) |
| tRPC routers | `server/routers.ts` |
| REST routes (referrals, docs, admin) | `server/privateReferralRoutes.ts` |
| Identity resolution | `server/_core/workosAuth.ts` (JWT JWKS + cookie) → `devAuth.ts` |
| tRPC context | `server/_core/context.ts` (must use `resolveWorkosIdentity` in prod) |
| Sessions | `server/_core/sdk.ts` (`createSessionToken`/`verifySession`; HS256, `JWT_SECRET`) |
| OTP service | `server/workEmailOtp.ts` (codes in `workEmailOtpCodes`, hashed) |
| Storage | R2 if configured → managed Forge → DB (`server/storageDb.ts`, `documentBlobs`) |
| Employer routing (LinkedIn→company) | `server/employerRouting.ts` + `resolveEmployerDomainFromTargetUrl` in `server/db.ts` |
| Schema/migrations | `drizzle/schema.ts`, `drizzle/00xx_*.sql` |

## Non-obvious invariants (learned the hard way)
1. Session JWTs embed `appId` from `VITE_APP_ID`; `verifySession` rejects empty
   ones — sign-in then instantly-signed-out means this regressed.
2. `JWT_SECRET` rotation invalidates all sessions at once. Rotate deliberately.
3. Credits: `spendToken` reserves a credit per referral; approvals grant the
   pending invite rewards (`invite_reward_pending` → `granted`).
4. Employer resolution is deliberately strict: job-board links must map to a
   verified referrer company domain (URL candidates → page evidence → handle
   prefix match). Unresolvable links are rejected with a clear error.
5. Azure MySQL clock can skew vs app servers — never compare DB NOW() with JS
   Date.now() for correctness-critical logic; compute timestamps in JS.
6. The deployed web bundle must be built from the same commit as the API
   (contract: tRPC + REST shapes). CI deploys both on every push; check
   `scripts/sync-check.sh` when working locally.

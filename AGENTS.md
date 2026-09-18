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

## Plan and inspect before edits
Before changing source, configuration, schema, dependencies, tests, or docs:
1. Inspect the current branch/worktree, latest `origin/main`, target files, their
   callers/tests, and any active coordination record.
2. Write a short plan naming the affected files, load-bearing assumptions,
   contract or data-flow changes, proposed logic, verification to add/run, and
   deployment or migration impact.
3. Resolve any uncertain identity, authorization, transaction, API, schema,
   styling, dependency, or production-state assumption before editing.
4. Reread each target immediately before modifying it. If source or HEAD changed
   since the plan, stop, reconcile, and update the plan rather than overwriting.

The plan may be concise for a small change, but it may not be skipped. Keep the
implementation inside the listed scope; revise the plan explicitly when scope
changes.

## Working agreement: multi-agent collaboration
- Read [COLLABORATION.md](./COLLABORATION.md) before editing. It is the shared
  protocol for every platform and model working on this repository.
- Coordinate ownership through a shared GitHub issue or draft PR; use one
  isolated branch/worktree per session. Never overwrite or commit another
  session's dirty files, or switch branches in a shared active working tree.
- Default to feature branches and reviewed PRs with serialized integration,
  not concurrent automatic pushes to main. Follow applicable user/tool
  authorization before committing, pushing, merging, or deploying.
- Validate the integrated result (`pnpm check` + affected Vitest files;
  `pnpm build` for runtime/dependency changes) and leave an explicit handoff.
- A push to main triggers both Cloudflare deploys; no local Docker needed.

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
| Auth provider (WorkOS AuthKit) | `client/src/_core/auth.tsx` (WorkOS-backed hook surface) |
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

## Product and identity constraints
- A person is one canonical account plus verified login aliases. Resolve an
  exact alias before normalized verified-email linking. WorkOS and work-email
  OTP must converge atomically on that canonical person.
- Never merge on an unverified email. Freeze ambiguous historic duplicates for
  operator review; never combine wallets, credits, referrals, employer records,
  or other business state while identity is ambiguous.
- Suspension and session revocation apply to every alias of the canonical
  person. Identity, access, credits, one-time consumption, replay protection,
  and webhook terminal state must be durable, transactional state, never
  process-memory decisions.
- Real payment execution is prohibited in engineering and QA. Use provider test
  modes, mocks, or synthetic fixtures. FreeCoffee is a separate product and is
  out of scope for this repository.

## Verification is part of every feature
- A feature or fix without self-checking verification is incomplete. Ship the
  smallest useful set of focused unit/component tests, endpoint scripts, and
  deterministic mock-data/fixture generators alongside the implementation.
- Backfill missing checks whenever touching an existing area. Cover success,
  failure, retry, idempotency, concurrency, authorization changes, and response
  loss where those states apply. Never weaken an existing test to land a fix.
- Run focused tests while iterating, then `pnpm check`; use `pnpm build` for
  runtime, dependency, or bundling changes. Production acceptance requires the
  exact deployed commit and the real endpoint/UI behavior, not a green build or
  successful upload alone.

## Observability means fix ownership
- Sentry is a repair loop, not a logging destination. Server uses
  `@sentry/node`; client uses `@sentry/react`. Keep DSNs environment-gated and
  scrub tokens, query strings, personal data, credentials, and single-use links.
- Every event must carry actionable release and environment identity. New
  production issues are fix work: deduplicate and triage, reproduce, add a
  regression check, fix, deploy, and close only after the exact release is
  verified in production.

## Deployment and runtime rules
- A push, upload, or successful deploy command is not deployment truth. Gate on
  canonical `https://skipwait.me`, exact baked commit SHA, readiness, and the
  expected active Worker/container revision. Keep `workers.dev` disabled and
  verify it remains unavailable.
- Serialize production writers so latest `main` wins. Reconcile unexpected
  remote changes before overwriting. Do not let stale queued workflows activate
  after a newer release. Never delete the Containers application to recover a
  rollout.
- Cloudflare container capacity changes are control-plane changes: verify the
  live application value and active instances. Container env passthrough in
  `src/worker.ts` must be updated for each new server secret. Return temporary
  capacity increases to the documented steady-state only after the new exact
  revision is healthy and old instances are drained.
- Schema-dependent code stays off `main` until the matching production migration
  exists and is verified. The web/API contract must come from the same compatible
  source state.

## Styling and dependency boundary
- `DESIGN.md` is the frozen product visual contract derived from the approved
  Refero direction. Reuse its tokens and components; run
  `node scripts/design-token-audit.mjs` for touched product UI. Do not drift the
  palette, typography, radii, motion, disabled states, or one-primary-action
  rule. Do not reintroduce legacy palette shims.
- Prohibited UI choices: gradients, glassmorphism, neon/glow decoration, blurred
  orbs, cream/brown/terracotta colors, condensed uppercase headings, Unicode
  glyph icons, nested cards, decorative kickers, faded disabled controls, and
  ad-hoc colors outside `DESIGN.md`.
- Do not add an alternate auth/session library, a direct client-to-database or
  provider-secret dependency, a standalone `@better-auth/react` package, or an
  unreviewed payment/provider SDK. Import client contracts from `shared/`, not
  server implementation modules. Any new runtime dependency needs a written
  reason, lockfile review, focused verification, and production build evidence.

## AI model swap (no code changes)
The AI features (smart pitch, copilot, fit summary, referrer matching) go
through `server/_core/modelRouter.ts`: any OpenAI-compatible endpoint works.

Swap = set three values, redeploy (or `wrangler secret put` for the key):
```
AI_PROVIDER_BASE_URL=https://api.groq.com/openai/v1   # or Together/Fireworks/DeepSeek/Qwen/Mistral/OpenRouter/vLLM/Ollama
AI_PROVIDER_API_KEY=...        # secret: wrangler secret put AI_PROVIDER_API_KEY
AI_MODEL=llama-3.3-70b-versatile
```
Verified behaviors: config-only model swap works; provider outage returns the
built-in deterministic fallback text (features never hard-fail).

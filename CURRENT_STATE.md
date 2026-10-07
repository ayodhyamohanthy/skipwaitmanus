# CURRENT_STATE.md — SkipWait.me repository inventory (V0-01)

Verified 2026-09-24 against `origin/main` @ `42002c3` in an isolated worktree.
Method: direct tree reads (routes, schema, workflows, package scripts); no
memory claims. Historical session context was re-verified, not trusted.

## 1. Stack (kept per playbook §6.1/§10.1 — it works)

| Layer | Actual |
|---|---|
| Language/runtime | TypeScript 5.9.3, Node ≥22, pnpm 10.4.1 (`package.json`) |
| Server | Express 4.21.2 + tRPC 11 + React Query 5 (`package.json`) |
| Client | React 19 + Vite 7 + wouter router + Tailwind (`package.json`, `client/src/App.tsx`) |
| Persistence | Drizzle ORM + mysql2 → Azure MySQL via `DATABASE_URL` (`server/db.ts`) |
| Auth | Two planes: WorkOS AuthKit (seekers/admin, `server/_core/workosAuth.ts`) + work-email OTP (referrers, `server/_core/otpLogin.ts`, `server/workEmailOtp.ts`); dev plane when keys absent (`server/_core/devAuth.ts`) |
| Hosting | Cloudflare Containers + Worker (`wrangler.jsonc`, `src/worker.ts`, `Dockerfile`); web via Cloudflare Pages; Render blueprint kept (`render.yaml`) |
| Billing | Chargebee (`server/chargebee*.ts`), Razorpay + PayPal webhooks (`server/paymentWebhooks.ts`, `server/payments.ts`) |
| Email | ZeptoMail primary, Resend fallback (`server/emailDelivery.ts`) |
| AI | Vendor-neutral OpenAI-compatible `modelRouter.ts`; callers in `server/ai.ts`, `server/routers.ts`; deterministic fallbacks, no new provider needed |
| Errors/analytics | Sentry server+client (`server/sentry.ts`, `client/src/lib/sentry.ts`); no PostHog in tree |

## 2. User flows that exist (51 `<Route>` entries, `client/src/App.tsx`)

Seeker: `/start` (job-link onboarding) → `/request` → `/requests` (status timeline) → `/conversation/:id` (milestones + messaging) → `/share`. Referrer: `/referrer` (OTP + review + ATS-blurb drawer) → `/inbox` (queue tabs, one-click review) → `/referrer/impact`. Discovery: `/jobs`, `/wall`, `/post-opportunity`. Billing: `/premium`, `/plans` (incl. gift buy/claim). Comms: `/notifications`, `/messages`, `/share`, `/share-card/:token`, `/email-review/:linkToken`, `/fast/:linkCode`, `/refer/:slug/:alias`. Employer: `/employer`, `/employer/talent|billing|opportunities`. Admin (12 routes): activity, approvals, payments, privacy, flow-health, token-recovery, users, schema, smoke, partners. Policy/static: `/terms /refunds /privacy /support /shipping /cancellations /about /contact /pricing /offline` + catch-all 404. Server: REST groups in `server/*Routes.ts` + tRPC `server/routers.ts` (see §3 of session notes for the full prefix map).

## 3. Database, storage, integrations

- **55 tables** (`drizzle/schema.ts`): identity (canonicalPeople/users/verifiedLoginAliases), OTP, requests + transition events, attachments + resumable uploads, DMs, notifications, wallets/ledger, promo + gift fulfillments, Chargebee subscription intents/events, employer/talent, partners, privacy requests, operational activity log.
- **65 migration files** (`drizzle/0000`–`0062`; duplicate numbers `0031`×2, `0061`×2 — dev-tree untidiness, zero prod effect). Prod path: `drizzle/deploy/` (3 files) via `scripts/apply-deploy-migrations.sh` (sha-pinned ledger) + boot self-heal `server/schemaReconcile.ts`.
- Storage: R2 primary (S3-compat), DB-bytes fallback, legacy Forge proxy. Resumes private; short-lived/proxied access; per-request authorization.
- Integrations live: Chargebee (packs, subscriptions, gifts), Razorpay/PayPal webhooks (verify-then-credit, fail-closed), WorkOS (seeker/admin + user.deleted webhook), ZeptoMail/Resend, Sentry, modelRouter AI.

## 4. Deployments, tests, costs

- CI (`ci.yml`): typecheck + vitest + production build. Deploy: `deploy-api.yml` (migration gate → Containers) and `deploy-pages.yml` (Pages). Guards: `design-gate.yml`, `drift-watch.yml`, `sync-guard.yml`, `rollback.yml`.
- Tests: ~186 `*.test.*` files (server 115, client ~68, shared 1, scripts 2). `pnpm check` (tsc), `pnpm test` (vitest), `pnpm build` (Vite + prerender + esbuild), `pnpm quality:gate`.
- Costs: **no cost ledger exists in the repo** (founder-owned). Known free/credit-funded surface: Cloudflare (credits), Render free blueprint, Aiven free MySQL (per `docs/DEPLOY.md`). Provider keys are production secrets, never in tree.

## 5. Known defects and risks (all verified this session)

1. **CI red repo-wide**: self-hosted Mac runner offline; every run fails in ~5s at setup (verified `gh run list`, 2026-09-24). Open PRs (#112, #113, others) cannot get checks. Owner: founder (runner hardware).
2. **Main worktree conflicted**: foreign stash `stash@{0} (foreign-rewrite-20260908-2112-before-flow-audit)` partially applied in the main checkout; all session work proceeds in isolated worktrees. Owner: founder decision (abandon vs. active session).
3. **Duplicate drizzle numbers** (`0031`, `0061`): cosmetic; prod reads `drizzle/deploy/` + reconcile. Cleanup needs operator sign-off (reviewed history).
4. **Live provider verification blocked**: no Chargebee test-site keys in any secret store; gift/subscription paths are fixture-proven, not live-proven. Owner: founder.
5. No `TODO/FIXME/HACK` or conflict markers in `client/src`, `server`, `shared`, `src` (grepped). No PostHog/analytics pipeline in tree (playbook §10 events not yet instrumented — V1.5+ work).

## 6. What maps to the playbook already (V0-02 input, not started)

V1 core loop exists (request/inbox/tracking/files), OTP verification exists, credits/subscriptions/gifts exist behind test gateway, admin + employer surfaces exist, policy pages exist. Gaps vs. playbook V1: PLAYBOOK.md itself (founder upload pending), analytics events (§10), pool-mode UI depth, re-verification lifecycle, moderation queue depth — to be triaged in V0-02/PROGRESS.md.

# skipwait.me — private job referrals, made simpler

> AI models and contributors: read [`docs/BRIEF.md`](docs/BRIEF.md) first (D-073), then `AGENTS.md`.
>
> **Owner says `build`, `resume`, `continue` or `next`?** They all mean one thing: run `node scripts/next-task.mjs --claim "<your model name>"` and do only what it prints, step by step. It adds a session tag and prints your full name (for example `Qwen 3 · k3f9`): use exactly that name for every later flag and when you resume (read it from the holder column of `--status`; never invent a new one), and never share a name with another session. Order, each top down: red `main`; your own unfinished work (pending work ranked above it with nobody on it comes first); pending work nobody is on; new work. A red or blocked priority holds its own lane and the tasks that depend on it (red `main` holds everything), so agents never take the same task and other lanes keep moving (D-109). A claim with no push and no `--heartbeat` for 2 hours is free. Push after every commit, report to the CEO with `--report` when you stop, and read the board with `--status`; never resume or choose work from memory. Claude Code is the CEO, claims as `--claim "Claude Code"` and sets the order in `docs/plans/assignments.json`; the open models (CTO, CDO and the team) build (D-083, D-085).

A mobile-first PWA where a Job Seeker shares one real job link and a resume, and only verified employees of that employer can review it. Employee identities stay hidden until a Referrer chooses to claim and approve a request.

- **Stack:** React 19 + Vite + Tailwind 4 + tRPC + Express + Drizzle (MySQL) + WorkOS AuthKit auth + Chargebee payments (Razorpay for INR, PayPal for USD as its gateways, D-004) + Cloudflare (Pages + Containers)
- **Product docs:** start with `AGENTS.md` and `docs/DECISIONS.md` (the decision register wins over every other doc); also `docs/skipwait-vibecodingapp-handoff.md` (original build spec), `todo.md` (history), `GROWTH_AND_MONETIZATION_AUDIT.md` (its pricing is superseded by D-146; see `docs/PRICING.md`)

## Quick start (local development)

```bash
pnpm install

# configure the local environment
cp .env.example .env
# then set at minimum:
#   JWT_SECRET=any-long-random-string   (signs the local session cookie)
#   VITE_APP_ID=local-dev               (required in session payloads)

pnpm dev        # server + Vite on http://localhost:3000
```

### Local dev sign-in (no WorkOS keys needed)

On a fresh clone there are no WorkOS credentials, so the app falls back to a
**local dev session**:

- The server registers `server/_core/devAuth.ts` (dev-auth routes)
  (`/api/dev-auth/session|login|logout`), which issues the same
  `app_session_id` JWT a real OAuth login would.
- `client/src/_core/auth.tsx` exposes the shared hook surface (`useAuth`,
  `useUser`, `SignInButton`, `SignedIn`, `SignedOut`) on top of WorkOS AuthKit
  plus the server `app_session_id` cookie session; with no keys it falls back
  to the server-session-only mode for local dev.
- A small "Local dev sign-in" widget (bottom-left) creates a session on this
  machine only. It never grants anything beyond the role derived by
  `resolveSyncedUserRole` (admin only for the durable admin email), and it
  disappears entirely once real WorkOS keys are configured.

Without a database the signed-in shell still works (dev sessions live in
process memory); data-backed features show their honest empty/error states.
Real work-email OTP requires `ZEPTOMAIL_API_KEY` (any transactional sender
  wired in `server/workEmailOtp.ts` works).

## Environment variables

| Variable | Used for |
|---|---|
| `JWT_SECRET` | Session cookie signing (required for dev auth) |
| `VITE_APP_ID` | App id embedded in session payloads |
| `DATABASE_URL` | MySQL connection (optional locally; in-memory dev sessions otherwise) |
| `WORKOS_CLIENT_ID` / `WORKOS_API_KEY` / `WORKOS_COOKIE_PASSWORD` / `WORKOS_REDIRECT_URI` | Production WorkOS AuthKit auth (disables the dev fallback when set; redirect URI `https://skipwait.me/api/auth/workos/callback`) |
| `VITE_WORKOS_CLIENT_ID` / `VITE_WORKOS_ENABLED` | Browser side of AuthKit (client id is public) |
| `ZEPTOMAIL_API_KEY` / `ZEPTOMAIL_FROM_EMAIL` | Work-email OTP delivery (referrer sign-in) |
| `R2_*` (optional) | Cloudflare R2 document storage; falls back to the database adapter when unset |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | Direct provider APIs: the Razorpay employer checkout (on until Chargebee employer prices exist, D-069) and PayPal webhook verification (Razorpay webhooks use `RAZORPAY_WEBHOOK_SECRET`). Seeker checkout runs only through Chargebee; the direct seeker order routes return 503 (D-004) |
| `SKIPWAIT_ADMIN_EMAIL` | The only address allowed through the admin sign-in gate |
| `VITE_APP_TITLE` | Managed app title (`skipwait.me`) |
| `CHARGEBEE_SITE` / `CHARGEBEE_API_KEY` / `CHARGEBEE_WEBHOOK_SECRET` | Payments (webhook-only fulfillment) |
| `CHARGEBEE_LIVE_API_KEY` | Live-site operations |
| `RESEND_API_KEY` / `ERROR_ALERT_FROM_EMAIL` | Transactional email + error alerts |
| `OAUTH_SERVER_URL` / `OWNER_OPEN_ID` | Managed Manus hosting runtime (leave blank locally) |
| `RUN_EXTERNAL_CREDENTIAL_TESTS` | Opt-in live credential test gate (`true` to enable) |

See `.env.example` for the full list.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (Express + Vite middleware) on `:3000` |
| `pnpm check` | TypeScript, no emit |
| `pnpm test` | Vitest suite (unit + component + route regressions) |
| `pnpm build` | Production client (PWA) + server bundle into `dist/` |
| `pnpm quality:gate` | `check` + `test` + `build` |
| `pnpm db:push` | Generate and run Drizzle migrations (needs `DATABASE_URL`) |

## Where things live

| Area | Path |
|---|---|
| Pages / routes | `client/src/pages/`, wired in `client/src/App.tsx` |
| Auth provider surface | `client/src/_core/auth.tsx` (WorkOS AuthKit hooks) |
| Payment route detection (INR/USD) | `client/src/lib/paymentRoute.ts` |
| tRPC routers | `server/routers.ts` |
| REST routes (referrals, uploads, admin) | `server/privateReferralRoutes.ts` |
| Chargebee checkout/webhooks | `server/chargebeeRoutes.ts` |
| Data layer | `server/db.ts`, schema in `drizzle/schema.ts` |
| Shared contracts | `shared/` |
| Dev auth fallback | `server/_core/devAuth.ts` + `server/_core/context.ts` |

## Verification notes

- Tests never depend on the host machine's locale/time zone: payment-route
  regressions mock `browserPaymentRoute` and cover both USD-first and
  INR-first presentations.
- Live external credential checks (Chargebee API, Resend API) are gated behind
  `RUN_EXTERNAL_CREDENTIAL_TESTS=true` and skipped otherwise.
- Production auth is WorkOS-only: the dev-auth fallback routes are registered
  only when WorkOS credentials are absent.

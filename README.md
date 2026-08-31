# skipwait.me — private job referrals, made simpler

A mobile-first PWA where a Job Seeker shares one real job link and a resume, and only verified employees of that employer can review it. Employee identities stay hidden until a Referrer chooses to claim and approve a request.

- **Stack:** React 19 + Vite + Tailwind 4 + tRPC + Express + Drizzle (MySQL) + WorkOS AuthKit auth + Razorpay/PayPal/Chargebee payments + Cloudflare (Pages + Containers)
- **Product docs:** see `docs/skipwait-vibecodingapp-handoff.md` (build spec), `todo.md` (history), `GROWTH_AND_MONETIZATION_AUDIT.md`

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
- Vite aliases `@clerk/react` to `client/src/_core/auth.tsx`, a WorkOS-backed
  compat module exposing the Clerk-shaped hook surface (`useAuth`, `useUser`,
  `useClerk`, `SignInButton`); with no keys it renders the local dev sign-in.
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
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | INR / USD checkout (optional; Chargebee remains the fallback) |
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
| Clerk dev shim | `client/src/_core/clerkShim.tsx` + alias in `vite.config.ts` |
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
- Production behavior is unchanged when Clerk keys are present: the shim and
  dev auth routes are registered only in their absence.

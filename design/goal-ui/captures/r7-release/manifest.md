# D-048-R7-prep capture manifest

Isolated release-preparation evidence for the policy + system + links trio.
Nothing here is a live release: `RELEASED` is unchanged and no production
override was published.

## Build and auth

| Field | Value |
|---|---|
| Exact head captured | `267043aa` (branch `agent/r7prep/eb38-emails-drift`, base `origin/main` `7dcc2cc5`) |
| Build | `VITE_GOAL_SURFACES=policy,system,links pnpm build` — only the trio ids on, nothing else added to `RELEASED` |
| Server | `node design/goal-ui/captures/r7-release/capture.mjs` — local static server over `dist/public`, SPA fallback |
| Auth | **Simulated.** No session cookie, no token, no backend. Every `/api/**` request is fulfilled at the network layer from `fixtures.json`; anything not named there answers `401 {"error":"Signed out"}` |
| Data | **Synthetic only.** `northwind.example`, `contoso*`, `fx-*` fixtures. No real person, company, customer, payment or mail |
| Browser | Playwright Chromium, viewports 1280x900 @1x and 390x844 @2x (mobile, touch) |
| Overflow gate | `horizontalOverflowPx` 0 on all 18 shots (see `results.json`) |

## Shots

| State | Route | Fixture | Auth |
|---|---|---|---|
| `policy-privacy` | `/privacy` | none (static legal frame) | simulated signed-out |
| `policy-terms` | `/terms` | none (static legal frame) | simulated signed-out |
| `emails-code` | `/emails` | none (reference gallery, fetch-free) | simulated signed-out |
| `emails-review-ready` | `/emails` → "Review ready" | none (reference gallery, fetch-free) | simulated signed-out |
| `offline` | `/offline` | none (fetch-free) | simulated signed-out |
| `app-states` | `/app-states` | none (fetch-free) | simulated signed-out |
| `fast-ready` | `/fast/fx-link-0001` | `GET /api/referrer-fast-track/fx-link-0001` 200 `{link:{companyDomain:"northwind.example",isActive:true}}` | simulated signed-out |
| `vanity-ready` | `/refer/northwind/fx-alias` | `GET /api/referrer-fast-track/vanity/northwind/fx-alias` 200, same body | simulated signed-out |
| `share-ready` | `/share-card/fxsharetoken000000000001` | `GET /api/referral-share-cards/public/fxsharetoken000000000001` 200 `{card:{companyDomain:"northwind.example",status:"accepted",inviteCode:"r1-fx000001"}}` | simulated signed-out |

Each state has `-1280.png` and `-390.png`.

## What the captures show

- `/emails` subject now reads `⟨6-digit code⟩ is your skipwait.me verification code`, matching `otpEmailMessage()` in `server/workEmailOtp.ts`.
- `/emails` review-ready body ends `Open the private review page to inspect and confirm a decision. Opening this link never records a decision.`, matching `server/referrerReviewEmail.ts`.
- `/terms` and `/privacy` render the goal static frame with the legal text unchanged.
- `/fast`, `/refer` and `/share-card` render the goal link landings, not the kit pages, under the trio-only flag.

## Not verified here

- Real signed-in states for the three link landings (no session was minted; the packet forbids credentials and real data).
- Any production surface: the trio ids stay off in `RELEASED`, so production still serves the kit pages.
- The error/loading variants of the link landings beyond what `D-048-p3-links` already captured.

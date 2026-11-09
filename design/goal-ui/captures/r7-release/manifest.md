# D-048-R7-prep capture manifest

Isolated release-preparation evidence for the policy + system + links trio.
Nothing here is a live release: `RELEASED` is unchanged and no production
override was published.

## Build and auth

| Field | Value |
|---|---|
| Exact head captured | `31d92128` (branch `agent/r7prep/eb38-emails-drift`; `origin/main` `0aa3a9ee` is an ancestor of it) |
| Build | `VITE_GOAL_SURFACES=policy,system,links pnpm build` — only the trio ids on, nothing else added to `RELEASED` |
| Server | `node design/goal-ui/captures/r7-release/capture.mjs` — local static server over `dist/public`, SPA fallback |
| Auth | **Simulated.** No session cookie, no token, no backend. Every `/api/**` request is fulfilled at the network layer from `fixtures.json`; anything not named there answers `401 {"error":"Signed out"}` |
| Data | **Synthetic only.** `northwind.example`, `fabrikam.example`, `fx-*` fixtures. No real person, company, customer, payment or mail |
| Browser | Playwright Chromium, viewports 1280x900 @1x and 390x844 @2x (mobile, touch) |
| Overflow gate | `horizontalOverflowPx` 0 on all 86 shots (see `results.json`) |
| Coverage | 43 states x 2 viewports = 86 PNGs |

## Shots

### Policy group (`policy` id, 11 routes)

| State | Route | Fixture | Auth |
|---|---|---|---|
| `policy-privacy` | `/privacy` | none (static legal frame) | simulated signed-out |
| `policy-terms` | `/terms` | none (static legal frame) | simulated signed-out |
| `policy-refunds` | `/refunds` | none (static legal frame) | simulated signed-out |
| `policy-shipping` | `/shipping` | none (static legal frame) | simulated signed-out |
| `policy-cancellations` | `/cancellations` | none (static legal frame) | simulated signed-out |
| `policy-guidelines` | `/guidelines` | none (static legal frame) | simulated signed-out |
| `policy-about` | `/about` | none (static legal frame) | simulated signed-out |
| `policy-contact` | `/contact` | none (static legal frame) | simulated signed-out |
| `guide-platforms` | `/job-referral-platforms` | none (static frame) | simulated signed-out |
| `guide-choosing` | `/choosing-a-job-referral-platform` | none (static frame) | simulated signed-out |
| `guide-how-employees` | `/how-employees-refer-candidates` | none (static frame) | simulated signed-out |

### System group (`system` id, 2 routes + 9 gallery tabs)

| State | Route | Interaction | Fixture | Auth |
|---|---|---|---|---|
| `system-offline` | `/offline` | none | none (fetch-free) | simulated signed-out |
| `system-not-found` | `/no-such-page-r7` | none | none (fetch-free) | simulated signed-out |
| `app-install-android` | `/app-states` | default tab | none (fetch-free) | simulated signed-out |
| `app-install-iphone` | `/app-states` | click "Install (iPhone)" | none (fetch-free) | simulated signed-out |
| `app-push-permission` | `/app-states` | click "Push permission" | none (fetch-free) | simulated signed-out |
| `app-offline` | `/app-states` | click "Offline" | none (fetch-free) | simulated signed-out |
| `app-slow-connection` | `/app-states` | click "Slow connection" | none (fetch-free) | simulated signed-out |
| `app-not-found` | `/app-states` | click "Not found" | none (fetch-free) | simulated signed-out |
| `app-error` | `/app-states` | click "Something went wrong" | none (fetch-free) | simulated signed-out |
| `app-payment-failed` | `/app-states` | click "Payment failed" | none (fetch-free) | simulated signed-out |
| `app-loading` | `/app-states` | click "Loading" | none (fetch-free) | simulated signed-out |

### Emails reference (`/emails`, every template in the gallery)

| State | Template selected | Fixture | Auth |
|---|---|---|---|
| `emails-code` | Work-email code (default) | none (fetch-free) | simulated signed-out |
| `emails-password-reset` | Password reset | none | simulated signed-out |
| `emails-welcome` | Welcome | none | simulated signed-out |
| `emails-claimed` | Request claimed | none | simulated signed-out |
| `emails-accepted` | Ask accepted | none | simulated signed-out |
| `emails-passed` | Ask passed | none | simulated signed-out |
| `emails-new-message` | New message | none | simulated signed-out |
| `emails-waiting-for-coverage` | Waiting for coverage | none | simulated signed-out |
| `emails-slot-opened` | Slot opened | none | simulated signed-out |
| `emails-review-ready` | Review ready | none | simulated signed-out |
| `emails-reverify-reminder` | Re-verify reminder | none | simulated signed-out |
| `emails-report-outcome` | Report outcome | none | simulated signed-out |
| `emails-payment-receipt` | Payment receipt / failed | none | simulated signed-out |

### Links group (`links` id, 7 states)

| State | Route | Fixture | Auth |
|---|---|---|---|
| `fast-ready` | `/fast/fx-link-0001` | `GET /api/referrer-fast-track/fx-link-0001` 200 `{link:{companyDomain:"northwind.example",isActive:true}}` | simulated signed-out |
| `fast-unavailable` | `/fast/fx-link-0002` | same path 404 `{error:"This private referral link is no longer active"}` (the server's own copy) | simulated signed-out |
| `fast-loading` | `/fast/fx-link-0003` | same path never answered (`hang`) | simulated signed-out |
| `vanity-ready` | `/refer/fabrikam/fx-alias` | `GET /api/referrer-fast-track/vanity/fabrikam/fx-alias` 200 `{link:{companyDomain:"fabrikam.example",isActive:true}}` | simulated signed-out |
| `vanity-unavailable` | `/refer/fabrikam/fx-alias-gone` | same path 404 `{error:"This private referral link is no longer active"}` | simulated signed-out |
| `share-ready` | `/share-card/fxsharetoken000000000001` | `GET /api/referral-share-cards/public/fxsharetoken000000000001` 200 `{card:{companyDomain:"northwind.example",status:"accepted",inviteCode:"r1-fx000001"}}` | simulated signed-out |
| `share-unavailable` | `/share-card/fxsharetoken000000000002` | same path 404 `{error:"This share card is unavailable"}` | simulated signed-out |

### Sign-in return

| State | Route | Fixture | Auth |
|---|---|---|---|
| `start-return` | `/start?fast=fx-link-0001` | none (fetch-free at this step) | simulated signed-out |

## What the captures show

- `/emails` subject now reads `⟨6-digit code⟩ is your skipwait.me verification code`, matching `otpEmailMessage()` in `server/workEmailOtp.ts`.
- `/emails` review-ready body ends `Open the private review page to inspect and confirm a decision. Opening this link never records a decision.`, matching `server/referrerReviewEmail.ts`.
- Every policy route renders the goal static frame with the legal text unchanged.
- `/offline`, `/app-states` (all nine tabs) and the not-found route render the goal system surfaces; each gallery tab is a distinct render (no two tab captures share pixels).
- `/fast`, `/refer` and `/share-card` render the goal link landings under the trio-only flag, including ready, unavailable and loading. The two ready states use different synthetic domains (`northwind.example` vs `fabrikam.example`) so the pixels prove each route fetched its own API path; the two unavailable states are byte-identical **by construction** — same component, same server 404 copy, no company domain in the failure state — and their distinct requested URLs and mocked API paths are recorded per shot in `results.json`.
- The share card exposes only the company domain, the milestone status and an invite code; no seeker or referrer identity.

## Not verified here

- Real signed-in states for the three link landings (no session was minted; the packet forbids credentials and real data).
- Any production surface: the trio ids stay off in `RELEASED`, so production still serves the kit pages.
- `/start` is the `start` id, not part of the trio, so `start-return` shows the kit surface under this preview. The link → `/start` handoff is therefore mixed-design until the row owning `start` lands; this packet does not change it.
- `/email-review/:linkToken` (the `email-review` id) and `/support` (the `support` id) are outside the trio and were not captured.
- Provider-delivered mail and real payment: none sent or touched.

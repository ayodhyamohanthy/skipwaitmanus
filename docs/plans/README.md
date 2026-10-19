# Work packets: execution order and index

> Read [`docs/BRIEF.md`](../BRIEF.md) first (D-073). The binding queue and every row's status live only in [`docs/KIT_V4_BUILD_PLAN.md`](../KIT_V4_BUILD_PLAN.md) §3b. This page is the execution view (D-074, D-075): what to run next, which packet to hand over, how risky it is, and what may run side by side.

How to hand a packet to a model: [`docs/DELEGATION.md`](../DELEGATION.md) §4. System map: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md). Packet format: [`TEMPLATE.md`](TEMPLATE.md).

## Rules for this page
- A row may be delegated only when its packet below is **ready**. "Architect" means Claude Code writes or refreshes the packet first.
- A row still claimed by a Claude Code session (D-072 lanes) stays with that session unless 24 hours pass with no new commits on its branch (queue rule 2). Check the §3b row before you claim it.
- Pick the first stage with a ready packet whose §3b status is `todo` and whose dependencies are live. Within a stage, anything marked parallel-safe may run at the same time with different models (D-075). Pushes to `main` stay one at a time.
- Rows another model already owns (§3b status `in progress — <model>`) are theirs until 24 hours pass with no commits on their branch (queue rule 2).

## Stage 0 — now
| Order | §3b row | Packet | Tier | Size | Packet state | Runs beside |
|---|---|---|---|---|---|---|
| 0.1 | P0-allocated-ask-stuck | [P0-allocated-ask-stuck.md](P0-allocated-ask-stuck.md) | 1 | M | done — `bc655963`, live (independent review passed on PR #321) | 1.1, 1.2, 1.4, F-1, T-1 |
| 0.2 | Owner: switch on Cloudflare Web Analytics for skipwait.me (free, D-054); the D-056 clock starts that day | plan §6 | — | — | owner action | everything |

## Stage 1 — the D-072 lanes
| Order | §3b row | Packet | Tier | Size | Packet state | Depends on | Runs beside |
|---|---|---|---|---|---|---|---|
| 1.1 | D-067-pro-max-removal | [D-067-packet.md](D-067-packet.md) (verification for slices 3–4 and the review) | 1 | L (sliced into commits) | done — `08d193a0`, live (independent review passed on PR #318) | — | 0.1, 1.2, 1.4 |
| 1.2 | 2 + Drift-D030-seeker-signin | [seeker-passwords.md](seeker-passwords.md) | 1 | M | ready; claimed by Claude Code (D-072 lane 2), open to any model under queue rule 2 | — | 0.1, 1.1, 1.4 |
| 1.2b | D-057-session-gate (new, from the sign-in review finding S-4) | [D-057-session-gate.md](D-057-session-gate.md) | 1 | M | ready | 1.2 live | 1.3, 1.4 |
| 1.3 | D-069-chargebee-catalog-sync | [D-069-chargebee-catalog-sync.md](D-069-chargebee-catalog-sync.md) | 1 | M | ready; claimed by Claude Code (D-072 lane 3), open to any model under queue rule 2 | 1.1 live | 1.2, 1.4, 3.1 |
| 1.4 | D-048 (phase 2) | [D-048-phase-2.md](D-048-phase-2.md) | 2 | M | ready | — | 0.1, 1.1, 1.2, 1.3 |

## Stage 2 — payments ready before referrers onboard (D-046, D-064, D-075)
| Order | §3b row | Packet | Tier | Size | Packet state | Depends on | Runs beside |
|---|---|---|---|---|---|---|---|
| 2.1 | 1 (go-live slice: `/plans` packs and passes, coverage before payment, no accidental renewal) | [GO-LIVE-1-plans-purchase.md](GO-LIVE-1-plans-purchase.md) | 1 | M | ready | 1.1 live, 1.3 built | 3.1 |
| 2.2 | D-065-daily-money-check | live (`eed80e5f`, PR #317); follow-up [D-065-B-slice-checks.md](D-065-B-slice-checks.md) | 2 | S | ready | — | everything |
| 2.3 | Owner: read the D-069 dry run, apply, fix `billing_cycles` mismatches in Chargebee, add the pass-refund wording to `/refunds`, then the one live ₹99 UPI buy-and-refund (D-065) | plan §6 | — | — | owner action | 1.3, 2.1 | — |

## Stage 3 — the money rules (one at a time; same functions in `server/db.ts`)
| Order | §3b row | Packet | Tier | Size | Packet state | Depends on |
|---|---|---|---|---|---|---|
| 3.0 | D-079-card-validation-free-credits | [D-079-card-validation-free-credits.md](D-079-card-validation-free-credits.md) | 1 | M | ready; claimed by Instinct (Oct 19) | — | nothing that touches the credit-cycle functions (3.1-3.3 included) |
| 3.1 | D-038 slice A: claim and allocation lapse, 5-claim cap | [D-038-A-lapses.md](D-038-A-lapses.md) | 1 | M | ready | 0.1 live |
| 3.2 | D-038 slice B: referred deadline, step back, seeker confirmation | [D-038-B-referred-deadline.md](D-038-B-referred-deadline.md) | 1 | M | ready | 3.1 live |
| 3.3 | D-035 + D-052: the pass reason decides the credit | [D-035-pass-reason-credit.md](D-035-pass-reason-credit.md) | 1 | M | ready | 3.2 live |
| 3.4 | D-035 + D-066(1): Send again | D-035-send-again.md | 1 | M | architect (after 3.3) | 3.3 live |

## Foundation, truth and hygiene (any time, beside any lane)
| ID | What | Packet | Tier | Size | Packet state | Wait for |
|---|---|---|---|---|---|---|
| F-1 | Toolchain pins (Node 22.12+, `.nvmrc`) and run the `shared/` tests | [FND-1-toolchain-and-test-collection.md](FND-1-toolchain-and-test-collection.md) | 3 | S | ready | — |
| F-2 | Remove verified-dead code that misleads readers | [FND-2-dead-code.md](FND-2-dead-code.md) | 3 | S | ready | — |
| F-3 | Test kit throws production-shaped duplicate errors; fix the two duplicate checks that read only `code` | [FND-3-duplicate-key-fidelity.md](FND-3-duplicate-key-fidelity.md) | 2 | S | ready | 0.1 |
| F-4 | Redact token-bearing API paths in Sentry and admin alerts | [FND-4-token-path-scrubbing.md](FND-4-token-path-scrubbing.md) | 2 | S | ready | 1.2 (same Sentry files) |
| F-5 | Forward or remove the server keys the container never receives | [FND-5-env-forwarding.md](FND-5-env-forwarding.md) | 2 | S | ready | 1.1 |
| F-6 | Correct stale §3b status cells (rows 4, 5, 7, 21, 25) from evidence on `main` | [FND-6-row-status-audit.md](FND-6-row-status-audit.md) | 3 | S | ready | — |
| F-7 | Triage the 53 open PRs and ~250 branches for the owner (read-only) | [FND-7-pr-branch-triage.md](FND-7-pr-branch-triage.md) | 3 | S | ready | — |
| T-1 | Public impact counts only accepted asks, never expired ones | [TRUTH-1-public-impact-count.md](TRUTH-1-public-impact-count.md) | 2 | S | ready | — |

## Later (packets come from the architect when the stage before them is live)
| §3b row | Why it waits |
|---|---|
| D-054-analytics (server funnel counts) | After the owner switches on Cloudflare Web Analytics (0.2) |
| D-060-pending-action-emails | Needs task 21 (notification kinds and preferences); D-038's reminders ship in-app first |
| D-057-referrer-continuity | After the session gate (1.2b) |
| P2 (D-028 link previews and company pages) | After stage 1; parallel-safe with stage 3 |
| D-048 phase 3 (surface by surface) | After 1.4; each surface is its own packet |
| Tasks 12, 13, 20 | Owned by opencode and Qoder (open PRs #308, #310, #311, #314) |
| The rest of §3b | D-053 order; parked rows stay parked (29, 30, 31, lite mode, 40) |

## Why lanes can or cannot run side by side
- **P0 (0.1) and D-067 (1.1):** both edit `server/db.ts`, but different functions: the referral expiry and withdraw region versus DMs, wallet normalization and gifts. Git merges them; whoever lands second re-runs the gate.
- **D-069 (1.3) waits for D-067:** D-067 rewrites `shared/planCatalog.ts`, `shared/billingCatalog.ts`, `server/chargebee.ts` and `server/adminBillingCatalog.ts`, which the sync reads.
- **GO-LIVE-1 (2.1) waits for D-067 and D-069:** it edits `client/src/pages/Plans.tsx` and `client/src/components/plans/`, which D-067 empties of Pro/Max, and it sells only item prices the sync created.
- **The D-038 and D-035 slices (3.x):** each edits the claim, accept, pass and transition functions. One at a time, never beside each other or beside a P0 in those functions.
- **F-4 waits for the sign-in branch:** that branch already rewrites `server/sentry.ts`.
- **F-5 waits for D-067:** D-067 removes the gift keys from `.env.example`.

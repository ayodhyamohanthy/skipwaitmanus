# Work packets: execution order and index

> Read [`docs/BRIEF.md`](../BRIEF.md) first (D-073). The binding queue and every row's status live in [`docs/KIT_V4_BUILD_PLAN.md`](../KIT_V4_BUILD_PLAN.md) §3b, or, when several tasks share a row, in their packet's Status section (D-134). This page is the execution view (D-074, D-075): what to run next, which packet to hand over, how risky it is, and what may run side by side.

How to hand a packet to a model: [`docs/DELEGATION.md`](../DELEGATION.md) §4. The machine order every agent's `build` uses is [`assignments.json`](assignments.json) (D-083): change the two together. System map: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md). Packet format: [`TEMPLATE.md`](TEMPLATE.md).

## Oct 21 (CEO sync, D-085)
The picker's order (`assignments.json`): first the two live regressions (P0-ask-link-signin, P1-queue-attestation, [`LIVE-OCT22-regressions.md`](LIVE-OCT22-regressions.md)); then the money lane (GO-LIVE-1b and D-038 reconcile are done; every employee decline keeps the credit spent under D-147); the redesign-and-review of the seven goal pages live in place (four rows after the landed D-048-p3-live-review, D-149, D-150: `-find`, `-requests`, `-conversation`, `-queue`; the find and conversation rows wait for the audit), the money check fix (D-065-C) and the frozen pricing audit (D-132-audit, next by D-146; #381, #410 and #415 are on `main` with their flags off, and the audit's items land one pull request each), the picker follow-ups (`PICKER-*`), then the pull requests built before they had a packet, finished through [`OCT21-BUILT-PRS.md`](OCT21-BUILT-PRS.md) — D-067 review outbox (#322), D-104 company signal (#373), D-107 claim your company (#384), D-105 win card (#375), D-106 impact card (#382), D-048 phase 3 (#358 and #361 done; #362 and #360 live), row 20 (#310, #311, #314), task 13 slice A (#308). Then the packets still to write (any agent, D-109: D-086 demand list (`D-086-demand-list`, Tier 1, D-154; its build follows BYOR, D-162), D-100 security audit, D-089 request-inbox link, D-093 language, D-094 AI-in-UI); the D-099 bonus pages packet is written ([`D-099-bonus-pages.md`](D-099-bonus-pages.md), two slices) and waits for BYOR, the request-inbox link and the demand list (D-163). D-095 one-tap's packet is written ([`D-095-one-tap.md`](D-095-one-tap.md), row `todo`). D-090 BYOR's packet is written ([`D-090-BYOR.md`](D-090-BYOR.md)) and its queue row is `todo` with nothing to wait for: the owner waived the demand-list gate (D-162), and workbuddy · b0eb's half-built branch is free to take over; its My asks client step (C5) builds into the redesigned /requests, which landed on Oct 23 (#533, D-162). #381 landed (flag off); #380 left the queue, because D-132's rungs replace it (D-135 (5)). The #520 rulings are on the board as D-201 to D-206: SKIPPY-fix and SKIPPY-next (D-201), PICKER-decision-sync (D-202), the CEO mandate (D-203), the credits toolbox (D-204), branch hygiene (D-205) and the decision review (D-206); their rows sit after PICKER-review-independence.

## Frozen pricing (D-132, D-135)
> Pricing source of truth is [`docs/PRICING.md`](../PRICING.md). D-146: D-132 only; the fixed passes stay off.

The owner froze the bundled pricing on Oct 21 (three plans with in-plan credit dropdowns; asks cost their job level in credits). The level classifier (#381), the plans page (#410) and the per-level spend (#415) are on `main` with their flags off; D-132-audit ([`D-132-pricing-v2.md`](D-132-pricing-v2.md)) reviews them in lane `money-core` after D-048-p3-live-review and TASK13-pinned-work (declines keep credits spent, D-147); the held item-3 and checkout work follows it as `D-132-item3` and `D-132-v2-checkout` (D-165). Switching it on is a separate step that needs the owner's word.

## D-048 phase 3 in parallel (D-134)
Every screen, landing to admin, is redesigned to the goal doctrine, UI and UX, never the old layout recoloured (D-150). The rollout runs as one foundation chain (lane `design-core`) and then up to 13 cluster lanes at once, every page landing dark behind its own flag or, for a doctrine redesign, in place with a parity check and a review before landing (D-149): [`D-048-phase-3-split.md`](D-048-phase-3-split.md) (76 rows, owned paths, landing steps, bug controls). The picker changes that make it safer are in [`PICKER-PARALLEL.md`](PICKER-PARALLEL.md).

## Rules for this page
- A row may be delegated only when its packet below is **ready**. "Architect" means any agent writes or refreshes the packet first (D-109); Claude Code makes the rulings.
- Nobody picks or claims a row by hand: every agent runs `node scripts/next-task.mjs --claim "<your model name>"` and does only what it prints (D-083, D-085). It walks [`assignments.json`](assignments.json) top down: red `main`, then your own unfinished work (pending work ranked above it with nobody on it first), then pending work nobody is on, then new work whose packet is ready, whose dependencies are done and whose lane is free. A red or blocked priority holds its own lane and the tasks that depend on it; red `main` holds everything (D-109).
- A claim is the task's branch on origin; your first commit on it sets the §3b row (or, when several tasks share that row, your line in the packet's Status section; the picker says which, D-134), which reaches `main` with the work. A claim is free after 2 hours with no push to its branch or lock and no `--heartbeat` (D-085; queue rule 2 said 24 hours); the picker then hands it to the next agent on the same branch.
- Within a stage, anything marked parallel-safe may run at the same time with different models (D-075). Pushes to `main` stay one at a time.

## Stage 0 — now
| Order | §3b row | Packet | Tier | Size | Packet state | Runs beside |
|---|---|---|---|---|---|---|
| 0.1 | P0-allocated-ask-stuck | [P0-allocated-ask-stuck.md](P0-allocated-ask-stuck.md) | 1 | M | done — `bc655963`, live (independent review passed on PR #321) | 1.1, 1.2, 1.4, F-1, T-1 |
| 0.2 | Owner: switch on Cloudflare Web Analytics for skipwait.me (free, D-054); the D-056 clock starts that day | plan §6 | — | — | owner action | everything |

## Stage 1 — the D-072 lanes
| Order | §3b row | Packet | Tier | Size | Packet state | Depends on | Runs beside |
|---|---|---|---|---|---|---|---|
| 1.1 | D-067-pro-max-removal | [D-067-packet.md](D-067-packet.md) (verification for slices 3–4 and the review) | 1 | L (sliced into commits) | done — `08d193a0`, live (independent review passed on PR #318) | — | 0.1, 1.2, 1.4 |
| 1.2 | 2 + Drift-D030-seeker-signin | [seeker-passwords.md](seeker-passwords.md) | 1 | M | review passed — landing waits for 1.2b, the D-057 session gate (D-080 (b), D-163), the owner's dashboard steps and `SEEKER_CODE_VERIFY_UNTIL` (PR #324, head `bcff1742`) | 1.2b | 0.1, 1.1, 1.4 |
| 1.2b | D-057-session-gate (new, from the sign-in review finding S-4) | [D-057-session-gate.md](D-057-session-gate.md) | 1 | M | ready | none (D-163: goes before 1.2, which waits for it under D-080 (b)) | 1.3, 1.4 |
| 1.3 | D-069-chargebee-catalog-sync | [D-069-chargebee-catalog-sync.md](D-069-chargebee-catalog-sync.md) | 1 | M | done — `c573af21`, live (independent review passed on PR #326); nothing applied: the owner's dry run, then apply | 1.1 live | 1.2, 1.4, 3.1 |
| 1.4 | D-048 (phase 2) | [D-048-phase-2.md](D-048-phase-2.md) | 2 | M | done — `b6ea65f1` (PR #320); phase 3 packets next (architect) | — | 0.1, 1.1, 1.2, 1.3 |

## Stage 2 — payments ready before referrers onboard (D-046, D-064, D-075; since D-146 only credit packs are sold)
| Order | §3b row | Packet | Tier | Size | Packet state | Depends on | Runs beside |
|---|---|---|---|---|---|---|---|
| 2.1 | 1 (go-live slice: `/plans` packs and passes, coverage before payment, no accidental renewal) | [GO-LIVE-1-plans-purchase.md](GO-LIVE-1-plans-purchase.md) | 1 | M | done — #351; passes switched off by the D-084 P0 and kept off by D-146 | 1.1 live, 1.3 built | 3.1 |
| 2.1b | 1 (pass slice: a paid pass always activates, then passes go back on sale; D-084) | [GO-LIVE-1b-pass-activation.md](GO-LIVE-1b-pass-activation.md) | 1 | M | landed — PR #359 (merge of `agent/queue/go-live-passes`); passes stay off (D-146) | 2.1 live | 3.1 |
| 2.2 | D-065-daily-money-check | live (`eed80e5f`, PR #317); follow-up [D-065-B-slice-checks.md](D-065-B-slice-checks.md) | 2 | S | done — `dc8d0bf3` (PR #333) | — | everything |
| 2.3 | Owner: read the D-069 dry run, apply, fix `billing_cycles` mismatches in Chargebee, add the pass-refund wording to `/refunds`, then the one live ₹99 UPI buy-and-refund (D-065) | plan §6 | — | — | owner action | 1.3, 2.1 | — |

## Stage 3 — the money rules (one at a time; same functions in `server/db.ts`)
| Order | §3b row | Packet | Tier | Size | Packet state | Depends on |
|---|---|---|---|---|---|---|
| 3.0 | D-079-card-validation-free-credits | [D-079-card-validation-free-credits.md](D-079-card-validation-free-credits.md) | 1 | M | ready; claimed by Instinct (Oct 19) | — | nothing that touches the credit-cycle functions (3.1-3.3 included) |
| 3.1 | D-038 slice A: claim and allocation lapse, 5-claim cap | [D-038-A-lapses.md](D-038-A-lapses.md) | 1 | M | done — `907bf2cd` (2026-10-22): reconciled by [D-038-reconcile.md](D-038-reconcile.md) (D-103); PR #353 passed review; `agent/opencode/d038-a-lapses` never merged | 0.1 live |
| 3.2 | D-038 slice B: referred deadline, step back, seeker confirmation | [D-038-B-referred-deadline.md](D-038-B-referred-deadline.md) | 1 | M | done — `907bf2cd` (2026-10-22): reviewed inside [D-038-reconcile.md](D-038-reconcile.md); part B on at landing (D-103) | 3.1 live |

## Foundation, truth and hygiene (any time, beside any lane)
| ID | What | Packet | Tier | Size | Packet state | Wait for |
|---|---|---|---|---|---|---|
| F-1 | Toolchain pins (Node 22.12+, `.nvmrc`) and run the `shared/` tests | [FND-1-toolchain-and-test-collection.md](FND-1-toolchain-and-test-collection.md) | 3 | S | done — `1f234293` | — |
| F-2 | Remove verified-dead code that misleads readers | [FND-2-dead-code.md](FND-2-dead-code.md) | 3 | S | done — `7fdc634d` (PR #342) | — |
| F-3 | Test kit throws production-shaped duplicate errors; fix the two duplicate checks that read only `code` | [FND-3-duplicate-key-fidelity.md](FND-3-duplicate-key-fidelity.md) | 2 | S | done — `a62c9d20` (PR #338) | 0.1 |
| F-4 | Redact token-bearing API paths in Sentry and admin alerts | [FND-4-token-path-scrubbing.md](FND-4-token-path-scrubbing.md) | 2 | S | ready | none (D-163: builds against `main`; 1.2 merges it later) |
| F-5 | Forward or remove the server keys the container never receives | [FND-5-env-forwarding.md](FND-5-env-forwarding.md) | 2 | S | done — `d93a1d12` (PR #334) | 1.1 |
| F-6 | Correct stale §3b status cells (rows 4, 5, 7, 21, 25) from evidence on `main` | [FND-6-row-status-audit.md](FND-6-row-status-audit.md) | 3 | S | done — `8e641c7c` (PR #343) | — |
| F-7 | Triage the 53 open PRs and ~250 branches for the owner (read-only) | [FND-7-pr-branch-triage.md](FND-7-pr-branch-triage.md) | 3 | S | done — `bcd1074e` (PR #344), result in [FND-7-triage-result.md](FND-7-triage-result.md) | — |
| T-1 | Public impact counts only accepted asks, never expired ones | [TRUTH-1-public-impact-count.md](TRUTH-1-public-impact-count.md) | 2 | S | done — `c34582a9` | — |

## Later (packets come from the architect when the stage before them is live)
| §3b row | Why it waits |
|---|---|
| D-054-analytics (server funnel counts) | After the owner switches on Cloudflare Web Analytics (0.2) |
| D-060-pending-action-emails | Needs task 21 (notification kinds and preferences); D-038's reminders ship in-app first |
| D-057-referrer-continuity | After the session gate (1.2b) |
| P2 (D-028 link previews and company pages) | After stage 1; parallel-safe with stage 3 |
| D-048 phase 3 (parallel split) | Runs as the 76-row split in [D-048-phase-3-split.md](D-048-phase-3-split.md) (D-134; the rollout map, #358, yields to it): W0, the signed-out landing, `/requests` and `/explore` are live; the foundation and lane packets come next. Open questions are decided there under D-123. |
| Tasks 12, 13, 20 | Owned by opencode and Qoder (open PRs #308, #310, #311, #314) |
| The rest of §3b | D-053 order; parked rows stay parked (29, 30, 31, lite mode, 40) |

## Why lanes can or cannot run side by side
- **P0 (0.1) and D-067 (1.1):** both edit `server/db.ts`, but different functions: the referral expiry and withdraw region versus DMs, wallet normalization and gifts. Git merges them; whoever lands second re-runs the gate.
- **D-069 (1.3) waits for D-067:** D-067 rewrites `shared/planCatalog.ts`, `shared/billingCatalog.ts`, `server/chargebee.ts` and `server/adminBillingCatalog.ts`, which the sync reads.
- **GO-LIVE-1 (2.1) waits for D-067 and D-069:** it edits `client/src/pages/Plans.tsx` and `client/src/components/plans/`, which D-067 empties of Pro/Max, and it sells only item prices the sync created.
- **The D-038 slices (3.x):** each edits the claim, accept, pass and transition functions. One at a time, never beside each other or beside a P0 in those functions.
- **F-4 builds against `main` now (D-163):** the sign-in branch picks up its scrubber when it merges `main`.
- **F-5 waits for D-067:** D-067 removes the gift keys from `.env.example`.

## Owner-registered follow-ups, Oct 22

registered by owner Ayu, coordinator unavailable, Oct 22. Scoped owner exception to D-083/D-134 registration authority for PR #462 (`PREMIUM-total-label`) and PR #463 (`D-067-outbox-fixture-repair`) only. Both packets are registered together immediately after the two live regressions that newer D-149 puts first; all pre-existing rows retain their order and content. Normal origin/main picker claims, full exact-candidate gate, GitHub CI and independent Tier 1 review still apply. Neither implementation nor production operations are authorized by registration alone. See the two packets for owned paths and evidence.


Scoped Oct 23 founder exception for one manual claim only: see docs/DECISIONS.md, section "Scoped founder manual-claim exception, Oct 23, 2026". Applies only to PICKER-review-independence by Forge · fd06 after the attestation is committed and published; reviews and every other hold remain unchanged.

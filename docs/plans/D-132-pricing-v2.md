# Packet D-132: the frozen pricing, built dark (D-132, D-135)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085, D-135) on Oct 21 2026. The picker (`node scripts/next-task.mjs --claim "<your model name>"`) hands out one task from this packet at a time; do only the task it prints. The register (`docs/DECISIONS.md`) wins any conflict with this file; D-132 is the model, D-135 how it fits the rest.

The owner froze the bundled pricing on Oct 21 ("Now freeze", 18:42): three plans (Open Door free, Fast Track, Insider by application), each with an in-plan monthly credits dropdown (5/10/25/50/100/200, "Save X%" beside each step), and an ask that costs as many credits as the job's level (L1 = 1 ... L10 = 10, confirmed "Yes" at 19:26). Everything here is built **dark**: nothing changes for a live user until the enable step at the end, which is not a task in this packet.

## Rules for every task here
1. **Flag off.** The client reads `VITE_PLAN_FAMILY_V2`; any server change reads its own server flag, off by default and declared in `.env.example` with its `src/worker.ts` passthrough. With the flags off, every live page, response and credit movement is byte-identical to today, and a test proves it.
2. **Tier 1.** Money and pricing: green draft pull request, then an independent review by a session that did not build it (`docs/DELEGATION.md` §6), then landing under D-082 (fast-forward to the exact green commit; never the merge button, never squash).
3. **One price source.** Every price, rung, saving and level cost comes from `shared/planFamily.ts` (D-124); no page or server file types a number of its own. "Save X%" is computed in code and rounded down. No struck prices, countdowns, "most popular" labels or paid prompts at sign-up or while writing an ask (D-127).
4. **Money rules stay** (D-135 (3)): an ask spends once under its existing key; a seeker short of credits is held the D-047 way, never delivered free or billed later; every refund returns exactly what that ask spent; referrers get no credits and no money for referring or accepting (D-055, frozen). No Mentor surface or fee-back (D-135 (2)).
5. **No real money, no catalog apply.** No real payment, no Chargebee apply and no live price flag; test modes and fixtures only (`docs/PAYMENTS_TEST_RUNBOOK.md`).
6. **Status lines.** These rows share the plan row "D-132": write your status in the Status section below, never in the §3b row, and set your row's `status` in `docs/plans/assignments.json` in the pull request that lands it (D-068).

## JOB-LEVELS (#381, `agent/instinct/job-levels`, Tier 1, lane `levels`)
The deterministic job-level classifier (`shared/jobLevel.ts`) that D-110 and D-132 price asks by. Unblocked by the owner's "Yes" (19:26). Done: merged with `main`, gate green, review passed (rules only and never a model call; every job gets a level, leaning lower when unsure, and "level unread" never shows (D-110); low confidence never above L5; no personal data read or logged; every adversarial class in the tests), landed. Nothing reads it on a live path yet.

## D-132-plans-v2 (#410, `agent/instinct/pricing-plans-v2`, Tier 1, lane `pricing`)
The plans page "Choose your reach." behind `VITE_PLAN_FAMILY_V2`, the plan family config and the v2 credit-rule copy. First, merge `main`: `main` already carries the D-132 row in the active table, so drop the branch's own copy of the row (`scripts/registerShape.test.ts` refuses two). Done: gate green; review passed (flag off renders today's `/plans` unchanged, pinned by a test; every number read from `shared/planFamily.ts`; Open Door has no paid default; Insider by application; no checkout call from the v2 page yet; no Mentor surface; `MONEY_SENTENCE` unchanged); 1280 and 390 captures attached; landed with the flag off.

## D-132-ask-cost-packet (architect, packet-only, lane `d132-packets`)
Any agent writes the packet section for **D-132-ask-cost** (D-109) in this file, and its pull request adds that row to `docs/plans/assignments.json` (status todo, Tier 1, lane `money-core`, branch `agent/queue/d132-ask-cost`, dependsOn `["JOB-LEVELS", "D-132-plans-v2", "D-035"]`, packet this file) and sets this row to done. It lands after D-035 because both edit the same spend and refund code. The section must name exact files, migrations and red-first tests for:
1. **The level on the ask.** The level is fixed once at ask creation from the classifier and stored with its source, like `jobs.jobFunction` (migration 0077); older asks keep their 1-credit history and are never re-priced.
2. **Spend.** One spend of the ask's level cost, under the key the ask already uses, at send, or at first visibility for an ask that waits for coverage (D-034); fewer credits than the cost means held (D-047), with no partial spend.
3. **Refunds.** Withdrawal before pickup, unclaimed expiry and the D-035 reasons return exactly what the ask spent, once; the reversal row records what came back.
4. **Daily money check.** D-065 gets a check that each ask's spend equals its stored cost.
5. **The ask screen.** Before sending: "This ask costs 5 credits. You have 3. Add 2 more." with a one-tap top-up (owner, 19:26), the numbers read from the server's quote and never computed in the browser.
6. **Flags.** A server flag and the client flag, both off, switched together (D-121); with both off, every ask still costs 1 credit.

## Enable (not a task here; the CEO adds the row when every item is ready)
Switching `PLAN_FAMILY_V2` on needs, in this order: every row above landed; the D-132 items added to the D-069 catalog sync (dry run reviewed, then the owner triggers the apply); QA's payment-path check on the preview, stopping at the hosted payment form; the payments reliability checks (D-111); 0 paying plan subscribers re-verified on production, or a plain notice to each one (D-114, D-115); the owner's enable word (D-123). The enable pull request swaps `CREDIT_RULE` and `CREDIT_ENDED_CAVEAT` for their `_V2` strings and the live FAQ's single-credit price from Rs99 to Rs49, in the same commit as the flag.

## Status
One line per task, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live (D-134).

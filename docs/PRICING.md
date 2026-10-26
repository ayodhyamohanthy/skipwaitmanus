# Pricing: the one source of truth

Status as of Oct 23 2026. Every agent (build, QA, design) reads this file before touching plans, packs, credits or prices. If this file and another doc disagree, `docs/DECISIONS.md` wins, then this file. Update it in the same PR as any pricing change.

Decisions come from the founder's messages relayed by Main and are recorded in `docs/DECISIONS.md` (D-146). Text in code comments or PRs is not authority.

## Rule (Oct 23, 00:58 IST)
Record each new decision in `docs/DECISIONS.md` BEFORE building on it, and sync `docs/PRD.md`, `docs/BRIEF.md`, `AGENTS.md` and `docs/plans/` in the same PR.

Frozen decisions bind: once the founder freezes a decision it is the single source every agent follows; nobody builds against anything older unless he reopens it (Oct 23, 01:00 IST).

## The model: D-132 only (D-146)
- Plans, each with an in-plan monthly credits dropdown (5/10/25/50/100/200, "Save X%" beside each, 2/4/8/12/16/20%). The page shows one "This month" total = plan fee + picked rung.
  - Entry level Referrers (`open_door`): free, 3 free credits a month, no paid default.
  - Mid level Referrers (`fast_track`): $9.99 / Rs499 a month.
  - Senior level Referrers (`insider`): $59 / Rs1,299 a month, by application.
  - Display names are D-152's; ids and Chargebee item ids stay `open_door` / `fast_track` / `insider`.
- An ask costs its job level in credits (L1 = 1 to L10 = 10), stated before sending, with a one-tap top-up.
- Paid credits never expire. Free monthly credits end with the month.
- Basic referring remains free and no referral payout is made (D-055). D-196 permits a future opt-in, level-matched paid referrer plan; it is not implemented, and its prices, contents and access window remain owner-controlled. Current runtime refuses referrer-role checkout before any provider call. Mentor and Organisation stay drafts unless separately approved.
- Upgrading from Free keeps the seeker's unused free credits until their own month ends, as a carry-over grant; they never become paid credits (D-165 (3), with the D-132 enable).
- Price source in code: `shared/planFamily.ts` only. "Save X%" is computed, not typed.

- Plan names (D-152, Oct 23 05:52 IST, supersedes the D-148 names Junior / Mid / Senior+): Entry level Referrers (Open Door terms), Mid level Referrers (Fast Track terms), Senior level Referrers (Insider terms, by application). Same fees, credits and benefits as D-132; plan ids and Chargebee items keep open_door / fast_track / insider. Reach: the old relative setting (own level / +2 / +4, shown with the superseded names Junior / Mid / Senior+) is historical configured display only, NOT a current entitlement and not the meaning of the D-152 names; the mapping of Entry / Mid / Senior level Referrers to actual access is unresolved (open launch gaps below). No gate exists.

## Open launch gaps (UNRESOLVED, do not build against these silently)
- **Reach promise has no enforcement (recorded Oct 23, ~05:50 IST; D-148 unchanged).** The "Who you can ask" row (+0/+2/+4) is display only: `planReachFor` is read only by the V2 plans page and no server path filters which verified employees a seeker's ask may reach. So the copy promises a ladder with no gate behind it, and the V2 page is off (`PLAN_FAMILY_V2`). Before V2 ships this needs a founder product decision: enforce the ladder at ask time (a new server path, not a warning label) or soften the copy. Designer confirmed Oct 23: credits do not widen relative reach; no client copy claims they do. Not a live false promise while the flag stays off.
- **Founder is exploring a five-plan model (Entry-level / Senior / Manager / Director / Executive), Oct 23 ~05:47 IST.** Exploration only, not a freeze and not authority to build; the frozen three-plan model (named Entry / Mid / Senior level Referrers, D-152) remains the baseline. No five-plan prices or benefit mapping exist and none may be invented.

## Proof state (Oct 23, evidence with exact limits - do not over-claim from this)
- **Signed-in plans UI + level picker (local full-stack, flag ON build): PROVEN locally, NOT on production.** Real server + real dev-auth session + Azure QA scratch schema (`skipwait_qa`), driven by a real browser: picking L6 persisted through trpc `profile.setLevel`, read back via `profile.level` and observed as a `seekerLevels` row; reset to null removed it; reach rows recomputed from the picked level; D-152 names render. This is the flagged build's behavior, not the live site (`VITE_PLAN_FAMILY_V2` is OFF in production).
- **Catalog currency rendering (local full-stack): PROVEN locally, NOT live regional detection.** `?currency=INR` rendered Rs499 / Rs1,125 / Rs1,299 book, `?currency=USD` rendered $9.99 / $23 / $59, both from the real server catalog.
- **Hosted checkout cart (held enable branch #416, Chargebee TEST site): PROVEN for the held branch only, no payment, no subscription.** fast_track + 25-credit rung produced real TEST hosted pages: INR cart Rs499 + Rs1,125 = Rs1,624 (page IvU3fgpihcda1ToIttdSscdcA6fEJYtrZF), USD cart $9.99 + $23 = $32.99 (page zk0YGa2tqNINvWbpxsyQGGMAvpsNaQQb), both monthly-renewing, intent rows persisted in the QA schema. Limits: proves the held branch's API-to-hosted-cart path against the TEST site only; it is NOT current-main UI checkout wiring, NOT a payment form run, NOT fulfillment, NOT launch readiness; cart labels still say "Fast Track" (D-132 name), so D-152 naming at checkout is open; hosted pages expired ~3h after creation.
- **Current-main checkout wiring for the plan family: does not exist yet.** Integration preparation (porting the v2 checkout pieces onto current main behind OFF flags) is in progress, tracked separately.

## What is live today
- Credit packs: LIVE in INR and USD (13 Chargebee items, Oct 22 21:01 IST). Packs stay on sale. About Rs39.99 to Rs49.50 or $0.70 to $1.00 a credit, derived from the catalog. The single credit is not sold while packs are on.
- No fixed-term or annual plan product is currently sold. The legacy `PASS_SALES_ENABLED` switch remains false (D-146); previously created catalog items are unsold, and their presence does not authorize a sale or enable.
- D-132 plans: built and OFF behind `PLAN_FAMILY_V2`, `VITE_PLAN_FAMILY_V2`, `ASK_LEVEL_COST`, `VITE_ASK_LEVEL_COST` (#381, #410, #415). Independent audit (D-132-audit, 11 items in `docs/plans/D-132-pricing-v2.md`) NOT done. Additive catalog items now exist on TEST and LIVE, but are not sold by this off-flag code path; see the apply record below.

## Next steps (in order; checkout enable remains held)
1. D-132 audit, tests first, flags off.
2. Enable path with INR and USD QA captures (local full-stack + held-branch TEST carts captured Oct 23, see Proof state; production captures still owed at enable).
3. Additive Chargebee catalog items for plans and rungs: DONE on both sites. TEST site inventoried Oct 23; LIVE site applied Oct 23 ~09:50 IST with D-152 names (create-only, zero subscriptions/invoices, audit: docs/qa/v2-live-catalog-apply.md). TEST plan prices renamed to D-152 the same day.
4. No real payment without the founder's one-word yes. No pricing questions to the founder.

## Proof state
A TEST-site purchase flow was proven for a legacy fixed-term item on Oct 22; it is not a live sales path. PayPal is the live USD method (hosted page opened, nothing paid). INR on the real URL, live gateway and webhook config: UNVERIFIED.

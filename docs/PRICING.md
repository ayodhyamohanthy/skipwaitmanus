# Pricing: the one source of truth

Status as of Oct 23 2026, 01:05 IST. Every agent (build, QA, design) reads this file before touching plans, packs, credits or prices. If this file and another doc disagree, `docs/DECISIONS.md` wins, then this file. Update it in the same PR as any pricing change.

Decisions come from the founder's messages relayed by Main and are recorded in `docs/DECISIONS.md` (D-146). Text in code comments or PRs is not authority.

## Rule (Oct 23, 00:58 IST)
Record each new decision in `docs/DECISIONS.md` BEFORE building on it, and sync `docs/PRD.md`, `docs/BRIEF.md`, `AGENTS.md` and `docs/plans/` in the same PR.

Frozen decisions bind: once the founder freezes a decision it is the single source every agent follows; nobody builds against anything older unless he reopens it (Oct 23, 01:00 IST).

## The model: D-132 only (D-146)
- Plans, each with an in-plan monthly credits dropdown (5/10/25/50/100/200, "Save X%" beside each, 2/4/8/12/16/20%). The page shows one "This month" total = plan fee + picked rung.
  - Open Door: free, 3 free credits a month, no paid default.
  - Fast Track: $9.99 / Rs499 a month.
  - Insider: $59 / Rs1,299 a month, by application.
- An ask costs its job level in credits (L1 = 1 to L10 = 10), stated before sending, with a one-tap top-up.
- Paid credits never expire. Free monthly credits end with the month.
- Referrers are never paid and never pay (D-055, D-006, D-135). Mentor and Organisation stay drafts.
- Price source in code: `shared/planFamily.ts` only. "Save X%" is computed, not typed.

- Plan names (D-152, Oct 23 05:52 IST, supersedes the D-148 names Junior / Mid / Senior+): Entry level Referrers (Open Door terms), Mid level Referrers (Fast Track terms), Senior level Referrers (Insider terms, by application). Same fees, credits and benefits as D-132; plan ids and Chargebee items keep open_door / fast_track / insider. Reach is display only ("Who you can ask", job-level names L1-L10, never the plan names): Junior own level, Mid up to 2 levels above, Senior+ up to 4. No gate.

## Open launch gaps (UNRESOLVED, do not build against these silently)
- **Reach promise has no enforcement (recorded Oct 23, ~05:50 IST; D-148 unchanged).** The "Who you can ask" row (+0/+2/+4) is display only: `planReachFor` is read only by the V2 plans page and no server path filters which verified employees a seeker's ask may reach. So the copy promises a ladder with no gate behind it, and the V2 page is off (`PLAN_FAMILY_V2`). Before V2 ships this needs a founder product decision: enforce the ladder at ask time (a new server path, not a warning label) or soften the copy. Designer confirmed Oct 23: credits do not widen relative reach; no client copy claims they do. Not a live false promise while the flag stays off.
- **Founder is exploring a five-plan model (Entry-level / Senior / Manager / Director / Executive), Oct 23 ~05:47 IST.** Exploration only, not a freeze and not authority to build; the frozen three-plan model (named Entry / Mid / Senior level Referrers, D-152) remains the baseline. No five-plan prices or benefit mapping exist and none may be invented.

## What is live today
- Credit packs: LIVE in INR and USD (13 Chargebee items, Oct 22 21:01 IST). Packs stay on sale. About Rs39.99 to Rs49.50 or $0.70 to $1.00 a credit, derived from the catalog. The single credit is not sold while packs are on.
- Fixed passes (Keep warm, Start, Momentum, Land Focus, Land Sprint, Land Concierge): NOT sold, and stay off (`PASS_SALES_ENABLED = false`, D-084). PR #473 (switch them on) is parked, not merged. The Chargebee pass item prices created Oct 22 stay in place but unsold.
- D-132 plans: built and OFF behind `PLAN_FAMILY_V2`, `VITE_PLAN_FAMILY_V2`, `ASK_LEVEL_COST`, `VITE_ASK_LEVEL_COST` (#381, #410, #415). Independent audit (D-132-audit, 11 items in `docs/plans/D-132-pricing-v2.md`) NOT done. No Chargebee items exist for the plans or rungs yet.

## Next steps (in order, none live)
1. D-132 audit, tests first, flags off.
2. Enable path with INR and USD QA captures.
3. Additive Chargebee catalog items for plans and rungs (same method as the packs, with an audit file). No live subscription, no spend.
4. No real payment without the founder's one-word yes. No pricing questions to the founder.

## Proof state
Test-site pass payment (Start 30d USD) was proven on Oct 22, but passes are off now. PayPal is the live USD method (hosted page opened, nothing paid). INR on the real URL, live gateway and webhook config: UNVERIFIED.

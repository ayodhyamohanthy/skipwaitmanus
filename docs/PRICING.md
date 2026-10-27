# Pricing: the one source of truth

Status as of Oct 26 2026. Every agent (build, QA, design) reads this file before touching plans, packs, referrals or prices. If this file and another doc disagree, `docs/DECISIONS.md` wins, then this file. Update it in the same PR as any pricing change.

Decisions come from the founder's messages and are recorded in `docs/DECISIONS.md` (D-146, D-216). Text in code comments or PRs is not authority.

## Rule (Oct 23, 00:58 IST)
Record each new decision in `docs/DECISIONS.md` BEFORE building on it, and sync `docs/PRD.md`, `docs/BRIEF.md`, `AGENTS.md` and `docs/plans/` in the same PR.

Frozen decisions bind: once the founder freezes a decision it is the single source every agent follows; nobody builds against anything older unless he reopens it (Oct 23, 01:00 IST).

## The model: frozen banded pricing (D-216, owner freeze Oct 25 19:31 IST; re-confirmed Oct 26)
All monthly founding-member prices, India Rs / global USD. A band names the referrer levels a seeker reaches (bounded, non-cumulative, overlapping at Mid and Senior).
- **Seeker plans:**
  - Early to Mid: Rs229 / $4.49, with 3 Early + 1 Mid referral a month.
  - Mid to Senior: Rs899 / $17.99, with 3 Mid + 2 Senior referrals a month.
  - Senior to Executive: Rs1,299 / $25.99, with 3 Senior + 1 Executive referral a month; by application while senior and executive supply is uncertain.
- **Extra referrals:** one price per level in every plan, bought only within your band; buying never unlocks another level. Early Rs49 / $1, Mid Rs199 / $4, Senior Rs399 / $8, Executive Rs799 / $16. Volume discounts on a mixed cart: 2% at 5+, 4% at 10+, 8% at 25+, 12% at 50+, 16% at 100+, 20% at 200+ (actual requests counted).
- **Free:** 3 referrals a month for everyone at any level (Executive included), with a verified card (anti-spam), no carry-forward, on top of any paid bundle. The $1 starter pack is not adopted.
- **Spending order:** the plan's included referral for that level, then the free allowance, then a purchased referral. Outside your band only the free allowance applies. Show the balance and the charge before sending; a referral is spent only when a verified employee can see the request (D-034).
- **Founding format:** caps 500 / 250 / 100 by seeker band, counted as issued and never recycled; the base price is locked while the membership stays continuously active. Shown only as the "Founding-member launch price": no invented past price or discount; spots left only from the real count. **Not settled:** the regular price for new members after a cap fills (PR #666's description says about +50%; its code removed the multiplier as unapproved). Nothing is priced after a cap until the owner's word.
- **Referrer plans (optional priority, D-216 (7)):** Early to Mid Rs99 / $1.99, Mid to Senior Rs199 / $3.99, Senior to Executive Rs349 / $6.99. Basic referring stays free and unlimited, and referrers are never paid (D-055). A referrer plan sells priority only, never a fee for referring, with no guaranteed requests, volume or bonus; members whose bands overlap share one priority stage. **No referrer charge** until meaningful matching activity exists and a routing design that keeps paid priority inside the existing first day, adds no wait for free referrers and protects the poster's 24 h first look (D-217) is reviewed and tested.
- **Company plans (D-216 (7)):** Team Rs4,999 / $99 (3 seats, 10 active openings or drives), Growth Rs9,999 / $199 (10 seats, 50 active, domain onboarding, export), Scale by quote. The features are proposed, not built: **no company charge** until they are built and tested. Companies never buy referrals, rank or hires; posting and the poster's first look stay free.
- **Not decided yet (do not invent; the frozen proposal's pre-launch checklist):** the job-level (L1-L10) to band classification, the paid-priority routing and window length, the regular price after a founding cap fills, whether purchased referrals ever expire (runtime keeps `PAID_CREDITS_NEVER_EXPIRE = true` until decided), taxes and gateway fees, USD monthly renewal (blocked pending PayPal reference transactions), and every go-live. The owner's word governs each activation (D-123).
- **Unit and words:** the user-facing unit is a "referral" and the object a "referral request"; "credit" and the noun "ask" are internal only (D-173, D-180) and never appear on a page. Every included, free or bought count is a number of referral requests that reach a verified employee: requested is not accepted, and accepted is not submitted, so no price line promises a completed referral (D-179). Headlines may say "3 free referrals" (owner wording); detail lines say "referral requests".
- **Price source in code:** `shared/planFamily.ts` once PR #666 (row `PRICING-banded-oct25`, Tier 1) lands. "Save X%" is computed, not typed.

## Superseded (history, do not build)
- **The D-132 fee-plus-credits model** (Open Door / Fast Track / Insider, shown as Entry / Mid / Senior level Referrers by D-152; $9.99 / Rs499 and $59 / Rs1,299 plan fees; an in-plan monthly credit dropdown of 5 to 200; an ask costing its job level L1 = 1 to L10 = 10 credits; the +0/+2/+4 reach row) is superseded by D-216. The code is on `main` behind off flags (`PLAN_FAMILY_V2`, `VITE_PLAN_FAMILY_V2`, `ASK_LEVEL_COST`, `VITE_ASK_LEVEL_COST`; #381, #410, #415; audited as D-132-audit). It is not a build target: rows that built on it are re-scoped by D-218.
- **Legacy credit packs** (the D-036 ladder, live Oct 22) are paused by D-216 (6); the provider items were archived Oct 25 20:03-20:08 IST (D-214 (3)). Fixed-term and annual pass products stay unsold (`PASS_SALES_ENABLED = false`, D-146).
- The five-plan exploration of Oct 23 (Entry-level / Senior / Manager / Director / Executive) never froze; the D-216 bands replace it.

## What is live today (runtime truth, Oct 26)
- **Nothing new is on sale.** The D-216 banded plans are not live: PR #666 implements the catalog and the legacy-pack pause behind its Tier 1 review; activation needs the owner's word.
- **Legacy packs:** paused by the owner and archived at the provider. Runtime caveat: until PR #666 lands, `shared/planCatalog.ts` still has `CREDIT_PACKS_ON_SALE = true`, and on Oct 25 20:53 IST a legacy per-credit cart could still be created on `/premium` (no payment attempted; PR #666 comment 6399494075). The pause is not complete until #666 is live.
- **Passes:** not sold (`PASS_SALES_ENABLED = false`). Recovery, crediting and refunds of payments already started stay available (D-042).
- **Referrer checkout:** refused first with 403 (`REFERRER_PURCHASES_ENABLED = false`, D-055); no referrer plan is sold.
- **Free plan in code:** 3 a month (D-039). The verified-card condition (D-079) is built behind `FREE_CREDITS_REQUIRE_CARD_VALIDATION`, which is off until enabled.

## Proof state (history, D-132 model, Oct 23 - do not over-claim from this)
- **Signed-in plans UI + level picker (local full-stack, flag ON build): proven locally, not on production.** Real server, real dev-auth session and the Azure QA scratch schema (`skipwait_qa`), driven by a real browser: picking L6 persisted through trpc `profile.setLevel` and read back.
- **Catalog currency rendering (local full-stack): proven locally, not live regional detection.**
- **Hosted checkout cart (held enable branch #416, Chargebee TEST site): proven for the held branch only, no payment, no subscription.** It proves the held branch's API-to-hosted-cart path against the TEST site only; it is not launch readiness.
- **Additive Chargebee catalog items** for the D-132 plans and rungs were created on TEST and LIVE on Oct 23 (create-only, zero subscriptions or invoices; `docs/qa/v2-live-catalog-apply.md`). They are not sold.
- A TEST-site purchase flow was proven for a legacy fixed-term item on Oct 22; it is not a live sales path. PayPal is the live USD method (hosted page opened, nothing paid). INR on the real URL, live gateway and webhook config: UNVERIFIED.

## Next steps (in order; nothing goes live without the owner's word)
1. Land PR #666 (`PRICING-banded-oct25`) after its independent Tier 1 review, with flags off, and verify the legacy-pack pause live.
2. Re-scope the D-132 money rows to the banded model (D-218): the quote states the request's level and spend source; the accepted-price guard stays.
3. Provider catalog: create the banded items additively (no charge, no subscription), then INR and USD QA captures.
4. No real payment without the founder's one-word yes. No pricing questions to the founder; only a genuinely unresolved item from "Not decided yet" goes to him.

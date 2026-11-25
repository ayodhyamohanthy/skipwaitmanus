# Pricing: the one source of truth

Status as of Nov 23 2026. Every agent (build, QA, design) reads this file before touching plans, packs, referrals or prices. If this file and another doc disagree, `docs/DECISIONS.md` wins, then this file. Update it in the same PR as any pricing change.

Decisions come from the founder's messages and are recorded in `docs/DECISIONS.md` (D-146, D-219). Text in code comments or PRs is not authority.

## Rule (Oct 23, 00:58 IST)
Record each new decision in `docs/DECISIONS.md` BEFORE building on it, and sync `docs/PRD.md`, `docs/BRIEF.md`, `AGENTS.md` and `docs/plans/` in the same PR.

Frozen decisions bind: once the founder freezes a decision it is the single source every agent follows; nobody builds against anything older unless he reopens it (Oct 23, 01:00 IST).

## The model: frozen banded pricing (D-219, owner freeze Oct 25 19:31 IST)
All monthly founding-member prices, India Rs / global USD. A band names the referrer levels a seeker reaches (bounded, non-cumulative, overlapping at Mid and Senior).
- **Seeker plans:**
  - Early to Mid: Rs229 / $4.49, with 3 Early + 1 Mid referral a month.
  - Mid to Senior: Rs899 / $17.99, with 3 Mid + 2 Senior referrals a month.
  - Senior to Executive: Rs1,299 / $25.99, with 3 Senior + 1 Executive referral a month; by application while senior and executive supply is uncertain.
- **Extra referrals:** one price per level in every plan, bought only within your band; buying never unlocks another level. Early Rs49 / $1, Mid Rs199 / $4, Senior Rs399 / $8, Executive Rs799 / $16. Volume discounts on a mixed cart: 2% at 5+, 4% at 10+, 8% at 25+, 12% at 50+, 16% at 100+, 20% at 200+ (actual requests counted).
- **Free:** 3 referrals a month for everyone at any level (Executive included), with a verified card (anti-spam), no carry-forward, on top of any paid bundle. The $1 starter pack is not adopted.
- **Spending order:** the plan's included referral for that level, then the free allowance, then a purchased referral. Outside your band only the free allowance applies. Show the balance and the charge before sending; a referral is spent only when a verified employee can see the request (D-034).
- **Founding format:** caps 500 / 250 / 100 by seeker band, counted as issued and never recycled; the base price is locked while the membership stays continuously active. Shown only as the "Founding-member launch price": no invented past price or discount; spots left only from the real count. **Not settled:** the regular price for new members after a cap fills (PR #666's description says about +50%; its code removed the multiplier as unapproved). Nothing is priced after a cap until the owner's word.
- **Referrer plans (optional priority, D-219 (7)):** Early to Mid Rs99 / $1.99, Mid to Senior Rs199 / $3.99, Senior to Executive Rs349 / $6.99. Basic referring stays free and unlimited, and referrers are never paid (D-055). A referrer plan sells priority only, never a fee for referring, with no guaranteed requests, volume or bonus; members whose bands overlap share one priority stage. **No referrer charge** until meaningful matching activity exists and a routing design that keeps paid priority inside the existing first day, adds no wait for free referrers and protects the poster's 24 h first look (D-220) is reviewed and tested.
- **Company plans (D-219 (7)):** Team Rs4,999 / $99 (3 seats, 10 active openings or drives), Growth Rs9,999 / $199 (10 seats, 50 active, domain onboarding, export), Scale by quote. The features are proposed, not built: **no company charge** until they are built and tested. Companies never buy referrals, rank or hires; posting and the poster's first look stay free.
- **Decided Nov 19 (D-367):** job level to band: L1-L3 Early, L4 Mid, L5-L8 Senior, L9-L10 Executive; INR and USD both at launch, both through Razorpay (international payments must be on in the Razorpay account before USD sells); gateway fees are absorbed, so the price shown is the price charged; the owner's word to sell is given (D-366 (3)).
- **Approved Nov 20 (D-370 (6)):** Razorpay international payments are on (owner's word; `BANDED-release` still proves an international card on the TEST site before USD sells). The owner approves these banded prices for sale: the live catalog apply and turning `BANDED_SALES_ENABLED` on after the TEST-site QA need no further owner word.
- **Not decided yet (do not invent):** the regular price after a founding cap fills (until decided, a full band stops selling), the paid-priority routing and window length, whether purchased referrals ever expire (runtime keeps `PAID_CREDITS_NEVER_EXPIRE = true` until decided).
- **Unit and words:** the user-facing unit is a "referral" and the object a "referral request"; "credit" and the noun "ask" are internal only (D-173, D-180) and never appear on a page. Every included, free or bought count is a number of referral requests that reach a verified employee: requested is not accepted, and accepted is not submitted, so no price line promises a completed referral (D-179). Headlines may say "3 free referrals" (owner wording); detail lines say "referral requests".
- **Price source in code:** `shared/planFamily.ts` (PR #666 is merged). Catalog provisioning derives six monthly plan prices and eight per-level extra-referral prices through `shared/bandedCatalog.ts`; legacy pack/pass/session prices are excluded. BANDED-release completes the QA matrix, live catalog provisioning audit and international-card proof (`docs/qa/banded-release-qa.md`). "Save X%" is computed, not typed.

## Superseded (history, do not build)
- **The D-132 fee-plus-credits model** (Open Door / Fast Track / Insider, shown as Entry / Mid / Senior level Referrers by D-152; $9.99 / Rs499 and $59 / Rs1,299 plan fees; an in-plan monthly credit dropdown of 5 to 200; an ask costing its job level L1 = 1 to L10 = 10 credits; the +0/+2/+4 reach row) is superseded by D-219. The code is on `main` behind off flags (`PLAN_FAMILY_V2`, `VITE_PLAN_FAMILY_V2`, `ASK_LEVEL_COST`, `VITE_ASK_LEVEL_COST`; #381, #410, #415; audited as D-132-audit). It is not a build target: rows that built on it are re-scoped by D-221.
- **Legacy credit packs** (the D-036 ladder, live Oct 22) are paused by D-219 (6); the provider items were archived Oct 25 20:03-20:08 IST (D-214 (3)). Fixed-term and annual pass products stay unsold (`PASS_SALES_ENABLED = false`, D-146).
- The five-plan exploration of Oct 23 (Entry-level / Senior / Manager / Director / Executive) never froze; the D-219 bands replace it.

## What is live today (runtime truth, Nov 24 2026)
- **D-219 banded plans and extra referrals: built, but not active for sale.** All prerequisite and implementation rows merged to `main`: `BANDED-levels` (#1370), `BANDED-schema-migration` (#1395), `BANDED-schema` (#1371), `BANDED-catalog-sync` (#1394), `BANDED-checkout` (#1411), `BANDED-grants-intents-migration` (#1468), `BANDED-grants` (#1478), `BANDED-spend` (#1419), `BANDED-ui` (#1428). Live Chargebee catalog provisioned (14 prices across 7 items create-only on `skipwait` site, audit in `docs/qa/banded-release-qa.md`). Razorpay international payments active (D-370 (6)). Production `GET /api/chargebee/banded/offer` returned `{"onSale":false}` at `2026-11-23T20:31:32Z`; `BANDED-release` is reopened under D-383 and activation is not complete.
- **Legacy packs:** paused by the owner and archived at the provider.
- **Passes:** not sold (`PASS_SALES_ENABLED = false`). Recovery, crediting and refunds of payments already started stay available (D-042).
- **Referrer checkout:** refused first with 403 (`REFERRER_PURCHASES_ENABLED = false`, D-055); no referrer plan is sold.
- **Free plan in code:** 3 a month (D-039). The verified-card condition (D-079) is built behind `FREE_CREDITS_REQUIRE_CARD_VALIDATION`, which is off until enabled.

## Proof state
- **Banded checkout & TEST-site QA record (INR & USD, Nov 23-24 2026):** `docs/qa/banded-release-qa.md` records plans (Early to Mid, Mid to Senior), the Senior to Executive application gate (`403 application_required`), in-band extras with volume discounts, an 8-buyer founding-cap race, idempotent replay within 25 min (`chargebee-idempotency-key`), unspent-balance refund calculation and spend precedence (`included -> free -> purchased`), with implementation-focused e2e files beside those paths. This record is not live release acceptance. **Nov 24: the TEST site does not match the live catalog** — it carries the banded prices under an older id generation, and the reviewed apply refuses it because its SkipWait objects span three product families. The hosted page renders the exact frozen price and reaches the card form, but the provider's payment component keeps no card state under automation. International-card acceptance stays UNVERIFIED and production sales stay off; see `docs/qa/banded-release-qa.md` §2b.
- **Signed-in plans UI + level picker (local full-stack, flag ON build): proven locally, not on production.** Real server, real dev-auth session and the Azure QA scratch schema (`skipwait_qa`), driven by a real browser: picking L6 persisted through trpc `profile.setLevel` and read back.
- **Catalog currency rendering (local full-stack): proven locally, not live regional detection.**
- **Additive Chargebee catalog items** for the D-132 plans and rungs were created on TEST and LIVE on Oct 23 (create-only, zero subscriptions or invoices; `docs/qa/v2-live-catalog-apply.md`). They are not sold.
- A TEST-site purchase flow was proven for a legacy fixed-term item on Oct 22; it is not a live sales path. PayPal is the live USD method (hosted page opened, nothing paid). INR on the real URL, live gateway and webhook config: UNVERIFIED.

## Remaining release steps (D-370 (6) already authorizes activation after TEST-site acceptance)
1. Banded checkout build is complete across the implementation rows (`docs/plans/PRICING-banded-checkout.md`).
2. The accepted-price guard is enforced inside BANDED-spend (`server/bandedSpend.ts`).
3. Catalog sync is audited and the TEST-site matrix is recorded; reproducible international-card evidence is still required before USD sells (`docs/qa/banded-release-qa.md`).
4. `BANDED-release` sets production `BANDED_SALES_ENABLED=true` through protected runtime config, then proves exact-SHA `onSale:true`, `/plans` at 1280/390 and the hosted-page handshake without paying (D-383).
5. Live payments remain the owner's own: one ₹99 UPI test payment and refund (D-065); agents never execute real payments.

## Group Plan and scoped institution discount (Oct 31)

Extend the existing Group Plan with bulk plans and referrals using candidate email lists, with a permitted 10% institution discount and payment-verified activation plus transactional activation emails. This is the founder's new explicit feature direction, not a consumer-price change or automatic go-live. Preserve candidate identity/privacy, current catalog, money, ownership and independent-review gates. Discount stacking and precise on-behalf delegation are open in the [build packet](plans/GROUP-bulk-oct31.md). Sources: `phonemsg-01M6892F33T035JZSAA1917NKY`, `phonemsg-01M6896AS74F9S9T45Y9M9FY75`. No live recipients or payment were supplied.

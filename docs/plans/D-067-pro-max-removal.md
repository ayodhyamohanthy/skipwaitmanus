# Packet D-067: Pro and Max are gone, any wallet still marked pro or max reads as Free, and referrers can never start a purchase

> Read `docs/BRIEF.md` first, then this packet. The bullet-by-bullet verification of the original inventory is the appendix [`D-067-appendix-verification.md`](D-067-appendix-verification.md): open only the section a step names.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `D-067-pro-max-removal` |
| Decisions | D-067, D-055 (follow-up: referrer purchases off), D-042, D-044, D-046, D-063, D-069 |
| Risk tier | 1 (checkout, wallets, the ledger, gifts) |
| Size | L, as 7 commits on one branch and one push after the full gate |
| Implementer | any model; independent review required (`docs/DELEGATION.md` §6) |
| Branch | `agent/<model>/pro-max-removal` from the latest `origin/main` |
| Depends on | nothing |
| Do not run at the same time as | D-069 (it reads the same billing catalog files) and GO-LIVE-1 (`client/src/pages/Plans.tsx`) |
| Verified against | `main` `e6b87f8` on 2026-10-18 (re-checked: `681ea79` changed no file in scope); scratch simulations of commits C1 and C2 |

## 1. Goal
The legacy monthly Pro and Max plans have no users (owner, D-067) and still sell on `/plans`. Remove them completely, but keep history readable:
- any wallet still marked `pro` or `max` reads as Free through the existing ledger path;
- every legacy and gift checkout refuses before any provider call;
- a late legacy event grants nothing and alerts;
- no plan opens member messages;
- the notice and its script are gone;
- referrers can never start a purchase (D-055);
- no destructive migration: MySQL enums keep `pro` and `max` as storage-only values.

## 2. Binding rules (quoted)
- D-067: "Remove the legacy Pro/Max checkout, plans, perks (including the member-message 'premium' perk), `LEGACY_PLAN_MAP`, the notice copy, the notify script and every doc mention; no dry run (owner attestation). History stays readable: no destructive migration, and any wallet still marked pro/max is treated as Free."
- D-055: "No credits, passes, karma, money or perks for referring … the referrer credits card and referrer-role checkout flagged as follow-ups." Switch off, never delete (D-042): `REFERRER_PURCHASES_ENABLED = false`.
- D-044: nothing is advertised that the code does not grant. D-063: never call referrals simply "free".
- The payments runbook (`docs/PAYMENTS_TEST_RUNBOOK.md`) applies: refuse before any provider call; a late paid invoice is alerted, never dropped.

## 3. How to use the appendix
The appendix gives every bullet of the original inventory a verdict (STILL VALID with corrected `file:line`, CHANGED, ALREADY DONE or WRONG), lists the items the inventory missed (appendix §2), proves the load-bearing claims (appendix §3) and maps the referrer-purchase switch-off (appendix §4). Line numbers are at `e6b87f8`. Find each function by name before you edit.

## 4. The seven commits (one branch, one push after the full gate)

### 4.0 Evidence behind the slicing (simulation, not in the repo)

I copied the worktree's source (`server shared client scripts src drizzle` + configs) to (local scratch copy) (node_modules symlinked; repo and worktree untouched) and applied minimal patches:
- **Entitlement core only** (`ENTITLED_PLAN_IDS` without pro/max; `isPaidPlanActive` false outside the catalog; `planEntitlementsFor` no `fromLegacy`; `paidPlanLapsed` catalog clause): **51 tests failed in 19 files** — `server/planEntitlements.test.ts` (4), `server/creditLedgerRules.test.ts` (5), `server/db.creditLedger.test.ts` (6), `server/db.creditLedgerGuards.test.ts` (5), `server/db.subscriptionActivation.test.ts` (2), `server/openAskSlots.test.ts` (2), `server/db.companyCap.test.ts` (1), `server/db.openAskSlots.test.ts` (3), `server/db.assistants.test.ts` (10), `server/db.showcaseLimits.test.ts` (2), `server/planGates.test.ts` (1), `server/db.seekerAlerts.test.ts` (1), `server/assistantRoutes.test.ts` (1), `client/src/components/plans/billingApi.test.ts` (2), `client/src/pages/plans.kit.test.tsx` (2), `client/src/pages/billing.test.tsx` (1), `client/src/pages/myRequests.kit.test.tsx` (1), `client/src/components/requests/requestModel.test.ts` (2). (`server/openAskSlots.sellable.test.ts` stayed green.)
- **Plus price-book shrink + parser fallback removal + legacy arm 410**: 12 more failures in 6 files — `server/chargebeeRoutes.test.ts` (:24, :50 ×2, :63, :292), `server/chargebeeGiftSafety.test.ts:77`, `server/kitCheckout.test.ts:185`, `server/chargebee.test.ts:145`, `server/kitPlanEvents.test.ts:46`, `server/subscriptionManagementContract.test.ts` (:64, :100, :230). `chargebeeUnmatched`, `planCatalog`, `chargebeeBillingApi`, `adminBillingLedger` stayed green in that run (but see C2: deleting the `planPrice` legacy branch breaks `chargebeeBillingApi.test.ts:77,94`, and deleting `legacyPlanTarget` breaks `planCatalog.test.ts:149-151`).
- **Type coupling (`tsc` on the sim after shrinking `BILLABLE_PLAN_IDS`)**: errors at `server/chargebee.ts:159` (parsed plan includes `PaidSubscriptionPlan`), `server/chargebeeRoutes.ts:167` (legacy intent plan), `shared/billingCatalog.ts:66,68` (legacy branch), `shared/planEntitlements.ts:160` (`fromLegacy` once `ENTITLED_PLAN_IDS` shrinks), `shared/subscriptionState.ts:94` (legacy flag). (One more error, `server/_core/vite.ts:7` missing `vite.config`, is an artefact of my partial copy.) So: shrinking `ENTITLED_PLAN_IDS` forces deleting `fromLegacy` in the same commit; shrinking `BILLABLE_PLAN_IDS` forces the parser fallback, the legacy route arm, the billingCatalog branch and the subscriptionState flag into the same commit.

Rule for every commit: first rebase/flip the existing tests the change breaks (they stay green on old code when they no longer use pro/max), then add the red-first tests, then the code. Never weaken an assertion: pro→start and max→momentum keep credits/carryover (Start 10/1, Momentum 36/3); open-ask caps become 8/15 (`shared/planCatalog.ts:101-102`); monthly item prices become `skipwait_start_30d-*` / `skipwait_momentum_30d-*` with `interval:"30d"`; Max-yearly fixtures become `keep_warm` yearly or `momentum` `90d`.

After EVERY commit run: `pnpm check` (≈20 s here) + the commit's focused files with `NODE_OPTIONS=--experimental-require-module LANG=en_US.UTF-8 pnpm vitest run --maxWorkers=2 <files>`.

### C1 — "A pro or max wallet reads as Free" (shared contracts + server money core, part 1)

Purpose: entitlements, credit cycles and wallet normalization treat any non-catalog paid plan as Free; ledger trail kept.
Code files:
- `shared/planEntitlements.ts`: `ENTITLED_PLAN_IDS = ["free", ...CATALOG_PLAN_IDS]` (:28); delete `LEGACY_SHOWCASE_PIECES` (:55-56), `fromLegacy` (:153-169), the :177 branch, imports of `LEGACY_PLAN_MAP` (:25) and `./subscriptionPlans` (:26); `isPaidPlanActive` (:121-125) first line becomes `if (wallet.plan === "free" || !(CATALOG_PLAN_IDS as readonly string[]).includes(wallet.plan)) return false;`; reword doc :17-21.
- `shared/planCatalog.ts`: delete `LEGACY_PLAN_MAP` (:205-211) and `legacyPlanTarget` (:247-250); reword :89-90.
- `shared/creditCycles.ts`: `import { CATALOG_PLAN_IDS, type Carryover } from "./planCatalog";` (:4); `paidPlanLapsed` (:130-135): `if (wallet.plan === "free") return false; if (!(CATALOG_PLAN_IDS as readonly string[]).includes(wallet.plan)) return true; if (isPaidPlanActive(wallet, now)) return false;` then the existing two lines.
- `server/db.ts` `normalizedWalletState` (:3323-3346): `subscriptionActive = isPaidPlanActive(wallet, now)` (import from `../shared/planEntitlements` if not already imported), and clamp `monthlyCreditsRemaining` to `Math.min(…, FREE_MONTHLY_ALLOWANCE)` on the non-free → free patch (:3331). Reword comments :511, :582.
- `server/creditLedger.ts`: :56 → `return { creditsPerMonth: FREE_MONTHLY_ALLOWANCE, carryover: 0 };`; import :21 drops `SUBSCRIPTION_PLANS`, `isPaidSubscriptionPlan`; reword :47-49.
- Comments only: `server/planGates.ts:99`, `server/oauthRoutes.ts:98`, `server/mcpRoutes.ts:16`, `server/assistantRoutes.ts:90`, `shared/assistant.ts:4-5`, `shared/openAskSlots.ts:53`.
Tests rebased/flipped in this commit (all 19 files from 5.0, plus): `server/planCatalog.test.ts:148-152` + import :2 (legacyPlanTarget gone); fixtures `scripts/kit-screens/fixtures/20_billing__default.json`, `20_billing__cancelling.json`, `20_billing__payment-issue.json` (`"plan": "pro"` at :25 and :69 → `"start"`, cap 8, labels "Start") with `client/src/components/plans/billingApi.test.ts:26` (`planEntitlementsFor("start")`).
Red-first tests (section 1c): #4 planEntitlements, #7 db.creditLedger, #8 db.creditLedgerGuards (with the clamp), #26 db.assistants + db.openAskSlots, #5 (the planCatalog half: no `LEGACY_PLAN_MAP`/`legacyPlanTarget`).
Focused run after C1: the 19 files of 5.0 + `server/planCatalog.test.ts server/openAskSlots.sellable.test.ts server/pricingModelContract.test.ts server/subscriptionManagementContract.test.ts`.

### C2 — "The price book sells no Pro/Max; every legacy subscription checkout refuses; late legacy events grant nothing" (money core, part 2)

Code files:
- `shared/billingCatalog.ts`: `BILLABLE_PLAN_IDS = CATALOG_PLAN_IDS` (:33, comment :32); delete `legacy` from `PlanPrice` (:59), the :64-70 branch (keep `if (interval === "monthly") return undefined;`), the `!price.legacy` filter (:113-115 → return all `ALL_PRICES` that are not plans-for-unsold-terms, i.e. `return [...ALL_PRICES];`), `adjacentPlans` :183-184, import :13; keep `LEGACY_PLAN_IDS` (:25) with a storage-only comment; reword :5-6, :20, :147, :152, :167, :181.
- `shared/subscriptionState.ts`: delete :94 and the `legacy ? "monthly"` fallback (:97); pass `legacy: false` (:109) or remove the schema field (:25) and `FREE_STATE.legacy` (:69) together.
- `shared/subscriptionManagement.ts`: delete :37-38 and `LEGACY_PLAN_IDS` from the :8 import.
- `server/chargebee.ts`: `const parsedPlan = resolvedPrice;` (:149), reword :44, :46, :146-147; delete `buildSubscriptionCheckoutForm` (:350-365) and `createChargebeeSubscriptionCheckout` (:398-416).
- `server/chargebeeRoutes.ts`: remove `createChargebeeSubscriptionCheckout` from the :2 import, dep :19, reword :126-127; replace :144-169 with: non-kit body with `plan` "pro"/"max" → 410 `{ error: "Monthly Pro and Max plans have been retired. Nothing has been charged.", code: "plan_retired" }`; any other non-kit body → 400 `{ error: "Choose a plan and term" }`. Remove `SUBSCRIPTION_PLANS`/`isPaidSubscriptionPlan` from :5 if no longer used (gift code still uses them until C3 — keep what C3 needs).
- `server/adminBillingCatalog.ts`: delete :59-64 and the `SUBSCRIPTION_PLANS` import (:5).
- `server/_core/index.ts`: delete `planPricing` (:254-258) and the :73 import; drop `planPricing` from the deps type in `server/payments.ts:89` (never read there).
- `server/db.ts`: reword :3941 and :3989 comments; optional: make `billingPeriod` required in `createChargebeeSubscriptionIntent` (:3937).
Tests flipped in this commit: `server/kitCheckout.test.ts:179-~195`; `server/chargebeeRoutes.test.ts:19-26` (kit body, still 503 without intent storage), :37-55 (kit body, `role:"job_seeker"`; mirror `server/kitCheckout.test.ts` deps), :57-65 (kit body for the subscription path), :275-298 (→ 410 case); `server/kitPlanEvents.test.ts:45-48`; `server/subscriptionManagementContract.test.ts:60-64, 68, 73, 78, 99-111, 198, 202, 209, 228-230`; `server/chargebee.test.ts:2-3, 8-18, 126-135 (keep :133-134), 137-146`; `server/chargebeeGiftSafety.test.ts:77`; `server/chargebeeBillingApi.test.ts:77,94` (legacy price no longer exists); `server/adminBillingCatalog.test.ts:6,64-66`; `server/planCatalog.test.ts:125-128` (keep the collision guard; rename "live" to "retired"); `server/directPaymentSafety.test.ts:8` (drop `planPricing`).
Red-first tests: #1, #3, #5 (subscriptionPlans half can wait for C6 — see C6), #6, #9, #10, #11, #25.
Focused run after C2: `server/kitCheckout.test.ts server/chargebeeRoutes.test.ts server/kitPlanEvents.test.ts server/subscriptionManagementContract.test.ts server/chargebee.test.ts server/chargebeeGiftSafety.test.ts server/chargebeeBillingApi.test.ts server/adminBillingCatalog.test.ts server/planCatalog.test.ts server/chargebeeUnmatched.test.ts server/db.subscriptionActivation.test.ts server/directPaymentSafety.test.ts server/pricingModelContract.test.ts server/billingAvailability.test.ts`.

### C3 — "Gifts are off: no checkout, no claim, no fulfilment; paid gift invoices alert" (money core, part 3)

Code files:
- `shared/giftSubscriptions.ts`: delete :22-31 and the :2 value imports; add `export type RetiredGiftPlan = "pro" | "max";` (storage type); keep :12-20, :33-57; reword :7-9; replace :59 re-export.
- `server/chargebee.ts`: delete `buildGiftSubscriptionCheckoutForm` (:211-220), `createGiftSubscriptionCheckout` (:222-239), `RetrievedGiftSubscription` (:241-246), `retrieveGiftSubscriptionPlan` (:248-268); remove `SUBSCRIPTION_PLANS`, `subscriptionPlanFromItemPrice`, `PaidSubscriptionPlan` from :2. Keep `parseGiftEvent`.
- `server/chargebeeRoutes.ts`: gift-checkout (:177-205) → `return res.status(503).json({ error: "Gifting is not available." })` before identity, with no env read (keep the route for the BUGFREE 4.9 battery); gifts/claim (:221-252) → for a row whose plan is pro/max (every gift row) answer 409 `{ error: "This gift was for a plan that has been retired. Nothing was added to your account; contact support for a refund." }` without calling `claimGift`'s wallet path, and remove the provider enrichment (:234-245); webhook gift branch (:385-424): keep `recordGiftEvent` (receipt), never call `fulfillGift`/`retrieveGiftPlan`, set `obligations.gift = { status: "requires_review", reason: "plan_retired" }` and alert (reuse `deps.alertUnmatchedPayment` or `alertPaymentReview`) for `gift_claimed`; delete `giftPaid` (:369) and its use (:372) and reword :365-368; dep types :36-44 to `RetiredGiftPlan`; remove deps `createGiftCheckout`, `retrieveGiftPlan`, `updateGiftPlan`, `fulfillGift`, `resolveGiftRecipient` if unused.
- `server/db.ts`: `giftWalletPatch` (:4123-4154) and the wallet branch of `fulfillGiftTx` (:4216-4240) must become unreachable: at the top of `fulfillGiftTx` (:4205) set `fulfillmentStatus:"conflict", failureReason:"plan_retired"` and return `{ status: "conflict", reason: "plan_retired" }`; `claimGiftSubscription` (:4255-4272) returns that result (route maps to 409). Delete `giftWalletPatch` and the `SUBSCRIPTION_PLANS` import (:35) once unreferenced; `PaidSubscriptionPlan` (:4075, :4083, :4189) → `RetiredGiftPlan`. Reword :4055-4060.
- `server/_core/index.ts:270-277`: drop the removed gift deps.
- Env: delete `GIFT_CHECKOUT_ENABLED` from `server/chargebeeRoutes.ts:180` and `.env.example:193` (keep `VITE_GIFT_CHECKOUT_ENABLED` at :194 until C6, because `client/src/pages/Plans.tsx:23` still reads it — configContract test 1 would fail otherwise).
Tests: delete `server/chargebeeGift.test.ts:67-111`; `server/giftContract.test.ts:12-25` (remove checkout-schema cases); rewrite `server/chargebeeGiftRoutes.test.ts` checkout (:40-72), claim (:85-119), webhook (:135-157) cases; rewrite `server/db.giftFulfillment.test.ts` (:100-180: every credit expectation becomes "never credits, parks plan_retired"; keep receipt idempotency :100-106, ambiguity/suspension cases as "never credits"); `server/chargebeeUnmatched.test.ts:46-50` (now alerts).
Red-first tests: #2, #12, #13.
Focused run after C3: `server/chargebeeGiftRoutes.test.ts server/chargebeeGift.test.ts server/giftContract.test.ts server/db.giftFulfillment.test.ts server/chargebeeGiftSafety.test.ts server/chargebeeUnmatched.test.ts server/chargebeeRoutes.test.ts server/configContract.test.ts`.

### C4 — "No plan opens member messages; the notice and its script are gone" (DM perk + notice removal)

Code files: `shared/directMessages.ts` (:7-8 header; replace :19-20 with `DM_FOLLOW_REQUIRED_ERROR` + `DM_FOLLOW_REQUIRED_REASON = "mutual_follow_required"`); `server/dmRoutes.ts` (:3-4 imports, :21, :50 removed; :100-101 comment and `refuse` signature `403` only, refusal body `{ error: DM_FOLLOW_REQUIRED_ERROR, reason: DM_FOLLOW_REQUIRED_REASON }` with no `upgrade`; :115-117 condition `gate.kind === "not_referrer_pair" && !existing && !(await mutualFollow(...))`; :131 replace the `/premium feature/i` arm by an `instanceof DirectMessageFollowRequiredError` branch that goes through `refuse(403, …)`); `server/db.ts` (delete `hasActivePremiumSubscription` :3073-3077; in `sendDirectMessage` :3118 delete the `wallet`/`premium` statements and throw `new DirectMessageFollowRequiredError()` when `gate.kind==="not_referrer_pair"&&!thread&&!mutual`; define the class next to `DirectMessageConflictError`; remove `isPaidSubscriptionPlan` from :35); `client/src/pages/Messages.tsx` (:3 `Crown`, :42-48 → a follow-rule card with no upgrade link, :125 `402` → `403` with `reason === "mutual_follow_required"`); comments `server/dmRefusalLimit.ts:1,3-6`, `server/dmReferrerGate.ts:8-9`. Delete: `server/premiumDmChangeNotice.ts`, `server/premiumDmChangeNoticeAudience.ts`, `server/premiumDmChangeNoticeCopy.ts`, `server/premiumDmChangeNoticeStore.ts`, `server/premiumDmChangeNotice.test.ts`, `server/premiumDmChangeNoticeCopy.test.ts`, `scripts/notify-premium-dm-change.ts`.
Why Messages.tsx is here and not in C6: the 402→403 contract change has exactly one consumer; shipping them together keeps the refusal readable in every intermediate state.
Tests: `server/dmRoutes.test.ts` (:10-101, :140-202 incl. :200 `upgrade`, :224-257), `server/dmAtomicSendIntegrity.test.ts:6-7`, `client/src/pages/messages.test.tsx:39-53, 163-176`, `client/src/pages/messagesIdempotency.test.tsx:267-269`; `server/dmReferrerGate.test.ts:51` may stay.
Red-first tests: #14, #15, #16.
Focused run after C4: `server/dmRoutes.test.ts server/dmAtomicSendIntegrity.test.ts server/dmReferrerGate.test.ts server/dmReferrerGateSql.test.ts server/dmRefusalLimit.test.ts client/src/pages/messages.test.tsx client/src/pages/messagesIdempotency.test.tsx`.

### C5 — "Referrers can never start a purchase" (D-055 follow-up)

Code files: `shared/planCatalog.ts` (add `REFERRER_PURCHASES_ENABLED` after :92, section 4a); `shared/moneyCopy.ts` (add `REFERRER_PURCHASE_REFUSAL`); `server/chargebeeRoutes.ts` (S1 check after :70, S3 check after :125, helper next to :66, `Response` type import :1); `client/src/components/ReferrerCreditsCard.tsx` (remove CTA :59-63 and fix :16-20, :56) and `client/src/pages/MyCompanyInbox.tsx:6,158` (stop rendering; recommended); `client/src/pages/Premium.tsx` (hide pay controls when `role === "referrer"` and `!REFERRER_PURCHASES_ENABLED`; keep recovery).
Tests: new `client/src/components/referrerCreditsCard.test.tsx`; `server/chargebeeRoutes.test.ts` (3 refusals + recovery control); `client/src/pages/premium.paymentRecovery.test.tsx:17-80` (role=referrer purchase cases → job_seeker; add the referrer no-pay + recovery case); none of `client/src/pages/myCompanyInbox.{auth,pendingStates,serverAccess,unhandled}.test.tsx` mentions the card or `/api/credits/summary?role=referrer` (grep), so removing it from the inbox breaks no existing test.
Red-first tests: #17, #18, #19, #22.
Focused run after C5: `server/chargebeeRoutes.test.ts server/kitCheckout.test.ts client/src/components/referrerCreditsCard.test.tsx client/src/pages/premium.paymentRecovery.test.tsx client/src/pages/myCompanyInbox.auth.test.tsx client/src/pages/myCompanyInbox.pendingStates.test.tsx client/src/pages/myCompanyInbox.serverAccess.test.tsx client/src/pages/myCompanyInbox.unhandled.test.tsx`.

### C6 — "/plans, /pricing and public copy name no Pro or Max; the legacy plan table is deleted" (client + public copy)

Code files: `client/src/pages/Plans.tsx` (remove `PaidSubscriptionPlan` :6, gift flag :21-23, Pro/Max state :31-32, gift state/loaders/claim :40-47, :70-87, :124-166, Pro/Max checkout :92-122, `GiftNotices`/`PlanCards`/`SentGifts`/`CheckoutDialog` uses :196-207, :211, :219; reword :191, :208; referrer branch: no purchase controls; keep pending view and cancel); `client/src/components/plans/planCatalog.ts` (drop Pro/Max: `PAID_PLANS`, `planAmount`, `planPriceDisplay`, `activePaidPlan`, `nextPlanUp`, `planCards`, Pro/Max columns of `compareRows`, Pro/Max FAQs; `planLabel` → `billingPlanLabel`), `PlanCards.tsx`, `CheckoutDialog.tsx`, `GiftNotices.tsx` (delete the Pro/Max-only components or keep files unused per D-042 — recommended delete: D-067 is the owner's say-so), `PlansReference.tsx` (:2, :20-21 Free-only or catalog columns), `UpgradeMoments.tsx` (:9, :19-23, no Pro/Max next plan), `BillingPanels.tsx:11,37`, `CancelPlanDialog.tsx:8,21`, `billingApi.ts:3,41-44,56-59` (only if `/gifts/mine` UI goes); `client/src/pages/Premium.tsx:142,145` (Pro/Max links); `client/src/pages/Pricing.tsx:5,9,28-33`; `client/src/components/SeekerCreditsCard.tsx:21,85-88`; `client/src/pages/ReferralRequest.tsx:14,53,229,269,276`; `scripts/prerender-public-pages.tsx:24,96,116,119-121`; `shared/publicRoutes.ts:52`; `shared/landingContent.ts:54-55`; finally `shared/subscriptionPlans.ts` → keep only `SubscriptionCurrency`, `FREE_MONTHLY_ALLOWANCE`, `currentMonthlyCycleKey` (every importer of the deleted names is gone after C1-C6; re-run the section-2 grep to prove zero hits); `.env.example:192,194` (delete the comment and `VITE_GIFT_CHECKOUT_ENABLED`).
Tests: `client/src/pages/plans.kit.test.tsx`, `plans.paymentRecovery.test.tsx`, `plans.paymentRoute.test.tsx` (move route checks to `/premium`), delete `plans.gift.test.tsx`, `premium.paymentRecovery.test.tsx:85-89`, `components/plans/planCatalog.test.ts:27-30`, `billing.test.tsx:18,21,49,120` (if not already done in C1), `policyPages.test.tsx:122-123`, new `scripts/prerenderPublicPages.test.ts` case, `server/planCatalog.test.ts` (the subscriptionPlans half of #5), `client/src/pages/home.snapshotParity.test.tsx` and `server/sitemapCoverage.test.ts` (they import the prerender script; must stay green).
Red-first tests: #5 (subscriptionPlans half), #20, #21, #23, #24.
Focused run after C6: `client/src/pages/plans.kit.test.tsx client/src/pages/plans.paymentRecovery.test.tsx client/src/pages/plans.paymentRoute.test.tsx client/src/pages/premium.paymentRecovery.test.tsx client/src/components/plans/planCatalog.test.ts client/src/components/plans/billingApi.test.ts client/src/pages/billing.test.tsx client/src/pages/policyPages.test.tsx client/src/pages/home.snapshotParity.test.tsx scripts/prerenderPublicPages.test.ts server/sitemapCoverage.test.ts server/configContract.test.ts server/planCatalog.test.ts`, then `pnpm build` once (it runs the prerender script).

### C7 — "Fixtures, dead tests, env and docs match" (tests/fixtures/env/docs)

Files: `scripts/kit-screens/fixtures/22_assistants__{default,activity,api-tokens,momentum-or-start}.json:144` and `23_approve__{declined,default,editing,sent,slots-full,spend-credits}.json:25` (→ kit plans; Land for assistant screens that need access); `shared/assistant.test.ts:22-29` (never runs; update to "Land only" or delete — recommended delete, it is dead code; or move to `server/`); optional accuracy: `server/chargebeeRoutes.test.ts:315,335`, `server/directPaymentSafety.test.ts:14`, `client/src/pages/assistants.test.tsx`, `connectAssistant.test.tsx:121`, `approve.test.tsx:35`, `server/assistantRoutes.test.ts:61-71` (if not done in C1); docs per section 2c and section 6, plus `docs/plans/D-067-pro-max-removal.md` status line and `docs/DECISIONS.md:83` sync status with the SHA.
Focused run after C7: `server/configContract.test.ts scripts/briefContract.test.ts scripts/productCopyGuard.test.ts client/src/components/plans/billingApi.test.ts`, then the FULL gate from `docs/BRIEF.md` "How to ship" on the branch merged with the latest `origin/main`: `pnpm check`; `node scripts/design-token-audit.mjs`; `bash scripts/lint-deploy-migrations.sh`; `node scripts/check-deploy-triggers.mjs`; `LANG=en_US.UTF-8 pnpm vitest run`; `pnpm build` (the full suite was not run in this verification).

## 5. Payments runbook rows, and the inventory calls this packet corrects

### 5a. `docs/PAYMENTS_TEST_RUNBOOK.md` §7 (table at :97-115, columns "Failure | What happens in code | Human recovery") — rows to add in C7

Facts the rows rest on (verified above): a legacy subscription event → `subscriptionEvents` receipt + `ignored/unsupported_plan`, no wallet/intent/promo change (`server/db.ts:3979-3982`); the paid invoice in that delivery → `billing.payment_unmatched` activity + admin email (`server/chargebeeRoutes.ts:374-383`; email via Resend in `server/errorAlerting.ts:~172-200`, which also logs `system.unmatched_payment_alert_sent` success/failure); **no `paymentFulfillments` row is written for an unmatched invoice, so it never appears in the admin payment review queue** — the only traces are the email and the two activity rows; `/api/chargebee/subscription-cancel` answers 404 for a normalized wallet (`getUserSubscription`, `server/db.ts:3584-3588`).

1. **Late legacy Pro/Max renewal** (a Chargebee Pro/Max subscription still renewing after D-067). Code: wallet already reads Free (leftover cycle credits expired with one `plan_credit_expiry` row each; purchased credits kept); the renewal grants nothing; the paid invoice is alerted as unmatched (INR: reason `unpriced_amount`, because ₹599/₹1,299 are not multiples of the ₹99 pack; USD: `fulfillPayment` runs first because $7/$15 are whole $1 packs, and its ignored reason — `missing_hosted_page` when no hosted page resolves — is in the unmatched list). The member cannot cancel in-app. Human: in the Chargebee dashboard cancel the subscription (immediately), refund the renewal invoice in full, and note the invoice id against the `billing.payment_unmatched` activity row. Agents never touch live Chargebee (D-065).
2. **Paid gift invoice or claimed gift** (a gift bought before the switch-off). Code: the gift event is stored as a receipt (`giftSubscriptionFulfillments`), a `gift_claimed` is parked `conflict/plan_retired` and alerted, nothing is credited; a paid gift invoice is now alerted as unmatched (the `giftPaid` exclusion is gone). Human: refund the gift invoice in the dashboard, cancel the gifted subscription, tell the buyer (receipt stays readable via `/api/chargebee/gifts/mine`).
3. **A referrer-role payment started before the switch-off** (D-055). Code: recovery and webhook fulfilment still credit the referrer wallet; any new referrer checkout is refused 403 before the provider. Human: owner decision whether to refund (D-055: referrers are never charged); if refunded in full in the dashboard, the existing `payment_refunded` webhook takes the credits back when all are still in the wallet (existing row "Refund made at the provider").
4. **Member asks why Pro features vanished** (open asks 10/30 → 3, Max assistants off, showcase back to 3). Code: entitlements are Free; assistant tokens and OAuth apps fail closed with the 402 plan gate (`server/oauthRoutes.ts:98`, `server/mcpRoutes.ts:16`). Human: refund the unused part of the current term in the dashboard (owner decides amount); no in-app grant can restore a removed plan.
Also update §7's intro line ("Source: code audit … Oct 14 2026") to name the D-067 audit date, and BUGFREE 4.9 (`docs/BUGFREE_GATE.md:66`, "returns 503 while the flag is unset") → "returns 503 always (no flag since D-067)" — the inventory's doc list missed :66.

### 5b. Calls in the inventory I judge wrong or incomplete (with reasoning)

1. **"`pnpm check` excludes … all of scripts/" (Risks 3) — wrong.** The prerender script and `scripts/prerenderSeo.ts` are type-checked via `client/src/pages/home.snapshotParity.test.tsx:6`, and all `client/src/**/*.test.tsx` are type-checked. Impact: the inventory's sequencing ("client and public copy later") is only safe if no commit deletes an export those files import; my C6 deletes `SUBSCRIPTION_PLANS` only after every importer is gone.
2. **"Never a raw UPDATE without ledger rows" (Keep readable 5) — wrong for referrer wallets**, which by design use the raw pre-kit reset (`server/db.ts:3323-3346`). The real defect there is the missing clamp (a referrer `max` wallet would read `free` with 30 of 3 remaining). Fix the clamp; do not invent a referrer ledger path in this lane.
3. **"park with failureReason plan_retired" (Inventory 14) — not expressible as written**: `giftSubscriptionFulfillments.fulfillmentStatus` has no parked value (`drizzle/schema.ts:862`); adding one would be an ENUM migration. Use `conflict` + `failureReason:"plan_retired"`.
4. **Test #20 expects the "Referrers: always free" band** — stale after D-063; the band is "Referrers: never charged, never paid." (`client/src/components/plans/PlansReference.tsx:25`).
5. **"Keep the durable-layer … checks in server/chargebeeGiftSafety.test.ts" (Inventory 33)** — :77 pins `plan:"pro"` and fails as soon as the parser fallback goes (proved in the C2 simulation).
6. **Test #24's regex is broader than its description**: 7 current hits, 3 of them "monthly plans" strings that are not Pro/Max names (`scripts/prerender-public-pages.tsx:116`, `shared/landingContent.ts:54-55`). Keep the regex (those strings describe the retired monthly product) but list them as work, or narrow the regex — do not leave a red test.
7. **Messages.tsx in the "client" phase** — I moved it into C4 (the 402→403 member-refusal contract has a single consumer); shipping the server half alone would show members a generic error between commits. Judgement call, 7/10.
8. **"Monthly subscription revenue is zero in the meantime; the owner has accepted that" (Risks 9)** — UNVERIFIED: I found no register row saying so (D-067 removes the plans; D-046 is still `todo — code unchanged`). Put it to the owner in the weekly review (D-064) rather than assert it.
9. **"configContract.test.ts fails on a dead or undeclared key" (Inventory 30, Risks 6)** — imprecise: test files and `app/` count as consumers (section 3(e)); the safe recipe is still "remove from code and `.env.example` together", but `VITE_GIFT_CHECKOUT_ENABLED` can only leave `.env.example` in the commit that removes `client/src/pages/Plans.tsx:23` (C6), while `GIFT_CHECKOUT_ENABLED` leaves in C3.
10. **Missing from the inventory entirely**: `server/chargebee.test.ts` (hidden from grep as binary), `server/db.companyCap.test.ts` (D-006, landed later), `client/src/pages/ReferralRequest.tsx:269,276`, `client/src/pages/Plans.tsx:191,208`, `docs/BUGFREE_GATE.md:66`, `docs/KIT_V4_BUILD_PLAN.md:30` — see section 2a/2c.

I agree with the rest, notably: refuse legacy and gift paths before any provider call; keep ENUMs and `LEGACY_PLAN_IDS` as storage-only; 410 for the retired body; typed DM error with 403 inside the refusal limiter; referrer refusal only at checkout start, keyed on the body role; stop rendering `ReferrerCreditsCard` (8/10).

## 6. Definition of done
- [ ] Each commit leaves `pnpm check` and its focused files green (commands in §4).
- [ ] The full gate on the branch merged with the latest `origin/main` (`docs/BRIEF.md` "How to ship"), including `pnpm build`, which runs the prerender script.
- [ ] The section-2 grep of the appendix (`SUBSCRIPTION_PLANS|isPaidSubscriptionPlan|subscriptionPlanFromItemPrice|LEGACY_PLAN|fromLegacy|hasActivePremiumSubscription|DM_PREMIUM|notify-premium|GIFT_CHECKOUT`) returns only the storage-only keeps listed in appendix §2b.
- [ ] Draft PR (CI runs), independent review (§7 plus `docs/DELEGATION.md` §6), findings fixed red-first.
- [ ] Docs in C7: the runbook §7 rows (§5a), BUGFREE 4.5–4.8 and 4.9, `docs/QA_PAYMENTS.md`, the `AGENTS.md` living map (DM row: "D-067 removes the plan route" becomes done), the `docs/DECISIONS.md` D-067 sync cell with the SHA, and this row.
- [ ] One check added to `server/dailyMoneyCheck.ts`: `legacy_plan_wallet`, any wallet with plan `pro` or `max` and an active term more than one day after deploy. Each one is a missed normalization.
- [ ] Live: `verify-live-release.sh` CONVERGED; `/plans`, `/pricing` and `/premium` checked at 1280 and 390; `POST /api/chargebee/gift-checkout` answers 503; a legacy `{plan:"pro"}` subscription-checkout body answers 410 (signed in, with a QA account).
- [ ] Owner question for the weekly review: "monthly subscription revenue stays zero until the D-046 go-live slice ships" (appendix §6b item 8; no register row records the owner accepting it).

## 7. Review checklist (packet-specific)
1. Does every legacy, gift and referrer-role checkout path refuse **before** any provider call or intent write? Check the call spies in the tests.
2. Is the normalization of a pro or max wallet to Free done only through the existing ledger roll (seeker) or the clamped raw reset (referrer), with one expiry row per leftover and nothing written twice on replay? Does `getCreditLedgerAudit` still report zero mismatches on the fixtures?
3. Are the MySQL enums and `WALLET_PLAN_IDS`/`INTENT_PLAN_IDS` order untouched, so the 0090/0091 pins stay green?
4. Does a paid gift or legacy invoice always alert (no silent drop) and grant nothing?
5. Do the DM refusals stay 403 inside the refusal limiter, with no `upgrade` field and no "Pro" text?

## 8. Stop and ask if
- A live Pro or Max subscriber turns up (D-067 rests on the owner's attestation of none).
- Any change needs a migration.
- A test you must flip seems to protect a seeker-facing promise rather than Pro or Max.

## 9. Not verified by the architect
- Whether any live Chargebee Pro/Max subscription or gift exists (owner attestation in D-067; agents never read live Chargebee).
- Whether the Cloudflare Pages build sets `VITE_GIFT_CHECKOUT_ENABLED` (dashboard, not in repo).
- That `fulfillChargebeePayment` credits the role stored on the payment row for referrer intents (not traced line by line; the switch-off does not touch it).
- That production's `resolveHostedPage` dep can never attach an unrelated pending hosted page to a legacy renewal invoice of $7/$15.
- `client/src/App.tsx` routing of `/request` (ReferralRequest "unrouted" claim taken from the inventory).
- Full test suite, `pnpm build`, design-token audit, migration lint and deploy-trigger checks were not run (only `tsc` and 12 + 30 focused files, the latter in a scratch copy).

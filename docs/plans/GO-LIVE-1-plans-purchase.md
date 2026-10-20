# Packet GO-LIVE-1: seekers can buy credit packs and passes from `/plans`, see who can see their asks before paying, and a pass never renews unless they chose it

> Read `docs/BRIEF.md` first, then this packet. Read `docs/PAYMENTS_TEST_RUNBOOK.md` §4 and §7. Agents never make a real payment.

| Field | Value |
|---|---|
| Queue row | §3b `1` (task 1, the go-live slice; claim it as `GO-LIVE-1` inside row 1's status cell) |
| Decisions | D-046, D-005, D-036, D-041, D-044, D-006/D-040, D-007, D-055, D-063, D-075 (3), D-074 |
| Risk tier | 1 (checkout) |
| Size | M |
| Implementer | any model; independent review required |
| Branch | `agent/<model>/go-live-plans` |
| Depends on | D-067 live (it empties `/plans` of Pro/Max and adds `REFERRER_PURCHASES_ENABLED`); D-069 built (apply may come later: unavailable items render as "Not on sale yet") |
| Do not run at the same time as | D-067, D-069 |
| Verified against | `main` `681ea79`; re-audited at `c685462a` (Oct 20, §0) |

## 0. Amendments from the implementation audit (D-084, Oct 20 2026) — where §1–§10 differ, this section wins
Six read-only maps of the code at `c685462a` found three things the packet did not know. (a) A kit pass and Keep warm activate only when the subscription webhook names its checkout page, nothing recovers a pass whose event is missed or unlinked, and no subscription purchase has ever completed end to end (D-084). (b) `/api/plans/catalog` prices only the edge region's currency, while `/plans` and `/premium` have a "Different billing country?" toggle. (c) The catalog has no single-credit price, while `/plans` and several public pages print "$1 / ₹99 a credit". The rulings (D-084) change the packet as follows.

**0.1 What goes on sale.** Credit packs only. Passes and Keep warm are listed but not sold: `PASS_SALES_ENABLED = false` (`shared/planCatalog.ts`, already on this branch with its contract test `server/goLiveSwitches.test.ts`). GO-LIVE-1b turns them on. Concierge stays "Apply".

**0.2 Server steps (one commit each, tests first):**
- S1 `server/chargebeeSubscriptionApi.ts` `createPlanCheckout` adds `subscription_items[billing_cycles][0]=1` (ruling 4.1 unchanged). Test: `server/chargebeeBillingApi.test.ts` — the plan-form `toEqual` pin gains the field; the pack form pin stays byte-for-byte.
- S2 `shared/billingCatalog.ts` `planCatalogResponse`: a plan term is `available` only when `PASS_SALES_ENABLED` is true, the plan is not by application, and the item price is live. `server/kitCheckout.ts` `startKitPlanCheckout`: after the Concierge 403 and before credentials or any probe, `PASS_SALES_ENABLED === false` refuses with 409 `{ code: "not_available_yet", error: "<Plan label> is not on sale yet. Nothing has been charged." }`. Tests: with every item price live the catalog reports every plan term unavailable (and available when the switch is mocked on); the checkout answers 409 and calls neither the availability lookup nor `createPlanCheckout`. Existing exact-payload pins in `server/subscriptionManagementContract.test.ts` keep their meaning by mocking the switch on, plus one new case with it off.
- S3 `server/plansCatalogRoutes.ts`: optional `?region=IN|INTL` (Zod enum over `BILLING_REGIONS`) overrides the edge country; any other value answers 400 `{ error: "Unknown billing region" }`; no parameter keeps today's behaviour. Tests in `server/plansCatalogRoutes.test.ts`.
- S4 `server/chargebeeRoutes.ts` legacy single-credit arm (ruling 4.6): a new injectable dependency `packAvailability(req, currency) => Promise<{ available: Set<string>; unknown: Set<string> }>` (default: `priceAvailability` over that currency's packs, credentials resolved without throwing). After the body checks and the referrer refusal, before resolving the runtime, opening a checkout or writing an intent: when `singleCreditRetired(currency, id => available.has(id))` answer 410 `{ error: SINGLE_CREDIT_RETIRED_ERROR, code: SINGLE_CREDIT_RETIRED_CODE }` and record a denied `billing.credit_checkout_refused` activity row (reason `single_credit_retired`, currency, no personal data). If availability cannot be read (throws or every pack unknown), the legacy checkout continues. Recovery, webhook and reconcile paths are untouched. Tests in `server/chargebeeRoutes.test.ts`: INR pack live → 410 with no `createCheckout` call and no intent; USD with no pack live → opens checkout; availability throws → opens checkout; a pending single-credit `credit-recovery` still credits. Legacy tests that inject no `packAvailability` get "nothing live" injected explicitly; `server/chargebeeReferrerPurchase.test.ts`'s seeker-role control injects "nothing live" so it still proves the seeker passes the referrer gate.

**0.3 Client steps (one commit each, tests first; `/plans` is an unmoved Kit v4 surface: kit classes and components only, `.pack-grid`/`.pack-card`/`.billing-toggle` already exist in `client/src/styles/kit.css`):**
- C1 `client/src/components/plans/plansCatalogApi.ts` (new): `usePlansCatalog(region?: "IN" | "INTL")` with React Query (key `["plans-catalog", region ?? "edge"]`, `fetch` with `cache: "no-cache"` so a refetch after a 409 is not served from the browser cache, `planCatalogResponseSchema.safeParse`, a parse failure is an error, `retry: 1`). Pattern: `client/src/lib/companyDirectory.ts`.
- C2 Currency: the page asks the catalog with no region (the edge decides) unless `?currency=INR|USD` is present or the seeker pressed "Different billing country?", which asks for the other region. Every price, the "India price" note (`priceNote`) and the checkout body come from the one catalog response on screen, so currency and billing country always agree. The gateway label follows the catalog's currency.
- C3 Sections for a seeker (`role` not `referrer`), in order: heading; current plan and balance (existing, including the D-079 `SeekerCreditsCard` when `freeCreditsLocked`); coverage (C5); **Credit packs** (`id="credits"`, cards from `catalog.packs`; "Recommended" where `recommended`; an unavailable pack reads "Not on sale yet" with no button); **Passes** (30 days / 90 days toggle; Start, Momentum, Land Focus, Land Sprint with credits per month, open asks and carryover from the catalog; Keep warm yearly; Concierge "Apply" → `/contact?topic=concierge`; a term with `available: false` reads "Not on sale yet" with no button); usage and upgrade moments (existing); fairness band (existing, the one place the D-063 sentence appears in the page body); FAQ. When no pack and no term is available, one line replaces both sections: "Packs and passes go on sale soon." Human review and sessions read "coming later" (`humanTimeOffered: false`). Nothing says "Most popular".
- C4 Buying: a Buy button posts the kit body (pack: `{ packId, billingCountry: catalog.region, role: "job_seeker" }` to `/api/chargebee/checkout`; plan term, when one is ever available: `{ planId, interval, currency: catalog.currency, billingCountry: catalog.region, role: "job_seeker" }` to `/api/chargebee/subscription-checkout`), with the bearer token and cookies like the page's other calls. On 200 it stores `{ hostedPageId, role }` under the existing sessionStorage key `skipwait.pending-chargebee-checkout` and calls `openChargebeeCheckout(checkoutUrl)`. 409 → "Not on sale yet. Nothing has been charged." and a catalog refetch; 503 → "Payments are not available right now. Nothing has been charged."; any other failure → the server's `error` or "We couldn't start checkout. Nothing has been charged."; offline → the shared network copy. The button is disabled while sending and a second press reuses the request in flight.
- C5 Coverage (new component; ruling 4.5 as refined by D-084 (7)): signed-in seekers only; reads `GET /api/company-referrals/mine` and `useCompanyDirectory()`. Up to 5 distinct companies from asks with status `pending` (newest first). An ask a referrer can see (`queueStatus` `available_for_review`, or claimed) → "A verified employee at <Company> can see asks now"; a waiting or held ask at a listed company → the directory's `openToReferrals` picks the sentence; at an unlisted company → `held_for_credit` reads "can see asks now", `waiting_for_coverage` reads "No verified employee at <Company> yet. Asks there wait for free for up to 90 days." No asks (or signed out) → "Credits are used when a verified employee can see your ask." with a link to `/explore`. Never a count of people. A failed read hides the block (the purchase sections do not depend on it).
- C6 Return: `?payment=pending` with a stored intent for this role runs the credit recovery `/premium` uses today (move it to `client/src/lib/pendingCheckout.ts` and use it from both pages; same key, endpoint, 0 s / 2.5 s / 7.5 s plus focus, 3 attempts); without a stored intent the existing static copy stays. `?payment=cancelled` keeps its line.
- C7 Referrers (`role=referrer`): no purchase control, no POST, no `/premium` or `payment=` link (unchanged; the pins stay).
- C8 States: catalog loading skeleton (`LoadingNote`), catalog error with "Try again", offline (the shared network copy), empty (C3). The summary read keeps working while the catalog fails, and the reverse.
- C9 `client/src/pages/Premium.tsx` (ruling 4.6): after the pending and referrer branches, when the catalog for the page's currency (`usePlansCatalog` with that region) shows any available pack, show "Credit packs replace single credits." with a link to `/plans#credits` instead of the quantity picker; while the catalog loads or fails, keep the legacy picker (the server is the gate). A 410 `single_credit_retired` from checkout shows the server's sentence and the same link, and never retries.
- C10 Copy with no amount (D-084 (6)): `/plans` drops every "$1 / ₹99 a credit" (the heading pill shows "Add credits" before sign-in; the Free card says "Add credits anytime"; the cost strip's price item is removed; the FAQ "What are credits for?" and "Is pricing local?" answer without a single-credit price, the second pointing at the catalog: "Yes. India sees India prices in rupees; everywhere else pays in US dollars."). Outside `/plans`, the same change in: `client/src/components/SeekerCreditsCard.tsx:128` ("Add credits"), `shared/landingContent.ts:53` and `:94`, `shared/publicRoutes.ts:39`, `client/src/pages/Premium.tsx:50` (title "Buy referral credits", descriptions without a per-credit price) and `client/src/pages/Pricing.tsx:22` ("Credit packs in rupees (India) or US dollars (everywhere else); see /plans for today's prices.").

**0.4 Tests to write first (replaces §7):** the server tests in 0.2; and, client, with a catalog fixture built by `planCatalogResponse(...)` whose amounts differ from the client constants: (1) `/plans` renders only catalog items, prices from the payload, "India price" for IN, "Recommended" only where marked, no "Most popular", no Pro/Max names, unavailable items without a button, the empty line when nothing is available; (2) pack Buy posts the exact body, stores the intent and redirects; an available plan term posts the exact kit plan body; 409, 503 and offline copy; one POST for a double press; (3) the coverage sentences for each ask state, the 5-company cap and the fallback; (4) `?payment=pending` with a stored intent credits through `credit-recovery`; (5) the referrer arm has no purchase control; (6) `/premium` shows the packs link when a pack is available, the legacy picker when the catalog fails, and the 410 sentence. Existing tests that encoded "`/plans` sells nothing" (`client/src/pages/plans.kit.test.tsx`, `plans.paymentRecovery.test.tsx`, `plans.paymentRoute.test.tsx`) and the `/premium` tests are changed on purpose: each gets a `QueryClientProvider` and a catalog stub; "no fetch" pins become "no POST and no checkout without a press"; "$1 a credit" pins move to the catalog's prices; the Pro/Max, referrer and no-dialog pins stay.

**0.5 Out of scope here (GO-LIVE-1b):** pass recovery, the pass return screen, "Ends <date>" for non-renewing passes, switching `PASS_SALES_ENABLED` on. Unchanged owner steps: plan §6.

## 1. Goal
D-046: every payment option goes live before referrers onboard. The server can already start a kit pack or pass checkout, but no client code offers one: nothing calls `/api/plans/catalog` or sends a kit checkout body. After this packet, `/plans` sells what the catalog says is available, at the server's price and in the seeker's currency:
- credit packs, passes (30 or 90 days), Keep warm yearly, and Concierge by application;
- the referrer coverage at the seeker's own companies is shown before payment;
- a pass is paid once, and never renews unless the seeker opted in. Opt-in comes in a later packet; this one sells non-renewing terms only.

## 2. Binding rules (quoted)
- D-046: "the D-036 credit packs (INR and USD), every 30/90-day pass (Start, Momentum, Land Focus, Land Sprint) and Keep warm yearly are sold from `/plans`; Land Concierge stays by application … human review and live sessions stay off until someone can deliver them … auto-extend is opt-in only within payment-method limits (D-005), with USD renewal off until PayPal reference transactions are confirmed; every purchase screen shows referrer coverage at the seeker's target companies before payment and the 7-day first-purchase refund applies (D-005); the ₹99/$1 single credit retires in each currency once its packs are buyable (D-036)."
- D-044: nothing is advertised that the code does not grant. D-007: INR is labelled "India price", with no GST wording. D-006/D-040: money never buys priority or visibility; at most 2 open asks per company on every plan. D-055: referrers never purchase.
- The payments bar: the server decides every amount; refuse before any provider call; credits land only from a verified webhook or recovery.

## 3. Current behaviour (verified at `681ea79`)
1. **Kit checkout exists on the server** (`server/kitCheckout.ts`):
   - `startKitPlanCheckout` and `startKitPackCheckout` serve `POST /api/chargebee/subscription-checkout` (body `{ planId, interval, currency, billingCountry, role }`, `shared/subscriptionManagement.ts` `kitPlanCheckoutRequestSchema`) and `POST /api/chargebee/checkout` (body `{ packId, billingCountry, role }`);
   - a missing item price answers `409 not_available_yet` with no hosted page;
   - Land Concierge answers `403 application_required`;
   - the webhook fulfils kit passes and packs.
2. **No renewal guard.** `createPlanCheckout` (`server/chargebeeSubscriptionApi.ts`, about line 44) sends only `subscription_items[item_price_id][0]` and `quantity` to `checkout_new_for_items`, with no `billing_cycles`. So a pass renews if its Chargebee item price renews by default. On Oct 18 the nine live USD pass prices exist and pass the availability check, which ignores `billing_cycles` (see the D-069 packet §6.2).
3. **The catalog endpoint.** `GET /api/plans/catalog` (`server/plansCatalogRoutes.ts`) answers the region's currency (INR from `CF-IPCountry: IN`, else USD) and per-item availability, cached 5 minutes. No client calls it.
4. **The refund page** (`client/src/pages/RefundPolicy.tsx`) says unused purchased credits can be refunded on request within 14 days. It states no pass refund and no "7-day first-purchase refund".
5. **The legacy single credit.** `/premium` still sells the per-credit item prices (`skipwait_token_1-INR`/`-USD`, BUGFREE 4.1–4.4).

## 4. Rulings (decided under D-074; the owner may change them)
1. **No renewal in this packet.** Passes and Keep warm are sold as non-renewing terms. `createPlanCheckout` sets `subscription_items[billing_cycles][0]` to `1` for every kit plan term. Auto-extend opt-in (D-005 limits; USD only once `USD_RECURRING_CONFIRMED`) is a later packet (`GO-LIVE-2`), after the first real purchases are proven.
2. **First pack.** Shown to everyone in its currency, with no first-purchase-only restriction: it is not cheaper per credit, so restricting it protects no revenue and only says no to a small top-up.
3. **Concierge.** "Apply" links to `/contact?topic=concierge`. There is no new backend; the checkout still refuses it with `403 application_required`.
4. **Refund line.**
   - Packs: quote the refund page's own sentence about unused purchased credits within 14 days, with a link to `/refunds`.
   - Passes: link to `/refunds` without stating terms.
   - The pass-refund wording (D-005's 7-day first-purchase refund) is legal text, so it is an **owner action before announcing** (plan §6). Agents never write it.
5. **Coverage before payment.** A block above the purchase sections, built from the seeker's own asks (pending, waiting or held), up to 5 companies, using the public company directory's availability boolean:
   - "A verified employee at <Company> can see asks now", or
   - "No verified employee at <Company> yet. Asks there wait for free for up to 90 days."
   - With no asks, the block reads "Credits are used when a verified employee can see your ask." plus a link to Explore.
   - Never show counts of people (no per-company referrer numbers).
6. **Legacy single credit (D-036).** When the catalog shows at least one pack available in a currency, `/premium` in that currency shows the packs (link to `/plans#credits`) instead of the single credit, and the legacy single-credit checkout for that currency answers `410` with `{ "error": "Single credits are replaced by credit packs. Nothing has been charged.", "code": "single_credit_retired" }`.
   - Keep the code behind a computed switch (D-042).
   - Pending single-credit checkouts still recover and credit.
   - BUGFREE 4.1–4.4 retire per currency in the same push.

## 5. Target behaviour (`/plans` after D-067)
1. **Data.** A React Query hook `usePlansCatalog()` (`client/src/components/plans/plansCatalogApi.ts`, new) reads `/api/plans/catalog` and parses it with the shared Zod contract. Every amount, label, term and availability shown comes from it, never from client constants.
2. **Order of sections:**
   - the current plan and balance (existing);
   - coverage (§4.5);
   - **Credit packs**: cards for the available packs in the currency, the first pack included, with "Most popular" only where the catalog marks `recommended`; an unavailable pack shows "Not on sale yet" and no button;
   - **Passes**: a "30 days / 90 days" toggle; Start, Momentum (marked Recommended), Land Focus and Land Sprint, each showing credits per month, open asks and carryover from the catalog; Keep warm yearly; Land Concierge with "Apply";
   - the fairness band ("What money can't buy", existing copy);
   - the FAQ.
3. **Copy.** INR shows "India price" (D-007). The D-063 money sentence appears once. Human review and live sessions read "coming later" (D-041), and nothing claims priority.
4. **Buying:**
   - the Buy button POSTs the kit body and then `location.assign(checkoutUrl)` (`client/src/lib/chargebeeCheckout.ts`), with the returned intent stored like today's pending checkouts;
   - on return with `?payment=pending`, the page shows the pending state and polls `/api/credits/summary` (packs) or the subscription summary (passes) using the existing recovery path;
   - `409 not_available_yet` shows "Not on sale yet. Nothing has been charged." and refreshes the catalog;
   - `503` shows "Payments are not available right now. Nothing has been charged.";
   - the button disables while sending, and a repeat press reuses the in-flight request.
5. **Referrers:** with `role=referrer` the page shows no purchase controls (D-055; D-067 built the switch).
6. **States:** loading skeletons, catalog error (retry), offline, empty (nothing available yet: "Packs and passes go on sale soon."). Check at 1280 and 390.

## 6. Files
- **In scope:**
  - `server/chargebeeSubscriptionApi.ts` (`createPlanCheckout`: `billing_cycles`);
  - the legacy single-credit refusal in `server/chargebeeRoutes.ts`, with its switch in `shared/planCatalog.ts`;
  - `client/src/pages/Plans.tsx`, `client/src/components/plans/*` (new cards, coverage block, catalog hook);
  - `client/src/pages/Premium.tsx` (§4.6);
  - tests;
  - docs.
- **Out of scope:**
  - auto-extend (GO-LIVE-2);
  - prices and plan contents (D-056);
  - the refund page (owner);
  - Chargebee configuration (owner);
  - employer checkout (D-040b).

## 7. Tests to write first
1. **Server.** `createPlanCheckout` sends `subscription_items[billing_cycles][0]=1`; the pack checkout form is unchanged. Pin both in `server/kitCheckout.test.ts` or `server/chargebeeSubscriptionApi.test.ts`.
2. **Server.** With an INR pack available, the legacy INR single-credit body answers 410 `single_credit_retired` with no provider call, while USD with no USD pack available still opens checkout. A pending single-credit recovery still credits.
3. **Client.** `/plans` renders only catalog items; an unavailable item has no button; prices, labels and "India price" come from the payload; there are no Pro/Max names (regression).
4. **Client.** Buy posts the exact kit body (planId, interval, currency, billingCountry, role `job_seeker`) and redirects; the 409, 503 and pending states render their copy.
5. **Client.** The coverage block shows each of the seeker's companies with the right sentence, and the fallback with no asks.
6. **Client.** `role=referrer` shows no purchase control.
7. **Controls:** `client/src/pages/plans.paymentRecovery.test.tsx`, `premium.paymentRecovery.test.tsx`, `server/kitCheckout.test.ts`, `server/chargebeeRoutes.test.ts`.

## 8. Definition of done
- [ ] Gate.
- [ ] Draft PR plus independent review.
- [ ] Screens at 1280 and 390 (INR and USD, available and unavailable, the pending state, referrer).
- [ ] Push; API and web CONVERGED.
- [ ] Owner steps before announcing (plan §6): the D-069 apply; pass-refund wording on `/refunds`; the one live ₹99 UPI pack buy-and-refund (D-065). The daily money check stays green the day after.
- [ ] Docs: BUGFREE 4.1–4.4 (retired per currency) plus new legs for kit pack and pass handoffs; runbook §7 (a pass that renewed by mistake: the owner cancels and refunds in the dashboard); the `AGENTS.md` living-map payments row; the `docs/DECISIONS.md` D-046 and D-036 sync cells; row 1.

## 9. Review checklist
1. Can any pass checkout reach Chargebee without `billing_cycles = 1`?
2. Is every amount on screen from the server catalog, and is every purchase refused before the provider when the item is unavailable or the role is referrer?
3. Does the page promise nothing the refund page or catalog does not say (D-044)?
4. Do pending checkouts from before the release still recover?

## 10. Stop and ask if
- Chargebee rejects `subscription_items[billing_cycles][0]` on `checkout_new_for_items` in the test environment (check apidocs.chargebee.com first).
- The catalog payload lacks a field the page needs.
- Any amount would have to be computed on the client.

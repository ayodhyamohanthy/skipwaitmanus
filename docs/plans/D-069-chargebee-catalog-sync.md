# Packet D-069: an admin-only Chargebee catalog sync (dry run first; the owner triggers apply; it only ever creates missing catalog objects)

> Read `docs/BRIEF.md` first, then this packet. Read `docs/PAYMENTS_TEST_RUNBOOK.md` §1 and §4 before you start.

| Field | Value |
|---|---|
| Queue row | §3b `D-069-chargebee-catalog-sync` |
| Decisions | D-069, D-004, D-036, D-046, D-042, D-031, D-056, D-007, D-067 |
| Risk tier | 1 (a live payment provider's catalog) |
| Size | M |
| Implementer | any model; independent review required |
| Branch | `origin/agent/claude/chargebee-catalog-sync` (one commit `53aeb5b`: 5 red-first test files). Rebase onto the latest `origin/main`; the modules those tests import are unchanged since `58338cd`, so the rebase is clean |
| Depends on | D-067 live (it rewrites the catalog files the sync reads, and removes Pro/Max) |
| Do not run at the same time as | D-067, GO-LIVE-1 |
| Verified against | `main` `e6b87f8`, branch `53aeb5b`; live public catalog read on 2026-10-18 |

## 1. Goal
Every sold catalog item price needs a live Chargebee item price with the exact catalog id; on Oct 18 the packs show `available: false`. Give the owner an admin page that:
- shows what is missing, wrong or blocked on the configured Chargebee site (dry run, read-only);
- creates only the missing family, items and item prices, in a safe order, when the owner types the site name and presses Apply.

It never updates, archives or deletes, and never touches subscriptions, customers, invoices or payments.

## 2. Binding rules (quoted)
- D-069: "Claude builds an admin-only catalog sync with a dry run (what would be created or changed) and an apply step the owner triggers after reading the dry run … The direct employer checkout stays on until Chargebee employer prices exist (D-042)."
- Runbook §4 rule 4: "Catalog item prices are created by the owner, or (once it is built) by the admin catalog sync's apply step that the owner triggers after reading its dry run (D-069)."
- Plan §4.1 step 4:
  - dry run reports exists / missing / mismatched for every catalog item price in INR and USD;
  - apply creates only what is missing and never updates, archives or deletes;
  - it never touches `skipwait_pro_*` or `skipwait_max_*`;
  - it is audit-logged;
  - the admin panel shows the environment and asks for a typed site-name confirmation.

## 3. Rulings (decided under D-074; the owner may change them)
1. **Rehearsal.** A test-site rehearsal (`skipwait-test`) is recommended, not required: the dry run is read-only and apply only creates. If the owner can run a local server with the test keys, dry-run and apply there first. Otherwise, dry-run on production, read it, then apply.
2. **The sync never edits an existing item price.** A mismatch is reported (`sellableNow` says whether it still sells) and fixed by the owner in the Chargebee dashboard.
3. **Pass renewal.** The nine live USD pass prices already pass the availability check, which ignores `billing_cycles`. The first dry run must be read for `billing_cycles` mismatches. GO-LIVE-1 also forces non-renewal at checkout (D-005: passes are paid once; auto-extend is opt-in), so a pass can never renew by accident whatever the item price says.
4. **The admin page** lives at `/admin/catalog-sync`. Register it in `client/src/App.tsx` and in `functions/_middleware.ts` `KNOWN_ROUTE_PATTERNS`; `scripts/seoRouteCoverage.test.ts` pins both. It shows:
   - the environment as a prominent badge reading LIVE or TEST, the site name and `checkedAt`;
   - the counts, then the lists: to create, mismatched (with "still sells" or "does not sell"), blocked (with reason), extras (left alone) and excluded (with reason);
   - an Apply button, enabled only when the typed text equals the site name exactly;
   - the report after apply, with each created id, any failure and what was not attempted, plus a "Run the dry run again" button.

   Copy is plain words, and the page carries no secret. Model it on `client/src/pages/AdminPaymentsReview.tsx` (admin gate, loading, error and empty states).

## 4. Interface spec derived from the 5 red-first tests

### 1.0 Seven modules, not four (key correction to the brief)
The tests import **seven** new modules. The brief names four; three more are required or the suites cannot load:

| Module (new) | Imported by | Exports the tests use |
|---|---|---|
| `shared/catalogSync.ts` | contract, plan, apply, routes tests | `catalogSyncDryRunSchema`, `catalogSyncApplyRequestSchema`, `catalogSyncApplyResponseSchema`, `catalogSyncErrorSchema`, types `CatalogSyncDryRun`, `CatalogSyncAction` (`server/catalogSyncContract.test.ts:2`, `server/catalogSyncPlan.test.ts:3`) |
| `server/catalogSyncDesired.ts` (**not in brief**) | plan, api tests | `desiredCatalog()`, `excludedItemPrices()` (`server/catalogSyncPlan.test.ts:6`, `server/chargebeeCatalogApi.test.ts:4`) |
| `server/catalogSyncPlan.ts` | plan, apply, routes tests | `planCatalogSync()`, type `CatalogSiteState` (`server/catalogSyncPlan.test.ts:7`) |
| `server/catalogSyncApply.ts` | apply test | `applyCatalogSync()`, `buildCatalogSyncDryRun()`, types `CatalogSyncActivity`, `CatalogSyncApplyDeps` (`server/catalogSyncApply.test.ts:4`) |
| `server/chargebeeCatalogApi.ts` | api test | `createChargebeeCatalogApi()`, `itemForm()`, `itemPriceForm()`, `CatalogListTooLongError` (`server/chargebeeCatalogApi.test.ts:3`) |
| `server/catalogSyncFixtures.ts` (**not in brief; test support the implementer must write**) | plan, apply, routes tests | `createFakeCatalogApi()`, type `FakeCatalogOptions`, `syncedSiteState()`, `providerItemFor()`, `providerItemPriceFor()` (`server/catalogSyncPlan.test.ts:8`, `server/catalogSyncApply.test.ts:5`, `server/adminCatalogSyncRoutes.test.ts:9`) |
| `server/adminCatalogSyncRoutes.ts` (**not in brief**) | routes test | `registerAdminCatalogSyncRoutes()`, type `AdminCatalogSyncDeps` (`server/adminCatalogSyncRoutes.test.ts:6`) |

Existing modules the tests also rely on, unchanged between 58338cd and e6b87f8 (`git diff --name-status 58338cd e6b87f8` on them is empty):
`shared/planCatalog.ts`, `shared/billingCatalog.ts` (`resolveItemPrice` :98, `packPrice` :77), `server/billingAvailability.ts`
(`itemPriceMatches` :71, `itemPriceAvailability` :82, `clearPriceAvailabilityCache` :136), `server/chargebeeApi.ts`
(`ChargebeeApiError(status, apiErrorCode, errorCode, providerMessage)` :30-35).

Tests run under vitest with esbuild transpile (no type check), but `pnpm check` is `tsc --noEmit` (`package.json:11`), so the
fixture and module types must also satisfy the tests' type usage (see 1.6 notes).

### 1.1 `shared/catalogSync.ts` (zod v4, `package.json:99` `"zod": "^4.1.12"`; use `z.strictObject` at every level)
Asserted by `server/catalogSyncContract.test.ts`:
- **Unknown keys rejected at every level**: top level, `family`, an `item_price` action's params, apply request, apply report (:49-56). Use `z.strictObject` (already the house style: `shared/billingCatalog.ts:194-237`).
- **planHash**: exactly 64 lowercase hex: `/^[0-9a-f]{64}$/`; rejects `"abc"`, 63 chars, uppercase, a `g` (:58-62). Same rule in the dry run and the apply request.
- **Apply request** `{ planHash, confirmSite }`: both required, `confirmSite` non-empty, no extra keys (`force: true` rejected) (:43, :54, :63-64).
- **Error body** `{ error: string, code: string, currentHash?: planHash }` (:46). Codes the routes emit: `invalid_request`, `site_mismatch`, `stale_plan`, `apply_in_progress`, `not_configured`, `provider_unreadable` (routes test :51, :57, :78, :84, :87, :98) plus `audit_unavailable` (apply test :136). The 403 body `{ error: "Administrator access is required" }` has no `code` and is outside this schema (routes test :38).
- **Dry run** (example at contract :9-27) top-level keys exactly:
  `version: 1`, `site: string`, `environment: "test"|"live"`, `checkedAt: ISO string`, `planHash`,
  `family: { id: string|null, action: "reuse"|"create"|"none"|"blocked", reason: string }` (null id + `none` from plan test :211; `blocked` :216),
  `toCreate: CatalogSyncAction[]`,
  `correct: { itemPriceId, currencyCode, price, term }[]`,
  `mismatched: { itemPriceId, currencyCode, price, term, diffs: Diff[], sellableNow: boolean }[]`,
  `blocked: { itemPriceId, currencyCode, price, term, reason }[]`,
  `extras: { kind, id, status, note }[]` (`kind` is `"item_price"` at :24 and `"item"` for items in plan test :162-167),
  `excluded: { itemPriceId, reason }[]`,
  `counts: { desired, correct, mismatched, blocked, toCreate, itemPricesToCreate, extras, excluded }`.
  `term` values: `"one_time"` (packs, :21-22), `"30d"` (:23); by extension `"90d"`, `"yearly"`.
  `Diff = { field, expected, actual }` with `expected`/`actual` `string | number | null` (plan test :131-136: numbers, `"USD"`, `"3 months"`, `"active"`, `"per_unit"`, `1`, `null`).
- **CatalogSyncAction** = discriminated union on `kind`:
  - `{ kind: "item_family", params: { id, name } }` (plan test :102)
  - `{ kind: "item", params: { id, name, type: "plan"|"charge", itemFamilyId: string|null, externalName, enabledInPortal: boolean|null } }` (contract :17; plan test :90, :212)
  - `{ kind: "item_price", params: ItemPriceSpec }`, `ItemPriceSpec = { id, name, itemId, itemType: "plan"|"charge", pricingModel: "flat_fee"|"per_unit", price: int, currencyCode, externalName, period: int|null, periodUnit: "month"|"year"|null, billingCycles: int|null }` (contract :6-7).
  Every action has `params.id` (plan test :20).
- **Cross-field rules on ItemPriceSpec** (contract :75-81): a `charge` with a period is rejected; a `plan` without period/periodUnit is rejected; a `charge` with `pricingModel: "flat_fee"` is rejected. So: charge => `per_unit`, period/periodUnit/billingCycles all null; plan => `flat_fee`, period and periodUnit non-null (billingCycles 1 in every desired plan spec, plan test :89).
- **Id rules** (contract :83-87): reject ids with a space, a slash, or longer than 100 chars, on item price `id`/`name`. Suggested: `z.string().min(1).max(100).regex(/^[A-Za-z0-9_.@-]+$/)` for item and item price ids; family id max 50 (see section 4 for the documented limits).
- **Apply report** (contract :29-38, :45): `{ outcome, site, environment, planHash, created: {kind,id,diffs}[], failed: {kind,id,httpStatus: int|null, apiErrorCode, errorCode: string|null, message} | null, notAttempted: {kind,id}[], stoppedReason }`.
  `outcome` enum: `applied | partial | failed | nothing_to_do` (`"ok"` rejected :68; `failed` used at apply test :95).
  `stoppedReason` enum or null: `provider_error | verification_mismatch | time_budget | audit_write_failed` (apply test :80, :103, :116, :144).
  Consistency refine needed to satisfy contract :67-73:
  `applied` => stoppedReason null, failed null, notAttempted empty (rejects :69);
  `nothing_to_do` => created/notAttempted empty, failed null, stoppedReason null (accepted :45);
  `partial` => stoppedReason non-null and created non-empty (rejects :72);
  `failed` => stoppedReason non-null and created empty (apply test :95);
  `failed` (the object) non-null **iff** stoppedReason is `provider_error` (rejects :70 and :71).
- **Do not add a "counts must equal array lengths" refine.** The example's counts are consistent with its arrays (contract :26), but the
  rejection tests at :53, :78-80 and :85 replace `toCreate` with one action while leaving `counts.toCreate: 3`; such a refine would make
  those tests pass for the wrong reason and hide a missing strict/period/id check. (`desired: 26` is deliberately not a sum.)

### 1.2 `server/catalogSyncDesired.ts`
- `desiredCatalog(): Array<{ spec: ItemPriceSpec; item: ItemSpec; price: CatalogPrice }>` where `ItemSpec = { id, name, type, externalName, enabledInPortal }` (no family; callers add `itemFamilyId`, api test :73-75) and `price` is the `shared/billingCatalog.ts` `CatalogPrice` (plan test :65-74).
  - Exactly 26 ids (plan test :32-41), derived from `CREDIT_PACKS`/`CATALOG_PLANS` (not hard-coded; the test rebuilds the list from `shared/planCatalog.ts`, :42-46).
  - `resolveItemPrice(spec.id)` must deep-equal `entry.price`, never legacy (:67-69); `spec.currencyCode === price.currency`, `spec.price === price.amount` (:70-71).
  - `itemPriceMatches(providerItemPriceFor(spec), price) === true` for every entry (:73).
  - Packs: `itemType "charge"`, `pricingModel "per_unit"`, period/periodUnit/billingCycles null, item `{ type: "charge", enabledInPortal: null }`, `externalName "<credits> credits"` (:82-86).
  - Plans: `itemType "plan"`, `pricingModel "flat_fee"`, 30d => `{period 1, periodUnit "month"}`, 90d => `{3, "month"}`, yearly => `{1, "year"}`, `billingCycles 1`, item `{ type: "plan", enabledInPortal: false }` (:88-90).
  - `spec.name === spec.id`, `item.name === item.id`, `spec.itemId === item.id` (:78-81).
  - External names: `"Keep warm, 1 year"`, `"Land Focus, 90 days"` (so `"<planDisplayName>, 30 days|90 days"`, `shared/planCatalog.ts:214-216`), item external name `"Start"` (= `planDisplayName`) (:92-94). Pack item external name `"25 credits"` (api test :83).
  - Item ids: `skipwait_pack_2|5|25|60|150`, `skipwait_keep_warm|start|momentum|land_focus|land_sprint` (:56) = `skipwait_${planId}` / `skipwait_${packId}`.
  - Never contains `land_concierge|written_review|live_session|skipwait_pro_|skipwait_max_|skipwait_token_` (:55).
- `excludedItemPrices(): Array<{ itemPriceId; reason }>`: exactly the 8 ids `skipwait_land_concierge_{30d,90d}-{INR,USD}`, `skipwait_live_session-{INR,USD}`, `skipwait_written_review-{INR,USD}`, each reason longer than 10 chars (:59-63). Build from `catalogItemPriceId`/`catalogSessionItemPriceId` (`shared/planCatalog.ts:233-245`).

### 1.3 `server/catalogSyncPlan.ts`
`planCatalogSync({ desired, excluded, state, site, environment, checkedAt: Date }): CatalogSyncDryRun` (pure; plan test :13-18). Every output must parse with `catalogSyncDryRunSchema` (:16).
`CatalogSiteState = { families: ProviderFamily[]; items: ProviderItem[]; itemPrices: ProviderItemPrice[] }` with snake_case provider fields
(`id, name, type, status, item_family_id, enabled_for_checkout` on items, `id, name, item_id, item_family_id, item_type, status, currency_code, price, pricing_model, period, period_unit, billing_cycles` on prices; tests also add `updated_at`, `resource_version`, so the element types must tolerate extra/optional fields) (:159-163, :176-181, :199, :228).
Asserted behaviour:
- **Empty site** (:99-117): `family {id:"skipwait", action:"create"}`; `toCreate[0] = { kind:"item_family", params:{ id:"skipwait", name:"SkipWait" } }`; then 10 items, then 26 prices; 37 actions. Item order = order their first price needs them: `skipwait_pack_2, _25, _60, _150, _5, skipwait_start, _momentum, _land_focus, _land_sprint, skipwait_keep_warm`. Every item's `itemFamilyId` = the family id. Price order: 8 packs (INR first: `pack_2-INR, pack_25-INR, pack_60-INR, pack_150-INR`, then USD), 8 x 30d, 2 x yearly, 8 x 90d ("the likeliest provider refusal last"). Counts `{ desired:26, correct:0, mismatched:0, blocked:0, toCreate:37, itemPricesToCreate:26, extras:0, excluded:8 }` (excluded is the static list, always 8).
- **Synced site** (:119-127): `toCreate []`, all 26 `correct`, `family {id:"skipwait_credits", action:"reuse"}`. A Keep warm price stored as `period 12, period_unit "month"` is correct (mirrors `server/billingAvailability.ts:63-68`).
- **Mismatch never queues** (:129-147). One diff each, exact `{field, expected, actual}` and `sellableNow`:
  price `119900 vs 119000` false; `currency_code "USD" vs "EUR"` false; `period "3 months" vs "1 month"` false (period and unit fold into one human-readable `period` field); `status "active" vs "archived"` false; `pricing_model "per_unit" vs "flat_fee"` **true**; `billing_cycles 1 vs null` **true** (absent provider value reads as `null`).
  `sellableNow` = `itemPriceMatches(providerPrice, entry.price)` (`server/billingAvailability.ts:71-77` ignores pricing_model and billing_cycles).
- **Deleted == missing** (:149-155): a `status:"deleted"` desired price is planned as a create of exactly `specFor(id).spec`; the planHash equals the hash for the same site with the price absent.
- **Extras** (:157-173): any `skipwait_`-namespace item or item price that is not desired is listed `{kind,id,status,note}` and left alone; notes: legacy token and `skipwait_pro*` => /legacy/i, Concierge => /application/i, written review/live session => /session/i, every note /left alone/i. Pro/Max ids come from `shared/subscriptionPlans.ts` (see section 3).
- **Blocked** (:175-196), reason regexes: item exists with the other type => /exists as a plan/ (both pack_25 prices); archived item => /archived/ (all 4 start prices); item `enabled_for_checkout: false` => /[Cc]heckout is switched off/ (all 4 momentum prices); another active price on the same item already holds the same currency and billing frequency => reason names that price id (`skipwait_land_focus_monthly-INR` blocks only `land_focus_30d-INR`). 11 blocked, blocked items are not created, the other 15 prices still plan.
- **Family choice** (:198-220): reuse the single family that existing `skipwait_` items/prices use (`skipwait_credits` even when another family exists); no SkipWait objects and no `skipwait` family => create `skipwait`; `skipwait` family exists => reuse; SkipWait objects exist but none has `item_family_id` and no families => `{ id:null, action:"none" }` and items get `itemFamilyId:null`; two different families in use => `action:"blocked"`, reason names `legacy_family`, no family/item actions, all 26 prices blocked.
- **planHash** (:222-235): sha256 hex of the canonical *classification* (not raw provider state): stable under list order, `updated_at`/`resource_version`, and `checkedAt`; changes when a mismatch value changes, a price disappears, the site or the environment changes. Hash the dry run minus `checkedAt` (and minus `planHash`) with arrays in deterministic order (desired order; sort extras by kind+id). Use `node:crypto` `createHash("sha256")`.

### 1.4 `server/chargebeeCatalogApi.ts`
`createChargebeeCatalogApi(credentials: { site, apiKey }): CatalogApi` with **exactly** six keys `createItem, createItemFamily, createItemPrice, listItemFamilies, listItemPrices, listItems` (api test :113).
- `listItemPrices({ idPrefix } | { itemIds })`, `listItems({ idPrefix })`, `listItemFamilies()` (:42, :49, :51, :58, :103).
  Query: `limit=100` plus `id[starts_with]=<prefix>` or `item_id[in]=["a","b"]` (JSON-array literal); follows `next_offset` as `offset=` (:45-53). Returns the inner objects (`list[].item_price` / `.item` / `.item_family`), parsed by zod with unknown fields stripped (`ignored_field` dropped, :44; `listItems` result deep-equals the 4 given fields, :52) and only `id` required (bodies at :65-67, :97-100 return minimal objects).
  Page cap: 10 pages; an 11th `next_offset` throws `CatalogListTooLongError` after exactly 10 requests, never a partial list (:56-60).
- Auth header `Basic base64("<apiKey>:")` (:47). URLs only `https://<site>.chargebee.com/api/v2/(item_families|items|item_prices)` with an optional query; never subscriptions/customers/invoices/transactions/hosted_pages/payment_sources/credit_notes/portal/refund, `/delete`, `/archive` (:94-112). All creates POST a `URLSearchParams` body (:13, :88).
- `fetch` is stubbed with `vi.stubGlobal` (:18), so call the global `fetch` at request time: reuse `chargebeeRequest` (`server/chargebeeApi.ts:50-72`), which does exactly that and already builds the base URL (:54), the auth header (:57), the form content type (:58) and a 15 s abort (:61).
- **Exact form fields** (:62-92; `Object.fromEntries` comparison, order irrelevant, never `is_taxable`):
  family `{ id, name }`;
  plan item `{ id, name, type:"plan", item_family_id, external_name, enabled_in_portal:"false" }`;
  charge item `{ id, name, type:"charge", item_family_id, external_name }` (no `enabled_in_portal` when null; no `item_family_id` when null, :84);
  plan price `{ id, name, item_id, pricing_model:"flat_fee", price:"1900", currency_code:"USD", external_name, period:"3", period_unit:"month", billing_cycles:"1" }`;
  charge price `{ id, name, item_id, pricing_model:"per_unit", price:"119900", currency_code:"INR", external_name }`.
  `itemPriceForm(spec)` and `itemForm({...item, itemFamilyId})` return the same `URLSearchParams` the client sends (:90-91).
- Provider refusal => `ChargebeeApiError { status, apiErrorCode, errorCode, providerMessage }` with newline turned into a space (:116-121); the existing `clean()` (`server/chargebeeApi.ts:26-28, :67`) already yields `"... not configured "`.
- `createItemPrice` resolves to the parsed provider item price (`toMatchObject({ id, price: 1900, currency_code: "USD" })`, :78).

### 1.5 `server/catalogSyncApply.ts`
- `buildCatalogSyncDryRun({ api, site: { site, environment }, now?: () => Date|number }): Promise<CatalogSyncDryRun>` lists families, items and prices and calls `planCatalogSync` with `desiredCatalog()`/`excludedItemPrices()` (apply test :16). It must not record audit rows (the stale-refusal test expects exactly one activity row, :37).
- `applyCatalogSync({ planHash, confirmSite }, deps: CatalogSyncApplyDeps): Promise<Result>`.
  `CatalogSyncApplyDeps = { api; site: { site, environment }; actorUserId: number; record(entry: CatalogSyncActivity): Promise<void>; reportError(error, context?): void; now?: () => number }` (:15, :111).
  `Result = { status:"done", report: CatalogSyncApplyResponse } | { status:"refused", code, message, currentHash? }`.
- Order of checks (from the assertions):
  1. `confirmSite !== deps.site.site` => `{status:"refused", code:"site_mismatch"}` with **zero** provider calls (:40-45).
  2. Build a fresh dry run; a list failure => `{status:"refused", code:"provider_unreadable"}`, nothing created (:150-154).
  3. `fresh.planHash !== request.planHash` => exactly `{ status:"refused", code:"stale_plan", currentHash, message:/changed/ }` (toEqual, no other keys) and one row `billing.catalog_sync.apply_refused`, outcome `denied`, metadata `{ reason:"stale_plan", planHash:<requested>, currentHash, site, environment }` (:29-38).
  4. Empty `toCreate` => `done` with `outcome:"nothing_to_do"` and **no** `apply_started` row (:63-66).
  5. Record `billing.catalog_sync.apply_started`; if that write throws => `{status:"refused", code:"audit_unavailable"}`, no creates (:134-137).
  6. Execute `toCreate` strictly in order (:55-57), one call at a time.
- Per action: before each create, stop with `time_budget` when fewer than 15 s of a 60 s budget remain (clock at 0/10/20/30/40 s => 5 creates; at 50 s it stops, :109-119). 15 s equals the per-call abort in `chargebeeRequest` (`server/chargebeeApi.ts:61`), so a started create always ends inside the budget.
- Success => compare the provider's answer with the spec using the planner's diff function; a difference stops the run with `verification_mismatch`, `failed:null`, and the last `created` entry carries the diffs (`[{field:"price", expected:2200, actual:2100}]`) (:98-107).
- `ChargebeeApiError` => stop with `provider_error`; `failed = { kind, id, httpStatus: error.status, apiErrorCode, errorCode, message: error.providerMessage }`; remaining actions go to `notAttempted` as `{kind,id}`; one `billing.catalog_sync.create_failed` row (`failure`, `resourceType:"chargebee_item_price"` for prices, metadata incl. `httpStatus`, `apiErrorCode`); `reportError` exactly once (:69-89).
- Any other error (e.g. `DOMException` `TimeoutError` from `AbortSignal.timeout`) => `failed = { kind, id, httpStatus:null, apiErrorCode:"no_answer", errorCode:null, message: /check again/i }` (do not claim the object is missing) (:91-96). On the first action of an empty site this is the family `skipwait` and outcome is `failed`.
- Audit rows for a normal run are exactly `[apply_started, created x N, apply_finished]` (:125); every row has `actorUserId` and metadata `{ site, environment, planHash }` (:126-129); a price row has `outcome:"success"`, `resourceType:"chargebee_item_price"`, metadata `{ currency, amount, pricingModel }` (:130-131); no `apiKey`/`secret` text anywhere (:132). `apply_finished` outcome `failure` and metadata `{ outcome, stoppedReason }` when stopped (:87).
- A failed `created` row write stops the run as `audit_write_failed` after that create (3rd write fails => 3 created, :139-147) and calls `reportError`.
- `CatalogSyncActivity = { actorUserId: number; action: string; outcome: "success"|"failure"|"denied"; resourceType?: string; resourceId?: string; metadata: Record<string, string|number|boolean|null> }` — keep metadata flat so it is assignable to `OperationalActivityInput` (`server/db.ts:1359`); serialise diffs as a short string if logged.

### 1.6 `server/catalogSyncFixtures.ts` (test support, but a production-path file name; keep it free of secrets and network)
- `syncedSiteState(): CatalogSiteState` = family `skipwait_credits` (name per contract `"SkipWait Credits"`-style), the 10 items via `providerItemFor(item, "skipwait_credits")`, the 26 prices via `providerItemPriceFor(spec)` (plan test :123, :176).
- `providerItemFor(item: ItemSpec, familyId: string, patch?: Partial<ProviderItem>)` => `{ id, name, type, status:"active", item_family_id, enabled_for_checkout:true?, ...patch }` (:177-180).
- `providerItemPriceFor(spec)` => `{ id, name, item_id, item_type, status:"active", currency_code, price, pricing_model, period?, period_unit?, billing_cycles? }` matching `itemPriceMatches` (:73, :124, :139).
- `createFakeCatalogApi(seed?: CatalogSiteState, options?: FakeCatalogOptions)` => `{ api: CatalogApi; state: CatalogSiteState /* mutable, tests push into state.itemPrices (apply :32) */; calls: Array<{ method: string; id?: string }> /* every list and create attempt, in order */; creates(): string[] /* ids of creates that succeeded */ }` (apply :36, :44, :84-85; routes :41, :95).
- `FakeCatalogOptions = { failCreate?(call: { id: string; index: number }): Error|undefined; answerItemPrice?(created): created; beforeCreate?(): void|Promise<void> /* awaited, routes test passes a gate promise :92 */; failLists?: Error }` (apply :74, :92, :99, :111, :151; routes :54, :92).
- Fake semantics needed for the assertions: creates write into `state` so a re-run dry run is all-correct (apply :59-61); a create rejected by `failCreate` is in `calls` but not in `creates()` (:84-85); an `answerItemPrice` answer is stored and counted in `creates()` (:105); `index` counts create calls from 0 (:92); list calls honour `idPrefix`/`itemIds` and do not advance the clock.

### 1.7 `server/adminCatalogSyncRoutes.ts`
`registerAdminCatalogSyncRoutes(app, deps: AdminCatalogSyncDeps)`,
`AdminCatalogSyncDeps = { resolveIdentity(req): Promise<{account:{id:number; role?:string}}|undefined>; recordActivity(entry: CatalogSyncActivity): Promise<void>; site?: () => ChargebeeSite; api?: (site: ChargebeeSite) => CatalogApi; reportError(error, context?): void }` (routes test :22, :149).
- `GET /api/admin/billing/catalog-sync`, `POST /api/admin/billing/catalog-sync/apply`.
- Signed out or non-admin => 403 `{ error:"Administrator access is required" }` on both, zero provider calls (:33-43). Same check as `server/adminBillingCatalog.ts:106-107`.
- `site` dep absent => fall back to `currentChargebeeSite()` (`server/chargebeeApi.ts:13-16`); not configured => 503 `{ error:"Chargebee is not configured", code:"not_configured" }` before any `api` call (:45-52; the test spreads `site: undefined` over the default, so treat `undefined` as "use the process site"; detect with `isChargebeeNotConfiguredError`, `server/chargebeeApi.ts:37-39`).
- `api` dep absent => `createChargebeeCatalogApi({ site, apiKey })` on the real `fetch` (:149, :155).
- Provider unreadable => 502 `{ error:"Chargebee could not be read. Nothing was changed.", code:"provider_unreadable" }`, `reportError` exactly once (:54-59).
- 200 dry run and 200 report both with header `Cache-Control: no-store` exactly (not the `private, no-store` used in `server/employerRoutes.ts:100`) (:66, :115).
- POST: non-JSON content type => 415 (checked before parsing; with Express 4 body-parser a form body leaves `req.body` as `{}` so a schema error would otherwise be 400) (:80-81); schema failure => 400 `code:"invalid_request"` (:75-79); wrong `confirmSite` => 400 `code:"site_mismatch"` (:82-84); stale => 409 exactly `{ error:/changed/, code:"stale_plan", currentHash }` (:85-87); a second apply while one runs => 409 `code:"apply_in_progress"` (in-process lock, released in `finally`) (:90-100).
- After an apply (any outcome that wrote), call `clearPriceAvailabilityCache()` so `/api/plans/catalog` re-probes (:103-123: a cached `missing` must re-probe; `lookup` called twice).
- `recordActivity` receives `actorUserId` = the admin's `account.id` (`1`) (:119).
- End-to-end with the real client: every URL `https://skipwait.chargebee.com/api/v2/(item_families|items|item_prices)` and POSTs only to the bare collection paths; more than 37 requests (lists for the GET, lists again inside apply, 37 creates) (:126-157). The fetch stub there echoes the form fields back as strings (e.g. `enabled_in_portal:"false"`, `item_family_id`), converts only `price`, `period`, `billing_cycles` to numbers and sets `item_type` from the stored item (:136-141), so response schemas must not require booleans and the post-create verification must not compare `enabled_in_portal`.

## 5. Existing Chargebee integration patterns to reuse

### 2.1 Transport: `server/chargebeeApi.ts` (reuse as is; do not copy `server/chargebee.ts`)
- Base URL `https://${site}.chargebee.com/api/v2${path}${?query}` (`server/chargebeeApi.ts:52-54`).
- Auth `Authorization: Basic base64("<apiKey>:")` (`server/chargebeeApi.ts:57`); form bodies are `URLSearchParams` with `application/x-www-form-urlencoded` (`:58-60`).
- Timeout: `AbortSignal.timeout(request.timeoutMs ?? 15_000)` (`:61`). Existing per-call budgets: item price retrieve 8 s (`server/chargebeeSubscriptionApi.ts:140`), hosted pages 25 s (`server/chargebeeSubscriptionApi.ts:39`), admin catalog check 10 s per price, sequential (`server/adminBillingCatalog.ts:74`). The availability probe has its own 15 s backstop (`server/billingAvailability.ts:40, :103-106`).
- Error mapping: non-2xx => `ChargebeeApiError(status, api_error_code ?? type ?? "unknown", error_code ?? null, message)` with `clean()` (CR/LF/TAB to space, non-printable ASCII dropped, 80/240 char caps) (`:26-35`, `:63-68`); a 2xx that fails the zod schema => `ChargebeeApiError(502, "invalid_response", null, "Chargebee returned an unexpected response")` (`:69-70`); missing credentials => plain `Error("Chargebee API key/site is not configured")` (`:51`), recognised by `isChargebeeNotConfiguredError` (`:37-39`). Network errors and `TimeoutError` are **not** wrapped (they reject from `fetch`), which is what the apply test's `no_answer` path expects (`server/catalogSyncApply.test.ts:91-96`).
- `idPath()` encodes ids for path segments (`:75-77`); the sync never needs it (creates POST to collection paths, lists use query filters).
- `currentChargebeeSite()` = `{ site, apiKey, environment }` from `resolveChargebeeRuntime(undefined)` + `resolveBillingEnvironment()` (`:13-16`). It currently has **no production caller**; it is the natural default for the routes' `site` dep.
- Do **not** copy the legacy helpers in `server/chargebee.ts`: they read `process.env.CHARGEBEE_SITE ?? "skipwait-test"` directly and ignore `BILLING_ENV` (`server/chargebee.ts:223-224, 249-250, 271-272, 368-369, 399-400, 419-420`).

### 2.2 Environment: `server/chargebeeEnvironment.ts`
- `BILLING_ENV` must be `test` or `live`; unset throws, except in unit tests where `NODE_ENV=test` defaults to `test` (`server/chargebeeEnvironment.ts:9-16`).
- `resolveChargebeeRuntime(_host)` ignores the host: live => `CHARGEBEE_LIVE_SITE` + `CHARGEBEE_LIVE_API_KEY`, test => `CHARGEBEE_SITE` + `CHARGEBEE_API_KEY`; missing => throws "... API key/site is not configured" (`:28-46`).
- Startup refuses to boot with an incomplete set: `validateBillingEnvironment()` (`:18-26`) is called first in `startServer()` (`server/_core/index.ts:109-110`).
- Keys are declared in `.env.example:84-87` (`BILLING_ENV=test`) and `:117-122` (test site); live keys follow at `:124+` (that comment still says "used ONLY when CHARGEBEE_LIVE_ENABLED=true", which no code reads any more: `CHARGEBEE_LIVE_ENABLED`/`CHARGEBEE_LIVE_DOMAIN` appear only in research/docs and the worker list). The Worker forwards `BILLING_ENV` and every `CHARGEBEE_*` key to the container (`src/worker.ts:7-10`).
- **New env key needed: none.** The site the owner must type is `runtime.site` (`CHARGEBEE_SITE` or `CHARGEBEE_LIVE_SITE`), the environment is `BILLING_ENV`, the key is the existing server key. Nothing goes into `VITE_*` (BRIEF rule, `docs/BRIEF.md:25`). One UNVERIFIED precondition: the configured API key must be a full-access (read-write) key on that site; a read-only key gets an authorization error on create, which the apply reports as `provider_error` without side effects.
- Which site production uses: the runbook says production checkout talks to the LIVE `skipwait` site and the test site is `skipwait-test` (`docs/PAYMENTS_TEST_RUNBOOK.md:9-14`); the actual `BILLING_ENV` value in production is UNVERIFIED from here (the dry run response shows it).

### 2.3 Admin diagnostics to mirror: `server/adminBillingCatalog.ts`
- Route `GET /api/admin/billing/catalog`, admin gate `identity.account.role !== "admin"` => 403 `{ error:"Administrator access is required" }` (`server/adminBillingCatalog.ts:104-107`), 503 `{ error:"Chargebee is not configured" }` when the runtime cannot be resolved (`:108-115`), 502 `{ error:"Catalog check failed" }` on any throw (`:123-125`), registered in `server/_core/index.ts:261` with `{ resolveIdentity }`.
- It checks only the legacy token packs and Pro/Max (`:54-66`), not the kit catalog; D-067's inventory removes the Pro/Max probes (`docs/plans/D-067-pro-max-removal.md:26`). The sync is the kit-catalog successor; leave this diagnostic alone.
- It encodes the per_unit rule for quantity checkouts (`:17-21`, `:87-89`). Kit pack checkout sends quantity 1 (`server/chargebeeSubscriptionApi.ts:56-59`), so per_unit is not required for kit packs to sell (and `itemPriceMatches` ignores `pricing_model`), but per_unit is still the correct and safest model for a charge sold by quantity, which is why a flat_fee pack is a *mismatch with sellableNow:true* (plan test :135).

### 2.4 Availability: `server/billingAvailability.ts`
- `itemPriceMatches` (`:71-77`): id equal, `status === "active"`, currency and amount equal; pack/session => `item_type` absent or `"charge"`; plan => `item_type` absent or `"plan"` and period match: 30d = 1 month, 90d = 3 months, yearly = 1 year or 12 months (`:53-68`). It does **not** check `pricing_model` or `billing_cycles`.
- Cache per `site:itemPriceId`: available 5 min, missing 60 s, error 30 s (`:26-28`, `:88-90`, `:108`); `clearPriceAvailabilityCache()` (`:136-139`) is what the apply route must call.
- The public `/api/plans/catalog` response itself is `Cache-Control: public, max-age=300` (`server/plansCatalogRoutes.ts:85`; confirmed on the live response, section 3.3), so a browser or shared cache can show the old `available:false` for up to 5 minutes after an apply even though the server re-probes.
- The catalog answers 503 only when every probe is `unknown` (`server/plansCatalogRoutes.ts:55-58`).

### 2.5 Audit and error reporting
- Audit table `operationalActivityLogs` (`drizzle/schema.ts:1047-1057`): `actorUserId`, `action` varchar(100), `outcome` enum success/failure/denied, `resourceType` varchar(80), `resourceId` varchar(120), `metadata` text.
- Writer `recordOperationalActivity(input: OperationalActivityInput)` (`server/db.ts:1359-1364`), metadata is a flat `Record<string, string|number|boolean|null|undefined>`. It is injected into route modules as `recordActivity: db.recordOperationalActivity` (e.g. `server/_core/index.ts:239, 242-246, 265`).
- **Gap: it silently returns when there is no database (`server/db.ts:1361` `if (!db) return;`).** The apply's "no start row means no writes" rule (apply test :134-137) only holds if the injected recorder throws when nothing was written. Wire a strict recorder for this route, e.g. at registration: `recordActivity: async entry => { if (!(await db.getDb())) throw new Error("Database unavailable"); await db.recordOperationalActivity(entry); }` (`getDb` is exported, `server/db.ts:73`), so `server/db.ts` (a hot file) need not change.
- Admin money actions already write audit rows such as `payment.review_${decision}` with `actorUserId: adminUserId` (`server/db.ts:3840`); the activity viewer reads by action substring (`server/db.ts:1375-1377`), so the `billing.catalog_sync.*` prefix is searchable in the existing admin activity page (`client/src/pages/AdminActivity.tsx`).
- Error reporting: `captureServerError(error, context?)` (`server/sentry.ts:52-55`) is the `reportError` to inject (used the same way at `server/privateReferralRoutes.ts:1484`). Never put the API key, form bodies or provider URLs with keys into the context.

## 6. The catalog item prices the sync covers

### 3.1 Desired: 26 item prices on 10 items (amounts in minor units; `shared/planCatalog.ts:75-80, :99-106, :132-138`)
Id rules: `catalogItemPriceId(plan, interval, currency) = skipwait_${plan}_${interval}-${currency}` (`shared/planCatalog.ts:233-235`), `catalogPackItemPriceId(pack, currency) = skipwait_${pack}-${currency}` (`:238-240`).

| Item (type) | Item price id | Currency | Price | Chargebee shape (from tests) |
|---|---|---|---|---|
| `skipwait_pack_2` (charge) | `skipwait_pack_2-INR` | INR | 9900 (Rs 99, 2 credits) | per_unit, no period |
| `skipwait_pack_5` (charge) | `skipwait_pack_5-USD` | USD | 500 ($5, 5 credits) | per_unit |
| `skipwait_pack_25` (charge) | `skipwait_pack_25-INR` / `-USD` | INR / USD | 119900 / 2200 | per_unit |
| `skipwait_pack_60` (charge) | `skipwait_pack_60-INR` / `-USD` | INR / USD | 259900 / 4800 | per_unit |
| `skipwait_pack_150` (charge) | `skipwait_pack_150-INR` / `-USD` | INR / USD | 599900 / 10500 | per_unit |
| `skipwait_start` (plan) | `skipwait_start_30d-INR` / `-USD`; `skipwait_start_90d-INR` / `-USD` | | 29900 / 800; 69900 / 1900 | flat_fee; 30d = period 1 month, 90d = period 3 months; billing_cycles 1 |
| `skipwait_momentum` (plan) | `_30d-INR`/`-USD`; `_90d-INR`/`-USD` | | 99900 / 2400; 249900 / 5900 | same |
| `skipwait_land_focus` (plan) | `_30d-INR`/`-USD`; `_90d-INR`/`-USD` | | 599900 / 10000; 1399900 / 24900 | same |
| `skipwait_land_sprint` (plan) | `_30d-INR`/`-USD`; `_90d-INR`/`-USD` | | 1199900 / 20000; 2799900 / 49900 | same |
| `skipwait_keep_warm` (plan) | `skipwait_keep_warm_yearly-INR` / `-USD` | INR / USD | 99900 / 2900 | flat_fee, period 1 year, billing_cycles 1 |

Totals: 8 pack prices (5 pack items; `pack_2` INR only and `pack_5` USD only, `shared/planCatalog.ts:133-134`), 16 pass prices, 2 Keep warm prices = 26 (plan test :32-36). `sellableItemPrices()` lists 34 = these 26 + 8 excluded (`shared/billingCatalog.ts:112-115`).
Excluded (never created; listed with a reason): Land Concierge 30d/90d INR/USD (`byApplication`, `shared/planCatalog.ts:105`; 3499900/75000, 8499900/199000), written review INR/USD (79900/4900) and live session INR/USD (149900/9900) (`shared/planCatalog.ts:151-154`; sessions only sell when staffed, `shared/billingCatalog.ts:303-305`).
Out of namespace scope but present on the live site per code: legacy `skipwait_token_1-INR/USD` (`server/chargebee.ts:8-11`, retire per D-036) and Pro/Max `skipwait_pro_monthly-INR/USD`, `skipwait_max_monthly-INR/USD` (`shared/subscriptionPlans.ts:12-21`). D-067 deletes `SUBSCRIPTION_PLANS` from code (`docs/plans/D-067-pro-max-removal.md:12`), so the planner must recognise these by **id prefix** (`skipwait_pro`, `skipwait_max`, `skipwait_token_`), not by importing `shared/subscriptionPlans.ts`.

### 3.2 What the live public catalog reports now (unauthenticated GET, 2026-10-18 15:30:46 UTC)
`GET https://skipwait.me/api/plans/catalog` => 200, `cache-control: public, max-age=300`, `server-timing: app;dur=1953`, served via Cloudflare SEA, so region `INTL`, currency `USD` (the Worker sets the region from the edge country, `server/plansCatalogRoutes.ts:12-15`; INR cannot be requested from here).

| USD term / pack | Amount | `available` |
|---|---|---|
| Keep warm yearly | 2900 | **true** |
| Start 30d / 90d | 800 / 1900 | **true / true** |
| Momentum 30d / 90d | 2400 / 5900 | **true / true** |
| Land Focus 30d / 90d | 10000 / 24900 | **true / true** |
| Land Sprint 30d / 90d | 20000 / 49900 | **true / true** |
| Land Concierge 30d / 90d | 75000 / 199000 | false (by application, always false, `shared/billingCatalog.ts:276`) |
| pack_5 / pack_25 / pack_60 / pack_150 | 500 / 2200 / 4800 / 10500 | **false / false / false / false** |
| written_review / live_session | 4900 / 9900 | false (not staffed) |

Reading (facts vs inference):
- On the site production is wired to, the 9 USD plan item prices pass `itemPriceMatches` (active, USD, exact amount, plan type, 1 month / 3 months / 1 year). That proves the 3-month billing frequency is usable on that site (at least in USD). It does **not** prove `billing_cycles = 1` or `flat_fee`, which `itemPriceMatches` ignores (`server/billingAvailability.ts:71-77`); server checkout sends no `billing_cycles` override (`createPlanCheckout`, `server/chargebeeSubscriptionApi.ts:44-53`; no `billing_cycles` anywhere in non-test server code), so whether a pass auto-renews depends on the item price default. **The first dry run must be read for `billing_cycles` mismatches on these 9 prices**: the sync reports them (`sellableNow:true`) but never edits them; fixing them is an owner action in the Chargebee UI.
- All 4 USD pack prices read as not sellable (missing, or present but not matching); the dry run tells which.
- INR: UNVERIFIED from here. Register evidence: "Live catalog Oct 16: every D-005 INR pack is `available:false`" (`docs/DECISIONS.md:52`, D-036) and "on Oct 18 every pack shows `available: false`" (`docs/DECISIONS.md:85`, D-069).
- Which Chargebee site that is (live `skipwait` vs `skipwait-test`) is UNVERIFIED; the runbook says production uses the live `skipwait` site (`docs/PAYMENTS_TEST_RUNBOOK.md:11-14`).
- Historical live-site state (research doc, Aug 2026, not re-verifiable here): multi-currency on with INR base and USD added (`research/chargebee-gateway-routing-audit.md:62`); catalog transferred from the test site: family "skipwait Credits" (test-site id `skipwait_credits`, `:71`), plans `skipwait_pro`/`skipwait_max`, charge `skipwait_token_1`, plus "5-token and 10-token charges" (`:85`, ids not recorded; they will show as extras if they use the `skipwait_` prefix); the production key is a live "Write Key" that "permits create/read/update operations but explicitly cannot delete business data" (`:91`). That matches the tests' fixture family `skipwait_credits` (`server/catalogSyncPlan.test.ts:123`) and plan §4.1 step 4 "reuse the Pro item's family" (`docs/KIT_V4_BUILD_PLAN.md:213`).

## 7. Steps (one commit each)
1. Rebase the branch onto the latest `origin/main`. Run the 5 test files: they fail with "cannot find module", which is expected.
2. `shared/catalogSync.ts` (the contract test goes green).
3. `server/catalogSyncDesired.ts` and `server/catalogSyncFixtures.ts` (test support, no network, no secrets).
4. `server/catalogSyncPlan.ts` (the plan test goes green).
5. `server/chargebeeCatalogApi.ts` (the API test goes green), reusing `chargebeeRequest`.
6. `server/catalogSyncApply.ts` (the apply test goes green).
7. `server/adminCatalogSyncRoutes.ts`, plus registration in `server/_core/index.ts` with the strict recorder (§5.5: throw when no database), `captureServerError` as `reportError`, and `clearPriceAvailabilityCache()` after an apply (the routes test goes green).
8. The admin page (§3.4), with its tests (gate, states, typed confirmation, report).
9. Docs:
   - plan §6 owner steps (§8);
   - runbook §4: name the page;
   - the `AGENTS.md` living-map payments row (the new admin route);
   - the `docs/DECISIONS.md` D-069 sync cell;
   - this row.

## 8. Owner steps (plan §6)
1. Make sure the server's Chargebee API key on the site you will sync is a read-write key; a read-only key fails the apply with a provider error and changes nothing.
2. Open `/admin/catalog-sync`, read the dry run (environment, site, every list), and decide.
3. Type the site name and press Apply; read the report; run the dry run again until it shows nothing to create.
4. Fix any reported mismatch in the Chargebee dashboard: `billing_cycles` on the pass prices first (rule 3.3).
5. Then GO-LIVE-1, and the one live ₹99 UPI buy-and-refund (D-065).

## 9. Definition of done
- [ ] The 5 red-first files pass unchanged (never edit their assertions); the page tests pass.
- [ ] Gate, draft PR and independent review.
- [ ] Push; API and web CONVERGED.
- [ ] Live: `GET /api/admin/billing/catalog-sync` signed out answers 403; signed in as admin it answers 200 with `environment` and `site`.
- [ ] Nothing applied by the agent; the owner applies.
- [ ] Row done.

## 10. Review checklist (packet-specific)
1. Can any code path call a Chargebee URL other than `item_families`, `items` or `item_prices`, or use a method other than GET-list and POST-create? (The API test pins this; check that no other module was added.)
2. Is apply refused with zero provider calls when `confirmSite` is wrong, and with zero creates when the plan hash is stale or the start audit row cannot be written?
3. Does a failure mid-apply stop at once, report the failing call honestly, and leave the rest `notAttempted`?
4. Are the Pro/Max, token and excluded ids only ever reported, never created?
5. Is no API key, form body or secret in logs, Sentry or audit metadata?

## 11. Stop and ask if
- Chargebee's API documentation contradicts a form field the tests expect (verify at apidocs.chargebee.com).
- A test seems to need editing.
- The site has two families in use (the dry run blocks; the owner decides).

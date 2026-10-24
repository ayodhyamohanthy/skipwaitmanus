# Packet GO-LIVE-1b: a paid pass always activates — recovered from its checkout page when the webhook cannot place it — and only then do passes go on sale

> Read `docs/BRIEF.md` first, then this packet. Read `docs/PAYMENTS_TEST_RUNBOOK.md` §4 and §7. Agents never make a real payment.

| Field | Value |
|---|---|
| Queue row | §3b `1` (task 1, pass slice; claim it as `GO-LIVE-1b` inside row 1's status cell) |
| Decisions | D-084, D-046, D-005, D-044, D-042, D-055, D-074 |
| Risk tier | 1 (checkout, subscription activation, credits) |
| Size | M |
| Implementer | any model; independent review required |
| Branch | `agent/queue/go-live-passes` |
| Depends on | GO-LIVE-1 (live as #351) and the P0 pass switch that added `PASS_SALES_ENABLED` (`agent/claude/p0-pass-switch`) |
| Do not run at the same time as | GO-LIVE-1, D-079 follow-ups that edit `server/chargebeeRoutes.ts` |
| Written against | `main` after #351 plus the P0 pass switch (Oct 20 2026), D-084 |

## 1. Goal
D-084: GO-LIVE-1 (#351) put passes and Keep warm on sale; the P0 switch took them off again, because a paid pass could grant nothing. They are listed on `/plans` as "Not on sale yet". This packet makes activation certain and then turns sales on:
- a pending pass checkout is activated from its checkout page (Chargebee `GET /hosted_pages/{id}`, which carries our `pass_thru_content` and the subscription) on the seeker's return and by an hourly job, through the same activation code the webhook uses;
- a kit subscription event the webhook cannot place raises an alert instead of being only recorded;
- a pass that does not renew says "Ends <date>" with no renewal control;
- `PASS_SALES_ENABLED` turns on only in the last commit, after test-site evidence (§4.5).

## 2. Binding rules (quoted)
- D-084: "GO-LIVE-1b … turns passes on: return-page and hourly recovery of pending pass checkouts through the checkout page, an alert on any unlinked kit subscription, \"Ends <date>\" with no renewal control for a pass that does not renew, and test-site evidence … that `billing_cycles=1` is accepted and the pass does not renew."
- Payments bar (AGENTS.md §0a): every externally visible mutation is idempotent, reconciled and recoverable; a missed or late provider event has a reconcile or replay path; failures surface at once.
- D-044: nothing is advertised that the code does not grant.

## 3. Current behaviour (verified at `c685462a`)
1. `server/chargebee.ts` `parseSubscriptionEvent` takes `hostedPageId` and `passThruContent` only from `payload.content.hosted_page`. Chargebee documents subscription events as carrying the subscription, customer and invoice.
2. `server/db.ts` `applyChargebeeSubscriptionEvent` finds the intent (`subscriptionCheckoutIntents`) only by `hostedPageId` + `passThruContent`. With neither and no wallet holding the subscription, it records the event and returns `ignored: unknown_subscription`; a redelivery of that event is then a duplicate.
3. `server/chargebeeSubscriptionApi.ts` `retrieveCheckoutSubscription(credentials, hostedPageId)` reads the checkout page (8 s deadline) and returns `{ hostedPageId, state, passThruContent, subscriptionId, customerId }`. Nothing calls it.
4. `POST /api/chargebee/credit-recovery` reads only `paymentFulfillments` (packs and single credits); a pass `hostedPageId` answers 404. The hourly `chargebee-pending-reconcile` job (`server/chargebeePendingReconcile.ts`) covers only `paymentFulfillments`.
5. `/plans` and `/billing` show "Cancel renewal" and "Renews <date>" for an `active` subscription (`client/src/components/plans/PlanCards.tsx`, `BillingPanels.tsx`), which would be false for a pass bought with `billing_cycles=1`.

## 4. Rulings (decided under D-074; the owner may change them)
1. **One activation path.** Recovery builds the same input the webhook builds (`ParsedSubscriptionEvent`: subscription id, status, item price, plan and term from `resolvePlanItemPrice`, currency, current term start and end, resource version) from the checkout page's `content.subscription`, with `eventId = "hosted_page:<hostedPageId>"`, and calls `applyChargebeeSubscriptionEvent`. A later webhook for the same subscription then matches the wallet by subscription id. Extend `retrieveCheckoutSubscription`'s Zod schema to read those fields; never trust the client for any of them.
2. **Return-page recovery.** `POST /api/chargebee/subscription-recovery` `{ hostedPageId, role }`: signed in; the intent must belong to the caller (user and role) or it answers 404 with no provider call; `activated` / `pending` (page not yet succeeded) / `requires_review` (a mismatch the activation refuses) plus the summary. Bounded client retries like the credit recovery (0 s, 2.5 s, 7.5 s, focus; 3 attempts).
3. **Hourly reconcile.** Extend the pending reconcile to `subscriptionCheckoutIntents` with `status = pending`, older than 10 minutes and younger than 3 days, oldest first, at most 25 per run, each provider read under its deadline; one failure never stops the rest (DELEGATION §7 items 11–12). A page that expired unpaid marks the intent `cancelled` with `failureReason = "checkout_expired"`.
4. **Unlinked kit subscription.** When `applyChargebeeSubscriptionEvent` returns `unknown_subscription` or `checkout_intent_mismatch` for an item price the kit sells, the webhook raises the existing billing alert (no personal data) so a human can match it; nothing is granted from the event alone.
5. **Switching sales on.** The last commit sets `PASS_SALES_ENABLED = true` only after the row records test-site evidence (the owner, or an agent with test-site access, on the Chargebee test site with a test gateway): (a) `checkout_new_for_items` with `subscription_items[billing_cycles][0]=1` is accepted; (b) the subscription's `status` and `remaining_billing_cycles` right after checkout; (c) recovery activates it on the test site; (d) at term end it cancels without a renewal invoice (or the site setting that guarantees it). Without that evidence the packet lands with the switch off and the row reads "owner: test-site evidence".
6. **Display (amended by the QA review of #359, finding 3; the amendment is raised for the CEO's confirmation).** A kit pass or Keep warm term always shows its term date. The "Cancel renewal" control stays while the provider still reports the subscription `active`, because `billing_cycles=1` is not yet proven on the test site (§4.5) and a pass that might renew must not hide its own renewal control; only a confirmed `non_renewing` subscription drops it. Once §4.5 shows the provider never renews a kit pass, the control goes away for a pass that does not renew, as originally ruled, and GO-LIVE-2 adds opt-in renewal.
7. **No second path without the guard.** `createChangeCheckout` (`checkout_existing_for_items`) sends no `billing_cycles` and nothing calls it today. If this packet or any later one wires a plan change, it sends `subscription_items[billing_cycles][0]=1` like `createPlanCheckout`, with a form pin test.

## 5. Files
- **In scope:** `server/chargebeeSubscriptionApi.ts` (`retrieveCheckoutSubscription`), `server/chargebeeRoutes.ts` (the recovery route; the alert), `server/chargebeePendingReconcile.ts` and its job registration, `server/db.ts` (only a read of pending subscription intents and the intent `cancelled` update; activation stays `applyChargebeeSubscriptionEvent`), `shared/planCatalog.ts` (`PASS_SALES_ENABLED`, last commit), `client/src/pages/Plans.tsx`, `client/src/components/plans/*` (the pending-checkout helpers `readPendingCheckout` and `clearPendingCheckout` live in `client/src/components/plans/PlansKitSections.tsx`, not a separate `client/src/lib/pendingCheckout.ts` — QA #359 finding 6), tests, docs.
- **Out of scope:** opt-in renewal (GO-LIVE-2), prices and plan contents (D-056), Chargebee configuration (owner), the refund page (owner).

## 6. Tests to write first
1. Recovery activates a succeeded pass page through `applyChargebeeSubscriptionEvent` once; a replay, and a later webhook for the same subscription, change nothing twice.
2. Another seeker's `hostedPageId`, a referrer role, a not-succeeded page, a page whose `pass_thru_content` differs, and an item price that is not the intent's: no grant, the documented status, no provider call where ownership fails.
3. The hourly job: activates a pending succeeded page; cancels an expired one; skips intents younger than 10 minutes; one provider failure leaves the others processed; at most 25 per run.
4. The webhook alerts on an unlinked kit subscription and grants nothing.
5. `/plans` pending return for a pass: activated copy with the pass end date; the bounded retries (0 s, 2.5 s, 7.5 s **and a re-check on window focus**, three tries in all); the term date with only a confirmed `non_renewing` subscription dropping the renewal control on `/plans` and `/billing` (ruling 6 as amended).
6. With `PASS_SALES_ENABLED` mocked on, the catalog and checkout sell a live pass term (the GO-LIVE-1 tests already cover the off state).

## 7. Definition of done

- Setup: in a fresh worktree run `pnpm install` before the first `pnpm check`; missing local dependencies fail as TS2688/TS5101 (REGISTER-520, Oct 24).
- [ ] Gate (green on `a93d3f0f`: `pnpm check`, design-token-audit, lint-deploy-migrations, check-deploy-triggers, full vitest 433 passed / 3 skipped, `pnpm build`); draft PR #359; independent review round 1 (opencode · 78db) recorded **findings** — all six fixed red-first on `agent/queue/go-live-passes` (finding 3 as a ruling-6 amendment raised to the CEO; findings 4–6 in the same push), re-review next (Tier 1).
- [ ] Test-site evidence in the row (§4.5), then the switch commit, then live checks: API and web CONVERGED; `/plans` at 1280 and 390 with passes on sale.
- [x] Docs: BUGFREE 4.18 legs for pass activation and recovery (first live run pending the release); runbook §7 (a paid pass whose webhook never arrived: recovery by checkout page, then the admin match); `AGENTS.md` living-map payments row; D-084 sync cell; row 1. (D-046 sync cell: updated when passes go back on sale.)

## 8. Review checklist
1. Can any path grant a pass without a provider-confirmed succeeded checkout page or webhook?
2. Is every activation keyed so a replay, a webhook after recovery, and recovery after a webhook grant once?
3. Does the job stay bounded and keep going after one failure?
4. Is `PASS_SALES_ENABLED` still false unless the row holds the §4.5 evidence?

## 9. Stop and ask if
- The test site shows `billing_cycles=1` rejected, or a pass that renews anyway.
- The checkout page does not carry `content.subscription` with the fields in ruling 1.
- Activation would need a schema change.

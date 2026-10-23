# V2 checkout port (PR #523) - QA proof state (Oct 23)

Scope of all proof below: local full-stack server running the PR head, QA scratch
schema on the shared QA database, Chargebee TEST site only. No real payment, no
subscription completion, no production data or credentials. Hosted pages expire
3 hours after creation and can never charge without checkout completion.

## What is proven

Pre-commitment leftover-wallet refusal: account with a free wallet at 3/3
monthly credits, POST /api/chargebee/subscription-checkout for a v2 plan
returns HTTP 409 with code upgrade_leftover_rule_unresolved and
"Nothing has been charged" copy. No checkout intent row and no Chargebee
hosted page are created; an audit row billing.upgrade_leftover_blocked is
written. The block happens before any payment commitment, with webhook
parking retained as an explicit recoverable exception path.

Zero-leftover bundle carts (same account, wallet zeroed): INR cart shows the
plan plus 25-credit addon rung at INR 1,624 total; USD/INTL cart shows the
same bundle at USD 32.99 total. Cart contents were DOM-verified on the
Chargebee hosted page and screenshotted; matching checkout intent rows exist
in the QA scratch schema with status pending. This is API-to-cart proof only,
not UI-to-payment or fulfillment proof.

D-067 outbox real-MySQL concurrency (CI job outbox-mysql, run 39893278287,
head 0a94ea8b): billingReviewOutbox.mysql.test.ts executes against a
throwaway mysql:8.0 service container on 127.0.0.1:34879, the only endpoint
the test accepts. Proven against a real server: concurrent same-obligation
enqueue collapses to one row; concurrent worker runs produce exactly one
provider send; rollback leaves no outbox row; a worker whose lease is
replaced mid-flight sends nothing (ambiguous-send guard) and the next worker
after lease expiry delivers exactly once; the 7-day purge nulls
payload/envelope and re-enqueue of a purged obligation does not resend. The
schema-drift gate battery also runs against real InnoDB.

Full retained-function review of the port: all non-comment deletions versus
merge-base are additive widenings or faithful moves; no main-side code was
dropped. The full suite caught a pre-existing itemPriceForm defect (no
period posted for recurring addons) that #416 also carries.

## What is NOT proven

- UI-to-payment, webhook fulfillment, or entitlement activation on any
  environment. No payment has been made or authorized.
- End-to-end delivery of the PR-specific obligation kinds (payment_failed,
  upgrade_leftover_blocked) through the live worker; those paths are covered
  by unit tests and the refusal/cart proof above, not by a real provider
  round-trip.
- walletAtomic.mysql.test.ts remains skipped in CI: it targets an
  SSL-protected Azure endpoint and is not a localhost-fixture test.
- Chargebee hosted-cart line-item naming still shows legacy (D-132) plan
  names rather than D-152 names.

## Reproducing the cart proof

Run the app from the PR head with BILLING_ENV=test, the Chargebee TEST site
key, and the QA scratch schema. Sign in through the dev-auth endpoint
(note: it always creates a fresh account; repeat logins with the same email
do not match prior accounts). Wallet-dependent paths need a token balance
row written directly in the QA scratch schema for that fresh account id.
Then POST /api/chargebee/subscription-checkout with a v2 plan and rung;
billingCountry IN | INTL selects the INR | USD catalog. A nonzero free
wallet must produce the 409 refusal above; a zeroed wallet produces the
hosted-page checkout URL.

## Remaining launch blockers (unchanged, held with the PR)

- carry_one_month leftover-upgrade rule: authority unverified; code refuses
  or parks everywhere until an explicit product decision exists.
- Hosted-cart naming (D-132 vs D-152 above).
- Referrer access semantics.

# Payment Reliability Source Notes

## Chargebee event-delivery contract

**Source:** https://apidocs.chargebee.com/docs/api/events

Chargebee documents that webhooks require a 2XX acknowledgement, retries unsuccessful deliveries with increasing delays for up to two days, and can deliver the same event more than once. It instructs integrators to persist the unique event `id` and make processing idempotent. It also states that webhook deliveries can arrive out of order and recommends using a resource’s `resource_version` when synchronizing state.

**Applied safeguards:** skipwait.me persists the Chargebee event ID, preserves subscription resource-version ordering, validates the application-created hosted-page and pass-through checkout intent, and transitions a payment row from `pending` to `credited` atomically before increasing the wallet. The user-return recovery route retrieves the Chargebee hosted page server-side and never credits from a browser callback.

**Source:** https://www.chargebee.com/docs/billing/2.0/site-configuration/events_and_webhooks

Chargebee explains that webhook event snapshots may be stale or out of order when processed and recommends retrieving the current resource when current state is required. It confirms that failed or timed-out webhook calls are retried with exponential intervals.

**Applied user experience:** a returning signed-in user sees a calm automatic payment-confirmation state while the server checks their own hosted payment record. A matching succeeded record credits exactly once; incomplete or mismatched records enter a protected review state rather than risking an incorrect credit.

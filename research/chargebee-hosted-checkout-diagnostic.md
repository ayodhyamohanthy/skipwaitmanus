

## Current routing decision

The connected gateways on the Chargebee test site are **Chargebee Test Gateway** and **Razorpay-1**. PayPal is not connected; Chargebee’s PayPal connection flow requires a separate PayPal sandbox authorization. Per the current product decision, PayPal is deferred.

The Smart Routing editor supports selecting a gateway for the Card → USD rule. The draft now selects **Razorpay-1** for Card → USD, while UPI and Netbanking already select Razorpay-1 for INR. This is the current test-site routing configuration to publish and verify. Chargebee’s editor does not expose a country condition on this rule, so this configuration uses Razorpay as the interim route for the hosted USD checkout rather than claiming India-versus-rest-of-world routing that cannot yet be configured with the connected gateways.



## Razorpay route smoke verification

After publishing the Card → USD mapping to **Razorpay-1**, Chargebee accepted a non-payment `checkout_one_time_for_items` request for `skipwait_token_1-USD` with HTTP 200. The response created a `checkout_one_time` hosted page in `created` state and preserved the opaque `skipwait:checkout:razorpay-smoke-*` pass-through identifier. No payment was submitted and no token balance was credited during this smoke test.

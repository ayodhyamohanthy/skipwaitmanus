# Chargebee gateway-routing audit

## Required commercial routing

Skipwait requires **Razorpay for domestic India INR payments** and **PayPal for global USD payments**. Chargebee hosted checkout remains the application integration point; Chargebee must select the eligible configured gateway and payment method for the customer and currency.

## Official provider guidance reviewed

Chargebee documents gateway configuration under **Settings → Configure Chargebee → Payment Gateways**, with separate controls for payment-method display and routing rules. This is the account-side location to enable and restrict Razorpay and PayPal.

Chargebee documents multiple PayPal services. For wallet checkout, PayPal Express Checkout redirects the customer to PayPal to authenticate and approve payment. PayPal Commerce can accept global card payments in supported currencies. The selected PayPal service and credentials must be live before a live hosted checkout can offer it.

## Audit implication

Application code must enforce the currency and country boundary, while the Chargebee account must independently enforce gateway eligibility:

| Route | App request | Required Chargebee gateway policy |
| --- | --- | --- |
| India domestic | INR, billing country `IN` | Razorpay enabled for INR and displayed only for India-eligible checkout traffic. |
| Global | USD, billing country `INTL` | PayPal enabled for USD and displayed only on international-eligible checkout traffic. |

No production credential, gateway, or routing setting has been changed by this evidence-gathering step.

## Test catalog reconciliation — 20 August 2026

The authenticated `skipwait-test` catalog and its item-price API were inspected. The implementation’s intended amounts are correct, but two active USD plan prices in Chargebee do not match them.

| Item price | Intended smallest-unit amount | Catalog amount before correction | Audit status |
| --- | ---: | ---: | --- |
| `skipwait_token_1-INR` | 9,900 | 9,900 | Matches. |
| `skipwait_token_1-USD` | 100 | 100 | Matches. |
| `skipwait_pro_monthly-INR` | 59,900 | 59,900 | Matches. |
| `skipwait_pro_monthly-USD` | 700 | 1,000 | Must be changed from $10 to $7. |
| `skipwait_max_monthly-INR` | 129,900 | 129,900 | Matches. |
| `skipwait_max_monthly-USD` | 1,500 | 2,000 | Must be changed from $20 to $15. |

The user authorized the test-catalog corrections. The authenticated catalog visibly confirms the Max USD monthly price is $20 before the correction. The related Max INR price is ₹1,299 and remains correct.

## Authenticated account evidence — configuration summary

On the `skipwait-test` **Test** site, Chargebee reports the configured currencies as `INR, USD`, identifies **PayPal plus two other payment gateways**, and reports **one configured webhook**. This confirms the account has a PayPal gateway entry and webhook configuration, but the individual gateway names, eligibility controls, routing rules, and webhook destination still require inspection in their respective settings pages.

The gateway list confirms three configured test-site accounts: **Chargebee Test Gateway**, **Paypal-1**, and **Razorpay-1**. PayPal is configured with the `PayPal` payment method enabled and Chargebee confirms that its transactions belong in the **PayPal sandbox** for a test site. Razorpay is configured with **UPI** and **Netbanking (eMandate)** payment methods enabled; the payment-gateway list reports 3D Secure enabled for its Razorpay account. The Razorpay detail page also exposes a Chargebee-to-Razorpay notification URL and secret for Razorpay provider-event synchronization; their values were not copied into project files or logs.

## Webhook finding

The single active Chargebee test-site webhook is subscribed to **payment succeeded**. It initially targeted an obsolete preview URL. The user-authorized correction has now been saved and visually re-verified: the target is `https://bridgeref-ybuthfmw.manus.space/api/chargebee/webhook`. The existing basic-auth protection and event selection were preserved. Chargebee notes that sandbox webhook delivery may be delayed by 10–15 minutes; this delay does not apply to live sites.

## Smart-routing verification

The authenticated Chargebee routing rules match the intended payment-method boundary. **PayPal Express Checkout in USD routes to `Paypal-1`**. **UPI, Netbanking (e-mandates), and card payments in INR route to `Razorpay-1`**. There is intentionally no USD card route, because the global route is the PayPal wallet route rather than a direct-card gateway. No configuration change was required for gateway routing.

## Live-site boundary

Chargebee exposes a separate live site at `skipwait.chargebee.com`. The active browser session authenticated only the test site and redirected to Chargebee sign-in when attempting the live site. Therefore, the live-site catalog, PayPal, Razorpay, routing, and webhook configuration remain **unverified and unchanged**. Chargebee documents that a PayPal configuration on a test site does not automatically connect the live site, so this must be treated as a separate production activation task.

### Live-site inspection update

The user subsequently authenticated the live site. It has two gateway entries, **Paypal-1** and **Razorpay-1**, with 3D Secure enabled for Razorpay. However, the live site’s currency summary currently lists **INR only**. This is a production readiness blocker for the intended global USD PayPal flow: the PayPal gateway being listed is not enough unless USD is enabled and its USD items and routing are configured. The live gateway configuration was not changed during this read-only inspection.

The user authorized correction of the production configuration. Multi-currency has been enabled on the live site and **USD has been added successfully** as an additional currency, with Chargebee’s automatic rate management selected. INR remains the base currency. The next required production step is to map USD PayPal Express Checkout to `Paypal-1` and then create or reconcile the application’s six currency-specific item prices on the live catalog.

The USD routing correction is complete: **PayPal Express Checkout in USD now maps to `Paypal-1`** on the Chargebee live site. Existing INR routing remains unchanged: Razorpay-1 continues to handle INR cards, UPI, and Netbanking e-mandates. The live site deliberately has no USD direct-card gateway configured; global checkout is the approved PayPal wallet route.

## Remaining live-site blockers

The live site has **zero configured webhooks** and an **empty Product Catalog** (no plans, charges, product family, or item prices). Therefore, it cannot yet fulfill payments through this application even though its INR and USD gateway routing is now correct.

The verified test catalog contains the required model: item family `skipwait_credits`; one-time `charge` item `skipwait_token_1` with INR and USD item prices; and subscription `plan` items `skipwait_pro` and `skipwait_max`, each with INR and USD monthly item prices. The approved active price points are: `skipwait_token_1-INR` ₹99 (9900 paise), `skipwait_token_1-USD` $1 (100 cents), `skipwait_pro_monthly-INR` ₹599 (59900 paise), `skipwait_pro_monthly-USD` $7 (700 cents), `skipwait_max_monthly-INR` ₹1,299 (129900 paise), and `skipwait_max_monthly-USD` $15 (1500 cents).

Chargebee officially supports copying product catalog and other configurations from a Test site to a Live site through **Settings → Configure Chargebee → Transfer Configurations**. The final transfer is documented as **irreversible** and third-party gateway credentials are deliberately excluded, so it is the appropriate route for this empty live catalog only after explicit confirmation. The live PayPal and Razorpay configuration must remain separately managed; those gateway accounts and their routing have already been verified/configured above.

A transfer review has been prepared with source **TEST `skipwait-test`** and destination **LIVE `skipwait`**. The review explicitly uses **Retain data**, so existing live records and the newly corrected currency/routing settings are not deleted. No validation or irreversible transfer has been started yet.

The transfer scope has now been narrowed from Chargebee’s broad default selection to the **eight Product Catalog configurations only**. No billing rules, tax settings, integrations, customer-facing settings, privacy settings, or gateway credentials are selected. The next action is a non-destructive validation; the later “Proceed to Transfer” step remains irreversible and has not been reached.

Chargebee validation has completed with warnings. Its final review reports one Product Catalog configuration that **will be transferred** and two that **can be transferred**: the latter are **Addons** (with any attached/addon differential prices) and **Charges** (with any attached charge/differential prices). The live catalog is empty, and the application needs the source catalog’s charge plus plans and prices. The validation leaves the **Proceed to Transfer** action available, but Chargebee explicitly warns that it is irreversible and will replace the destination’s selected configurations. No final transfer has been submitted.

Following explicit user confirmation, the final Product Catalog transfer was submitted with the restricted scope above. Chargebee reports **12 configurations successfully transferred** from `skipwait-test` to `skipwait`. The remaining verification is to inspect the live item prices and confirm the four subscription/one-time price pairs match the application, then complete the separate live webhook and application live-credential activation work.

### Live catalog price verification

The live catalog now contains active `skipwait_pro` and `skipwait_max` plans and the active `skipwait_token_1` charge in the `skipwait Credits` product family. The live UI confirms the application’s approved active price points: **Pro monthly** ₹599 INR and $7 USD; **Max monthly** ₹1,299 INR and $15 USD; **1 Token charge** ₹99 INR and $1 USD. These correspond to the six required item-price IDs and smallest-unit amounts documented above. The additional 5-token and 10-token charges were transferred as related catalog entries but are not referenced by the present application checkout implementation.

The live `Paypal-1` gateway detail confirms that the **PayPal payment method is enabled** and exposes its own live gateway-account identifier. Combined with the verified USD PayPal Express Checkout smart-routing rule, the Chargebee-side global USD PayPal path is configured. The dashboard is a live site; the generic help note about test-site PayPal sandbox behavior does not change this live-gateway verification.

## Production application activation boundary

On 20 August 2026, a dedicated Chargebee live **Write Key** named `skipwait.me production server` was created. It permits create/read/update operations but explicitly cannot delete business data, which covers hosted checkout creation, hosted-page retrieval, and end-of-term subscription cancellation without granting deletion power. A minimal authenticated request to the live Item Prices endpoint returned HTTP 200, confirming the key works without retrieving customer data.

The application now has an explicit host-scoped credential boundary. Only the canonical host `skipwait.me`, when `CHARGEBEE_LIVE_ENABLED=true`, selects the `skipwait` live site and live credentials. The managed project domain and preview domains stay on the `skipwait-test` site and test credentials. Automated tests cover canonical-host selection, preview isolation, lookalike-host rejection, and a fail-closed missing-live-key path.

## Live webhook deployment blocker

Chargebee’s live site currently has **zero webhook endpoints**. A direct unauthenticated POST probe to `https://skipwait.me/api/chargebee/webhook` returned a JSON HTTP **404 Not Found**, so `skipwait.me` is still not routed to this project’s deployed webhook receiver. Creating a live Chargebee webhook now would therefore send payment events to the legacy deployment, and is intentionally blocked. The remaining safe sequence is: bind `skipwait.me` to this project, verify a POST reaches this project and returns HTTP 401 when unsigned, create the live webhook at that canonical URL using the separately stored webhook secret, subscribe only to payment/subscription lifecycle events, then use Chargebee’s Test Webhook facility to confirm an authenticated 2xx delivery without crediting any account.

## Sources

1. https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/gateway_settings
2. https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/payments_with_paypal

# Payment Route Detection Notes

skipwait.me should not perform an IP-address lookup merely to remove a currency choice. Browser locale data is sufficient to provide a sensible low-friction default, while a small user-initiated correction path resolves the cases where a device setting does not match the user’s current billing country.

## Detection rule

The browser can expose a region when a BCP 47 locale contains one. `Intl.Locale(...).region` returns that region, but it may be undefined because region is optional. The preferred locale list is also intentionally incomplete in some browsers and private modes to reduce fingerprinting. The client must therefore treat locale only as a defaulting signal, never as proof of billing eligibility.[1][2]

Use the first locale that explicitly resolves to `IN` to select the India route. If no explicit India region is present, select the international route. The IANA time zone returned by `Intl.DateTimeFormat().resolvedOptions()` may be used only as a fallback India signal for `Asia/Calcutta`; it must not be stored or sent to the server.[3]

## User experience and security rule

The interface shows one local amount and gateway by default: ₹99 / Razorpay Domestic in India, or $1 / PayPal elsewhere. It removes the manual INR/USD choice from the primary surface. A quiet “Different billing country?” link exposes the alternate route only on request. The server still validates the declared route and Chargebee item price; locale never authorizes payment or entitlement.

## References

[1]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/region "MDN: Intl.Locale.prototype.region"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages "MDN: Navigator.languages"
[3]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions "MDN: Intl.DateTimeFormat.prototype.resolvedOptions"

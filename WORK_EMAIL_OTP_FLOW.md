# Work-Email OTP Flow

The Referrer remains signed in to skipwait.me with any supported identity. To join a company’s hidden employee pool, the Referrer enters a separate company email address. The browser adds that email to the signed-in Clerk user, requests Clerk’s email-code verification, and then submits the verified address to skipwait.me for domain eligibility validation and enrollment.

| Step | Responsibility | Result |
| --- | --- | --- |
| Enter work email | Referrer | A company address is supplied without changing the sign-in identity. |
| Send six-digit code | Clerk | Clerk delivers and owns the short-lived verification challenge. |
| Confirm code | Clerk | The submitted address becomes a verified Clerk email address. |
| Enroll company domain | skipwait.me | The server confirms that the specific verified address belongs to the signed-in user, rejects consumer domains, and records the company domain. |
| Load private inbox | skipwait.me | Requests are scoped only to that verified company domain. |

The server never accepts an arbitrary email string as proof. It retrieves the authenticated Clerk user and only enrolls an address that Clerk reports as verified on that user record. This keeps personal inboxes out of the employee pool and preserves the existing hidden-identity model.

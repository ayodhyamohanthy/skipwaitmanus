# Work-Email OTP Flow

For Referrers, the work-email OTP **is** the sign-in: there is no separate
account step. The Referrer enters a company email address, the server sends a
six-digit code to that address via ZeptoMail (work domains only — consumer
inboxes are rejected before a code is ever generated), and verifying the code
creates the session. The verified company email itself becomes the identity,
and on first sign-in it is automatically enrolled as the referrer profile for
that company domain.

| Step | Responsibility | Result |
| --- | --- | --- |
| Enter work email | Referrer | A company address is supplied as the sign-in identity. |
| Send six-digit code | skipwait.me server (`/api/auth/otp/send`) | The server generates the short-lived challenge and delivers it via ZeptoMail; consumer domains are rejected. |
| Confirm code | skipwait.me server (`/api/auth/otp/verify`) | The server checks the hashed code (10-min TTL, single use, attempt caps) and issues the `app_session_id` JWT session cookie. |
| Enroll company domain | skipwait.me | On first sign-in the verified address is recorded as the referrer profile for that company domain, so the Referrer lands ready to receive their company's private requests. |
| Load private inbox | skipwait.me | Requests are scoped only to that verified company domain. |

The server never accepts an arbitrary email string as proof. The identity is
derived solely from successful proof-of-delivery to the company address: the
session is issued only after the code was verified server-side against the
hashed code stored for that exact email. This keeps personal inboxes out of
the employee pool and preserves the hidden-identity model.

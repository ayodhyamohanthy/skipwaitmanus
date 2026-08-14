# Referrer Work-Email Verification Fix

## Observed failure

The signed-in Referrer session used a personal email domain. The verification endpoint correctly rejected that domain, but returned the rejection as a server error and the UI only displayed a generic warning. This made it appear that the user could not continue.

## Correction

The verification route now classifies personal-email rejection as a `400` validation response. The Referrer inbox recognizes this message and shows a clear recovery panel: the user must switch accounts and sign in with a verified company email. The button signs out of the current personal-email session rather than attempting to enroll it in the private employee pool.

## Verification boundary

The app must not treat a personal email as a work-email fallback. A real company email remains necessary to join the hidden employee pool, receive company-matched requests, and open claimed candidate documents.

## Live UI regression check

Using the affected signed-in personal-email session, selecting **Verify my work email** now produces the explicit company-email recovery panel and the **Use a work email instead** action. The Referrer is no longer left at an unexplained failure state.

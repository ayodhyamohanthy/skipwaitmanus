# skipwait.me Growth and Monetization Audit

## Product constraints

The implementation must preserve a single-decision flow, progressive sign-in, anonymous employee participation, private documents, and user-initiated sharing. No address-book import, auto-send, employee directory, fake outcome card, or public applicant detail is permitted.

## Existing strengths

The live product already has the two strongest acquisition surfaces: the anonymous Opportunity Wall and the verified employee opportunity composer. The request confirmation page is the remaining high-intent point for a targeted employee-coverage share loop. The Referrer decision confirmation is the correct, non-blocking moment for a single trusted-colleague invite.

## Monetization finding

The three-free-then-$1-per-token approach is a suitable early-stage, transaction-aligned MVP model because it makes the paid unit identical to the user-visible action: one private request or one approved referral action. It is clearer and lower-commitment than a subscription before skipwait.me has predictable company coverage, claim speed, and repeat-job-seeker demand.

The monetization interface should keep the $1 price inside the existing balance panels and only surface a top-up after a user has used the included allowance or reaches a token-gated action. The simulated Razorpay, PayPal, and Chargebee selection remains a future activation surface rather than a real payment claim.

## Implementation scope for this release

1. Add the approved post-request company share card to the live confirmation screen, with editable user-initiated copy, copy-link, WhatsApp, LinkedIn, and email handoffs.
2. Make every share destination a company-specific invite to a public employee entry point. It will not include the Job Seeker’s identity, role URL, resume, document names, request state, or employee identity.
3. Add a compact invitation context to the employee entry flow so a recipient understands that they are being asked to strengthen private company coverage before choosing sign-in and work-email verification.
4. Add one colleague-invite prompt only after a Referrer approves or declines a claimed request. It will never block a decision or auto-send an invitation.
5. Add a public, non-blocking company-coverage share action to existing Opportunity Wall cards so visitors can help a relevant company build verified coverage without creating a profile.
6. Improve pricing clarity only inside the already-present token wallet and checkout flow: three included actions, one $1 action token, and a clear simulation-only payment status. No discount, subscription, or live-payment model will be introduced before claim-time and repeat-use data exist.
7. Defer contact sync, automatic follow-up, paid acquisition loops, employee-count displays, referral success claims, and any automated notifications. Each conflicts with the present trust, privacy, or speed requirements.

## Comparator note

Refer.me publicly offers a free candidate plan with one referral request per week and a $39/month premium plan with forty referral requests and additional career tools. This supports reserving subscription bundling for a later stage with repeat demand and differentiated recurring value. Its referrers are free, whereas skipwait.me’s current symmetric token design is intentionally a product choice that should be tested against Referrer approval conversion and retention rather than expanded immediately.

## Sources

- Existing product playbook: `VIRAL_GROWTH_PLAYBOOK.md`.
- Existing progressive-sign-in design: `PROGRESSIVE_SIGNIN_AND_OPPORTUNITIES.md`.
- Refer.me public pricing: https://www.refer.me/pricing.
- Refer.me public landing page: https://www.refer.me/.
- GetMeReferred public product page: https://getmereferred.com/.
